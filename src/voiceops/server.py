"""Loopback API; credentials and provider bearer capabilities stay out of storage."""

import os
import time
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from voiceops.cloud import validate_agent
from voiceops.provider import ElevenAgents, ProviderError, read_cloud
from voiceops.scenarios import SCENARIOS, SOURCE_TEXT
from voiceops.store import Store
from voiceops.tools import execute, preview

MAX_SECONDS = 90
VOICE_RATE = 0.08
PRICE_NOTE = "2026-10-03 list projection at $0.08/min additional voice, excluding LLM and plan allowances. Not a billing cap."


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateBody(Body):
    scenario_id: Literal["permissions", "quota", "outage", "escalation"]
    mode: Literal["preview", "text", "voice"]


class ConnectBody(Body):
    transport: Literal["websocket", "webrtc"]


class ToolBody(Body):
    tool_name: str = Field(min_length=1, max_length=100)
    parameters: dict = Field(default_factory=dict)


class MessageBody(Body):
    role: Literal["user", "agent", "system"]
    text: str = Field(min_length=1, max_length=4000)


class PreviewBody(Body):
    message: str = Field(min_length=1, max_length=4000)


class ProviderBody(Body):
    conversation_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")


def present(session: dict) -> dict:
    now = session["ended_at"] or time.time()
    elapsed = max(0, now - session["connected_at"]) if session["connected_at"] else 0
    # A projection ends at the cloud duration limit, not at invoice settlement.
    elapsed = min(elapsed, MAX_SECONDS)
    result = {k: v for k, v in session.items() if k not in {
        "created_at", "connected_at", "ended_at", "connect_attempted",
    }}
    tools = [event for event in session["events"] if event["type"] == "client_tool"]
    result["metrics"] = {
        "tool_calls": len(tools), "tool_failures": sum(event["status"] == "error" for event in tools),
        "elapsed_seconds": round(elapsed, 1),
        "estimated_voice_usd": round(elapsed / 60 * VOICE_RATE, 5) if session["mode"] == "voice" else 0,
        "price_note": PRICE_NOTE,
    }
    return result


