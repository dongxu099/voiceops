# Working record

## Changelog

### 2026-10-03
- Defined a developer-support demo around real ElevenAgents, local tools and explicit case approval.
- Started with public-safe scaffolding and synthetic account data.
- Existing key returned HTTP 401 missing_permissions for Agents listing; permission update requested while local implementation continues.

## Lessons Learned
- HTTP 401 must be interpreted with the provider's error category; key loading and product permissions are separate.
- Tool execution and human approval are separate boundaries.
# Implementation checkpoint — 2026-10-03

FastAPI, SQLite fixtures, four typed client tools, atomic human confirmation and credential-safe private connection routes implemented. Cloud provisioning registers separate tool resources and attaches a small synthetic policy in prompt mode. CLI: doctor, provision, serve. Final checks: 21 offline tests, Ruff and frontend build passed; four preview scenarios and 390-pixel responsive layout checked in the browser, with no console errors. A synthetic screenshot is included in the README.

Read-only live preflight: HTTP 401 missing_permissions, so no cloud agent or charged conversation has been created. Permission changes are pending with the user. Preview runs without credentials and does not measure model/speech quality. Current additional-minute voice projection: $0.08/min plus LLM, verified 2026-10-03; provider cost_fiat is USD while legacy cost remains raw.

Independent review fixes: validate current cloud authentication/duration/tools before connection admission; start timing from SDK onConnect; release local lock during provider I/O and preserve an intervening Stop. Frontend closes transports on post-start synchronization errors, hides unavailable account usage, records typed messages exactly once and distinguishes missing fiat cost from zero.
