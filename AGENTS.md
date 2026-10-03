# VoiceOps Desk

Python FastAPI backend lives in `src/voiceops/`; React/Vite/TypeScript frontend in `frontend/`. Synthetic knowledge is in `knowledge/`; all runtime state, cloud resource IDs and reports belong in ignored `data/` or `output/`.

This is a public portfolio project. Never commit API keys, signed URLs, conversation tokens, account diagnostics, personal interview material or real customer records. Use only fictional examples. Read root workspace instructions when working locally; portable instructions must not contain local paths or private key aliases.

Run Ruff, offline pytest and the frontend build before publishing. Live provider tests are opt-in, budgeted and absent from CI. Report measured and simulated results separately. Update `docs/working.md` when behavior or validation changes. Commit scaffold, implementation and validation as separate steps.

Cloud setup must create only this demo's resources and persist their IDs locally to avoid duplicate provisioning. Do not modify unrelated agents. Do not retry a possibly charged conversation automatically. Never expose the server API key to the browser. Client tool arguments do not authorize workspace access or writes; the backend binds the demo workspace and a human confirmation controls case creation.
