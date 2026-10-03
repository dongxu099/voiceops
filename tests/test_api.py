import json
import threading
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from voiceops.cloud import agent_config
from voiceops.provider import ElevenAgents, write_cloud
from voiceops.server import create_app


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path, ElevenAgents(key="")))


def session(client, mode="preview", scenario="permissions"):
    response = client.post("/api/sessions", json={"scenario_id": scenario, "mode": mode})
    assert response.status_code == 200
    return response.json()


def demo_cloud(tmp_path):
    write_cloud(tmp_path, {"agent_id": "agent_demo", "document_id": "doc_demo",
                           "tool_ids": {"lookup_workspace": "tool_demo"}})
    return agent_config(["tool_demo"], "doc_demo", "voice_demo")


def test_preview_journey_confirm_and_end(client):
    item = session(client, scenario="escalation")
    result = client.post(f"/api/sessions/{item['id']}/preview", json={"message": "Prepare a high priority case"}).json()
    action = result["pending_actions"][0]
    confirmed = client.post(f"/api/sessions/{item['id']}/confirm/{action['id']}").json()
    assert confirmed["case"]["priority"] == "high"
    assert confirmed["session"]["metrics"]["estimated_voice_usd"] == 0
    client.post(f"/api/sessions/{item['id']}/end")
    assert client.post(f"/api/sessions/{item['id']}/preview", json={"message": "retry"}).status_code == 409


def test_loopback_origin_json_and_body_boundary(client):
    assert client.get("/api/config", headers={"host": "evil.example"}).status_code == 403
    assert client.post("/api/sessions", headers={"origin": "https://evil.example"}, json={}).status_code == 403
    assert client.post("/api/sessions", content="bad", headers={"content-type": "text/plain"}).status_code == 415
    assert client.post("/api/sessions", content='"' + "x" * 17000 + '"',
                       headers={"content-type": "application/json"}).status_code == 413
    assert client.get("/api/config").headers["cache-control"] == "no-store"


def test_live_cannot_use_preview_or_unconnected_tools(client):
    item = session(client, "text")
    root = f"/api/sessions/{item['id']}"
    assert client.post(root + "/preview", json={"message": "hello"}).status_code == 409
    assert client.post(root + "/tools", json={"tool_name": "lookup_workspace", "parameters": {}}).status_code == 409
    assert client.post(root + "/connect", json={"transport": "webrtc"}).status_code == 409


def test_connection_credentials_not_stored_and_no_retry(tmp_path):
    config = demo_cloud(tmp_path)
    calls = []

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("agent_demo"):
            return httpx.Response(200, json=config)
        return httpx.Response(200, json={"signed_url": "wss://example.test?conversation_signature=secret"})

    client = TestClient(create_app(tmp_path, ElevenAgents("fake-key", httpx.MockTransport(handler))))
    item = session(client, "text")
    root = f"/api/sessions/{item['id']}"
    assert "signed_url" in client.post(root + "/connect", json={"transport": "websocket"}).json()
    assert "secret" not in json.dumps(client.get(root).json())
    assert client.post(root + "/connect", json={"transport": "websocket"}).status_code == 409
    assert len(calls) == 2  # One cloud-boundary verification, one admission capability.
    assert client.get(root).json()["status"] == "connecting"
    assert client.get(root).json()["metrics"]["elapsed_seconds"] == 0
    client.post(root + "/provider", json={"conversation_id": "conv_demo"})
    assert client.get(root).json()["status"] == "active"


def test_provider_error_is_sanitized(tmp_path):
    write_cloud(tmp_path, {"agent_id": "agent_demo"})

    def handler(_request):
        return httpx.Response(401, json={"detail": {"status": "missing_permissions", "message": "secret-key-value"}})

    client = TestClient(create_app(tmp_path, ElevenAgents("fake", httpx.MockTransport(handler))))
    item = session(client, "voice")
    response = client.post(f"/api/sessions/{item['id']}/connect", json={"transport": "webrtc"})
    assert response.status_code == 503
    assert "secret-key-value" not in response.text
    assert "permission" in response.text


def test_known_agent_does_not_hide_permission_failure(tmp_path):
    write_cloud(tmp_path, {"agent_id": "agent_demo", "status": "missing_permissions"})
    client = TestClient(create_app(tmp_path, ElevenAgents("fake")))
    assert client.get("/api/config").json()["cloud_status"] == "missing_permissions"


def test_report_rejects_other_agent_and_keeps_fiat_units(tmp_path):
    config = demo_cloud(tmp_path)
    agent = {"id": "other_agent"}

    def handler(request):
        if request.url.path.endswith("agent_demo"):
            return httpx.Response(200, json=config)
        if "get-signed-url" in str(request.url):
            return httpx.Response(200, json={"signed_url": "wss://example.test"})
        return httpx.Response(200, json={"agent_id": agent["id"], "status": "done",
                                       "metadata": {"cost": 5, "cost_fiat": 0.04}, "transcript": "private"})

    client = TestClient(create_app(tmp_path, ElevenAgents("fake", httpx.MockTransport(handler))))
    item = session(client, "text")
    root = f"/api/sessions/{item['id']}"
    client.post(root + "/connect", json={"transport": "websocket"})
    client.post(root + "/provider", json={"conversation_id": "conv_fake"})
    assert client.get(root + "/provider-report").status_code == 403
    agent["id"] = "agent_demo"
    report = client.get(root + "/provider-report").json()
    assert report["metadata"]["cost_fiat"] == 0.04
    assert "private" not in json.dumps(report)


def test_slow_admission_does_not_block_stop_or_reopen_ended_session(tmp_path):
    config = demo_cloud(tmp_path)
    entered, release = threading.Event(), threading.Event()

    def handler(request):
        if request.url.path.endswith("agent_demo"):
            return httpx.Response(200, json=config)
        entered.set()
        assert release.wait(5)
        return httpx.Response(200, json={"signed_url": "wss://example.test"})

    client = TestClient(create_app(tmp_path, ElevenAgents("fake", httpx.MockTransport(handler))))
    item = session(client, "text")
    root = f"/api/sessions/{item['id']}"
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = pool.submit(client.post, root + "/connect", json={"transport": "websocket"})
        assert entered.wait(2)
        ending = pool.submit(client.post, root + "/end")
        try:
            assert ending.result(timeout=1).json()["status"] == "ended"
        finally:
            release.set()
        assert pending.result(timeout=2).status_code == 409
    assert client.get(root).json()["status"] == "ended"
