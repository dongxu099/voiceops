# Integration tradeoffs

The managed agent provides speech orchestration, turn handling and a supported browser connection. The local application controls workspace identity, typed support operations and confirmation. This keeps sensitive action authority in application code and gives the presenter a trace they can inspect.

The short support policy uses a managed knowledge document in `prompt` mode. Its entire content is small enough to include directly; this avoids claiming that a four-section document demonstrates large-scale retrieval quality. A larger corpus would need RAG evaluation, freshness/versioning and citation tests.

Client tools fit a localhost application with application-owned state. They depend on the browser staying connected. A production deployment might prefer authenticated server tools or a gateway, with audited tenant identity, timeout policies and idempotency keys. Tool schema validation controls shape, not truth: model choices and spoken claims still need live evaluation.

The UI projection is elapsed voice time multiplied by a dated additional-minute list rate. It excludes LLM charges and subscription allowances. Provider conversation metadata is a better source for settled conversation usage, while an account invoice establishes actual cash charges. A duration limit does not establish a strict dollar cap.

Preview is useful for rehearsing the workflow and demonstrating backend controls when permissions or microphones are unavailable. It is explicitly deterministic. It must not be used as evidence for ElevenAgents latency, model accuracy, speech quality or interruption handling.

SQLite transactions protect confirmation in this single-process local app. The app validates loopback Host, same Origin and request size, but localhost is not application authentication. Multi-user deployment needs authenticated sessions, tenant authorization on every request, distributed concurrency controls and a durable idempotency store. A same-agent provider conversation check narrows telemetry access; production also needs verified per-user conversation ownership.

Cloud setup checkpoints successful resource IDs. If a provider creates a resource but the response is lost, inspect the dashboard and reconcile local state before retrying setup; an automatic retry could create a duplicate. No cloud cleanup command is provided because deleting an agent or knowledge document is a separate destructive action.
