# NEXUS ARCADE

**One Universe. Multiple Minds. Infinite Possibilities.**

A full-stack, bring-your-own-model collaboration platform. Agents receive a shared mission, execute a persistent dependency graph, pass actual model outputs to one another, and produce a traceable synthesis. The interface includes a gaming-inspired landing page, an optional interactive 3D Nexus core, mission control, a backend-derived live network, connection management, custom agents, history, exports, and account security.

> **Integration status:** the application and offline protocol tests are implemented and exercised. No real AI credentials were available in the build environment, so live provider compatibility and live cross-provider collaboration remain **UNVERIFIED**. Offline fixtures are confined to `tests/` and are never imported by application code.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript
- PostgreSQL 17 and parameterized `pg` queries; SQL migrations
- Zod write contracts; opaque database-backed sessions; per-session CSRF
- AES-256-GCM credential encryption; scrypt password hashing
- Durable database worker with leases, bounded retries, token reservations, and abort handling
- Authenticated SSE with persisted event cursors and reconnect/replay
- Three.js / React Three Fiber, Motion, local fonts, local optimized WebP artwork
- Vitest database/API/orchestration tests and Playwright browser tests

## Quick start (local development)

Requirements: Node.js **22.12+**, npm, and a supported platform for the optional embedded PostgreSQL binaries. A managed/external PostgreSQL database can be used instead.

```bash
npm ci
npm run setup                 # creates .env.local with random secrets; never overwrites it
npm run db:start              # keep this terminal open; loopback-only PostgreSQL on 54329
# In a second terminal:
npm run db:migrate
npm run db:check
npm run dev
```

Open **http://localhost:3000**. Create an account, add a provider in **Connections**, enter a model ID, and choose **Save & verify**. Saving a key alone leaves the connection **unverified**. Assign verified connections to at least two agents, then launch a mission.

The embedded database is a development convenience, not a managed production service. Its data lives in `.data/postgres`; do not delete that directory if you want to keep local accounts and missions. On systems where the embedded binaries are unsuitable, set `DATABASE_URL` to your PostgreSQL instance and run only `db:migrate`/`db:check`.

### Environment

See [`.env.example`](.env.example). Important settings:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. On Vercel/serverless, use the Supabase **transaction pooler** (port `6543`) with `sslmode=verify-full`; keep the pool small. |
| `CREDENTIAL_ENCRYPTION_KEY` | Base64-encoded **32-byte** key; back it up securely. Rotation requires re-encrypting stored credentials. |
| `APP_ORIGIN` | Canonical browser origin. Use the exact public HTTPS origin in production, without a trailing slash. |
| `TRUST_PROXY` | Enable only behind a proxy that overwrites forwarded client-IP headers. |
| `DATABASE_SSL`, `DATABASE_CA_CERT` | Verified TLS for managed PostgreSQL when needed. |
| `ALLOW_LOCAL_PROVIDERS` | Development opt-in for loopback HTTP Ollama/LM Studio. Keep `false` on shared servers. |
| `PROVIDER_ORIGIN_ALLOWLIST` | Optional exact, operator-approved origins. This does not disable TLS verification. |
| `NEXUS_DISABLE_WORKER` | Disable the in-process worker, for tests or a separately managed worker deployment. |

AI keys are entered through the authenticated Connection Center, not placed in browser environment variables. They are encrypted on the server and never returned by the API.

## Provider pathways

| Provider | Protocol / endpoint convention |
|---|---|
| OpenAI | OpenAI Chat Completions; base URL normally ends in `/v1` |
| Google Gemini | Gemini `generateContent`; API key sent in the provider header |
| Anthropic | Anthropic Messages; base URL normally ends in `/v1` |
| OpenRouter | OpenAI-compatible Chat Completions; base URL normally ends in `/api/v1` |
| Ollama | Native `/api/chat`; enter the server origin, not `/api/chat` |
| LM Studio | OpenAI-compatible endpoint, normally `http://127.0.0.1:1234/v1` on the **application server's machine** |
| OpenAI-compatible | Explicit protocol selection and custom base URL/model |
| Custom endpoint | One of the four supported wire protocols; arbitrary JavaScript adapters are not executed |

A connection is marked **verified** only after a successful, non-empty generation request. Model discovery is not generation verification. Configuration changes invalidate prior verification. Verification records the tested model; an agent using a different model still needs access to that model.

For a hosted deployment, `localhost` refers to the app container/server, not the visitor's computer. Expose a local model through an operator-controlled HTTPS endpoint or run the app on the same trusted machine. Private-network and metadata addresses are blocked by default; the endpoint resolver pins the validated IP and preserves TLS SNI/certificate identity. Redirects are limited to the same origin.

## Collaboration modes

