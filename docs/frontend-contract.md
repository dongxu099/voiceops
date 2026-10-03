# Frontend / backend contract

All routes are same-origin under `/api`. Error responses use `{detail: string}` with sanitized text. Frontend must not persist bearer tokens, signed URLs or raw SDK errors.

- `GET /api/config`: `{product_name, key_loaded, agent_provisioned, cloud_status, max_session_seconds, voice_rate_per_minute, price_note}`. cloud_status is `not_configured`, `ready`, or `missing_permissions`.
- `GET /api/scenarios`: array of `{id, title, description, first_user_message, workspace_id}`. IDs: `permissions`, `quota`, `outage`, `escalation`.
- `POST /api/sessions` body `{scenario_id, mode}` with mode `preview`, `text`, or `voice`; returns a full session.
- `GET /api/sessions/{id}`: `{id, scenario_id, mode, status, workspace, messages, events, pending_actions, cases, metrics, provider_conversation_id}`. Messages: `{role: user|agent|system, text}`. Workspace: `{id,name,plan,monthly_limit,used_requests,rate_limit_per_minute}`.
- `POST /api/sessions/{id}/connect` body `{transport: websocket|webrtc}` returns `{signed_url}` or `{conversation_token}`. SDK sessions use dynamicVariables `{workspace_id: session.workspace.id}`. Text uses textOnly mode; voice requires a deliberate click and microphone disclosure.
- `POST /api/sessions/{id}/tools` body `{tool_name, parameters}` returns `{result, event}`. Registered client tool names: `lookup_workspace`, `diagnose_error`, `estimate_monthly_cost`, `prepare_support_case`. Log duration/status from the returned event; then refresh the session. SDK callback returns `JSON.stringify(result)`.
- `POST /api/sessions/{id}/preview` body `{message}` returns a full session, using a clearly labeled deterministic path.
- `POST /api/sessions/{id}/confirm/{action_id}` with no body returns `{case, session}`. Show pending action summary and priority before this human button. After success, `sendContextualUpdate` may report actual case ID to the live agent.
- `POST /api/sessions/{id}/messages` body `{role,text}` appends final SDK messages, returns `{ok:true}`.
- `POST /api/sessions/{id}/provider` body `{conversation_id}` records the SDK conversation ID, returns `{ok:true}`.
- `POST /api/sessions/{id}/end` returns a full session. End the SDK conversation first.
- `GET /api/sessions/{id}/provider-report` returns sanitized provider usage or a clear unavailable state; optional read permission may be absent.

Events: `{id, type, tool_name, status: success|error|awaiting_confirmation, duration_ms, parameters, result, source_ids}`. Pending actions: `{id,summary,priority,status}`. Cases: `{id,summary,priority,status}`. Metrics: `{tool_calls, tool_failures, elapsed_seconds, estimated_voice_usd, price_note}`. Price is a dated local projection, never an enforced provider spending cap.

Live mode and guided preview must be visually distinct. Voice/text connection errors must keep the trace and existing outputs. Do not auto-reconnect paid sessions. A 90-second session limit applies in cloud config and the browser. The UI should allow a user to stop the conversation early.
