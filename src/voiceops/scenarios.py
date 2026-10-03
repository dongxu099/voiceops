"""Public synthetic fixtures, deliberately independent of real customer records."""

WORKSPACES = {
    "ws_demo_dev": {
        "id": "ws_demo_dev", "name": "Northstar / Sandbox", "plan": "Developer",
        "monthly_limit": 10000, "used_requests": 8400, "rate_limit_per_minute": 60,
    },
    "ws_demo_scale": {
        "id": "ws_demo_scale", "name": "Northstar / Launch", "plan": "Developer",
        "monthly_limit": 10000, "used_requests": 12600, "rate_limit_per_minute": 60,
    },
}

SCENARIOS = [
    {"id": "permissions", "title": "Diagnose a 401", "description": "Distinguish a valid key from missing access.",
     "first_user_message": "My API returns 401 missing_permissions. Should I replace the key?",
     "workspace_id": "ws_demo_dev"},
    {"id": "quota", "title": "Plan a launch", "description": "Verify usage and forecast a fictional monthly bill.",
     "first_user_message": "We expect 18000 requests next month. Check our usage and estimate the bill.",
     "workspace_id": "ws_demo_scale"},
    {"id": "outage", "title": "Handle a tool outage", "description": "Expose failure and give an honest next step.",
     "first_user_message": "Can you check my current usage? The account service seems unavailable.",
     "workspace_id": "ws_demo_dev"},
    {"id": "escalation", "title": "Escalate with approval", "description": "Prepare a case; require a human to commit it.",
     "first_user_message": "I still cannot access the API. Please prepare a high priority support case.",
     "workspace_id": "ws_demo_dev"},
]

SOURCE_TEXT = {
    "AUTH-001": "401: invalid_api_key requires authentication repair; missing_permissions requires endpoint access.",
    "QUOTA-001": "Fictional Developer: $29 / month, 10,000 included requests, $0.003 per extra request; 60/minute.",
    "CASE-001": "Prepare first. A separate human confirmation creates one local case. No outbound support message.",
    "RELIABILITY-001": "An unavailable workspace tool cannot establish current usage. Do not invent a balance.",
    "SCOPE-001": "Server session identity controls workspace access; model parameters cannot authorize it.",
}
