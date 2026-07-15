# SocialOps Provider Design

Goal: local-first provider/account pool for SocialOps Hub, kept as a thin AiToEarn custom layer.

## Implemented Slice
- Provider registry stays in `aitoearn-ai` providers module.
- Provider accounts store credentials only in `credentialsEnc`; list/select responses redact secrets and expose `hasCredentials`.
- Auth modes include `oauth`, `api_key`, `cookie_import`, `extension`, `cdp_profile`, `builtin_relay`, and `9router`.
- Cookie import parses `username|password|2fa|email|cookie-string` and stores parsed data encrypted.
- Account selection supports provider/capability validation and least-used/round-robin strategy.
- Health endpoint updates `lastHealthStatus`, `lastHealthAt`, `failCount`, `status`, and cooldown.
- 9router health runs from container via `host.docker.internal` when stored base URL is localhost.

## Still Required
- Real provider router execution wrapper: execute -> mark success/fail -> retry next account.
- Workflow step executor and artifact storage.
- CDP/extension automation runners and screenshot artifacts.
- Durable Docker image rebuild path; current runtime uses selective JS hotpatch.
