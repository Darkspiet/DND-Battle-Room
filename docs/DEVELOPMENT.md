# Development

Use Node.js 24 and PostgreSQL 16. Production, development and tests all require PostgreSQL; there is no JSON or browser-storage fallback. Copy `.env.example` to `.env.local`, replace its database credentials and keep it out of Git. For local work use `APP_URL=http://127.0.0.1:3000`, `HOSTNAME=127.0.0.1`, `PORT=3000` and `ASSET_DIR=.data/assets`.

Create a local database owned by a dedicated login, then run:

```bash
npm ci
npm run db:apply
npm run dev
```

Open http://127.0.0.1:3000 and sign up as a regular DM. SQL migrations live in `db/migrations`; the typed Drizzle schema is `db/schema.ts`. Review generated SQL before using it. `db:apply` and `db:migrate` use the same ordered migration runner and serialize migration attempts with a PostgreSQL advisory lock.

## Verification

Create a separate disposable database whose name contains `_test`. Never point Playwright at a development or production database: global setup deletes test users and their associated fixtures. Use a test role allowed to create databases/roles for provisioning tests; never grant those privileges to the application service role.

On Bash, configure the test process (PowerShell users can set the same values with `$env:NAME='value'`):

```bash
export DATABASE_URL='postgresql://test_user:your-test-password@127.0.0.1:5432/dnd_battle_room_test'
export TEST_DATABASE_URL="$DATABASE_URL"
export APP_URL='http://127.0.0.1:3100'
export ASSET_DIR='/tmp/dnd-test-assets'
export E2E_ADMIN_PASSWORD='a-local-test-only-passphrase'
npm run db:apply
npx playwright install chromium
npm run typecheck
npm run test:e2e
npm run build
npm run lint
npm test
npm run test:installer
node --test tests/postgres/*.test.mjs
python3 tests/installer/config.test.py
python3 tests/installer/archive.test.py
bash -n install.sh scripts/install-production.sh
shellcheck install.sh scripts/install-production.sh
```

`E2E_ADMIN_PASSWORD` is a legacy fixture variable name: the fixture creates a **regular DM**, with no administrator privileges or authentication bypass. Playwright starts the real custom server on **3100**, with PostgreSQL and Socket.IO. Production uses 3000. Run typecheck, the full browser suite, then the production build in that order. To exercise production transport, set `PLAYWRIGHT_SERVER_COMMAND='node server.mjs'` and rerun the browser suite after building.

The browser suite covers campaign worlds, desktop/mobile battle interaction, drag commits, build undo, initiative, audio, public signup, literal special-character credentials, privacy, ownership, deduplication and socket-session revocation. Unit tests cover pure geometry, scene commands, initiative, ranges and private-network checks. Installer tests cover literal JSON configuration, safe extraction, credential hashing, bootstrap retries and missing/unavailable PostgreSQL.

## Modules

`app/api/v1` owns HTTP adapters; `lib/server` owns persistence, authentication and realtime authority. `lib/domain` contains typed contracts and pure reducers/geometry/privacy projection. `components/campaign` composes world/battle controls. `lib/client/realtime.ts` owns the single browser Socket.IO connection. Send durable edits as versioned commands and keep movement previews separate from committed snapshots. An outage must pause edits and reload saved state, never silently save offline.

Use synthetic data for screenshots. Keep source recovery evidence, database exports, uploaded private media and raw chat logs outside the repository.

For contribution rules and permission boundaries, see the short [project rulebook](PROJECT_RULEBOOK.md).

## Release verification

Before publishing a release, test the installer on fresh Ubuntu 24.04 x86-64 and ARM64 servers with public DNS and Caddy HTTPS. Verify first-DM login, public signup, player invitations, two-browser synchronization, reboot persistence and backup restoration. Exercise interrupted installation/retries, occupied ports, failed downloads and certificate failures. Local browser/build checks alone do not cover these deployment cases.

The current campaign schema requires a fresh database; there is no automatic migration from the earlier simple-room app. Complete final review before publishing a tag, release or repository visibility change.
