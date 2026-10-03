# Validation

Offline tests cover workspace binding, knowledge references, typed tool inputs, service failure behavior, human confirmation, idempotence, Host/Origin checks, credential redaction and provider HTTP contracts. The frontend must typecheck/build and be inspected in a real browser at desktop and narrow widths.

Opt-in live checks provision the private demo agent, connect to the managed text conversation, observe real client tool calls and check native knowledge behavior. Voice requires explicit microphone interaction; text-only or simulated results must not be described as a voice end-to-end test. No paid request runs in CI.

Collect measured response/tool timings, provider conversation usage and local price projections separately. Set a short session duration and a small total test budget. Never retry an uncertain billed session silently.
