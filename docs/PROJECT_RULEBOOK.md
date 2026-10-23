# DND Battle Room Project Rulebook

This is the source of truth for development and deployment. Update stale documents when changing these rules. Older design documents are historical.

## Product and backend

DND Battle Room is a Next.js browser tabletop with a custom Node HTTP/WebSocket server. Preserve the map as the primary room surface, existing DM signup, DM room management, guest-player entry, and room invitation links/codes. The installer creates a regular first DM; there is no server-administrator role.

Official production storage is local PostgreSQL. Required: `DATABASE_URL` and the applied `db/schema.sql`. A missing/unreachable database or missing schema stops production startup. JSON `.data/dm-backend.json` is development fallback only. Supabase compatibility remains optional; its schema is `supabase/schema.sql`.

Room snapshots have a schema table but current live tabletop state remains in memory. Do not promise encounter-state persistence across restarts without implementing and testing it. PostgreSQL currently persists accounts, sessions, room listings and library items.

## Ports and service

- Production service: `dnd-battle-room`; app listens on `127.0.0.1:3000` behind Caddy HTTPS on 80/443.
- Temporary dev and Playwright: `127.0.0.1:3100`. Never point tests at port 3000 or the live database.
- Public installation targets fresh Ubuntu 24.04, x86-64/ARM64, Node.js 24 LTS, PostgreSQL and systemd.
- App: `/opt/dnd-battle-room`; runtime: `/opt/dnd-battle-room-node`; dedicated user/group: `dnd-battle-room`.
- Configuration: `/etc/dnd-battle-room/config.json`, root-owned mode 640, service-readable group; directory mode 750. No shell sourcing, inline command-line passwords, logged credentials, or automatic credential rotation.
- User-owned DNS, inbound 80/443 and a public domain are prerequisites. Installer configures the proxy/certificates, not DNS providers or firewall/router rules.
- Existing `/root/DND` servers are not migrated or modified. `install.sh` is for fresh installs and same-version recovery, not upgrades.

## Configuration

Installer-managed `config.json` supplies string settings through `scripts/load-config.mjs`. Public app settings include `SITE_NAME` (default DND Battle Room), `APP_URL`, `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `HOSTNAME`, and `PORT`. `INSTALL_*` values record recovery settings and are not exported. The session implementation uses database-backed random tokens, not `SESSION_SECRET` signing.

Manual development may use ignored `.env.local`; `.env.example` is a committed template. Production services load JSON rather than dotenv. Do not commit real configuration, data files, generated test artifacts or build caches. Never rotate a database password or reset the first DM on installer retries.

First-DM bootstrap shares account validation and hashing with signup. The initial setup enforces a 12-character password; public signup retains its existing minimum. HTTPS deployments set secure session cookies. `/api/health` checks PostgreSQL/schema readiness without revealing internals.

## Required checks

Before deploying, run `npm run typecheck`, `npm run test:e2e` on port 3100, then `npm run build`. Playwright starts its own temporary server; do not reuse a live process. Installation changes also require Bash syntax, ShellCheck, Python configuration tests, and `npm run test:installer`.

Test desktop and mobile for visual changes; keep screenshots/traces ignored under `test-results`. Report exact blockers rather than claiming unavailable tests passed. Clean Ubuntu install, same-version retry, reboot, public HTTPS and two-browser WebSocket verification are release acceptance checks; see `RELEASE-v1.0.0.md`.

## Schema and documentation

Self-hosted schema changes belong in `db/schema.sql`; compatibility changes belong in `supabase/schema.sql`. Add indexes for common ownership/filter queries. Document schema requirements and do not infer live data migration from development fallback files.

Every meaningful change must update README/rulebook as appropriate: user workflow, backend requirements, environment variables, schema, test instructions, and whether a service restart is needed. Prefer these durable files over overlapping plan documents. Update E2E selectors when UI text changes. Keep DM/player workflows distinct and preserve usable desktop/mobile layouts.

## Release process

MIT license, package/release version 1.0.0. `private: true` only prevents accidental npm publication. Before a public release, review the current tree and Git history for credentials/private deployment data, rotate any exposed secrets, run CI and fresh-server acceptance, and review the final diff. Never rewrite history automatically. Repository visibility, tag creation and GitHub release publication happen only after final review. Never alter the existing live server as part of local release preparation.