def create_app(directory: Path | None = None, provider: ElevenAgents | None = None,
               frontend: Path | None = None) -> FastAPI:
    directory = directory or Path(os.environ.get("VOICEOPS_DATA_DIR", "data"))
    store = Store(directory)
    provider = provider or ElevenAgents()
    frontend = frontend or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    app = FastAPI(title="VoiceOps Desk", docs_url="/api/docs", redoc_url=None)
    app.state.store = store

    @app.middleware("http")
    async def loopback_boundary(request: Request, call_next):
        if request.url.hostname not in {"localhost", "127.0.0.1", "testserver"}:
            return JSONResponse({"detail": "Loopback hosts only."}, status_code=403)
        origin = request.headers.get("origin")
        if origin:
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or parsed.netloc != request.headers.get("host"):
                return JSONResponse({"detail": "Same-origin requests only."}, status_code=403)
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            if "application/json" not in request.headers.get("content-type", "") and request.headers.get("content-length", "0") != "0":
                return JSONResponse({"detail": "JSON requests only."}, status_code=415)
            # Stop reading oversized streamed requests as well as explicit Content-Length bodies.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 16384:
                    return JSONResponse({"detail": "Request body too large."}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(KeyError)
    async def missing_record(_request, _error):
        return JSONResponse({"detail": "Session or pending action not found."}, status_code=404)

    @app.exception_handler(ValueError)
    async def rejected_state(_request, _error):
        return JSONResponse({"detail": "Operation rejected for this session state."}, status_code=409)

    @app.exception_handler(ProviderError)
    async def provider_error(_request, error):
        messages = {
            "missing_permissions": "The key lacks ElevenAgents access. Enable Agents and Knowledge Base permissions.",
            "key_not_configured": "A server API key is required for live mode.",
            "demo_configuration_drift": "The cloud demo configuration changed. Restore private auth, duration and tool boundaries before starting.",
        }
        return JSONResponse({"detail": messages.get(error.status, "ElevenAgents request failed. Start a new session to retry.")},
                            status_code=503)

    @app.get("/api/config")
    def config():
        cloud = read_cloud(directory)
        cloud_status = cloud.get("status", "ready" if cloud.get("agent_id") else "not_configured")
        return {
            "product_name": "VoiceOps Desk", "key_loaded": bool(provider.key),
            "agent_provisioned": bool(cloud.get("agent_id")),
            "cloud_status": cloud_status,
            "max_session_seconds": MAX_SECONDS, "voice_rate_per_minute": VOICE_RATE, "price_note": PRICE_NOTE,
        }

    @app.get("/api/scenarios")
    def scenarios():
        return SCENARIOS

    @app.get("/api/sources")
    def sources():
        return SOURCE_TEXT

    @app.post("/api/sessions")
    def create(body: CreateBody):
        return present(store.create(body.scenario_id, body.mode))

    @app.get("/api/sessions/{session_id}")
    def get(session_id: str):
        return present(store.load(session_id))

    @app.post("/api/sessions/{session_id}/connect")
    def connect(session_id: str, body: ConnectBody):
        with store.lock:
            session = store.load(session_id)
            expected = "webrtc" if session["mode"] == "voice" else "websocket"
            if session["mode"] == "preview" or body.transport != expected:
                raise HTTPException(409, "Transport does not match session mode.")
            if session["connect_attempted"] or session["status"] == "ended":
                raise HTTPException(409, "A connection was already attempted. Create a new session.")
            cloud = read_cloud(directory)
            if not cloud.get("agent_id"):
                raise HTTPException(409, "Provision this demo's agent first: voiceops provision.")
            session["connect_attempted"] = True
            session["status"] = "connecting"
            store.save(session)
        # External I/O must not hold the lock needed by existing tools or Stop.
        try:
            agent = provider.request("GET", f"/v1/convai/agents/{cloud['agent_id']}")
            validate_agent(agent, cloud)
            result = provider.connect(cloud["agent_id"], body.transport)
        except ProviderError:
            with store.lock:
                session = store.load(session_id)
                if session["status"] != "ended":
                    session["status"] = "connection_failed"
                    store.save(session)
            raise
        with store.lock:
            session = store.load(session_id)
            if session["status"] == "ended":
                raise HTTPException(409, "Session ended while requesting connection access.")
            # Issuing a capability does not establish a connected conversation.
            store.save(session)
            return result

    @app.post("/api/sessions/{session_id}/tools")
    def tool(session_id: str, body: ToolBody):
        session = store.load(session_id)
        if session["mode"] != "preview" and (
            not session["connected_at"] or time.time() - session["connected_at"] > MAX_SECONDS + 5
        ):
            raise HTTPException(409, "Live tools require an active, unexpired session.")
        return execute(store, session_id, body.tool_name, body.parameters)

    @app.post("/api/sessions/{session_id}/preview")
    def guided_preview(session_id: str, body: PreviewBody):
        return present(preview(store, session_id, body.message))

    @app.post("/api/sessions/{session_id}/confirm/{action_id}")
    def confirm(session_id: str, action_id: str):
        case, session = store.confirm(session_id, action_id)
        return {"case": case, "session": present(session)}

    @app.post("/api/sessions/{session_id}/messages")
    def message(session_id: str, body: MessageBody):
        with store.lock:
            session = store.load(session_id)
            if len(session["messages"]) >= 200:
                raise HTTPException(409, "Message limit reached.")
            session["messages"].append(body.model_dump())
            store.save(session)
        return {"ok": True}

    @app.post("/api/sessions/{session_id}/provider")
    def identify_provider(session_id: str, body: ProviderBody):
        with store.lock:
            session = store.load(session_id)
            if session["mode"] == "preview" or not session["connect_attempted"] or session["status"] not in {"connecting", "active"}:
                raise HTTPException(409, "No live connection in this session.")
            if session["provider_conversation_id"] and session["provider_conversation_id"] != body.conversation_id:
                raise HTTPException(409, "A provider conversation is already bound.")
            session["provider_conversation_id"] = body.conversation_id
            if not session["connected_at"]:
                session["connected_at"] = time.time()
                session["status"] = "active"
            store.save(session)
        return {"ok": True}

    @app.post("/api/sessions/{session_id}/end")
    def end(session_id: str):
        with store.lock:
            session = store.load(session_id)
            if session["status"] != "ended":
                session["ended_at"] = time.time()
                session["status"] = "ended"
                store.save(session)
        return present(session)

    @app.get("/api/sessions/{session_id}/provider-report")
    def report(session_id: str):
        session = store.load(session_id)
        conversation_id = session["provider_conversation_id"]
        if not conversation_id:
            return {"available": False, "reason": "No provider conversation. Preview has no provider usage."}
        try:
            data = provider.request("GET", f"/v1/convai/conversations/{conversation_id}")
        except ProviderError as error:
            return {"available": False, "reason": error.status}
        if data.get("agent_id") != read_cloud(directory).get("agent_id"):
            raise HTTPException(403, "Conversation does not belong to this demo agent.")
        metadata = data.get("metadata") or {}
        return {"available": True, "status": data.get("status"), "metadata": {
            key: metadata.get(key) for key in ["call_duration_secs", "cost", "cost_fiat", "charging"]
        }, "note": "cost_fiat is USD per current docs; cost units are undocumented. This is conversation usage, not your account invoice."}

    @app.get("/{path:path}")
    def static(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "API route not found.")
        root = frontend.resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise HTTPException(404, "File not found.")
        if target.is_file():
            return FileResponse(target)
        index = root / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"detail": "Frontend not built. Run npm --prefix frontend run build."}, status_code=503)

    return app
