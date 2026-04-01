# Technical Concerns & Risk Assessment

## Security

### High Risk
- **`--accept-data-loss` in build command** (`vercel.json`) — silently drops columns on schema changes; switch to `prisma migrate deploy`
- **No rate limiting** on any API route — brute-force login and query DoS possible
- **No user ownership validation** on PATCH/DELETE — any admin can delete another admin's entries

### Medium Risk
- **Plaintext password comparison** (`lib/auth.ts`) — `password === process.env.ADMIN_PASSWORD`; no rate limiting on `/api/auth/login`
- **Fallback JWT secret** — `'fallback-secret-change-in-production'` used if `JWT_SECRET` not set
- **Path traversal** on media URL (`api/media/url/[filename]`) — string check only; should use `path.normalize()` + UUID whitelist
- **Service role key** in API route — isolate to server-only lib, never risk frontend import

### Low Risk
- **Local `/public/uploads/`** is publicly accessible (dev only; Supabase in prod)
- **No auth on logout** endpoint

---

## Performance

- **N+1 pattern in `/media` page** — three separate DB queries; combine or filter client-side
- **No pagination caps** — `take` is client-controlled; set server-side MAX_LIMIT
- **AdminClient.tsx is 900+ lines** — monolithic; complex state; hard to test
- **`force-dynamic` on all pages** — no ISR; every request re-renders
- **No marker clustering on media map** — degrades with 100+ entries

---

## Reliability & Edge Cases

- **EXIF extraction has no timeout** — malformed files could hang indefinitely; wrap in `Promise.race`
- **Reverse geocode race condition** — entry fetched by client before background update completes (city/country missing briefly)
- **Orphaned storage files** — if DB write fails after Supabase upload, file is never cleaned up
- **PAJ GPS scraping fragility** — regex on HTML; breaks silently if PAJ changes page structure

---

## Technical Debt

- **`prisma db push` instead of migrations** — dangerous for production; use `prisma migrate deploy`
- **Hard-coded `system-admin` user** (`api/entries/route.ts`) — fake user with `password: 'n/a'`; User/Entry relation not properly utilised
- **`next-auth` installed but unused** — custom JWT used instead; remove dead dependency
- **No structured logging** — bare `console.error` throughout; no error tracking (Sentry etc.)
- **No input validation schemas** — `latitude`/`longitude` not bounds-checked; no Zod/io-ts

---

## Scalability

- **LiveLocation singleton** (`id: 'singleton'`) — cannot support multiple users without schema redesign
- **100 MB files loaded fully into memory** — no streaming; concurrent large uploads risk OOM
- **Default Prisma pool size** — may bottleneck under concurrent load with PgBouncer

---

## Risk Matrix

| Level | Items |
|---|---|
| **High** | `--accept-data-loss`, no rate limiting, no ownership checks |
| **Medium** | Plaintext password check, JWT fallback, path traversal, service role exposure, N+1 queries, no pagination cap, EXIF timeout, orphaned files, geocode race |
| **Low** | Public local uploads, no logout auth, console logging, PAJ fragility |

---

## Recommended Priority Actions

**P0 (immediate)**
1. Remove `--accept-data-loss` from `vercel.json` — use migrations
2. Add rate limiting to `/api/auth/login`
3. Add user ownership check on DELETE/PATCH routes

**P1**
4. Add Zod input validation to all POST/PATCH routes
5. Add timeout to EXIF extraction
6. Add structured error logging (Sentry)

**P2**
7. Refactor AdminClient into sub-components
8. Implement cursor-based pagination with server-side MAX_LIMIT
9. Fix geocoding race condition with proper background job handling
