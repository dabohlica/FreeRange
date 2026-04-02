# Roadmap — TravelTrace Improvement Milestone

## Milestone 1: Core Quality & Features

### Phase 1: Fix Map Pin Photo Thumbnails (P0)
**Goal**: Photo thumbnails visible in map pins, no jumping, no blank icons.

**Plans:** 1/1 plans complete

Plans:
- [x] 01-01-PLAN.md — Fix sprite format (ImageData -> HTMLImageElement), progressive loading, fade transition

---

### Phase 2: Bulk Upload Reliability (P0)
**Goal**: 40-photo bulk upload completes with zero silent drops.

**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — Per-file result checking: rewrite uploadInParallel to read results[] and return UploadSummary
- [ ] 02-02-PLAN.md — Retry logic + summary modal: silent 2× retry with backoff; post-upload modal with failed file list and inline retry
- [ ] 02-03-PLAN.md — Progress UI: replace string bulkProgress with structured count summary bar (done · skipped · failed)
- [ ] 02-04-PLAN.md — Adaptive concurrency: getConcurrency helper; small=6, medium=4, large=2

---

### Phase 3: Image Loading Performance (P1)
**Goal**: Gallery and timeline thumbnails visible in < 2s on mobile.

**Plans**:
3.1 · Schema + upload pipeline — add `thumbnailUrl` to `Media` model; generate 400px JPEG thumbnail at upload via `sharp`; store as `thumb_[filename]` in Supabase
3.2 · Frontend optimisation — use `thumbnailUrl` in gallery/timeline grids; full image only in modal; implement lazy loading
3.3 · Blurhash placeholders — extract blurhash at upload time; store on `Media`; show as CSS background until image loads
3.4 · Backfill existing media — admin "Generate thumbnails" button; batch process existing media without thumbnails

---

### Phase 4: Weather Data (P2)
**Goal**: Each entry with GPS + date shows historical weather; existing entries backfilled.

**Plans**:
4.1 · Schema + API — add `weather` JSON field to `Entry`; create `/api/weather` route; WMO code → label/emoji map
4.2 · Auto-fetch on entry creation — non-blocking weather fetch in upload route background (like reverse geocode)
4.3 · Admin backfill UI — "Fetch weather" per entry + "Backfill all" batch button with progress
4.4 · Display — map pin tooltip shows condition + temp; timeline entry cards show condition icon + temp range

---

## Execution Order

```
Phase 1 (map pins)     → Phase 2 (upload reliability) → Phase 3 (image speed) → Phase 4 (weather)
   P0 fix                      P0 fix                          P1 optimisation         P2 feature
```

Phases 1 and 2 are independent and could run in parallel if desired.

## Definition of Done (Milestone 1)

- [ ] Bulk upload 40 photos → all appear, zero silent drops
- [ ] Gallery page thumbnails visible < 2s on mobile
- [x] Map pins show photo thumbnails, stable across zoom levels
- [ ] Each entry with GPS shows historical weather in tooltip + timeline card
- [ ] Admin backfill for weather + thumbnails available
- [ ] `tsc --noEmit` passes, deployed to Vercel production
