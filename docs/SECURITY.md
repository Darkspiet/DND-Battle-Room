# Security

Use the reviewed lockfile, run CI and complete [release verification](DEVELOPMENT.md#release-verification) before public deployment. The protections below describe the current application; they are not a guarantee against every attack.

## Dependencies

Next.js / React serve the UI, Socket.IO provides shared state transport, Drizzle / pg access PostgreSQL, Zod validates commands, React Flow renders worlds, and Konva / React Konva render encounters. Radix Dialog/Tabs provide accessible controls, Lucide supplies icons, Pino handles runtime logs, and the dice-roller evaluates a restricted dice grammar. The Argon2 verifier is retained only for recovered credentials; new credentials use the shared bounded scrypt implementation. `@next/env` loads local runtime configuration and `react-dom` is required by React/Next.

Unused direct declarations for Radix Dropdown Menu, Radix Tooltip and Zustand were removed after checking source imports. Some may remain as transitive dependencies required by other packages. Dependencies are locked; npm publication remains disabled. `npm audit --omit=dev` is a CI gate, not a substitute for reviewing application authorization or newly published advisories.

## Authority and injection defenses

- SQL values are bound through Drizzle/pg parameters. The installer restricts database identifiers, independently quotes PostgreSQL password literals and URL-encodes connection-string components.
- The installer and service parse literal JSON; user settings are never sourced/evaluated as shell commands. Passwords are confirmed without echo and initial plaintext passwords are not saved.
- DMs and guests use independent opaque, hashed sessions. Public signup cannot grant administrator privileges. Token reassignment resolves the target membership/name on the server.
- Scene commands are validated under a row lock and revision check. Player commands are restricted to their own tokens; map/settings/combat changes require campaign ownership.
- Recipient projection strips DM notes and private HP in HTTP, socket acknowledgments and committed-state broadcasts. Private dice reach only the roller and campaign DM. Existing sockets revalidate sessions before acting and before private broadcasts.
- Origin checks, body/frame/connection limits, restricted dice expressions and authentication rate limits bound important entry points. Failed database access produces an error rather than a local-only save.
- Uploaded raster MIME/dimensions and size limits are checked; imports reject private/reserved networks and pin the validated DNS address for each redirect. Owned/shared references govern media use. Stored files and PostgreSQL must both be backed up.

## Evidence and limits

Playwright exercises literal passwords containing quotes, spaces, backslashes, Unicode and shell-like characters, SQL-shaped login inputs, hostile origins, unrelated DM access, same-name guests, own-token commands, reassignment/privacy, duplicate command IDs, private dice and live session revocation. PostgreSQL provisioning tests use real databases and retry schema/bootstrap without rotating credentials. Installer archive tests reject traversal, links, duplicate roots and unsafe filenames.

No matching secret patterns were found in the reachable Git history and current tracked/unignored source during the local pattern scan. This does not prove that all historical content is public-safe; manually review releases and keep raw recovery evidence outside Git. Linux service hardening, Caddy certificate issuance, reboot/recovery and ARM64 acceptance must be repeated for this restored app before publication.
