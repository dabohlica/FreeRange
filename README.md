# TravelTrace

A private, self-hosted travel journal — your own Polarsteps.

Track your live GPS location, upload photos & videos, map your memories, and share privately with friends via a single password.

---

## Features

- **Fullscreen interactive map** — Mapbox-based, diamond photo markers, click-to-preview
- **Live GPS tracking** — PAJ tracker integration + manual update fallback, auto-refresh every 45s
- **Photo & video upload** — drag & drop, EXIF GPS extraction, auto-maps media to location
- **Timeline** — chronological feed grouped by month, trip colour badges
- **Media gallery** — grid view + map view, fullscreen viewer with keyboard navigation
- **Trip grouping** — organise entries under named trips with custom colours
- **Private sharing** — two passwords: admin (full access) + viewer (read-only), no accounts needed
- **Reverse geocoding** — auto-detects city & country from coordinates via Mapbox

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT in HTTP-only cookies (via `jose`) |
| Maps | Mapbox GL JS |
| EXIF parsing | `exifr` |
| File upload | React Dropzone + `fs` (local storage) |
| Animations | Framer Motion |

---

## Prerequisites

- **Node.js** 20+ — check with `node --version`
- **PostgreSQL** 14+ — see install instructions below

---

## Setup (No Docker Required)

### 1. Install PostgreSQL

