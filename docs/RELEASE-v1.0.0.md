# DND Battle Room v1.0.0

Status: unpublished release candidate for fresh installations. No deployed-app migration is required for this project, as confirmed by its owner.

## Release notes

- Interactive Ubuntu 24.04 x86-64/ARM64 installer with Node 24, PostgreSQL, first regular DM account, protected configuration, systemd and Caddy HTTPS/WebSockets.
- Custom website name/domain and same-version installer recovery preserving credentials/data.
- Opaque server-verified DM/guest sessions; guest entry keeps room codes and display names.
- Server-authorized token, initiative, dice and DM commands; owner-protected room metadata/shared library edits.
- Private rolls sent only to the roller/DM, private DM notes and hidden DM token HP. New DM ownership reassignment control.
- Full encounters persist in PostgreSQL across app restarts. Failed saves pause editing and reload committed state after recovery.
- Twelve-character minimum for new DM passwords, asynchronous bounded scrypt, request/input/frame limits and authenticated WebSocket Origins.
- Patched dependencies; removed Supabase, JSON/offline save backends and confirmed dead helpers. Production/development/tests all require PostgreSQL.
- MIT license, updated service/backup/test instructions, PostgreSQL-backed CI and production dependency audit gate. npm publication remains disabled.

Public DM signup stays available. There is no administrator role. Existing local data files are untouched; no automatic import is provided for older JSON/Supabase data.

## Required external acceptance before publication

Complete these on disposable Ubuntu 24.04 x86-64 and ARM64 servers with real DNS. Local Windows checks do not prove Linux service/proxy behavior:

- Fresh installer: confirmed hidden passwords, generated/custom database credentials, quotes/spaces/Unicode, downloads/checksums, schema, first DM, production build and service startup.
- Public HTTPS certificates/renewal, HTTP redirect, customized homepage/title on desktop/mobile, first-DM login, public signup, invitations and two-browser token/dice synchronization over HTTPS/WebSockets.
- App and PostgreSQL listen only on loopback; service uses its dedicated identity; root-owned config/service/proxy; no passwords in logs/process arguments. Confirm changing the service-user app template cannot change root-installed units.
- Interrupt after each major stage and retry the same tag; preserve passwords/accounts/data. Exercise unsupported systems, bad inputs, occupied ports, failed downloads, wrong DNS, blocked ports and certificate failures. Never report success before health checks pass.
- Reboot and recover accounts, sessions, rooms, complete maps/tokens/drawings/effects/combat/private rolls and shared presets.
- Back up PostgreSQL and protected config; restore into a separate empty database and verify the complete encounter and private fields.

For unpublished installer testing, use a private test tag/repository and adjust RELEASE_VERSION/REPOSITORY only in that copy. The documented public installer URL becomes available only after the reviewed v1.0.0 tag is published. Do not publish an unverified tag to make testing convenient.

## Local implementation verification — 2026-10-23

Windows, Node.js 24.22.1, disposable PostgreSQL 16.15 bound to 127.0.0.1:55432. Tests use a dedicated database; no live server was contacted.

- Updated lockfile installation with npm ci: passed.
- Typecheck → full Chromium Playwright on 3100 → production build: passed in that order. **19 browser tests**, including separate DM/player synchronization, reassignment privacy, failed-save recovery, public signup/literal-passphrase login and owner preset editing.
- Custom website name/browser title on desktop/mobile: **1 additional browser test passed**. Desktop/mobile room and site screenshots inspected.
- **10 Node tests passed**: installer/config loader/hash/bootstrap/startup/root-template regression; real PostgreSQL special-character provisioning/retry and authorization/privacy/injection/concurrency/deduplication/persistence tests.
- **1 production transport test passed** on 3101: unauthorized/foreign-Origin HTTP/WS rejection, forged claims/room_patch/malformed messages, private payloads, revocation, app restart persistence, spoof-resistant rate limiting and real PostgreSQL outage/recovery without an app crash.
- **2 Python tests passed**: UTF-8 JSON and special-character SQL/connection-string round trips, invalid/injected identifiers and refusal to overwrite saved config.
- Bash 5.2 syntax and ShellCheck 0.11.0: passed for both installer scripts.
- npm audit (including development dependencies): **0 known vulnerabilities** at verification time.
- Reachable Git history/source credential-pattern audit: no matching patterns. This does not prove that screenshots/documents contain no private information; review historical content before changing visibility. No history was rewritten.
- Generated test output and TypeScript caches removed from tracking; local copies remain ignored.

Not verified: Ubuntu x86-64/ARM64 installer execution, systemd interruption/retry/reboot, public DNS/certificates/HTTPS WebSockets and operator backup/restore. These remain release gates.

## Publication after final review

1. Review the final diff, current source and historical private installation data. Rotate any confirmed exposed credential.
2. Complete CI and external acceptance; commit the verified tree.
3. Only after final approval, create the annotated v1.0.0 tag, change visibility and publish the GitHub release using the notes above.
4. Verify the raw tagged installer and release archive URLs resolve.

No commit, tag, visibility change, release publication, unattended updates or deployment was performed during this work.


## CI provisioning-test cleanup correction

The provisioning fixture now waits for every application PostgreSQL client to emit its disconnect event before dropping its temporary database. `pg-pool.end()` can resolve before those sockets close; forced database deletion during that interval can raise an asynchronous “terminating connection due to administrator command” error. Cleanup no longer uses `DROP DATABASE ... WITH (FORCE)`, and its administrator pool/temporary files are closed even when database cleanup fails. This changes test teardown only.

Validation: the exact PostgreSQL CI test command passed 10 consecutive local runs (30 test passes) against PostgreSQL 16.15 on Windows. GitHub Actions has not been rerun from this workspace.
