# DND Battle Room v1.0.0

Status: release candidate; not published. No live server migration.

## Release notes

- Interactive Ubuntu 24.04 installation from the v1.0.0 GitHub tag, with first-DM and PostgreSQL setup.
- Configurable website name/domain, automatic HTTPS and WebSocket proxying with Caddy.
- Dedicated system service user, protected JSON configuration, production database checks and secure HTTPS session cookies.
- Same-version installation recovery preserving saved credentials and data.
- MIT licensing, updated documentation, ignored generated artifacts and release CI.

Existing public DM signup, player room invitations and gameplay remain unchanged. A first DM is not an administrator. Encounter state remains in memory as in prior versions; save what you need before service restarts.

## Acceptance checklist — required before publication

Local checks and their actual results are recorded in the implementation report at the end of this file. These external checks must be completed on disposable Ubuntu 24.04 x86-64 and ARM64 VMs with real DNS:

- Fresh installation: settings with spaces/quotes, hidden confirmed passwords, generated/custom PostgreSQL passwords, source/runtime download, first DM creation, schema, build and service startup.
- Actual HTTPS certificate, HTTP redirect, matching custom homepage/browser title on desktop/mobile, first-DM login, public DM signup, room creation, existing invite/player entry, and two-browser movement/dice synchronization through `/ws`.
- Database only on loopback and app on 127.0.0.1:3000; nonroot service identity; root-owned config with no public read permission; no credentials in logs/process arguments.
- Interrupt after package/source/role/database/bootstrap/build stages and retry the same version. Verify credentials and first-DM password never change and unrelated services/data are untouched.
- Invalid OS/architecture/input, existing configuration, occupied ports, failed downloads/checksums, wrong DNS, blocked 80/443 and certificate failures produce actionable failures, never a success message.
- Reboot: services restart, HTTPS reconnects, DM login and saved room listings/library remain. Active encounter state is not expected to survive a restart.
- Back up and restore into a separate empty database; verify accounts and saved room listings.

To test unpublished source, create a private test tag/repository and adjust only the installer's `RELEASE_VERSION`/`REPOSITORY` in that test copy. Do not create the public v1.0.0 tag just to test an unverified release. The production download command cannot work until the public tag exists.

## Publication after final review

1. Resolve any release-audit findings; exposed credentials must be rotated even when removed from the latest tree. Review history before making it public.
2. Complete CI and the VM acceptance checklist; review the final diff and commit the verified tree.
3. Create an annotated `v1.0.0` tag at that verified commit; switch repository visibility and push the reviewed tag only after final approval.
4. Publish a GitHub release using the release notes above, and verify the documented public raw installer and tagged source archive resolve.

Do not publish npm packages or change/migrate the existing live server.


## Local implementation verification — 2026-10-23

Environment: Windows, Node.js 24.22.1. No live server was contacted or modified.

- Locked dependency installation (`npm ci`): passed.
- TypeScript: passed.
- Full Chromium Playwright suite: 17 tests passed, including separate DM/player browsers receiving live token and dice updates.
- Production Next.js build: passed.
- Custom website name on desktop/mobile and browser title: passed; screenshots reviewed.
- Node installer regression tests: 6 passed (hashing, bootstrap preservation, literal/invalid configuration, and production startup refusal without a working database).
- Python installer configuration tests: 2 passed (special-character round trips, SQL quoting, rejection of invalid/injected input, refusal to overwrite saved config).
- Bash 5.2 syntax and ShellCheck 0.11.0: passed for both shell scripts.
- Reachable Git history pattern audit: 142 historical blobs scanned; no matching credential patterns. Removed the private LAN IP from the current proxy example. Historical documents/screenshots remain in Git history and are not rewritten. Pattern scanning cannot guarantee absence of all sensitive material.
- Generated test output and TypeScript caches removed from tracking; local copies remain ignored.

**Not verified here:** real PostgreSQL integration (test added to CI, skipped locally without `TEST_DATABASE_URL`); full Ubuntu x86-64/ARM64 installation; DNS/public certificates and HTTPS WebSockets; stage interruption/retry under systemd; reboot and backup/restore acceptance. WSL is unavailable on this machine and no Docker/Linux VM runtime was provided.

**Publication remains pending:** no commit, v1.0.0 tag, visibility change, GitHub release or live deployment was performed. Finish the acceptance checklist and final review first.