- **Round Table:** independent findings, cross-examination, synthesis.
- **Debate Arena:** assigned positions, opposition/rebuttal, evidence-aware judgment.
- **Autonomous Mission:** a real planner model proposes a bounded JSON task graph; the server validates agent IDs, dependencies, task count, and acyclicity before executing delegations.
- **Expert Review:** production, independent review, revision, synthesis.
- **Human-Guided:** persisted guidance and an approval gate before final synthesis.

Every mission snapshots its squad, records task inputs/outputs and handoffs, reserves budget before calls, bounds attempts, and stores usage/evidence. Pause/cancel abort in-flight requests and conservatively settle outstanding reservations as **explicitly labeled estimates**. Interrupted work requires explicit resume. A completed animation or a saved key is never treated as mission success.

The platform does **not** execute generated code, browse the web, or provide tool sandboxes to agents. Model text is treated as untrusted content and rendered through a constrained Markdown component.

## Application routes

- Public: `/`, `/login`, `/signup`
- Workspace: `/dashboard`, `/connections`, `/agents`, `/missions`, `/missions/new`, `/missions/[id]`, `/network`, `/archive`, `/settings`, `/profile`
- API: `/api/auth/*`, `/api/profile`, `/api/preferences`, `/api/dashboard`, `/api/providers/*`, `/api/agents/*`, `/api/missions/*`, `/api/health`

Mission exports are available as JSON and Markdown. History supports title/brief search, status filters, pagination, and reopening. The network graph is derived from persisted tasks/dependencies/statuses, not a decorative timer.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test                      # destructive operations guarded to a *_test database
npm run test:e2e              # Playwright; starts/reuses the app on port 3000
npm run build
npm run test:e2e:workflow     # standalone production build + isolated *_test DB + offline HTTP endpoint
npm run db:check
```

`npm run check` runs lint, typecheck, offline tests, and the production build. Workspace browser tests use real signup/login and application APIs; they save an explicitly fake key **without verification** and assert launch gating.

The separate workflow suite starts the **actual standalone production server** on port 3100 against `nexus_browser_test` (or `WORKFLOW_DATABASE_URL`, which must end in `_test`). It resets only that test database, enables loopback HTTP only in that test process, and runs a clearly labeled endpoint on port 3101. It exercises real browser/API/worker/HTTP round trips: generation-based verification, SSE, guidance/approval, synthesis/export/archive/network, pause/resume/cancel, provider failure, and password-change session revocation. Its deterministic `OFFLINE_HTTP_FIXTURE` responses are test evidence, **not live AI provider verification**. Build first; do not run it against a production database.

### Chromium in minimal Linux environments

`test:e2e` uses the already-installed `@sparticuz/chromium` binary. The launcher automatically uses optional `.data/browser-libs` when present. Normal hosts should install Playwright's browser/system dependencies (`npx playwright install --with-deps chromium`) and may set `CHROMIUM_EXECUTABLE_PATH` to a system browser. The test configuration deliberately removes Lambda convenience flags that disable web security, so Origin/CSRF behavior is tested honestly.

### Opt-in live integration test

**This makes real, potentially billable requests.** Use a dedicated test database whose name ends in `_test`, and set two real provider configurations in `.env.local`:

```dotenv
NEXUS_RUN_LIVE_TESTS=true
NEXUS_LIVE_PROVIDER_A=openai
NEXUS_LIVE_KEY_A=<real key>
NEXUS_LIVE_MODEL_A=<accessible model>
NEXUS_LIVE_PROVIDER_B=anthropic
NEXUS_LIVE_KEY_B=<real key>
NEXUS_LIVE_MODEL_B=<accessible model>
# Optional custom base URLs:
# NEXUS_LIVE_BASE_A=
# NEXUS_LIVE_BASE_B=
TEST_DATABASE_URL=postgresql://.../nexus_test
```

Then run:

```bash
npm run test:live
```

The test verifies both providers, assigns them to separate agents, runs a persisted Round Table mission, and checks real outputs/evidence/usage. Without the explicit flag and complete credentials it **skips**; a skip is not a pass. Do not paste keys into issues, logs, or source control.

## Deployment

### Recommended: one long-running Node container + managed PostgreSQL

The repository includes a multi-stage, non-root `Dockerfile` using Next's standalone output. The in-process worker is appropriate for a single always-on instance.

1. Provision PostgreSQL and apply `migrations/` in order using `npm run db:migrate`.
2. Inject `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEY`, and the exact public HTTPS `APP_ORIGIN`.
3. Build/start the container; it binds to `0.0.0.0:3000`.
4. Terminate TLS at a trusted reverse proxy. Set `TRUST_PROXY=true` only if that proxy overwrites forwarded headers.
5. Preserve PostgreSQL backups and the encryption key separately. Check `/api/health` and run the live integration test with test credentials before opening access.

A local Compose example is provided:

```bash
# Set POSTGRES_PASSWORD, CREDENTIAL_ENCRYPTION_KEY, APP_ORIGIN in .env.local first.
docker compose --env-file .env.local up --build
```

Compose runs PostgreSQL, a one-shot migration job, and the app. It binds the published app port to loopback; put TLS termination in front for public use. The Compose file and Docker image were prepared but **not executed in the build sandbox** (no Docker daemon).

### Serverless caution

A normal Vercel request lifecycle is not a durable mission worker. Do not deploy the UI to an ephemeral function and assume queued missions will finish. Use an always-on Node host for this architecture, or set `NEXUS_DISABLE_WORKER=true` on the web tier and run `npm run worker` as a separately supervised long-running service with the same database and encryption key. The worker entry point validates database connectivity and handles SIGINT/SIGTERM. SSE also requires a host/proxy that supports long-lived, unbuffered responses. Supabase/managed PostgreSQL can supply the database; apply the SQL migrations and use verified TLS.

### Current Vercel production deployment

The public production origin is **https://nexus-agent-collab.vercel.app**. It uses a dedicated Supabase project (`Nexus Arcade`, ref `xguxwwztdswaapjkoafn`, us-east-1, free tier) and Vercel production environment variables only:

- `APP_ORIGIN=https://nexus-agent-collab.vercel.app`
- `DATABASE_URL`: Supabase shared **transaction** pooler, port `6543`, user `postgres.<project-ref>`, `sslmode=verify-full`
- `DATABASE_CA_CERT`: Supabase Root 2021 CA PEM used for verified TLS
- `CREDENTIAL_ENCRYPTION_KEY`: sensitive 32-byte base64 key
- `TRUST_PROXY=true` (Vercel overwrites `X-Forwarded-For` at the edge)
- `NEXUS_DISABLE_WORKER=true` (serverless web tier; run a separate supervised worker for missions)
- `ALLOW_LOCAL_PROVIDERS=false`