**macOS (Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
Download the installer from https://www.postgresql.org/download/windows/

---

### 2. Create the database

```bash
# macOS / Linux (most common)
createdb travel_journal

# If that fails, connect as postgres user first:
psql -U postgres -c "CREATE DATABASE travel_journal;"
```

---

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
# Your local Postgres connection
DATABASE_URL="postgresql://postgres:@localhost:5432/travel_journal"
# On macOS, the default user is often your system username:
# DATABASE_URL="postgresql://yourname:@localhost:5432/travel_journal"

# Auth — choose strong passwords
JWT_SECRET="run: openssl rand -base64 32"
ADMIN_PASSWORD="your-secure-admin-password"
VIEWER_PASSWORD="password-you-share-with-friends"

# Mapbox — free token from https://account.mapbox.com
NEXT_PUBLIC_MAPBOX_TOKEN="pk.your-token-here"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional: PAJ GPS share link for live tracking
PAJ_GPS_SHARE_URL=""
```

**Tip — find your Postgres username:**
```bash
psql -c "\du"    # list all users
whoami           # your system username (often the default on macOS)
```

---

### 4. Install & initialise

```bash
npm install
npm run setup
```

This runs: `prisma generate` → `prisma db push` → seed admin user.

---

### 5. Start the app

```bash
npm run dev
```

Open **http://localhost:3000** and sign in with your `ADMIN_PASSWORD`.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run setup` | First-time: generate Prisma client + push schema + seed |
| `npm run db:push` | Apply schema changes (no migration files) |
| `npm run db:migrate` | Create and apply a named migration |
| `npm run db:seed` | Re-create the admin user |
| `npm run db:studio` | Open Prisma Studio — visual DB browser |

---

## Auth System

| Env var | Role | Access |
|---------|------|--------|
| `ADMIN_PASSWORD` | Admin | Create/edit/delete entries, upload media, manage trips, set live GPS |
| `VIEWER_PASSWORD` | Viewer | View map, timeline, photos — read-only |

Share your `VIEWER_PASSWORD` with friends and family. Change it any time in `.env` and restart.

---

## Getting a Mapbox Token

1. Create a free account at https://account.mapbox.com
2. Copy the **Default public token** (starts with `pk.`)
3. Set it in `.env` as `NEXT_PUBLIC_MAPBOX_TOKEN`

Free tier: 50,000 map loads/month — more than enough for personal use.

---

## PAJ GPS Tracker

If you have a PAJ GPS tracker:
1. Open the PAJ app → share your location → copy the share URL
2. Set `PAJ_GPS_SHARE_URL` in `.env` and restart
3. The app polls the share page every 45s and extracts coordinates
4. A pulsing blue dot appears on the map

**No PAJ tracker?** Use Admin → **Live Location** tab to manually enter your position, or POST to the API from any location-aware tool:

```bash
curl -X POST http://localhost:3000/api/location \
  -b "auth_token=YOUR_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 48.8566, "longitude": 2.3522}'
```

---

## Adding Your First Entry

1. Sign in with your admin password
2. Click **Admin** in the nav
3. Go to **New Entry** tab
4. Fill in title and date
5. Drag & drop photos/videos
   - GPS is extracted automatically from photo EXIF data
   - City & country are reverse-geocoded from the coordinates
   - No GPS in photos? Enter latitude/longitude manually or leave blank
6. Click **Create Entry** — appears on map and timeline immediately

---

## Project Structure

```
travel_journal/
├── app/
│   ├── (app)/                 # Authenticated pages
│   │   ├── map/               # Fullscreen Mapbox map (homepage)
│   │   ├── timeline/          # Chronological entry feed
│   │   ├── media/             # Photo grid + media map view
│   │   └── admin/             # Admin dashboard
│   ├── api/
│   │   ├── auth/              # login / logout / me
│   │   ├── entries/           # CRUD entries
│   │   ├── media/             # List + delete media
│   │   ├── upload/            # Multipart upload + EXIF parsing
│   │   ├── location/          # Live GPS read/write
│   │   └── trips/             # CRUD trips
│   ├── login/
│   └── globals.css
├── components/
│   ├── Navigation.tsx         # Floating glass navbar
│   ├── map/TravelMap.tsx      # Mapbox markers + live dot
│   ├── media/                 # MediaModal, MediaGrid
│   └── entries/EntryCard.tsx  # Timeline card
├── lib/
│   ├── auth.ts                # JWT helpers
│   ├── exif.ts                # EXIF extraction
│   ├── gps.ts                 # PAJ scraping + reverse geocoding
│   ├── upload.ts              # File handling
│   └── prisma.ts              # DB client singleton
├── prisma/
│   ├── schema.prisma          # DB models
│   └── seed.ts                # Admin user seed
├── proxy.ts                   # Auth proxy (Next.js 16 middleware)
├── .env.example               # Environment variable template
├── docker-compose.yml         # Optional Docker setup
└── Dockerfile                 # Optional Docker build
```

---

## Database Schema

```
User          → admin account (created by seed)
Entry         → journal entry: title, date, location, description
Media         → photo/video attached to an entry + EXIF metadata
Location      → GPS location history
LiveLocation  → single-row current live position
Trip          → named group for organising entries
```

---

## Production Deployment (no Docker)

On a Linux VPS:

```bash
# Install Node 20
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20 && nvm use 20

# Clone, install, build
git clone <your-repo> && cd travel_journal
npm install
npm run build

# Configure
cp .env.example .env  # fill in production values

# Initialise DB
npm run setup

# Run with PM2
npm install -g pm2
pm2 start npm --name traveltrace -- start
pm2 save && pm2 startup
```

Put Nginx or Caddy in front for HTTPS.

---

## Troubleshooting

**`Error: connect ECONNREFUSED 127.0.0.1:5432`**
PostgreSQL is not running.
```bash
brew services start postgresql@16   # macOS
sudo systemctl start postgresql     # Linux
```

**`relation "users" does not exist`**
Schema hasn't been applied yet.
```bash
npm run db:push && npm run db:seed
```

**Map shows "Map unavailable"**
`NEXT_PUBLIC_MAPBOX_TOKEN` is missing or still the placeholder in `.env`. Restart the server after changing it.

**Photos upload but don't appear on the map**
The photo has no GPS EXIF data. Set latitude/longitude manually in the Admin entry form.

**`Invalid password` on login**
Check that `ADMIN_PASSWORD` is set in `.env` and that you restarted the dev server after editing the file.

**`password authentication failed for user "postgres"`**
Your Postgres user needs a password, or use your system username:
```bash
# Check which user works
psql -U $(whoami) -d travel_journal -c "SELECT 1"
# Then set DATABASE_URL accordingly
```
