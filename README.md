# DND Battle Room

This DND Battle Room is a self-hosted tabletop for running encounters together in your browser. U can prepare a battlefield, invite players with a room code, and manage tokens, initiative and dice in one shared room.

I build this App for my DND group and build it after the wishes of my Companions and the DM of what they can do

![A sample encounter with player tokens, goblins, walls, a spell effect and a shared turn order](docs/images/battle-room.png)

## These are some of the features:

- **Build the battlefield.** Upload a map or link a background, adjust the grid, draw walls and place spell effects.
- **Move your pieces.** Create tokens with names, pictures, sizes and HP/status. Players control their own characters; the DM manages the encounter.
- **Run combat together.** Collect initiative from app rolls or dice rolled at the table, then advance through the turn order.
- **Share the dice.** Roll publicly for the table, or privately with only the roller and DM receiving the result.
- **Prepare and reuse.** Save token and object presets in the shared library. Complete encounters are stored in PostgreSQL and survive app restarts.
- **Play in the browser.** DMs and players see live updates, with layouts for desktop and mobile.

## How a session works

1. The DM signs in, creates a room and prepares the map and tokens.
2. Share the invite link or room code. Players choose a name and optional picture, then enter through their browsers.
3. Players move their tokens, roll dice and submit initiative. The DM controls the battlefield and combat progression.

DM signup is public. Players can join as guests without creating a DM account. If someone loses their guest session, the DM can reassign their tokens. DM notes stay private, and DM-controlled token HP is hidden from players. Shared library notes are visible to other DMs.

## Installation

**Version 1.0.0 is an unpublished release candidate.** The command below becomes available when the reviewed `v1.0.0` tag is published. See [release status and verification](docs/RELEASE-v1.0.0.md).

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

### Open your battle room

After installation succeeds, open the website URL printed by the installer and choose **Open DM Profile**. Sign in with the first DM username and password you entered, create a room, and share its invitation with your players.

Keep the configuration location and service commands printed by the installer. For a failed or interrupted setup, follow [installation recovery](docs/OPERATIONS.md#failed-or-interrupted-installation).

## More information

- [Operations guide](docs/OPERATIONS.md): configuration, service management, troubleshooting, backups, restore and manual updates.
- [Development guide](docs/DEVELOPMENT.md): code organization, local PostgreSQL setup and tests.
- [Security review](docs/SECURITY_REVIEW-2026-10-23.md) and [project rulebook](docs/PROJECT_RULEBOOK.md).
- [Release notes and acceptance checks](docs/RELEASE-v1.0.0.md).

DND Battle Room is [MIT licensed](LICENSE).
