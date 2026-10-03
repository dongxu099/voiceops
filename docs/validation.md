# Validation record

Date: 2026-10-03. Do not equate local preview tests with a real speech evaluation.

| Layer | Status | Evidence / limit |
| --- | --- | --- |
| Backend | Passed | 21 offline pytest cases; Ruff passed. |
| Cloud transport | Mock tested | Private connection capabilities remain transient; sanitized errors; reject telemetry from another agent. |
| Provisioning | Mock tested | Persist document/tool IDs; resume partial setup; repeated setup does not duplicate confirmed resources. |
| Tool authorization | Passed | Model account ID cannot access another fixture; unknown tools and malformed arguments are rejected/audited. |
| Human action | Passed | Preparation creates zero cases; eight concurrent confirmations create one case; another session cannot confirm it. |
| Guided preview | Passed | Four scenarios checked in the browser; inspectable 401/quota results, explicit outage, preparation then human confirmation. |
| Responsive UI | Passed | 390-pixel viewport; document width 390, no horizontal overflow; desktop layout checked. |
| Browser console | Passed | No warnings/errors observed during local preview acceptance. |
| Frontend build | Passed | TypeScript/Vite build; official SDK lazy loaded. Non-blocking SDK chunk-size warning. |
| Live provider | Blocked | Read-only Agents preflight returned HTTP 401 `missing_permissions`. |
| Real voice / interruption | Not tested | Requires a provisioned agent and deliberate microphone interaction. |
| Competitor quality / latency | Not tested | Rate-card comparison only. |

The offline suite covers workflow and security boundaries, not language-model correctness. The Starlette TestClient emits an upstream deprecation warning for its httpx integration; the current tests pass.

An independent review identified cloud configuration drift, premature usage timing and a global lock around external I/O. The final implementation verifies the cloud agent before admission, starts the clock from SDK onConnect acknowledgment and releases the store lock for network calls. Regression tests cover drift rejection and stopping while admission is pending. Connection-after-start failure handling was reviewed in code and built, but has not been exercised with a paid SDK session.

## Opt-in live evaluation checklist

1. Enable ElevenAgents and Knowledge Base read/write for the server key; re-run doctor and provision. Restart the server if the Keychain item changed.
2. Start **Live text**, run the 401 and approval scripts. Inspect actual tools and final claims. Record provider conversation usage after processing completes.
3. Start **Voice** deliberately. Speak a short synthetic issue, interrupt the answer once and stop early. Record time-to-first-audio and interruption behavior separately from total session duration.
4. Exercise outage and account-boundary prompts. Record both successful controls and model failures; a prompt alone is not an authorization barrier.
5. Save transcripts and raw usage only in ignored local `output/`. Publish synthetic aggregate outcomes only after checking ownership and redacting resource/account identifiers.

Suggested initial budget: four sessions of at most 90 seconds, up to $0.48 of undiscounted platform usage plus LLM. This is a planning estimate, not a hard provider spending cap. There are no automatic paid retries. API/SDK traces must not persist keys, signed URLs or conversation tokens.
