---
phase: 04-weather-data-p2
plan: "01"
subsystem: weather
tags: [weather, open-meteo, prisma, api-route, typescript]
dependency_graph:
  requires: []
  provides: [lib/weather.ts, app/api/weather/route.ts, Entry.weather schema field]
  affects: [04-02, 04-03, 04-04]
tech_stack:
  added: []
  patterns: [Open-Meteo archive API, WMO code mapping, nullable Json Prisma field]
key_files:
  created:
    - prisma/schema.prisma (Entry.weather Json? field)
    - lib/weather.ts (WeatherData type, WMO_MAP, fetchWeather, degToCardinal)
    - app/api/weather/route.ts (GET handler with auth, validation, 400/401/404)
  modified: []
decisions:
  - "WMO icon values are Lucide component name strings (not imports) — keeps lib/weather.ts server-safe; callers import from lucide-react themselves"
  - "Auth pattern follows existing routes: getSession() from @/lib/auth (not next-auth)"
  - "fetchWeather returns null on any error — callers handle 404 gracefully"
metrics:
  duration: 5min
  completed: "2026-04-10"
  tasks: 3
  files: 3
---

# Phase 04 Plan 01: Weather Foundation Summary

Weather foundation established: nullable Json schema field on Entry, shared lib/weather.ts with WeatherData type and full WMO-to-Lucide mapping, and authenticated GET /api/weather route backed by Open-Meteo archive API.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add weather Json field to Entry + push schema | 2efff8f | prisma/schema.prisma |
| 2 | Create lib/weather.ts | ef7b2e4 | lib/weather.ts |
| 3 | Create GET /api/weather route handler | a62bc6d | app/api/weather/route.ts |

## Decisions Made

1. **WMO_MAP stores icon names as strings** — keeps lib/weather.ts server-safe; callers import Lucide components themselves using the string name as a key.
2. **Auth pattern: getSession() from @/lib/auth** — matches all existing authenticated routes (entries, upload, admin), not next-auth.
3. **fetchWeather returns null on any failure** — network error, bad JSON, missing daily values, or API error all collapse to null; route handler returns 404.

## Artifacts Produced

- `prisma/schema.prisma` — `weather   Json?` field on Entry model, DB column pushed, Prisma client regenerated
- `lib/weather.ts` — exports `WeatherData`, `WMO_MAP` (28 codes), `fetchWeather`, `degToCardinal`; compiles with `tsc --noEmit`
- `app/api/weather/route.ts` — GET handler: 401 (no session), 400 (invalid params), 404 (no data), 200 (WeatherData JSON)

## Route Contract

```
GET /api/weather?lat={float}&lng={float}&date={YYYY-MM-DD}
→ 200 WeatherData JSON
→ 400 { error: 'invalid params' }
→ 401 { error: 'unauthorized' }
→ 404 { error: 'no data' }
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all exports are fully implemented.

## Self-Check: PASSED

- [x] prisma/schema.prisma has `weather   Json?` on Entry
- [x] lib/weather.ts exists with all 4 exports
- [x] app/api/weather/route.ts exists with GET export
- [x] All 3 commits exist: 2efff8f, ef7b2e4, a62bc6d
- [x] `npx tsc --noEmit` exits 0
- [x] 28 WMO codes present in WMO_MAP
