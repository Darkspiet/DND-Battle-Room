# Start, DM Accounts, Rooms, And Shared Library Overhaul

## Summary

The app now moves toward a Kahoot-style entry flow:

- Start screen with `Login as DM` and `Join Game`.
- DM account flow backed by Supabase Auth when configured.
- DM dashboard for named saved rooms and shared public library presets.
- Player join flow with room code, display name, and optional picture before entering the room.

The tabletop state model remains compatible with the existing room snapshot and realtime sync path.

## DM Flow

- DMs sign in or sign up from `/dm/login`.
- When Supabase is not configured, local development can continue with a local DM profile.
- Authenticated DMs land on `/dm/dashboard`.
- The dashboard can create named rooms with generated room codes.
- Opening a saved room sets the DM profile before entering `/room/[roomCode]`.

## Player Flow

- Players start from `/join`.
- Players enter a DM-provided room code.
- `/join/[roomCode]` collects:
  - Player display name.
  - Optional avatar picture.
- The profile is saved into the existing guest profile storage and included when joining the room.

## Shared Library

- DMs can create shared public presets in the dashboard.
- Presets are split into:
  - Tokens for characters, NPCs, and monsters.
  - Objects for PNG map props such as walls, furniture, and set dressing.
- Library items support name, category, icon, image, size, token type, HP, and note defaults.
- The tabletop exposes a filterable `Build Library` panel for DMs, with token/object tabs and text search.
- Placing a preset creates a normal room token, preserving the existing movement, selection, initiative, and sync behavior.

## Supabase Schema

The schema adds:

- `dm_rooms` for account-owned room metadata.
- `public_library_items` for shared token/object presets.
- RLS policies that keep DM room metadata owned by the DM account while allowing public library reads.

Room snapshots remain the compatibility layer for tabletop state.

## Verification

Run:

```bash
npm run typecheck
npm run build
npm run test:e2e
```

Manual checks:

- DM can login or use local fallback when Supabase is absent.
- DM can create a named room and open it.
- Player can join an open room through the pre-join profile screen.
- Avatar pictures show in the player bar.
- Shared library presets can be created, filtered, and placed in the tabletop.
