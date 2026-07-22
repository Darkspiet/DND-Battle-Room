# DND Battle Room

A browser tabletop for DND-style combat rooms.

The source of truth for setup, ports, testing, backend requirements, deployment, and documentation rules is:

- [docs/PROJECT_RULEBOOK.md](docs/PROJECT_RULEBOOK.md)

## Quick Start

Install dependencies:

```bash
npm install
```

Run a temporary local dev server on the project test port:

```bash
HOSTNAME=127.0.0.1 PORT=3100 npm run dev
```

Open:

```text
http://127.0.0.1:3100
```

Do not use port `3000` for temporary development or Playwright. Port `3000` belongs to the official `dnd-battle-room` systemd service.

## Backend Setup

The official backend is self-hosted PostgreSQL. The intended production setup is:

```bash
npm run install:production
```

Manual setup uses `.env.production` with:

```bash
DATABASE_URL=
SESSION_SECRET=
```

Then apply the schema:

```bash
npm run db:apply
```

Supabase remains optional compatibility, not the default install path. Real env files are ignored by git. Do not commit secrets.

## Checks

Use this order before deploying to the official service:

```bash
npm run typecheck
npm run test:e2e
npm run build
```

Playwright uses `http://127.0.0.1:3100` by default.

## Official Service

The official server runs through systemd on port `3000`:

```bash
systemctl status dnd-battle-room
journalctl -u dnd-battle-room -f
```

After checks pass, deploy the current build:

```bash
npm run build
systemctl restart dnd-battle-room
curl -I http://127.0.0.1:3000
```

Expected result: `HTTP/1.1 200 OK`.
