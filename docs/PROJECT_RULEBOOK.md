# DND Battle Room Project Rulebook

This is the source of truth for future work in this repository. If another doc disagrees with this file, follow this file and update the stale doc.

## Project Overview

DND Battle Room is a Next.js tabletop app for DND-style combat rooms. The official server runs through the `dnd-battle-room` systemd service on port `3000`. Development and Playwright verification must use a separate temporary port so tests never disturb the live service.

## Official Server And Ports

- Production/systemd service: `dnd-battle-room`.
- Production port: `3000`.
- Production bind: `0.0.0.0`.
- Temporary test/dev verification port: `3100`.
- Do not run Playwright or temporary dev servers on port `3000`.
- If port `3100` is busy, stop the temporary process using it or choose a documented alternate temporary port for that run.

Useful service commands:

```bash
systemctl status dnd-battle-room
journalctl -u dnd-battle-room -f
npm run build
systemctl restart dnd-battle-room
curl -I http://127.0.0.1:3000
```

## Backend Setup

The official backend is self-hosted PostgreSQL on the same server or private network as the app. This keeps the install path simple and avoids requiring every installer to create an external Supabase project.

Required production values:

- `DATABASE_URL`: Postgres connection string.
- `SESSION_SECRET`: long random string used by the app for server-side session protection.

Official setup options:

- Preferred: run `npm run install:production` from `/root/DND`. The installer creates the database user, writes `/root/DND/.env.production`, applies `db/schema.sql`, builds the app, installs the systemd unit, and restarts the service.
- Manual: create the database/user yourself, copy `.env.example` to `.env.production`, fill `DATABASE_URL` and `SESSION_SECRET`, then run `npm run db:apply`.

Supabase is optional compatibility, not the default production path. Use `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `supabase/schema.sql` only when intentionally using hosted Supabase.

If no `DATABASE_URL` and no Supabase config are present, the dev server uses `.data/dm-backend.json`. That JSON backend is development fallback only.

## Environment Files

- `.env.example`: committed template with required variable names.
- `.env.local`: local developer values, ignored.
- `.env.production`: official server values, ignored.

The systemd service template loads `/root/DND/.env.production` if present. Missing optional env files must not crash the service, but production installs should have `DATABASE_URL` and `SESSION_SECRET`.

## Local Development

Use port `3100` for local verification work:

```bash
HOSTNAME=127.0.0.1 PORT=3100 npm run dev
```

Use port `3000` only through the official service.

## Playwright Testing

Playwright must default to `http://127.0.0.1:3100`.

Expected flow:

```bash
npm run test:e2e
```

The Playwright config should start a temporary server with:

```bash
HOSTNAME=127.0.0.1 PORT=3100 npm run dev
```

Rules:

- Do not point Playwright at `http://127.0.0.1:3000`.
- Keep screenshots and traces in `test-results/`.
- Update E2E selectors whenever UI text changes.
- If a test cannot run, document the exact blocker and do not claim the feature is verified.

## Production Install, Build, And Restart

Fresh official server install:

```bash
cd /root/DND
npm run install:production
```

Before updating the official service:

```bash
npm run typecheck
npm run test:e2e
npm run build
```

Only after those pass:

```bash
systemctl restart dnd-battle-room
curl -I http://127.0.0.1:3000
```

Expected verification result: `HTTP/1.1 200 OK`.

## Documentation Rules

Every meaningful feature or backend change must update documentation in the same work session.

Required documentation content:

- What changed.
- Which user workflow changed.
- Any new environment variables.
- Any database/schema changes.
- How to test it.
- Whether production service restart is required.

Do not create many overlapping plan files for the same feature. Prefer updating:

- `docs/PROJECT_RULEBOOK.md` for durable rules.
- `README.md` for short entrypoint instructions.
- A dated `docs/YYYY-MM-DD-change-summary.md` only when a detailed change report is useful.

Historical docs may stay in `docs/`, but they must not override this rulebook.

## Feature Planning Rules

For new feature work:

- State the intended user workflow first.
- State backend requirements before UI work when auth, storage, or realtime sync is involved.
- Keep DM workflows and player workflows separate unless the feature explicitly crosses both.
- Preserve the official port rule: test on `3100`, deploy on `3000`.
- Do not finish with hidden setup assumptions. If a key, table, service, or command is needed, document it.

## UI And Frontend Rules

- Build the usable app surface first, not a marketing page.
- Keep the tabletop map as the primary room surface.
- Keep DM-only controls visible and understandable to DMs.
- Do not hide primary room modes behind unclear pre-menus.
- Verify desktop and mobile layouts with Playwright screenshots for visual UI work.
- Text must not overlap, clip, or depend on browser-default control styling.

## Database And Schema Rules

- Official self-hosted schema changes belong in `db/schema.sql`.
- Supabase compatibility schema changes belong in `supabase/schema.sql`.
- Add indexes for common ownership/filter queries.
- Document every required table and env variable.
- Local JSON-backed data is acceptable only for development fallback, not as the official hosted database.

## Current Known Gaps

- Some older docs still describe earlier product directions and should be treated as historical.
- E2E tests must stay aligned with the current UI text and DM auth/profile flow.
- Existing `.data/dm-backend.json` data is development fallback data and should be migrated manually if it ever needs to become production data.
