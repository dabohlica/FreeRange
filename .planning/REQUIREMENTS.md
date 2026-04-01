# Requirements — TravelTrace Improvement Milestone

## R1 · Bulk Upload Reliability

**Problem**: Entries are created but images are silently dropped during bulk upload of 40+ photos. Some uploads complete, others are missing entirely.

**Root causes to investigate**:
- Upload route try/catch returns partial `results` array but client doesn't check individual result statuses
- Parallel fetch with concurrency=4 may hit Vercel cold-start / memory limits for large files
- No retry logic on individual file failures
- Client progress tracking doesn't distinguish skipped (duplicate) vs failed

**Requirements**:
- R1.1 — Client reads per-file results from upload response; retries failed files (up to 2 retries)
- R1.2 — Progress UI distinguishes: uploading / skipped (duplicate) / failed / done
- R1.3 — After bulk create completes, show summary: "X uploaded, Y skipped, Z failed"
- R1.4 — Failed files listed by name so user can re-attempt specific ones
- R1.5 — Concurrency auto-scales: small files (< 2MB) → 6 concurrent; large files (> 10MB) → 2 concurrent

## R2 · Image Loading Performance

**Problem**: Gallery (/media) and timeline (/timeline) show slow loading thumbnails. All images route through `/api/media/url/[filename]` → Supabase signed URL → full-size image.

**Requirements**:
- R2.1 — Generate thumbnail (max 400×400px, JPEG 75%) at upload time using `sharp`; store as separate Supabase file (`thumb_[filename]`)
- R2.2 — Add `thumbnailUrl` field to `Media` model pointing to `/api/media/url/thumb_[filename]`
- R2.3 — Gallery and timeline use `thumbnailUrl` for grid display; full image only in modal
- R2.4 — Implement lazy loading: images not in viewport don't start loading
- R2.5 — Show blurhash placeholder while thumbnail loads (extract blurhash from image at upload time using `blurhash` package or `sharp`)
- R2.6 — Signed URL cache: memoize signed URLs client-side for 55 minutes (avoid re-fetching on every render)
- R2.7 — Backfill thumbnails for existing media (admin trigger or background script)

## R3 · Photo Thumbnails in Map Pins

**Problem**: GL sprite approach (canvas → `ctx.getImageData()` → `map.addImage()`) renders blank icons. Pins disappear entirely.

**Requirements**:
- [x] R3.1 — Diagnose root cause of blank sprite rendering; fix within GL pipeline (no HTML markers)
- [x] R3.2 — Each entry pin shows circular photo thumbnail (44px) with white border + downward tip
- [x] R3.3 — Entries without photos show a plain dark circle pin (existing behaviour)
- [x] R3.4 — Pins render without jumping during zoom (pure GL, no visibility-sync)
- [x] R3.5 — Fallback: if image fetch fails, degrade gracefully to plain dark circle
- [x] R3.6 — Sprites load asynchronously after map init; map is usable immediately

## R4 · Weather Data on Entries

**Problem**: No weather information attached to entries.

**API**: Open-Meteo Historical Archive — `https://archive-api.open-meteo.com/v1/archive` — free, no API key, supports lat/lng + date range.

**Data to store** (new `Weather` model or JSON field on `Entry`):
- `temperatureMax` / `temperatureMin` (°C)
- `weatherCode` (WMO code → icon + description)
- `windspeedMax` (km/h)
- `precipitationSum` (mm)
- `fetchedAt` (timestamp)

**Requirements**:
- R4.1 — Add `weather` JSON field to `Entry` model (nullable); stores above fields
- R4.2 — On entry creation (POST /api/entries): if `latitude`, `longitude`, and `date` all present → fetch weather in background (non-blocking, like reverse geocode)
- R4.3 — Admin panel: "Fetch weather" button per entry + "Backfill all" button that queues all entries with GPS + date but no weather
- R4.4 — Map pin tooltip shows: temperature range, WMO condition icon/label
- R4.5 — Entry cards on timeline show: condition icon + temp range inline
- R4.6 — Backfill rate-limited: max 10 requests/second to Open-Meteo (batch with 100ms delay between requests)
- R4.7 — WMO code mapped to human label + emoji (e.g., `0` → "Clear sky ☀️")

## Non-Functional Requirements

- NF1 — No breaking changes to existing entries, media, trips, or auth
- NF2 — All new DB fields nullable / optional (safe schema evolution with `prisma db push`)
- NF3 — All new API routes require auth (existing pattern)
- NF4 — TypeScript strict — `tsc --noEmit` must pass before every deploy
- NF5 — Vercel 10s function timeout — no synchronous operations > 8s in a single request
