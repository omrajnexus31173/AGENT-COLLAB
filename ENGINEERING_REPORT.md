# NEXUS ARCADE — Engineering Report

Date: 2026-11-14\
Branch: `arena/8fa25593-agent-collab`\
Repository: `omrajnexus31173/AGENT-COLLAB`

## Executive status

Implemented a full-stack multi-AI collaboration platform with a durable PostgreSQL orchestration engine, real provider adapters, authenticated workspace, connection verification, five collaboration modes, mission control, backend-derived network visualization, history/export, account/settings/profile management, and a responsive gaming-inspired interface.

**Release qualification: suitable for operator-run live acceptance testing, not a claim that live AI integrations are verified.** No real provider credentials were available. Offline tests use explicitly labeled protocol fixtures only. Application code has no fixture fallback and never fabricates model responses, verification, scores, or completion.

## Production signup incident addendum — 2026-11-15

Branch: `arena/187a72ae-agent-collab`\
Public origin: `https://nexus-agent-collab.vercel.app`\
Verified production deployment: `dpl_D5QsZ5hwjZK7tSorRxABmM5vdHAf` (commit `8dc89da`, target `production`, READY/PROMOTED, canonical alias assigned)

### Exact root cause

The original `POST /api/auth/signup → 403` was returned by the application, not by Vercel auth or a generic platform block. The captured response body was:

```json
{"error":"This origin is not allowed. Check APP_ORIGIN.","code":"ORIGIN_REJECTED"}
```

The production deployment had **no environment variables**. `assertOrigin()` in `src/lib/server/http.ts` fails closed in production when `APP_ORIGIN` is unset, so every signup was rejected. `/api/health` separately returned `503` because `DATABASE_URL` was also missing.

### Smallest safe fix

- Provisioned a **new dedicated Supabase project** for Nexus Arcade (`xguxwwztdswaapjkoafn`), rather than restoring/repurposing NEXUS EDUVERSE.
- Applied migrations `001_initial.sql`, `002_session_csrf.sql`, and `003_supabase_api_lockdown.sql`; verified 15 tables, 34 indexes, RLS enabled on all public app tables, and no `anon`/`authenticated` table grants.
- Set production-only Vercel env vars: `APP_ORIGIN`, `DATABASE_URL`, `DATABASE_CA_CERT`, `CREDENTIAL_ENCRYPTION_KEY`, `TRUST_PROXY=true`, `NEXUS_DISABLE_WORKER=true`, `ALLOW_LOCAL_PROVIDERS=false`. No secret values are recorded here.
- Corrected the managed database path to the verified Supabase pooler tenant host and switched the serverless web tier to the **transaction pooler** (`6543`) after session-mode client exhaustion caused intermittent `500`s.
- Fixed `pg` TLS option precedence in `src/lib/server/db.ts`: URL `sslmode` parameters no longer silently replace the explicit verified `ssl` object/CA. Added `tests/db-config.test.ts`.
- Bounded each serverless pool to `max: 5`, `idleTimeoutMillis: 10000`, `connectionTimeoutMillis: 10000`.
- Added valid `public/favicon.ico` and `public/icon.png`, plus layout icon metadata.
- Replaced the app-owned deprecated `THREE.Clock` usage with `THREE.Timer` in `src/components/nexus-scene.tsx` (three `0.187.0`). React Three Fiber's internal clock was left untouched because it is dependency-owned.
- Did **not** disable authentication, remove CSRF/origin checks, allow arbitrary origins, bypass rate limits, hardcode signup, or hide the error in the frontend.

### Production verification actually executed

External Chromium verification ran in GitHub Actions against the public production origin because the sandbox could not POST to Vercel directly and local Chromium was environment-blocked. Final successful run: `43750057224`, conclusion `success`, evidence recorded at `2026-11-15T19:02:42.435Z`.

| Check | Result |
|---|---|
| `/api/health` | **200** `{"status":"ok"}` |
| `/favicon.ico` | **200**, valid ICO magic, 13,008 bytes |
| Invalid signup | **422** `VALIDATION_ERROR` |
| Cross-origin signup | **403** `ORIGIN_REJECTED` |
| Real production signup | **201**, user created, session cookie + CSRF token returned |
| Session cookie flags | HttpOnly, Secure, SameSite=Lax, Path=/ |
| Duplicate email | **409** `CONFLICT` |
| Signup session | **200**, authenticated user matches signup |
| Protected dashboard API | **200**, 6 starter agents |
| Protected agents API | **200**, 6 agents |
| Missing CSRF mutation | **403** `CSRF_REJECTED` |
| CSRF-protected preferences mutation | **200** |
| Unauthenticated protected API | **401** |
| 3D scene | 1 canvas, concept label present, node interaction works |
| Landing browser errors | none (page/console/failed responses) |
| Dashboard auto-login | pass |
| Refresh persistence | pass |
| Protected `/connections` route | **200**, heading rendered |
| Browser logout | pass |
| Logout server revocation | old session no longer authenticates |
| Browser login | **200** login API, dashboard rendered |
| Login session cookie | HttpOnly, Secure, SameSite=Lax |
| Authenticated browser page errors | none |

