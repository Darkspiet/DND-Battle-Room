# DND Battle Room

A browser tabletop for DND-style combat rooms: maps, initiative, dice, DM profiles, reusable pieces, and live player synchronization. MIT licensed.

## Install version 1.0.0

**Release candidate:** the command below becomes available after the reviewed `v1.0.0` tag is published. See [release notes and verification](docs/RELEASE-v1.0.0.md).

Use a **fresh Ubuntu 24.04 server**, x86-64 or ARM64, with systemd and root/sudo access. Reserve at least 2 CPU cores, 4 GB RAM and 10 GB free disk for installation and the Next.js build. Install `curl` and `python3` if missing.

Before running the installer:

- Point a domain/subdomain's A record at your server. Only add an AAAA record if IPv6 reaches this server too.
- Allow inbound TCP **80 and 443** in your hosting firewall/router. DNS and forwarding are configured with your provider.
- Use a fresh server without existing PostgreSQL, web-server configuration, or services occupying ports 80, 443, 3000 or 5432. Existing `/root/DND` installations are not migrated.

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Darkspiet/DND-Battle-Room/v1.0.0/install.sh)
```

The script obtains sudo access when needed and shows settings for confirmation before changing the system. You can also download and inspect `install.sh` before running it. The installer asks for:

- Website name and public domain.
- First DM username, display name, and password (at least 12 characters).
- PostgreSQL database name, username, and password (at least 16 characters), with an option to generate a random database password.

Passwords are hidden and confirmed. The first DM is a regular DM. Public DM signup and existing room codes/invite links work as before; this release adds no administrator role or signup restrictions.

The installer downloads the tagged source, installs Node.js 24 LTS and local PostgreSQL, applies the schema, creates the first DM, builds the app, installs systemd services, and configures Caddy HTTPS. It reports success only when local database readiness and the public HTTPS health check pass.

## Configuration and services

| Location | Purpose |
| --- | --- |
| `/opt/dnd-battle-room` | Application and build |
| `/opt/dnd-battle-room-node` | Installer-managed Node.js 24 runtime |
| `/etc/dnd-battle-room/config.json` | Root-managed JSON settings, readable by the service group |
| `dnd-battle-room.service` | App running as the dedicated `dnd-battle-room` user |
| `/etc/caddy/Caddyfile` | HTTPS proxy to `127.0.0.1:3000`, including `/ws` |

The installer uses JSON rather than shell-sourcing secrets. Never run `source` on configuration. `DATABASE_URL`, `SITE_NAME`, `APP_URL`, and the generated `SESSION_SECRET` are loaded on startup. `INSTALL_*` fields are reserved for retries and are not exported to the app. The existing session implementation uses random database-backed tokens; `SESSION_SECRET` is retained for compatibility and is not its signing key.

Production requires a reachable PostgreSQL database with the schema applied. It never falls back to development JSON storage. PostgreSQL is local-only; do not publish ports 3000 or 5432. Development/tests use **3100**.

```bash
sudo systemctl status dnd-battle-room caddy postgresql
sudo journalctl -u dnd-battle-room -u caddy -f
curl --fail https://YOUR-DOMAIN/api/health
```

The health endpoint returns only `ok` or `unavailable`, without database details. To change the website name, edit `SITE_NAME` in the protected JSON file using `sudoedit`, then restart `dnd-battle-room`. Homepage/browser title changes apply without a rebuild. Keep `APP_URL`, the domain and the Caddy configuration consistent if changing a domain.

## Failed or interrupted installation

Rerun the **same v1.0.0 command**. Saved settings, database credentials and accounts are preserved. A partially completed first-DM step may ask you to re-enter the password; it will not change an existing account's password. The script does not automatically upgrade an existing completed installation to another version.

If HTTPS fails, inspect DNS (including stale AAAA records), firewall/port forwarding, and `journalctl -u caddy`. A failed public health check is not a successful installation. The configured services remain available for troubleshooting and retries; the installer never drops databases or removes accounts to recover.

Unrecognized existing files/services stop installation. Retry checks also refuse to overwrite service/proxy files edited outside the installer. Do not delete PostgreSQL data or overwrite another site's proxy configuration to bypass a conflict. Keep protected configuration private; it contains the database password.

## Backup and restore

Before updates, back up both PostgreSQL and configuration to protected storage:

```bash
sudo install -d -m 700 /var/backups/dnd-battle-room
sudo sh -c 'umask 077; runuser -u postgres -- pg_dump -Fc YOUR_DATABASE > /var/backups/dnd-battle-room/database.dump'
sudo cp -a /etc/dnd-battle-room /var/backups/dnd-battle-room/config
sudo cp -a /etc/caddy/Caddyfile /var/backups/dnd-battle-room/Caddyfile
```

Substitute your chosen database name. Copy backups off the server securely. Database credentials are required to recreate the role on a replacement host. To restore into an already provisioned, empty database owned by the same database user:

```bash
sudo systemctl stop dnd-battle-room
sudo sh -c 'runuser -u postgres -- pg_restore --no-owner --role=YOUR_DB_USER --dbname=YOUR_DATABASE < /var/backups/dnd-battle-room/database.dump'
sudo systemctl start dnd-battle-room
```

Do not restore blindly over existing tables; validate restoration on a separate server first. Saved DM accounts and room listings live in PostgreSQL. The existing live tabletop state is held in memory; this release does not add durable encounter-state storage, and a restart can lose the active encounter state.

## Manual updates

There are no unattended updates. Read the target release notes, take backups, and download the reviewed tagged source to a separate staging directory. Preserve `/etc/dnd-battle-room` and the database. Run `npm ci`, `npm run typecheck`, `npm run test:e2e` on port 3100, then `npm run build` with Node 24. Test with an isolated database, not the live data.

Only after verification, stop the app, replace its source/build with the staged release owned by `dnd-battle-room`, apply any documented schema migration with the protected configuration loader, and restart it. Keep the old source/build and a matching database backup for rollback. Recheck `/api/health`, login and a two-browser room. Never use the fresh-install script as an upgrade/migration command.

## Development

```bash
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3100
npm run typecheck
npm run test:e2e
npm run build
```

Without database configuration, development uses ignored `.data/dm-backend.json`. For PostgreSQL development copy `.env.example` to `.env.local`, fill the database URL, and apply the schema:

```bash
node --env-file=.env.local scripts/apply-db-schema.mjs
```

The installer uses `scripts/bootstrap-dm.mjs` to create the first account directly in PostgreSQL using the same username validation and scrypt hashing as normal signup. It reads NUL-separated username, password, display-name fields from stdin; do not put passwords in command arguments or shell history.

Additional checks:

```bash
npm run test:installer
python3 tests/installer/config.test.py
python3 scripts/audit-release.py
bash -n install.sh
bash -n scripts/install-production.sh
shellcheck install.sh scripts/install-production.sh
```

Supabase remains an optional compatibility backend and is not installed by this script. See [the project rulebook](docs/PROJECT_RULEBOOK.md) for durable development rules.
