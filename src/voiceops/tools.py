"""Typed tools with session-derived identity and inspectable failures."""

import time
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from voiceops.store import Store


class Params(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str | None = Field(default=None, max_length=100)


class DiagnoseParams(Params):
    status_code: int = Field(ge=100, le=599)
    error_code: str = Field(min_length=1, max_length=100)


class EstimateParams(Params):
    projected_requests: int = Field(ge=0, le=10000000)


class CaseParams(Params):
    summary: str = Field(min_length=5, max_length=500)
    priority: Literal["normal", "high"] = "normal"


PARAM_TYPES = {
    "lookup_workspace": Params, "diagnose_error": DiagnoseParams,
    "estimate_monthly_cost": EstimateParams, "prepare_support_case": CaseParams,
}


def execute(store: Store, session_id: str, tool_name: str, parameters: dict) -> dict:
    start = time.perf_counter()
    with store.lock:
        session = store.load(session_id)
        if session["status"] == "ended":
            raise ValueError("This session has ended. Start a new session.")
        if len(session["events"]) >= 100:
            raise ValueError("This session has reached its tool limit.")
        source_ids, status = [], "success"
        try:
            if tool_name not in PARAM_TYPES:
                raise ValueError("Unknown tool. The confirmation operation is not an agent tool.")
            params = PARAM_TYPES[tool_name].model_validate(parameters)
            workspace = session["workspace"]
            if params.workspace_id and params.workspace_id != workspace["id"]:
                result = {"ok": False, "error": "workspace_scope_denied", "retryable": False}
                source_ids, status = ["SCOPE-001"], "error"
            elif tool_name == "lookup_workspace":
                if session["scenario_id"] == "outage":
                    result = {"ok": False, "error": "workspace_service_unavailable", "retryable": False,
                              "guidance": "Current usage is unverified. Offer policy guidance or prepare a case."}
                    source_ids, status = ["RELIABILITY-001"], "error"
                else:
                    result = {"ok": True, "workspace": workspace, "data_kind": "fictional_fixture"}
                    source_ids = ["QUOTA-001", "SCOPE-001"]
            elif tool_name == "diagnose_error":
                code = params.error_code.lower()
                if params.status_code == 401 and code == "missing_permissions":
                    result = {"ok": True, "diagnosis": "Key authenticated; endpoint permission is missing.",
                              "next_step": "Ask an admin to edit endpoint permissions. Do not share the key.",
                              "replace_key_required": False}
                elif params.status_code == 401 and code == "invalid_api_key":
                    result = {"ok": True, "diagnosis": "The key cannot authenticate.",
                              "next_step": "Verify server key injection, the header and whether the key was revoked.",
                              "replace_key_required": None}
                elif params.status_code == 429 and code in {"quota_exceeded", "rate_limit_exceeded"}:
                    result = {"ok": True, "diagnosis": "Monthly allowance exceeded." if code == "quota_exceeded"
                              else "Short-term rate exceeded.", "retryable": code == "rate_limit_exceeded",
                              "next_step": "Check verified usage." if code == "quota_exceeded"
                              else "Use bounded exponential backoff with jitter."}
                else:
                    result = {"ok": True, "diagnosis": "This code is not covered by the demo policy.",
                              "next_step": "Collect a redacted request ID and prepare a support case if needed."}
                source_ids = ["QUOTA-001" if params.status_code == 429 else "AUTH-001"]
            elif tool_name == "estimate_monthly_cost":
                extras = max(0, params.projected_requests - workspace["monthly_limit"])
                result = {"ok": True, "projected_requests": params.projected_requests,
                          "included_requests": workspace["monthly_limit"], "extra_requests": extras,
                          "base_usd": 29, "overage_usd": round(extras * 0.003, 2),
                          "total_usd": round(29 + extras * 0.003, 2),
                          "price_kind": "Fictional Northstar plan; not ElevenLabs pricing."}
                source_ids = ["QUOTA-001"]
            else:
                action = {"id": uuid.uuid4().hex, "summary": params.summary,
                          "priority": params.priority, "status": "pending"}
                existing = next((a for a in session["pending_actions"] if a["status"] == "pending"
                                 and a["summary"] == action["summary"] and a["priority"] == action["priority"]), None)
                if existing:
                    action = existing
                else:
                    session["pending_actions"].append(action)
                result = {"ok": True, "pending_action": action, "created": False,
                          "next_step": "Ask the human to review and click Confirm case in the interface."}
                source_ids, status = ["CASE-001"], "awaiting_confirmation"
        except (ValidationError, ValueError):
            result = {"ok": False, "error": "invalid_tool_request", "retryable": False,
                      "guidance": "Use a registered tool with its documented parameters."}
            status = "error"
        event = {
            "id": uuid.uuid4().hex, "type": "client_tool", "tool_name": tool_name, "status": status,
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "parameters": parameters, "result": result, "source_ids": source_ids,
        }
        session["events"].append(event)
        store.save(session)
        return {"result": result, "event": event}


def preview(store: Store, session_id: str, message: str) -> dict:
    """An explicit deterministic presenter path, never a provider conversation."""
    with store.lock:
        session = store.load(session_id)
        if session["mode"] != "preview":
            raise ValueError("Guided preview is only available in preview sessions.")
        if session["status"] == "ended":
            raise ValueError("This session has ended.")
        session["messages"].append({"role": "user", "text": message})
        store.save(session)
        lower = message.lower()
        scenario = session["scenario_id"]
        if any(term in lower for term in ["ignore", "bypass", "without approval", "other workspace"]):
            response = "Workspace access comes from this session. I can prepare a case, but a human must confirm it."
        elif "case" in lower or "escalat" in lower or scenario == "escalation":
            execute(store, session_id, "prepare_support_case", {
                "summary": "Customer cannot access the developer API; permission issue needs investigation.",
                "priority": "high" if "high" in lower else "normal",
            })
            response = "I prepared a local support case. Please review its summary and click Confirm case. It has not been created yet."
        elif scenario == "permissions":
            execute(store, session_id, "lookup_workspace", {})
            result = execute(store, session_id, "diagnose_error", {
                "status_code": 401, "error_code": "invalid_api_key" if "invalid_api_key" in lower else "missing_permissions",
            })["result"]
            response = result["diagnosis"] + " " + result["next_step"]
        elif scenario == "quota":
            execute(store, session_id, "lookup_workspace", {})
            result = execute(store, session_id, "estimate_monthly_cost", {"projected_requests": 18000})["result"]
            response = (f"This fictional workspace has used 12,600 requests. For 18,000 requests next month, "
                        f"the Northstar demo plan is ${result['total_usd']:.2f}: $29 base plus $24 overage. "
                        "These are synthetic Northstar prices, separate from the agent's voice cost.")
        else:
            execute(store, session_id, "lookup_workspace", {})
            response = "The workspace service is unavailable, so I could not verify current usage. I can explain the policy or prepare a case."
        session = store.load(session_id)
        session["messages"].append({"role": "agent", "text": response})
        store.save(session)
        return session
