# DM Build Mode Overhaul Plan

## Summary

Replace the current DM drawing toggle with a Build Mode toolset. The first release focuses on drawing, snapped visual walls, build-action undo, and battlefield background images while keeping the structure ready for future map-kit tools.

## Initial Build Tools

- Add a DM-only Build Mode toggle with selectable tools: Draw, Wall, and Background.
- Add an Effects tool for D&D area templates.
- Rename user-facing Drawing Mode text to Build Mode.
- Keep normal token movement and selection when Build Mode is off.
- Disable token dragging while Build Mode is on so build gestures do not move tokens.

## Drawing And Walls

- Let the DM pick a build color with preset swatches and a custom color input.
- Use the selected build color for new freehand strokes and walls.
- Store freehand strokes and walls in the room drawing collection with a `kind` value.
- Draw walls as straight snapped segments aligned to grid points.
- Keep walls visual-only for this version; they do not block token movement or line of sight.

## Area Effects

- Add saved visual templates for circle/sphere, cone, cube, and line effects.
- Use 5 feet per grid cell by default, with effect sizes entered in feet.
- Let the DM choose color, opacity, label, size, and line width for line effects.
- Place effects with click-drag gestures and render them above the grid/background but below tokens.
- Keep effects visual-only; they do not calculate affected tokens or enforce rules.

## Undo

- Add an Undo control in the Build Mode tools.
- Support `Ctrl+Z` / `Cmd+Z` while Build Mode is active.
- Undo the latest build action only: add freehand stroke, add wall, clear marks, or background update.
- Include added effects and cleared effects in Build Mode undo.
- Do not include token edits, dice rolls, or initiative changes in build undo.

## Battlefield Backgrounds

- Support both uploaded images and image URLs.
- Compress uploaded battlemap images client-side before storing them in room state.
- Render the background image below the grid, drawings, walls, and tokens.
- Keep the existing background color as the fallback behind the image.
- Add manual controls for background position, scale, opacity, and removal.

## Future Expansion

The Build Mode structure should leave room for future tools such as fog/hidden zones, labels and pins, terrain overlays, spell presets, grid visibility controls, token-anchored auras, and DM-only marks.

## Verification

- Run `npm run typecheck`.
- Run `npm run build`.
- Run Playwright coverage for tabletop behavior.
- Manually verify Build Mode on desktop and mobile-size layouts.
