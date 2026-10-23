# Operating DND Battle Room

Service management, recovery, backups and manual updates for an installer-managed server. For first installation, see [the README](../README.md#installation).

## Configuration and services

| Location | Purpose |
| --- | --- |
| `/opt/dnd-battle-room` | Application and build |
| `/opt/dnd-battle-room-node` | Installer-managed Node.js 24 runtime |
| `/etc/dnd-battle-room/config.json` | Root-managed JSON settings, readable by the service group |
| `dnd-battle-room.service` | App running as the dedicated `dnd-battle-room` user |
| `/etc/caddy/Caddyfile` | HTTPS proxy to `127.0.0.1:3000`, including `/ws` |

The installer uses JSON rather than shell-sourcing secrets. Never run `source` on configuration. `DATABASE_URL`, `SITE_NAME`, `APP_URL`, and `TRUST_PROXY` are loaded on startup. `INSTALL_*` fields are reserved for retries and are not exported to the app. Sessions use opaque random tokens; only token digests are stored in PostgreSQL. There is no signing secret.

Production, development and tests require a reachable PostgreSQL database with the schema applied. There is no JSON or Supabase backend. PostgreSQL is local-only; do not publish ports 3000 or 5432. Development/tests use **3100**.

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

Do not restore blindly over existing tables; validate restoration on a separate server first. Accounts, sessions, room listings, library presets and complete encounters live in PostgreSQL. Maps, tokens, drawings, effects, initiative and dice history survive app restarts. Private data is included in database backups; protect backups like credentials.

## Manual updates

There are no unattended updates. Read the target release notes, take backups, and download the reviewed tagged source to a separate staging directory. Preserve `/etc/dnd-battle-room` and the database. Run `npm ci`, `npm run typecheck`, `npm run test:e2e` on port 3100, then `npm run build` with Node 24. Test with an isolated database, not the live data.

Only after verification, stop the app, replace its source/build with the staged release owned by `dnd-battle-room`, apply any documented schema migration with the protected configuration loader, and restart it. Keep the old source/build and a matching database backup for rollback. Recheck `/api/health`, login and a two-browser room. Never use the fresh-install script as an upgrade/migration command.


See [development and tests](DEVELOPMENT.md) for a separate local setup, and [release acceptance](RELEASE-v1.0.0.md) before publishing.
