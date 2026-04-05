# FreeRange — Setup Guide

## Quick Start (Docker — recommended)

**Requirements:** Docker + Docker Compose

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — set strong passwords and your Mapbox token

# 2. Start everything (DB + App)
docker compose up -d

# 3. Run migrations + seed admin user
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed
```

Open http://localhost:3000 — sign in with your ADMIN_PASSWORD.

---

## Manual Setup (local dev)

**Requirements:** Node 20+, PostgreSQL 14+

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/travel_journal"
JWT_SECRET="generate-with: openssl rand -base64 32"
ADMIN_PASSWORD="your-secure-admin-password"
VIEWER_PASSWORD="password-you-share-with-friends"
NEXT_PUBLIC_MAPBOX_TOKEN="pk.your-token-from-account.mapbox.com"
```

### 3. Set up the database
```bash
# Apply schema
npm run db:push

# Create admin user
npm run db:seed
```

### 4. Start the dev server
```bash
npm run dev
```

Open http://localhost:3000

---

## Auth System

| Password | Access |
|----------|--------|
| `ADMIN_PASSWORD` | Full access — create/edit/delete entries, manage trips, set location |
| `VIEWER_PASSWORD` | Read-only — view map, timeline, photos |

Both stored as env vars — no database accounts needed for viewers.

---

## Getting a Mapbox Token

1. Create a free account at https://account.mapbox.com
2. Copy the **Default public token** (starts with `pk.`)
3. Set it as `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env`

Free tier: 50,000 map loads/month — plenty for personal use.

---

## PAJ GPS Tracker

Set `PAJ_GPS_SHARE_URL` in `.env` to the share link from your PAJ GPS app. The app will:
- Attempt to extract coordinates from the share page every 45 seconds
- Display a live pulsing blue dot on the map
- Fall back to manual location update via Admin → Live Location

For manual GPS updates (or other trackers), use the Admin panel → **Live Location** tab, or call the API directly:

```bash
curl -X POST http://localhost:3000/api/location \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=YOUR_TOKEN" \
  -d '{"latitude": 48.8566, "longitude": 2.3522}'
```

---

## Adding Entries

1. Sign in with admin password
2. Go to **Admin** → **New Entry**
3. Fill in title, date, optional description
4. Drag & drop photos/videos
   - GPS coordinates are extracted automatically from EXIF data
   - If no GPS in photo: set latitude/longitude manually, or leave blank
5. Create entry — it appears on the map and timeline immediately

---

## Trips

Group related entries under a named trip with a custom colour:
1. Admin → **Trips** → Create a trip
2. When creating entries, select the trip from the dropdown

---

## Production Deployment

For a production server (VPS, Raspberry Pi, etc.):

```bash
# Build production image
docker compose up -d --build

# Set NEXT_PUBLIC_APP_URL to your domain in .env
NEXT_PUBLIC_APP_URL=https://travel.yourdomain.com
```

For HTTPS, put Nginx or Caddy in front as a reverse proxy.

---

## Project Structure

```
travel_journal/
├── app/
│   ├── (app)/           # Authenticated pages
│   │   ├── map/         # Homepage — fullscreen map
│   │   ├── timeline/    # Chronological feed
│   │   ├── media/       # Photo grid + media map
│   │   └── admin/       # Admin dashboard
│   ├── api/             # API routes
│   └── login/           # Login page
├── components/
│   ├── map/             # TravelMap (Mapbox)
│   ├── media/           # MediaGrid, MediaModal
│   ├── entries/         # EntryCard
│   └── Navigation.tsx
├── lib/
│   ├── auth.ts          # JWT auth
│   ├── exif.ts          # EXIF GPS extraction
│   ├── gps.ts           # PAJ GPS + reverse geocoding
│   ├── upload.ts        # File upload handling
│   └── prisma.ts        # DB client
├── prisma/
│   └── schema.prisma    # DB schema
├── proxy.ts             # Auth middleware
├── docker-compose.yml
└── Dockerfile
```
