# TravelTrace Architecture

## System Overview

Private self-hosted travel journal (Polarsteps alternative). Next.js full-stack app with PostgreSQL, Supabase Storage, and Mapbox GL.

## Client/Server Split

**Server Components (SSR):** `map/page.tsx`, `admin/page.tsx`, `timeline/page.tsx`, `media/page.tsx` — fetch data, pass to client  
**Client Components (`'use client'`):** `TravelMap`, `AdminClient`, `MediaModal`, `MediaPageClient`, `LocationPicker` — interactivity  
**API Routes:** REST handlers in `app/api/` — auth, CRUD, upload, signed URLs

## Authentication Flow

```
POST /api/auth/login
  password === ADMIN_PASSWORD → signToken({ role: 'admin' })
  password === VIEWER_PASSWORD → signToken({ role: 'viewer' })
  → HTTP-only cookie: auth_token (7-day JWT, HS256)

getSession() → verifyToken(cookie) → { role, iat, exp } | null
Redirect to /login if null
```

Role checks per route:
- `!session` → 401 (all protected routes)
- `session.role !== 'admin'` → 403 (write operations)

## File Upload Pipeline

```
Browser drag-drop
  → client EXIF extraction (exifr)
  → groupFiles() by date + Haversine proximity
  → POST /api/upload (4 concurrent requests)
     → SHA256 hash → check Media.hash (dedup)
     → saveUploadedFile() → Supabase bucket / local /public/uploads/
     → extractExif() (server-side)
     → prisma.media.create()
     → reverseGeocode() [background, non-blocking]
  → URL served via /api/media/url/[filename]
     → auth check → Supabase createSignedUrl(1hr) → redirect
```

## Map Rendering

```
TravelMap.tsx (client, ssr:false)
  → loadSprites(): fetch photo → canvas (44×55px circle pin) → ImageData → map.addImage()
  → GeoJSON source (cluster: true, clusterMaxZoom: 13, clusterRadius: 60)
  → Layers: clusters (circle) + cluster-count (symbol) + entry-pins (symbol, sprite)
  → Click handlers via queryRenderedFeatures (all GL, no HTML markers)
  → Live location: separate HTML marker (pulsing blue dot, CSS animation)
```

## Data Flow

```
PostgreSQL (Supabase)
  ↓ Prisma ORM
  ↓ /api/* routes (auth → query → JSON)
  ↓ Server components (SSR prefetch → props)
  ↓ Client components (state + fetch for mutations)
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| JWT in HTTP-only cookie | Stateless, works on Vercel serverless |
| Env var passwords (no registration) | Fits private single-admin use case |
| Supabase signed URLs (1hr) | Private storage, no public bucket access |
| `prisma.config.ts` `directUrl` | PgBouncer (port 6543) can't run DDL; direct (5432) required for `db push` |
| `unoptimized: true` in next.config | Next.js Image fetches server-side without cookies → can't auth-gate |
| `force-dynamic` on all pages | Live data; no stale cache acceptable |
| Non-blocking `reverseGeocode` | Mapbox call ~300ms; don't block upload response |
| Canvas sprites for map pins | Custom photo thumbnails in GL pipeline; no HTML markers = no jumping |
