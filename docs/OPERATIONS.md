# Operations

## Service and configuration

The standard installer places the app at `/opt/dnd-battle-room`, Node.js 24 at `/opt/dnd-battle-room-node`, configuration at `/etc/dnd-battle-room/config.json`, and uploaded media at `/var/lib/dnd-battle-room/assets`. The `dnd-battle-room` system user runs one systemd service. The app connects to PostgreSQL over loopback and normally binds `127.0.0.1:3000`. Existing PostgreSQL listen settings are preserved. Caddy-managed mode exposes HTTPS on 80/443 and proxies all routes, including Socket.IO, to the app.

Configuration is protected JSON, never shell code. Do not `source` it. `DND_CONFIG_FILE` loads runtime strings; installer-only keys are excluded from the application environment. Set `SITE_NAME`, `APP_URL` (the exact HTTPS origin), `DATABASE_URL`, `HOSTNAME`, `PORT` and `ASSET_DIR`. The legacy `APP_ORIGIN` name is accepted when `APP_URL` is absent. Opaque session digests need no shared session secret. HTTPS origins enable Secure, HttpOnly session cookies.

```bash
sudo systemctl status dnd-battle-room --no-pager
sudo systemctl restart dnd-battle-room
sudo journalctl -u dnd-battle-room -n 100 --no-pager
sudo systemctl status caddy postgresql --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

`/api/health/live` checks the HTTP process; `/api/health` and `/api/health/ready` check PostgreSQL. Failed startup does not fall back to local files. Avoid sharing raw configuration or diagnostic output containing secrets.

## Existing dependencies and uninstall

The opening installer menu offers install/resume/reinstall, uninstall, and exit. `bash install.sh --install` skips that menu. Existing local PostgreSQL 16+ on port 5432 is reused through its `postgres` system account; unrelated databases and roles are untouched. A new installation creates its own unused database/role. Unsupported older clusters must be upgraded manually. System packages already installed are not deliberately reinstalled/upgraded. A trusted root-managed Node.js 24/npm under `/usr` is reused through private runtime links; otherwise an isolated Node 24 runtime is downloaded without changing system Node.

Caddy mode reuses the normal `/etc/caddy/Caddyfile` service, backs up that file under protected configuration and adds a marked import for `/etc/caddy/dnd-battle-room.caddy`. It validates the combined configuration before applying it. Other websites are retained. Edited blocks, duplicate domains and custom Caddy service/config layouts require manual review or existing-proxy mode.

For nginx, a custom Caddy service or a tunnel, choose **existing reverse proxy**. The installer leaves proxy packages/configuration and ports 80/443 alone; configure HTTP/WebSocket routing to this app before its public HTTPS check. The default origin is loopback. A connector on another machine needs an explicit LAN `HOSTNAME` and appropriate firewall rules in the protected configuration, followed by an app restart; it cannot reach `127.0.0.1` remotely.

```bash
bash install.sh --uninstall
```

Uninstall requires typing `UNINSTALL`. It removes only the app source/private runtime, its verified systemd unit and its unchanged managed Caddy site. PostgreSQL databases/roles, uploaded media, protected configuration, the service user and shared packages are retained. Configuration and ownership records remain available for reinstalling a reviewed compatible release, which preserves saved credentials and skips account bootstrap. This is not a database migration tool.

Modified units/sites or symlinked installation paths stop removal for manual inspection. Uploads stored inside the application/runtime directory must be moved outside it and `ASSET_DIR` updated before uninstalling. Legacy installers that owned the whole Caddyfile leave that file in place with a manual-removal message. There is no automatic data purge or shared-package removal.

## Accounts

The initial account is an ordinary DM. DM signup requires an invitation by default. Any signed-in DM can select **Generate DM invitation** on the dashboard and share the code privately. It expires after 72 hours and creates one regular DM account. Codes are stored only as hashes and cannot be retrieved later; at most 20 unused codes per issuer are allowed. Player campaign codes are separate and do not create DM accounts.

Set `"DM_SIGNUP_MODE": "invite"` in `/etc/dnd-battle-room/config.json` to require invitations (also the default when absent). To allow public DM registration, explicitly set `"DM_SIGNUP_MODE": "open"`, then restart `dnd-battle-room`. Other values keep invitations required. Existing accounts continue working when the setting changes. Passwords require 12–128 characters; spaces and passphrases are accepted. Usernames use 3–32 lowercase letters, digits, dots, underscores or hyphens. A guest clearing browser data must rejoin; the DM reassigns tokens using the ownership control. A matching guest name grants no authority.

A host operator can generate a one-use password-reset code, valid for one hour, without an application administrator:

```bash
cd /opt/dnd-battle-room
sudo -u dnd-battle-room env DND_CONFIG_FILE=/etc/dnd-battle-room/config.json /opt/dnd-battle-room-node/bin/node scripts/password-reset.mjs USERNAME
```

Deliver that code privately to the account owner. They use **Reset** on the DM login page. Changing the password revokes existing DM sessions. Do not put passwords on command lines or save initial plaintext passwords.

## Manual backup

Back up **PostgreSQL, media and protected configuration together**. Store encrypted copies off-server and test restoration. Stop the service briefly so media references and database state remain consistent. The commands below use the installer's default database name; substitute the actual name from your configuration if you chose another.

```bash
sudo systemctl stop dnd-battle-room
sudo install -d -m 700 /var/backups/dnd-manual
sudo sh -c 'umask 077; sudo -u postgres pg_dump --format=custom dnd_battle_room > /var/backups/dnd-manual/database.dump'
sudo tar -czf /var/backups/dnd-manual/assets.tar.gz -C /var/lib/dnd-battle-room/assets .
sudo cp /etc/dnd-battle-room/config.json /var/backups/dnd-manual/config.json
sudo chmod 600 /var/backups/dnd-manual/*
sudo systemctl start dnd-battle-room
```

Use a new empty backup directory for every backup; the example paths are placeholders. Never reuse them to overwrite a needed backup. No timer, automatic retention deletion or unattended update is installed.

## Restore into a separate empty installation

Keep the original backup immutable. Create a separate empty database owned by the intended application role, and use `pg_restore --no-owner --no-privileges --role=APP_ROLE --dbname=RESTORE_DB database.dump` as PostgreSQL's local operator. Restore media into a new empty asset directory, preserving the service user's ownership. Prepare a protected JSON config referencing that database and media directory; do not execute the backup configuration as shell code. Start an isolated copy with that configuration and verify accounts, campaigns, private rolls, images, world maps and audio before switching the service over.

Reuse of a populated PostgreSQL server is supported, but choose a separate unused application database; never overwrite the current database to test a backup. The restored campaign app uses a different schema from the earlier simple-room app. There is no automatic data migration between them.

## Manual updates

1. Read the target release notes and check schema compatibility. Back up the current code, database, media and configuration.
2. Stage the reviewed source in a separate directory. With Node.js 24 run `npm ci`, the required checks, and the production build using its intended configuration.
3. Stop the app. Apply only reviewed migrations to the intended database with `node --import ./scripts/load-config.mjs scripts/apply-db-schema.mjs`; retain the backup. Switch the service's app directory only after the build and migration succeed.
4. Restart and check local readiness, public HTTPS, login and two-browser synchronization. For rollback, restore the matching code/database/media/configuration set into separate paths and switch back.

The installer supports new application installations alongside compatible dependencies, same-archive interrupted retries and data-preserving reinstall after its uninstall operation. It never adopts an unrelated populated database or resets its credentials. Review migrations before reinstalling another release. Reusing a stage marker after manually replacing source is unsupported.

## Troubleshooting

- **Release download 404:** private/unpublished tags cannot use the anonymous public command. Use the matching trusted source ZIP and `bash install.sh --local-archive /absolute/archive.zip`.
- **Port or PostgreSQL conflict:** use unused application database/role names. An unrelated listener on port 3000 must be moved or stopped by its owner. For another proxy on 80/443, choose existing-proxy mode. Keep backups and never delete unrelated data to bypass preflight.
- **Certificate failure:** verify A/AAAA records, inbound 80/443 and router forwarding; inspect Caddy logs. A Cloudflare Tunnel test adapter is a different deployment path and does not prove Caddy certificate issuance.
- **Live updates fail:** proxy `/socket.io` and its WebSocket upgrades to the same custom Node server. Do not replace `node server.mjs` with `next start`. Confirm `APP_URL` exactly matches the browser origin.
- **Paused edits:** restore database/connectivity and wait for reconnect/reload. Do not keep editing stale state or switch to browser-only storage.
- **Missing media:** check `ASSET_DIR`, disk space and service-user permissions. Backing up PostgreSQL alone does not include uploaded files.

See [development and release verification](DEVELOPMENT.md) and [security](SECURITY.md).
