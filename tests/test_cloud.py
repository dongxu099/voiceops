import httpx
import pytest

from voiceops.cloud import agent_config, provision
from voiceops.provider import ElevenAgents, ProviderError, read_cloud


def test_partial_setup_resumes_without_duplicate_tools(tmp_path):
    counts = {"documents": 0, "tools": 0, "agents": 0}

    def handler(request):
        path = request.url.path
        if request.method == "GET":
            if path.endswith("agent_demo"):
                state = read_cloud(tmp_path)
                return httpx.Response(200, json=agent_config(list(state["tool_ids"].values()), "doc_demo", "voice_demo"))
            return httpx.Response(200, json={"agents": []})
        if "knowledge-base" in path:
            counts["documents"] += 1
            return httpx.Response(200, json={"id": "doc_demo"})
        if path.endswith("tools"):
            counts["tools"] += 1
            if counts["tools"] == 3:
                return httpx.Response(401, json={"detail": {"status": "missing_permissions"}})
            return httpx.Response(200, json={"id": f"tool_{counts['tools']}"})
        counts["agents"] += 1
        return httpx.Response(200, json={"agent_id": "agent_demo"})

    provider = ElevenAgents("fake-key", httpx.MockTransport(handler))
    with pytest.raises(ProviderError):
        provision(provider, tmp_path, "voice_demo")
    partial = read_cloud(tmp_path)
    assert partial["document_id"] == "doc_demo"
    assert len(partial["tool_ids"]) == 2
    result = provision(provider, tmp_path, "voice_demo")
    assert result["agent_id"] == "agent_demo"
    assert counts == {"documents": 1, "tools": 5, "agents": 1}
    provision(provider, tmp_path, "voice_demo")
    assert counts == {"documents": 1, "tools": 5, "agents": 1}


def test_cloud_configuration_preserves_demo_boundaries():
    config = agent_config(["tool_demo"], "doc_demo", "voice_demo")
    assert config["platform_settings"]["auth"]["enable_auth"] is True
    assert config["conversation_config"]["conversation"]["max_duration_seconds"] == 90
    overrides = config["platform_settings"]["overrides"]["conversation_config_override"]
    assert overrides == {"conversation": {"text_only": True}}
    assert config["platform_settings"]["privacy"]["record_voice"] is False
    assert config["conversation_config"]["agent"]["prompt"]["tool_ids"] == ["tool_demo"]


def test_configuration_drift_is_rejected(tmp_path):
    from voiceops.cloud import validate_agent

    state = {"tool_ids": {"lookup_workspace": "tool_demo"}, "document_id": "doc_demo"}
    config = agent_config(["tool_demo"], "doc_demo", "voice_demo")
    validate_agent(config, state)
    config["platform_settings"]["auth"]["enable_auth"] = False
    with pytest.raises(ProviderError, match="demo_configuration_drift"):
        validate_agent(config, state)