Temporary verification account: `nexus-verification-1794769347996-40890189@example.com` (user id `1dc9f06c-98f9-4cde-acdc-66cb4a42a6d6`). The password was generated in the runner and never persisted. Temporary diagnostic/verification workflows and JSON evidence files were deleted after capture.

### Current local gates after the fix

- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm test`: **57/57 pass**, 8 files (added managed PostgreSQL TLS/pool configuration tests)
- `npm run db:migrate`: migrations 001–003 already applied locally
- `npm run db:check`: 15 tables, 34 indexes, PostgreSQL 17.6
- `npm run build`: pass, Next.js 16.4.6, 16 static pages
- Local `npm run test:e2e`: **environment-blocked**, not an application pass. Sandbox glibc 2.36 cannot satisfy the available Chromium NSS/GLIBC symbol sets; browser coverage was moved to GitHub Actions production verification.

### Remaining limitations

- `NEXUS_DISABLE_WORKER=true` on Vercel: missions can be created/queued but the durable runner requires a separate always-on worker host. This is independent of the signup fix.
- Live AI provider generation remains unverified without operator-supplied keys/models.
- Supabase free-tier pooler/compute limits still apply; the app now uses transaction pooling and small per-instance pools.
- The production deployment was verified at commit `8dc89da`; later documentation/cleanup commits do not change runtime application code.

## What was built

### Experience and interface

- Dark multiverse identity with restrained purple/blue/cyan accents, local variable fonts, consistent spacing/components, and purposeful motion.
- Landing page with navigation, Nexus hero, collaboration explanation, provider ecosystem, squad, interactive workflow/mode preview, debate explanation, backend-network explanation, mission examples, security, capabilities, CTA, and footer.
- Lazy Three.js/React Three Fiber core with orbiting entities, pathways, particles, pointer response, selectable concept nodes, mobile simplification, reduced-motion handling, and local static fallback. The concept is explicitly labeled and is not presented as live telemetry.
- Dashboard, Connection Center, agent roster/editor, mission creation/detail, live network, archive/search/filter/pagination, settings, profile, active-session revocation, and password change.
- Loading, empty, success, error, disabled, unverified, reconnecting, paused, interrupted, failed, and completed states.
- Local optimized WebP character/core artwork. Original generated PNGs are retained under `design-assets/`, outside the public runtime payload.

### Backend and data

- Next.js App Router API routes and server-rendered protected workspace.
- PostgreSQL schema with users, sessions, preferences, provider connections, agents, missions, tasks, dependencies, messages, events, outputs, usage, audit logs, and rate limits.
- SQL migrations `001_initial.sql` and `002_session_csrf.sql`, with a migration ledger and schema check script.
- Transactional mission creation, agent snapshots, task graphs, context handoffs, usage settlement, and output/evidence persistence.
- Worker claims use `FOR UPDATE SKIP LOCKED`, per-execution fencing tokens, leases, heartbeats, bounded concurrency, explicit recovery, and abort propagation. A stale same-process execution cannot commit over a recovered/resumed attempt.
- Authenticated SSE ordered by a bigint event cursor, with heartbeat, session recheck, replay, client deduplication, and reconnect state.

### Providers and orchestration

- OpenAI, Gemini, Anthropic, OpenRouter, Ollama, LM Studio, OpenAI-compatible, and custom endpoints using four explicit wire protocols.
- Server-only encrypted credentials, masked hints, model discovery, real generation-based verification, disconnect/status handling, and verification invalidation on configuration changes.
- Round Table, Debate Arena, Autonomous Mission, Expert Review, and Human-Guided modes.
- Autonomous planning is constrained JSON generated by a real model; the server validates IDs, dependencies, task bounds, and acyclicity. No arbitrary planner code is executed.
- Shared context contains actual completed dependency outputs and persisted human guidance. Retries, timeouts, token reservations, iteration limits, approval gates, pause/resume/cancel, and failure states are enforced.
- Final synthesis appends recorded task/model/request evidence and explicitly states that no code-execution or browsing tools were available.

## Architecture decisions

1. **PostgreSQL is the source of truth.** UI animation never determines mission success. Mission/task state, messages, usage, and events are persisted before the UI presents them.
2. **One durable runner architecture.** The default worker runs inside an always-on Node process. Serverless web hosting requires a separate supervised worker; this is documented rather than hidden.
3. **Strict write contracts.** Read models may contain database metadata; browser writes project only contract fields. Regression tests cover agent update/delete and mission detail/export routes.
4. **Verification is evidence, not configuration.** A saved key starts unverified. Only a successful non-empty provider generation can mark the tested connection verified.
5. **Budget safety over optimistic completion.** Calls reserve estimated input plus configured output capacity. Missing usage and interrupted calls are labeled estimates; failed missions do not receive fabricated outputs.
6. **Local assets and graceful degradation.** Fonts/artwork are local; the app remains usable without WebGL or motion.

## Security implementation

- Scrypt password hashes with per-password salts and timing-equalized invalid-login handling.
- Opaque random session tokens; only token hashes are stored. Seven-day expiry; HttpOnly, SameSite=Lax, Secure in production/HTTPS; server-side logout/revocation.
- Per-session CSRF tokens, canonical production origin allowlist, strict JSON validation, body-size limits, and PostgreSQL-backed rate limits.
- Owner-scoped database access for providers, agents, missions, streams, and exports.
- AES-256-GCM credential encryption with user/connection associated data. Keys are not returned to the browser or written to logs.
- Provider SSRF controls: HTTP(S) only, public-address DNS checks, validated-IP pinning, TLS SNI/certificate identity, metadata/private/reserved-address denial, explicit loopback opt-in, exact-origin operator allowlist, same-origin redirect cap, time/size limits.
- CSP, nosniff, frame denial, referrer/permissions policies, and production HSTS.
- No host-side execution of generated/user code. Markdown output does not enable raw HTML execution.

Remaining hardening for a public launch: nonce/hash-based CSP (current framework-compatible CSP allows inline/eval), MFA, email recovery, organization/RBAC if needed, independent security review, load/chaos testing, and backup/restore drills.

## Actually executed verification

The following were executed in this workspace. Final gate run: 2026-11-14, 19:42–19:44 UTC. Timings are reported runner durations, not performance guarantees.

| Check | Result | Evidence / scope |
|---|---|---|
| `npm run lint` | **PASS** | ESLint; final run after fixes reported no errors/warnings |
| `npm run typecheck` | **PASS** | Strict TypeScript across app, scripts, and tests |
| `npm test` | **52/52 PASS**, 7 files | Crypto 5, providers 9, security 6, plans 9, provider-service 3, API 7, orchestration 13; includes stale-execution fencing regression; 15.40s |
| `npm run test:e2e` | **4/4 PASS** | Desktop landing/assets/workflow/reduced-motion; signup/refresh/protected routes/connections/agent assignment/launch gating/settings/profile/logout/login; mobile overflow/navigation/dialog; invalid credentials; 35.2s |
| `npm run test:e2e:workflow` | **3/3 PASS** | Actual standalone production server, isolated PostgreSQL test DB, real HTTP transport against explicit offline endpoint; guided execution/SSE/guidance/approval/synthesis/export/archive/network; pause/resume/cancel; honest failure; cross-session password revocation; 59.9s |
| `npm audit` | **PASS** | 0 reported vulnerabilities after targeted compatible minimatch override; not an independent security certification |
| Docker/Compose static validation | **PASS** | YAML parsed, service dependencies/migration command and Dockerfile non-root/standalone invariants checked; no container execution |
| `npm run build` | **PASS** | Next.js 16.4.6 production build; 16 static pages generated; standalone output |
| `npm run db:migrate` | **PASS** | Migrations 001 and 002 applied to local PostgreSQL |
| `npm run db:check` | **PASS** | 15 required tables, 34 indexes, PostgreSQL 17.6, event log readable |
| `npm run test:live` | **SKIPPED (1)** | Explicit opt-in flag/real credentials absent. This is not reported as a live pass. |
| Browser screenshot inspection | **DONE** | Landing, dashboard, mobile landing/connection, and completed workflow-network screenshots inspected. The apparent clipped landing pill was the off-screen skip link composited at a scrolled full-page capture offset; capture now resets scroll. |
| Browser/server log inspection | **DONE** | Fixed development-origin configuration, missing-key warnings, and a reduced-motion hydration mismatch; landing console/page-error assertion added |
| Dedicated worker process | **PASS** | `npm run worker` started against PostgreSQL and was stopped cleanly; no web port required |
| Docker/Compose execution | **NOT RUN** | No Docker daemon available; files are deployment preparation only |
| Cloud deployment | **SUPERSEDED** | Original build did not create cloud resources; see the 2026-11-15 production signup incident addendum for the verified Vercel/Supabase deployment |

### Important defects found and fixed during verification

- Chromium initially could not launch in the minimal sandbox because NSS/NSPR libraries were absent. Test-only compatibility libraries were placed under ignored `.data/browser-libs`; they are not application dependencies or committed artifacts.
- Lambda convenience flags disabled browser web security and suppressed Origin headers. Playwright now removes those flags and exercises the actual CSRF boundary.
- Next development origin configuration blocked local browser resources; exact loopback development origins were added without weakening production origin checks.
- Agent editing sent read-only metadata into a strict write contract; the UI now projects write fields only.
- Agent update/delete SQL parameter order was corrected and covered by API regression tests.
- An unused owner-scoped mission helper had reversed parameters; corrected during query audit.
- The default-model input received an explicit accessible name/description association.
- Landing content is visible by default; reduced-motion rendering no longer creates a server/client style mismatch. Mapped motion elements have stable keys before spreads.
- Worker recovery now uses a fresh fencing token per claim and records it in the task input snapshot. A regression exercises a delayed stale execution overlapping a recovered/resumed execution in the same process.
- The E2E launcher owns the optional vendored-library path; a separate production workflow harness isolates destructive state and local-provider opt-in from the development app.
- Compose migration copies only migration inputs, not host dependencies, data directories, or secret files. A dedicated `npm run worker` entry point supports web/worker separation.
- Token-budget test now fixes the mission snapshot rather than editing live agents after creation, and asserts exactly one allowed call before the next reservation is refused. Recovery regression waits for SKIP LOCKED recovery rather than assuming one tick wins a heartbeat race.

### Offline fixture disclosure

`tests/helpers/transport.ts` returns deterministic strings prefixed `OFFLINE_TEST_FIXTURE` to exercise protocol parsing and database orchestration without network credentials. `tests/e2e/offline-provider.ts` serves explicitly labeled `OFFLINE_HTTP_FIXTURE` responses over loopback HTTP to exercise the actual transport and standalone worker. Neither is imported by `src/`. Workspace browser tests enter `OFFLINE_BROWSER_KEY_NOT_A_REAL_PROVIDER` only to test save-only/unverified behavior and launch gating. These are test inputs, not claims of live provider success.

## Live acceptance still required

An operator must supply accessible credentials/models for at least two providers and run `npm run test:live` against a dedicated `*_test` database. Then verify the target deployment's networking, TLS, proxy headers, SSE behavior, worker restart recovery, provider quotas/billing, and real mission quality. The repository includes the opt-in harness and exact environment variables in `.env.example`/`README.md`.

No statement in this report should be interpreted as a successful live OpenAI/Gemini/Anthropic/OpenRouter/Ollama/LM Studio request. Those remain **UNVERIFIED** in this environment.

## Deployment readiness and operational notes

- Use an always-on Node container/host with managed PostgreSQL, or separate the web tier from a supervised worker.
- Apply migrations before serving traffic; inject runtime secrets through the platform secret store.
- Back up PostgreSQL and the credential encryption key independently. Key rotation requires credential re-encryption.
- Set the exact public HTTPS `APP_ORIGIN`; enable `TRUST_PROXY` only behind a trusted header-overwriting proxy.
- Keep `ALLOW_LOCAL_PROVIDERS=false` on shared infrastructure. Hosted `localhost` is the server/container, not the user's device.
- Configure long-lived SSE support and disable proxy buffering. The SSE route sets `X-Accel-Buffering: no`.
- Monitor database connectivity, worker lease recovery, provider error rates, usage estimates, and disk/database growth.
- The included Dockerfile/Compose configuration is prepared but unexecuted; validate it in the target CI/container environment before release.

## Source map

- `src/lib/server/`: auth, crypto, safe transport, provider adapters/service, plans/context, accounting, mission service, runner, repository, DB helpers.
- `src/app/api/`: authenticated HTTP contracts and SSE/export endpoints.
- `src/components/`: landing, 3D scene, workspace shell, connections, agents, mission UI/network, settings/profile, shared primitives.
- `migrations/`: relational schema and CSRF correction.
- `tests/`: offline unit/database/API/orchestration tests; `tests/e2e/` browser checks; `tests/live/` opt-in real-provider acceptance.
- `scripts/`: secret setup, local PostgreSQL, migrations/checks, Chromium E2E launcher.
- `README.md`: setup, provider conventions, security, deployment, limitations.
