# DM Build Mode Overhaul Plan

## Summary

Replace the current DM drawing toggle with a Build Mode toolset. The first release focuses on drawing, snapped visual walls, build-action undo, and battlefield background images while keeping the structure ready for future map-kit tools.

## Initial Build Tools

- Add a DM-only Build Mode toggle with selectable tools: Draw, Wall, and Background.
- Rename user-facing Drawing Mode text to Build Mode.
- Keep normal token movement and selection when Build Mode is off.
- Disable token dragging while Build Mode is on so build gestures do not move tokens.

## Drawing And Walls

- Let the DM pick a build color with preset swatches and a custom color input.
- Use the selected build color for new freehand strokes and walls.
- Store freehand strokes and walls in the room drawing collection with a `kind` value.
- Draw walls as straight snapped segments aligned to grid points.
- Keep walls visual-only for this version; they do not block token movement or line of sight.

## Undo

- Add an Undo control in the Build Mode tools.
- Support `Ctrl+Z` / `Cmd+Z` while Build Mode is active.
- Undo the latest build action only: add freehand stroke, add wall, clear marks, or background update.
- Do not include token edits, dice rolls, or initiative changes in build undo.

## Battlefield Backgrounds

- Support both uploaded images and image URLs.
- Compress uploaded battlemap images client-side before storing them in room state.
- Render the background image below the grid, drawings, walls, and tokens.
- Keep the existing background color as the fallback behind the image.
- Add manual controls for background position, scale, opacity, and removal.

## Future Expansion

The Build Mode structure should leave room for future tools such as fog/hidden zones, labels and pins, terrain overlays, spell templates, grid visibility controls, and DM-only marks.

## Verification

- Run `npm run typecheck`.
- Run `npm run build`.
- Run Playwright coverage for tabletop behavior.
- Manually verify Build Mode on desktop and mobile-size layouts.
