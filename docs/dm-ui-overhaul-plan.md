# DM UI, Profile, And Room Overhaul Plan

## Summary

Overhaul the opening flow, DM login, DM profile system, DM dashboard rooms section, and in-room DM controls using the generated tabletop-operations concept as the visual direction, leaning slightly more fantasy while keeping the UI practical.

DM access should require a real authenticated DM profile with username and password. The current behavior where clicking DM can silently skip login in local fallback mode should be removed.

## Key Changes

- Redesign the start screen around clear `DM` and `Player` entry paths with stronger DND Battle Room identity, less generic card styling, and concept-matched fantasy utility polish.
- Replace the current DM login behavior with an auth-required DM account flow:
  - Sign in with username/password.
  - Create DM profile with username/password and display name.
  - No automatic redirect to dashboard just because local fallback exists.
  - Show clear auth errors and loading states.
- Add a real DM profile model with username, display name, profile color/accent, optional avatar, created/updated timestamps, and auth identity linkage.
- Rework the DM dashboard so the rooms section is primary:
  - DM profile header.
  - Create room form.
  - Saved rooms list/table with room name, join code, updated time, open/copy/rename actions.
  - Library summary kept secondary and compact.
- Replace the in-room `DM Tools` dropdown with visible primary DM mode navigation:
  - `Table`
  - `Combat`
  - `Build`
  - `Library`
  - Active mode state should be obvious and stable.
- Refresh global styling around the accepted concept:
  - More fantasy character, but still an app/dashboard.
  - Parchment-neutral surfaces, ink text, crimson accent, muted forest/steel secondary tones.
  - 8px or smaller radii, crisp borders, restrained shadows.
  - No nested cards, no decorative orbs, no hidden primary navigation.

## Interfaces And Data

- Extend DM data types to include a persistent `DMProfile`.
- Add profile load/save helpers in the DM data layer.
- Use authenticated DM identity as the source of truth for room ownership.
- Keep player profile flow separate from DM profile flow.
- Preserve existing room, token, library, and tabletop behavior unless directly affected by DM auth/profile ownership.
- If Supabase is the configured backend, store DM profile data in Supabase and connect it to auth users.
- If Supabase is not configured, use the server-side local DM database with hashed passwords and an HttpOnly session cookie for development.

## Test Plan

- Typecheck with `npm run typecheck`.
- Build with `npm run build`.
- Verify DM click from start page always lands on DM login/profile flow when not authenticated.
- Verify creating/signing into a DM profile reaches the dashboard and shows the correct username/display profile.
- Verify saved rooms load only for the authenticated DM.
- Verify room creation opens the tabletop as DM.
- Verify dashboard room actions: create, rename, open, copy join code.
- Verify in-room DM mode toolbar switches between Table, Combat, Build, and Library.
- Browser-check desktop and mobile views for start, DM login, DM dashboard, and room header.
- Compare implementation against the generated concept and fix visible drift before handoff.

## Assumptions

- Target plan file: `docs/dm-ui-overhaul-plan.md`.
- Generated concept direction should be used, with slightly stronger fantasy styling than the first concept.
- "Real DM profile" means authenticated username/password access, not local-only fallback.
- Existing Player join/profile behavior stays intact except for visual consistency.
- Supabase-backed auth/profile storage is acceptable for the real DM account system.
