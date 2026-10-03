"""SQLite state with atomic, idempotent human confirmation."""

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from voiceops.scenarios import SCENARIOS, WORKSPACES


class Store:
    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "voiceops.sqlite3"
        self.lock = threading.RLock()
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS cases (action_id TEXT PRIMARY KEY, body TEXT NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def load(self, session_id: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT body FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            raise KeyError("Session not found.")
        return json.loads(row[0])

    def save(self, session: dict):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO sessions VALUES (?,?)", (session["id"], json.dumps(session)))

    def create(self, scenario_id: str, mode: str) -> dict:
        scenario = next((item for item in SCENARIOS if item["id"] == scenario_id), None)
        if not scenario:
            raise ValueError("Unknown scenario.")
        session = {
            "id": uuid.uuid4().hex, "scenario_id": scenario_id, "mode": mode, "status": "ready",
            "workspace": WORKSPACES[scenario["workspace_id"]].copy(), "messages": [], "events": [],
            "pending_actions": [], "cases": [], "provider_conversation_id": None,
            "created_at": time.time(), "connected_at": None, "ended_at": None, "connect_attempted": False,
        }
        self.save(session)
        return session

    def confirm(self, session_id: str, action_id: str) -> tuple[dict, dict]:
        start = time.perf_counter()
        with self.lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT body FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not row:
                raise KeyError("Session not found.")
            session = json.loads(row[0])
            action = next((item for item in session["pending_actions"] if item["id"] == action_id), None)
            if not action:
                raise KeyError("Pending action not found in this session.")
            previous = db.execute("SELECT body FROM cases WHERE action_id=?", (action_id,)).fetchone()
            if previous:
                return json.loads(previous[0]), session
            case = {
                "id": "CASE-" + uuid.uuid4().hex[:8].upper(), "summary": action["summary"],
                "priority": action["priority"], "status": "open", "workspace_id": session["workspace"]["id"],
            }
            action["status"] = "confirmed"
            session["cases"].append(case)
            session["messages"].append({"role": "system", "text": f"Local case {case['id']} created after human confirmation. No support message was sent."})
            session["events"].append({
                "id": uuid.uuid4().hex, "type": "human_confirmation", "tool_name": "confirm_case",
                "status": "success", "duration_ms": round((time.perf_counter() - start) * 1000, 3),
                "parameters": {"action_id": action_id},
                "result": case, "source_ids": ["CASE-001"],
            })
            db.execute("INSERT INTO cases VALUES (?,?)", (action_id, json.dumps(case)))
            db.execute("UPDATE sessions SET body=? WHERE id=?", (json.dumps(session), session_id))
            return case, session
