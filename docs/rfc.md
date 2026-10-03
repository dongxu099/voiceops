# Architecture

The React browser connects to a private ElevenAgents agent using a short-lived WebRTC conversation token for voice, or a signed WebSocket URL for text. FastAPI obtains these with a server-side API key. The managed agent uses a synthetic support knowledge document and calls registered client tools. SDK callbacks forward those calls to loopback FastAPI, which executes typed operations against fictional SQLite state and appends an audit event.

Case preparation returns a pending action. A separate UI confirmation endpoint commits a local support case; this endpoint is not an agent tool. A unique pending-action ID provides idempotence. Workspace identity comes from the server session, never from model arguments.

FastAPI serves the built frontend on loopback port 7861, validates Host/Origin and limits body size. This is a personal local demo. Public deployment would require application authentication, tenant isolation, durable session admission, secret rotation, quotas and storage retention controls.

Cloud setup is a CLI operation. Created agent/document IDs are stored in ignored local state; repeat setup inspects existing resources. No unrelated account resources are changed. Conversation telemetry must be fetched only for the configured demo agent and stored locally. Providers' cost fields are retained in their documented units; missing invoice data is null.

The guided preview is a deterministic presenter path using the real local tool service. It provides a usable demo when microphone access, credentials or network are unavailable, but does not establish provider latency or speech quality.
