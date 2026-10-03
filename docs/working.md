# Working record

## Changelog

### 2026-10-03
- Defined a developer-support demo around real ElevenAgents, local tools and explicit case approval.
- Started with public-safe scaffolding and synthetic account data.
- Existing key returned HTTP 401 missing_permissions for Agents listing; permission update requested while local implementation continues.

## Lessons Learned
- HTTP 401 must be interpreted with the provider's error category; key loading and product permissions are separate.
- Tool execution and human approval are separate boundaries.
