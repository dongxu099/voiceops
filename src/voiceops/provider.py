"""Minimal server-only ElevenAgents transport. Provider bodies never become errors."""

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx


class ProviderError(Exception):
    def __init__(self, status: str, http_status: int | None = None):
        self.status = status
        self.http_status = http_status
        super().__init__(status)


def load_keychain(service: str = "elevenlabs_api_key"):
    if os.environ.get("ELEVENLABS_API_KEY"):
        return
    if sys.platform != "darwin":
        raise ValueError("Keychain is macOS only. Use process environment injection on other systems.")
    result = subprocess.run(["security", "find-generic-password", "-s", service, "-w"],
                            capture_output=True, text=True, check=False)
    if result.returncode == 0 and result.stdout.strip():
        os.environ["ELEVENLABS_API_KEY"] = result.stdout.strip()


class ElevenAgents:
    def __init__(self, key: str | None = None, transport=None):
        self.key = key if key is not None else os.environ.get("ELEVENLABS_API_KEY", "")
        self.transport = transport

    def request(self, method: str, path: str, **kwargs) -> dict:
        if not self.key:
            raise ProviderError("key_not_configured")
        try:
            with httpx.Client(base_url="https://api.elevenlabs.io", timeout=30,
                              transport=self.transport, follow_redirects=False) as client:
                response = client.request(method, path, headers={"xi-api-key": self.key}, **kwargs)
        except httpx.HTTPError:
            raise ProviderError("provider_connection_failed") from None
        if response.is_error:
            code = "provider_request_failed"
            try:
                detail = response.json().get("detail", {})
                if isinstance(detail, dict) and detail.get("status") == "missing_permissions":
                    code = "missing_permissions"
            except (ValueError, AttributeError):
                pass
            raise ProviderError(code, response.status_code)
        try:
            return response.json()
        except ValueError:
            raise ProviderError("invalid_provider_response") from None

    def connect(self, agent_id: str, transport: str) -> dict:
        endpoint = "token" if transport == "webrtc" else "get-signed-url"
        response = self.request("GET", f"/v1/convai/conversation/{endpoint}", params={"agent_id": agent_id})
        key = "token" if transport == "webrtc" else "signed_url"
        if not isinstance(response.get(key), str):
            raise ProviderError("invalid_provider_response")
        return {"conversation_token" if transport == "webrtc" else "signed_url": response[key]}


def read_cloud(directory: Path) -> dict:
    path = directory / "cloud.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def write_cloud(directory: Path, state: dict):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "cloud.json"
    temporary = directory / "cloud.json.tmp"
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(path)
