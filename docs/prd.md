# VoiceOps Desk

A voice support agent for the fictional Northstar Cloud developer platform. The customer can explain an authentication or quota problem, get a grounded diagnosis, inspect account-specific facts and approve a support case. A presenter can show the integration boundary, tool execution, failure handling and cost assumptions in one short demonstration.

The product uses real ElevenAgents orchestration and browser voice/chat connections. A separately labeled guided preview runs deterministic scenarios using the same backend tools, without provider credentials or spending. It must never be presented as a live AI conversation.

Acceptance criteria:

- Authenticated private-agent voice and text sessions through the official SDK; key stays on the server.
- Knowledge-grounded support answers and local client tools for workspace lookup, error diagnosis, cost forecast and support-case preparation.
- Tool trace includes arguments, measured duration, result and source references. Failures produce an explicit recoverable state.
- Case creation requires a separate human review action. Replayed confirmation creates one case.
- Customer tools are bound to the session's fictional workspace, regardless of model-supplied account IDs.
- Session duration and price projections are visible; provider-reported billing units remain separate.
- Four short presenter scenarios: 401 diagnosis, quota/cost planning, unavailable account service and approval-required escalation.
- Real voice, chat, preview and offline test evidence are clearly distinguished.

No telephone calls, outbound messages, real refunds or real customer accounts are part of this release.
