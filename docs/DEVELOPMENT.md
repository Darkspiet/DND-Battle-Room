# Developing DND Battle Room

## Code map

The browser, HTTP API and WebSocket endpoint still run as one app. This organization changes code ownership, not the deployment model.

| Area | Responsibility |
| --- | --- |
| `components/Tabletop.tsx` | Page composition and switching between table, combat, build and library modes |
| `components/tabletop/useRoomConnection.ts` | The single room connection: join, HTTP/WS synchronization, committed snapshots, command queue, previews and failure recovery |
| `components/tabletop/useBoardInteraction.ts` | Board gestures, token dragging, build selections and undo |
| `components/tabletop/useCombat.ts` | Initiative form state, combat actions and derived turn order |
| `components/tabletop/useTokens.ts` | Token selection, draft/picture controls and token actions |
| `components/tabletop/` views | Typed, focused controls and presentation; dice, library and background form state stays with its view |
| `components/tabletop/geometry.ts` | Pure board/effect geometry without React state or transport |
| `lib/backend.mjs` | Stable backend exports used by routes, WebSockets and integration tests |
| `lib/server/` | Authentication/sessions, room persistence and shared-library operations |
| `lib/roomEngine.mjs` | Central command validation, authorization and recipient privacy filtering |

Views send actions through the one connection hook. Do not create another socket, polling loop, persistence queue or local-success fallback inside a control. The server remains the permission authority. Backend modules import their dependencies directly; the facade is for callers, avoiding circular imports.

Form views stay mounted while their mode is hidden, returning no markup, so switching modes preserves unfinished inputs. Keep hooks unconditional and keep helper logic out of page composition.

## Local setup

Install Node.js 24 and PostgreSQL 16 (Ubuntu 24.04's default). Create a development role/database using PostgreSQL's interactive tools. Never reuse production credentials for development:

```bash
sudo -u postgres createuser --pwprompt dnd_dev
sudo -u postgres createdb --owner=dnd_dev dnd_development
npm ci
cp .env.example .env.local
# Edit DATABASE_URL, APP_URL=http://127.0.0.1:3100 and other settings.
npm run db:apply
npm run dev -- --hostname 127.0.0.1 --port 3100
```

URL-encode special characters in the database username/password when manually assembling `DATABASE_URL`. The installer does this automatically. The database role needs schema/table creation permissions in its own database; it does not need PostgreSQL superuser privileges.

Create a **separate disposable test database**, owned by a test-only role. Export `TEST_DATABASE_URL` explicitly in the test shell; the database name must contain `test`. Playwright ignores development database settings and refuses to run without this URL. Example (replace the password locally):

```bash
export TEST_DATABASE_URL='postgresql://dnd_test:REPLACE_PASSWORD@127.0.0.1:5432/dnd_test'
DATABASE_URL="$TEST_DATABASE_URL" node scripts/apply-db-schema.mjs
npm run typecheck
npm run test:e2e
npm run build
npm run test:security
RUN_TRANSPORT_TESTS=1 node --test tests/security/transport.test.mjs
```

PowerShell uses `$env:TEST_DATABASE_URL = '...'` and `$env:DATABASE_URL = $env:TEST_DATABASE_URL` instead of Bash exports. Browser tests use port **3100**; production transport tests use **3101** after a production build. Never use production port 3000 or live data. Tests create synthetic records in the test database. Production transport tests simulate a database outage using the test database owner: they temporarily disable connections, terminate test-database clients and restore access. Run them without other test/development sessions using that database. The optional provisioning test below also requires a test-only PostgreSQL administrator allowed to create/drop its randomly named test roles and databases:

```bash
node --test tests/postgres/*.test.mjs
npm run test:installer
python3 tests/installer/config.test.py
python3 scripts/audit-release.py
bash -n install.sh
bash -n scripts/install-production.sh
shellcheck install.sh scripts/install-production.sh
npm audit --omit=dev --audit-level=high
```

The installer runs `scripts/bootstrap-dm.mjs` to create the first account with the same username validation and asynchronous scrypt hashing as signup. It reads NUL-separated username, password and display name from stdin; never put passwords in arguments or shell history. Retries preserve the existing account.

See [the project rulebook](PROJECT_RULEBOOK.md), [security review and fixes](SECURITY_REVIEW-2026-10-23.md) and [release acceptance](RELEASE-v1.0.0.md). No deployment migration is included: this release targets a fresh installation. Existing local data files are left untouched.
