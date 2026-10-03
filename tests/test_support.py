from concurrent.futures import ThreadPoolExecutor

import pytest

from voiceops.store import Store
from voiceops.tools import execute, preview


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path)


@pytest.mark.parametrize("scenario,source,failed", [
    ("permissions", "AUTH-001", False), ("quota", "QUOTA-001", False),
    ("outage", "RELIABILITY-001", True), ("escalation", "CASE-001", False),
])
def test_presenter_scenarios_use_real_tools(store, scenario, source, failed):
    session = store.create(scenario, "preview")
    result = preview(store, session["id"], "Run the scenario")
    assert result["messages"][-1]["role"] == "agent"
    assert any(source in event["source_ids"] for event in result["events"])
    assert any(event["status"] == "error" for event in result["events"]) is failed


def test_missing_permission_does_not_rotate_key(store):
    session = store.create("permissions", "preview")
    result = execute(store, session["id"], "diagnose_error", {
        "status_code": 401, "error_code": "missing_permissions",
    })["result"]
    assert result["replace_key_required"] is False
    assert "permission" in result["diagnosis"]


def test_model_workspace_is_not_authority(store):
    session = store.create("permissions", "preview")
    result = execute(store, session["id"], "lookup_workspace", {"workspace_id": "ws_demo_scale"})
    assert result["result"]["error"] == "workspace_scope_denied"
    assert "used_requests" not in str(result["result"])


def test_unknown_and_malformed_tools_are_audited(store):
    session = store.create("permissions", "preview")
    for name, args in [("confirm_case", {}), ("estimate_monthly_cost", {"projected_requests": -1}),
                       ("lookup_workspace", {"admin": True})]:
        result = execute(store, session["id"], name, args)
        assert result["event"]["status"] == "error"
        assert result["result"]["error"] == "invalid_tool_request"
    assert len(store.load(session["id"])["events"]) == 3


def test_preparation_is_not_creation_and_confirm_is_atomic(store):
    session = store.create("escalation", "preview")
    action = execute(store, session["id"], "prepare_support_case", {
        "summary": "Cannot access API with scoped key", "priority": "high",
    })["result"]["pending_action"]
    assert store.load(session["id"])["cases"] == []
    with ThreadPoolExecutor(max_workers=4) as pool:
        cases = list(pool.map(lambda _: store.confirm(session["id"], action["id"])[0], range(8)))
    assert len({case["id"] for case in cases}) == 1
    assert len(store.load(session["id"])["cases"]) == 1
    other = store.create("escalation", "preview")
    with pytest.raises(KeyError):
        store.confirm(other["id"], action["id"])


def test_repeated_preparation_reuses_pending_action(store):
    session = store.create("escalation", "preview")
    args = {"summary": "Need help with permissions", "priority": "normal"}
    first = execute(store, session["id"], "prepare_support_case", args)["result"]
    second = execute(store, session["id"], "prepare_support_case", args)["result"]
    assert first["pending_action"]["id"] == second["pending_action"]["id"]


def test_forecast_uses_explicit_fictional_pricing(store):
    session = store.create("quota", "preview")
    result = execute(store, session["id"], "estimate_monthly_cost", {"projected_requests": 18000})["result"]
    assert result["total_usd"] == 53
    assert "not ElevenLabs" in result["price_kind"]
