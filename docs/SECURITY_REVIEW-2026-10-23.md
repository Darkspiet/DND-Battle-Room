# Security review and implemented fixes — 2026-10-23

Scope: source, dependency lockfile, credential handling, HTTP/WebSocket room authority, privacy, persistence and installer privilege boundaries. The owner confirmed there is no current deployed app; this implementation targets a fresh PostgreSQL installation. Existing local data files are untouched. No compatibility migration, deployment or publication was performed.

## Findings and fixes

| Original finding | Implemented fix |
| --- | --- |
| Anonymous room reads/replacements; client-supplied DM identity | Authenticated room membership, database-owned DM authority, opaque guest sessions, no full-state PUT/room_patch |
| Unrestricted player changes | Shared typed command handler authorizes owned-token/initiative changes; DM-only map/combat/assignment |
| Cross-owner room/library upserts | Server-generated ids, editable-field allowlists, atomic owner predicates in SQL |
| Private rolls and hidden notes sent to all browsers | Recipient-specific HTTP/WS snapshots; separate DM notes; server-side private-roll and HP filtering |
| Client-generated dice | Cryptographic server dice; explicit manual initiative remains supported |
| Encounter state lost on restart | PostgreSQL snapshots, row locks, revisions and transactional command deduplication |
| Silent local-only saves | PostgreSQL-only operation; failed saves pause editing, roll back optimistic state and resynchronize |
| Weak input/resource boundaries | Field/size/range/image validation, bounded bodies/frames/connections and request/command limits |
| Blocking password hashing and no abuse limits | Async scrypt N=131072/r=8/p=1, concurrency 2, bounded queue; signup/login limits; 12–128 character passwords |
| Long-lived bearer tokens stored directly | Random 256-bit cookies; SHA-256 token digests in PostgreSQL; expiry/revocation checked by HTTP and WS |
| Root copies service-user-writable service template | Privileged unit copied exclusively from root-owned release staging |
| Vulnerable dependency versions | Patched Next 15, ws, Sharp/PostCSS and lockfile transitives; production audit added to CI/installer |
| Unused compatibility/backend code | Removed Supabase SDK/schema, JSON backend, obsolete room storage, client dice and unused color helper |

## SQL injection and credentials

The original username/password queries were parameterized; no working SQL-injection path was found there. They remain parameterized. New tests submit quoted passwords and SQL-shaped credentials/profile values against real PostgreSQL and verify authentication/table integrity. Invalid usernames are rejected instead of stripped; passwords remain literal. Installer database identifiers are constrained and quoted, SQL values escaped, and connection credentials URL-encoded. Configuration is JSON and is never executed as shell code.

No plaintext DM password is stored. Signup/bootstrap share hashing and validation. There is no password-change endpoint currently; any future endpoint must use the same policy. HTTP-only cookies become Secure with HTTPS APP_URL. Login responses use one generic invalid-credentials message.

## Packages

Direct production packages: Next.js (routing/rendering), React/React DOM (UI), pg (PostgreSQL), ws (WebSockets). Development packages: TypeScript, Playwright and type declarations. Supabase and direct ws type declarations are removed. Sharp (Next image support) and PostCSS (Next CSS processing) remain required transitive dependencies, with patched overrides.

The lockfile installs Next 15.5.28 or later in its line, ws 8.22.0 or later, Sharp 0.35.5 and PostCSS 8.5.31. npm audit reported zero known advisories after the update. This is a dated advisory check, not proof that packages have no undiscovered vulnerabilities. CI runs the production audit on future changes. Keep Node 24 and PostgreSQL OS packages updated manually with backups and release review.

## Validation and limits

Automated coverage includes real PostgreSQL ownership/privacy/injection cases, special-character database provisioning and preserved bootstrap credentials, anonymous/foreign-Origin transport rejection, forged identity/room_patch rejection, connection-bound sessions, duplicate/stale/concurrent commands, restart persistence, player reassignment and failed-save UI recovery. The exact final check results are recorded in RELEASE-v1.0.0.md.

Limits include 16 MiB inbound bodies/frames, 2 MiB token/avatar images, 8 MiB map images, bounded room entities and 80 retained dice rolls. Data images accept raster PNG/JPEG/WebP/GIF signatures; SVG data is rejected. External image URLs are HTTP(S), require HTTPS for an HTTPS app, and are loaded only by browsers. The server does not fetch arbitrary image URLs. External hosts can still observe browser requests. Security headers prevent framing and MIME sniffing and suppress referrer disclosure. Rate limits and socket registries are local to one Node process; this release does not support horizontal scaling.

Before public release, still complete fresh Ubuntu 24.04 x86-64/ARM64 installation, interruption/retry, public DNS/certificates/HTTPS WebSockets, reboot and protected backup/restore acceptance. Windows tests do not substitute for those checks. Pattern-scan Git history and manually review private installation data before changing visibility; rotate any confirmed exposed secret. No history rewrite is automatic.
