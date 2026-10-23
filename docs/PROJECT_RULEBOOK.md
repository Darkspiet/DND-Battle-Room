# DND Battle Room Project Rulebook

This is the source of truth for development and deployment. Update it and README in the same change when behavior changes. Older design documents are historical.

## Product and authority

Preserve public DM signup, DM room management, guest entry by code/name and invitations. Keep guest join inputs disabled until hydration, saved preferences and room readiness finish, so startup cannot overwrite early edits. The first installed account is a regular DM; there is no administrator role. New DM passwords require 12–128 characters without symbol rules. Username validation and password hashing must be shared by signup and bootstrap.

PostgreSQL is the only backend in production, development and tests. Missing configuration, unreachable PostgreSQL or a missing schema stops startup. Never add JSON, Supabase or browser-only success fallbacks. Do not delete preexisting local data files as cleanup. The current implementation targets fresh installations; no legacy password/data/session migration is promised.

Authenticated identity comes only from opaque DM/guest session cookies. Store SHA-256 token digests and expiration, never plaintext tokens or passwords. Cookies are HTTP-only, SameSite=Lax and Secure when APP_URL uses HTTPS. A room's DM is its saved authenticated owner, not a supplied role/id/name. Another DM joining that room is a player.

Players control their own tokens and initiative, and may roll dice. Only the room DM controls maps/build tools, settings, combat progression and ownership reassignment. Lost guest sessions require DM reassignment; names never recover ownership. Shared library updates must include an atomic existing-owner predicate in SQL. All SQL values remain parameter-bound; identifiers come only from constants or the installer's validated/quoted identifiers.

## Room state and privacy

Use the same validated, authorized command handler for HTTP and WebSockets. Never accept complete client room replacements. Persist the full authoritative snapshot, revisions and command deduplication transactionally under a database row lock. Acknowledge and broadcast only committed state. Reject stale revisions rather than overwriting another edit. Final token positions must persist; previews are transient and carry only id/coordinates.

Filter every snapshot for its recipient. Private rolls go only to the roller and room DM. DM notes are stored separately and never sent to players, including after reassignment. DM-owned HP is hidden; previously hidden HP stays visible only to the assigned owner and DM after reassignment. Ordinary player-token HP and character notes remain shared. Library notes are shared preset content.

Generate app dice on the server. Keep explicitly labelled manual initiative input. Pause editing on server/database failure, visibly revert uncommitted changes and reload saved state after reconnecting. Do not persist room snapshots in browser storage. Browser preferences confer no authority.

Validate field allowlists, sizes, counts, numeric ranges, images and all WebSocket messages. Bound request/frame sizes, sockets, authentication work and rate-limit maps. Revalidate sessions on messages and broadcasts; verify browser WebSocket Origin against APP_URL. Only trust Caddy's forwarded address when TRUST_PROXY=loopback and the peer is loopback. This release uses one Node process; rate limits are process-local.

## Installation and configuration

- Fresh Ubuntu 24.04 x86-64/ARM64, Node.js 24 LTS, local PostgreSQL, systemd and Caddy.
- Production app binds 127.0.0.1:3000; public HTTPS uses 80/443, including /ws. Browser tests use 3100; transport tests use 3101. Never test against live data or port 3000.
- App /opt/dnd-battle-room; runtime /opt/dnd-battle-room-node; dedicated user/group dnd-battle-room.
- Root-owned /etc/dnd-battle-room/config.json mode 640, directory 750. Load JSON with scripts/load-config.mjs; never shell-source settings or put passwords in process arguments/logs.
- Configuration: DATABASE_URL, SITE_NAME (default DND Battle Room), APP_URL, TRUST_PROXY, NODE_ENV, HOSTNAME and PORT. INSTALL_* records retry settings and is not exported. SESSION_SECRET is unused and removed.
- Manual development uses ignored .env.local and the tracked .env.example template. PostgreSQL is mandatory; Playwright requires an explicit dedicated TEST_DATABASE_URL with test in the database name.
- User-owned DNS and inbound 80/443 are prerequisites. No DNS-provider/firewall automation, Docker installer, external database installer or migration from /root/DND.
- Preserve completed setup and saved credentials on same-version retries. Never rotate passwords, reset accounts, drop data or overwrite unrelated services/proxy files automatically.
- Root installs privileged service templates only from freshly downloaded root-owned staging. Never use the service-user-writable app copy as a privileged source.

## Required checks and release

Run typecheck, PostgreSQL-backed Playwright on 3100, then production build in that order. Run real PostgreSQL security tests, post-build HTTP/WebSocket transport tests, installer/configuration tests, Bash syntax, ShellCheck and dependency audit. Keep generated output/caches ignored. Test desktop/mobile UI changes and inspect screenshots. Document unavailable checks honestly.

Schema belongs in db/schema.sql and must be repeatable without account resets or data loss. Backups include complete encounters and private fields. README documents protected PostgreSQL/config backups, restore to an empty database, manual updates and troubleshooting. No unattended updates.

MIT license, v1.0.0, private:true prevents accidental npm publication. Review the tree and reachable Git history for credentials/private information; rotate confirmed exposed secrets before publication. Never rewrite history automatically. Ubuntu x86-64/ARM64 install/retry/reboot/public HTTPS and backup/restore acceptance remain mandatory before publication. Final diff review precedes tag creation, repository visibility changes and GitHub release publication. Local preparation does not authorize deployment or publication.