The original production signup `403` was caused by a missing `APP_ORIGIN`, not by disabled CSRF or a frontend workaround. The fix preserved the exact-origin allowlist and CSRF checks. Database connectivity also required the correct pooler tenant host, verified TLS CA handling, and transaction-mode pooling so concurrent serverless instances do not exhaust session-mode clients.

A real production signup, duplicate-email rejection, invalid-input rejection, cross-origin rejection, session creation, protected APIs, dashboard auto-login, refresh persistence, protected route navigation, logout/revocation, and browser login were verified against the public origin using Chromium in GitHub Actions. The temporary diagnostic/verification workflows and evidence files were removed after the run; the sanitized result is recorded in `ENGINEERING_REPORT.md`.

## Security boundaries

- Passwords: salted scrypt; opaque session tokens stored only as hashes; HttpOnly/SameSite cookies; Secure in production/HTTPS.
- Mutations: canonical-origin checks plus per-session CSRF; owner-scoped queries; strict Zod contracts and request-size limits.
- Credentials: AES-256-GCM with user/connection associated data; masked UI hints; redacted provider errors.
- Provider transport: public-address DNS validation, IP pinning, TLS identity checks, metadata/private-network denial, same-origin redirect limits, response/time/size limits.
- Database: foreign keys, checks, unique constraints, transactions, indexed mission/event access, migration ledger.
- Headers: CSP, frame denial, nosniff, referrer policy, permissions policy, HSTS in production. The current CSP permits inline/eval scripts for framework compatibility; a nonce/hash-based CSP is a recommended future hardening step.
- Rate limits are PostgreSQL-backed. Multi-instance deployments share them through the same database.

This is a deployable application baseline, not a claim of independent security certification. Perform threat modeling, dependency auditing, backup/restore drills, load tests, and live provider acceptance tests for your target environment.

## Known limitations

- **Live AI integration is unverified here** because real keys/models were not supplied.
- No email verification/recovery service, billing/subscription system, organization/RBAC layer, or MFA is configured.
- No generated-code execution, browsing, file-upload ingestion, or external tool sandbox is included.
- Token estimates are conservative when a provider omits usage; they are labeled and are not billing statements.
- Provider verification tests the configured default model, not every model in an account.
- The 3D hero is a clearly labeled concept, not live agent telemetry. Reduced-motion users receive local static artwork; the app does not depend on WebGL.
- Browser coverage includes desktop/mobile landing, auth, connections, agent assignment, mission-launch gating, settings/profile, protected routes, and an isolated production-build workflow suite. It is not an exhaustive accessibility or cross-browser audit.

See [`ENGINEERING_REPORT.md`](ENGINEERING_REPORT.md) for the exact executed checks, fixes, architecture, and remaining acceptance work.
