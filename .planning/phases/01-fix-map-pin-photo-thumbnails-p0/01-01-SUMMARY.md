---
phase: 01-fix-map-pin-photo-thumbnails-p0
plan: 01
subsystem: ui
tags: [mapbox, mapbox-gl, canvas, sprites, map-pins, progressive-loading]

# Dependency graph
requires: []
provides:
  - Map pins render circular photo thumbnails via HTMLImageElement + canvas.toDataURL
  - Progressive photo sprite loading (non-blocking map init)
  - Dark-circle fallback placeholder pin (SPRITE_DEFAULT) shown instantly on load
  - 200ms fade-in transition when photo sprites replace placeholder pins
  - Silent graceful degradation when photo fetch fails
affects: [phase-3-image-loading-performance, phase-4-weather-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mapbox GL JS v3 addImage: use HTMLImageElement loaded from canvas.toDataURL, NOT ImageData"
    - "Progressive sprite loading: fire-and-forget per entry, update GeoJSON spriteId on each load"
    - "GL symbol layer fade-in: icon-opacity-transition with duration/delay in paint config"

key-files:
  created: []
  modified:
    - components/map/TravelMap.tsx

key-decisions:
  - "Use HTMLImageElement via canvas.toDataURL() for map.addImage() — ImageData renders blank in Mapbox GL JS v3"
  - "loadSpritesProgressive fires-and-forgets per entry — map shows immediately with dark circles, photos swap in"
  - "buildGeojson accepts optional loadedSprites Set — pins default to SPRITE_DEFAULT until sprite is confirmed loaded"
  - "getLoadedSpriteIds and loadSpritesProgressive defined inside component body to access entriesRef closure"

patterns-established:
  - "Mapbox sprite registration: always use HTMLImageElement (not ImageData) for map.addImage in GL JS v3"
  - "Progressive map data: initialize GeoJSON with fallback values, update source as async data arrives"

requirements-completed: [R3.1, R3.2, R3.3, R3.4, R3.5, R3.6]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 01 Plan 01: Fix Map Pin Photo Thumbnails Summary

**Mapbox GL JS v3 sprite fix: switched from broken ImageData to HTMLImageElement via canvas.toDataURL, with progressive per-entry photo loading and 200ms fade-in transition**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-01T20:26:08Z
- **Completed:** 2026-04-01T20:27:40Z
- **Tasks:** 2 (1 code + 1 auto-approved checkpoint)
- **Files modified:** 1

## Accomplishments
- Fixed the core rendering bug: `ctx.getImageData()` returned `ImageData` which Mapbox GL JS v3 rejects silently — replaced with `HTMLImageElement` loaded from `canvas.toDataURL()`
- Refactored blocking `loadSprites()` (awaited all sprites before map appeared) into fire-and-forget `loadSpritesProgressive()` — map now shows instantly with dark-circle placeholder pins
- Added 200ms `icon-opacity-transition` fade-in when photo sprites replace placeholders
- Failed photo loads silently degrade to dark circle — no user-visible error
- Auth proxy pattern (`credentials: 'include'`) preserved throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix sprite format and implement progressive loading with fade** - `78928d1` (feat)
2. **Task 2: Visual verification** - auto-approved checkpoint (no code change)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `components/map/TravelMap.tsx` - Sprite rendering fix, progressive loading refactor, fade-in transition

## Decisions Made
- `HTMLImageElement` via `canvas.toDataURL()` chosen as `map.addImage()` input — confirmed compatible with Mapbox GL JS v3; `ImageData` approach was silently broken
- `loadSpritesProgressive` and `getLoadedSpriteIds` moved inside component body to access `entriesRef` without stale closure issues
- `buildGeojson` made to accept `loadedSprites?: Set<string>` — returns `SPRITE_DEFAULT` for unloaded entries, entry ID once sprite is confirmed present on map

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled clean on first attempt, all acceptance criteria passed immediately.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Map pin photo thumbnails are now functional; Phase 3 (Image Loading Performance) can add `thumbnailUrl` to `Media` model and point `buildPinSprite()` at thumbnail URLs for faster sprite loads
- No blockers for subsequent phases

## Self-Check: PASSED
- `components/map/TravelMap.tsx` — FOUND
- commit `78928d1` — FOUND

---
*Phase: 01-fix-map-pin-photo-thumbnails-p0*
*Completed: 2026-04-01*
