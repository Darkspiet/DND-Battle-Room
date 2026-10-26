# Project rulebook

Keep one repository, one Node.js application service and one installer. Preserve the campaign world, battle tools and desktop/mobile UI when refactoring.

## Product and security rules

- PostgreSQL is authoritative in production, development and tests. Commit scene commands transactionally with revision checks and duplicate-command handling. Keep uploaded media outside scene JSON.
- Signup requires a single-use DM invitation by default; only the operator setting `DM_SIGNUP_MODE=open` allows public signup. Any existing DM may issue codes. Installer bootstrap creates the first regular DM without a code. Authenticate DMs and guests with server sessions; never trust supplied roles, owner names or matching display names. Revalidate socket sessions before commands and private broadcasts.
- Players create, edit, move and delete their own tokens, roll dice and submit their own initiative. The campaign DM controls maps, settings, combat progression and token reassignment.
- Private dice reach only the roller and campaign DM. Filter private data on the server: DM notes stay private after reassignment, and DM-controlled token HP is visible only to its reassigned owner and the DM.
- DMs can use shared presets; only the creator edits/deletes them. Validate media references and ownership.
- Require 12–128 characters for new/changed passwords; preserve literal password characters. Keep secrets out of Git/logs, parameterize SQL values and parse configuration as JSON rather than shell code.
- Pause edits on connection/database failures, discard uncommitted previews and reload saved state after reconnecting. Never silently save offline.

## Code and verification

HTTP routes are in `app/api/v1`; authentication, persistence and realtime authority are in `lib/server`. Shared contracts, geometry, reducers and privacy projection are in `lib/domain`. UI controls are in `components/campaign`, and `lib/client/realtime.ts` owns the browser socket. Preserve drag/commit behavior, build-only undo and guest hydration.

Run typecheck, PostgreSQL-backed Playwright on port 3100, then production build. Also run the relevant unit, security, provisioning, installer and production transport checks. Follow [development](DEVELOPMENT.md) for commands, [operations](OPERATIONS.md) for server procedures and [security](SECURITY.md) for protections. Keep plans, recovery logs and historical reports outside the public repository. Use synthetic screenshots.

Deployment, publication, visibility changes and history rewrites require the owner's final review. Do not introduce unattended updates.
