# FreeRange

A private, self-hosted travel journal — your own Polarsteps.

Track your live GPS location, upload photos & videos, map your memories, and share privately with friends via a single password.

---

## Features

- **Fullscreen interactive map** — Mapbox-based, photo pin markers, click-to-preview
- **Live GPS tracking** — PAJ tracker integration + manual update fallback, auto-refresh every 45s
- **Photo & video upload** — drag & drop, EXIF GPS extraction, auto-maps media to location
- **Timeline** — chronological feed grouped by month, trip colour badges
- **Media gallery** — grid view + map view, fullscreen viewer with swipe/keyboard navigation
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
| File storage | Supabase Storage (production) or local filesystem (dev) |
| EXIF parsing | `exifr` |
| File upload | React Dropzone |

---

## Setup: Local Development

No Supabase required — files are stored on local disk.

### Prerequisites

- Node.js 20+
- PostgreSQL 14+

### 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:** [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

### 2. Create the database

```bash
createdb travel_journal
# or: psql -U postgres -c "CREATE DATABASE travel_journal;"
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env` for local dev (Supabase vars are optional — omit them and files save to `public/uploads/`):

```env
DATABASE_URL="postgresql://postgres:@localhost:5432/travel_journal"

JWT_SECRET="run: openssl rand -base64 32"
ADMIN_PASSWORD="your-admin-password"
VIEWER_PASSWORD="password-for-friends"

NEXT_PUBLIC_MAPBOX_TOKEN="pk.your-token-here"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Install and initialise

```bash
npm install
npm run setup   # prisma generate + db push + seed admin user
```

### 5. Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your `ADMIN_PASSWORD`.

---

## Setup: Production (Supabase + Vercel)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Create a **private** Storage bucket named `media`
   - Storage → New bucket → name: `media` → Public: **off**

### 2. Get your Supabase credentials

From the Supabase dashboard:

| What | Where |
|------|-------|
| `DATABASE_URL` | Settings → Database → Connection string → **Transaction** (port 6543) |
| `DIRECT_URL` | Settings → Database → Connection string → **Direct** (port 5432) |
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` key (keep secret) |

`DATABASE_URL` uses the pooled connection (PgBouncer) for app queries. `DIRECT_URL` uses the direct connection for schema migrations.

### 3. Push the schema

Run this once from your local machine (or CI) using the direct connection:

```bash
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres" \
npx prisma db push
```

Or set both `DATABASE_URL` and `DIRECT_URL` in your local `.env` and run:

```bash
npm run db:push
npm run db:seed
```

### 4. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set the following environment variables in the Vercel dashboard (Project → Settings → Environment Variables):

```env
DATABASE_URL=             # Supabase Transaction pooler URL (port 6543)
DIRECT_URL=               # Supabase Direct connection URL (port 5432)
JWT_SECRET=               # openssl rand -base64 32
ADMIN_PASSWORD=           # your admin password
VIEWER_PASSWORD=          # password you share with friends
NEXT_PUBLIC_MAPBOX_TOKEN= # pk.your-token-here
NEXT_PUBLIC_APP_URL=      # https://your-app.vercel.app
SUPABASE_URL=             # https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=# your service_role key
```

`NEXT_PUBLIC_APP_URL` can also be left unset on Vercel — the platform sets `VERCEL_URL` automatically.

Vercel will run `prisma generate && next build` on every deploy (configured in `vercel.json`). Schema changes must be pushed manually via `npm run db:push` before deploying.

---

## Setup: Docker (self-hosted VPS)

```bash
git clone https://github.com/dabohlica/freerange.git
cd freerange
cp .env.example .env   # fill in all values
docker compose up -d
```

This starts the app + a local PostgreSQL container. For production, replace the local DB with Supabase by setting `DATABASE_URL` in `.env`.

---

## Auth

| Env var | Role | Access |
|---------|------|--------|
| `ADMIN_PASSWORD` | Admin | Create/edit/delete entries, upload media, manage trips |
| `VIEWER_PASSWORD` | Viewer | View map, timeline, photos — read-only |

Share `VIEWER_PASSWORD` with friends. Change it any time in `.env` (or Vercel env vars) and redeploy/restart.

---

## Getting a Mapbox Token

1. Create a free account at [account.mapbox.com](https://account.mapbox.com)
2. Copy the **Default public token** (starts with `pk.`)
3. Set it as `NEXT_PUBLIC_MAPBOX_TOKEN`

Free tier: 50,000 map loads/month — more than enough for personal use.

---

## PAJ GPS Tracker

If you have a PAJ GPS tracker:

1. Open the PAJ app → share your location → copy the share URL
2. Set `PAJ_GPS_SHARE_URL` in `.env`
3. The app polls it every 45s and shows a pulsing blue dot on the map

**No PAJ tracker?** Use Admin → **Live Location** tab to set your position manually.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run setup` | First-time init: generate + push schema + seed admin |
| `npm run db:push` | Push schema changes to the database |
| `npm run db:migrate` | Create a named migration file |
| `npm run db:seed` | (Re-)create the admin user |
| `npm run db:studio` | Open Prisma Studio — visual DB browser |

---

## Project Structure

```
freerange/
├── app/
│   ├── (app)/                 # Authenticated pages
│   │   ├── map/               # Fullscreen Mapbox map (homepage)
│   │   ├── timeline/          # Chronological entry feed
│   │   ├── media/             # Photo grid + media map view
│   │   └── admin/             # Admin dashboard
│   ├── api/
│   │   ├── auth/              # login / logout / me
│   │   ├── entries/           # CRUD entries
│   │   ├── media/             # List, serve, delete media
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
│   ├── upload.ts              # Supabase / local file handling
│   └── prisma.ts              # DB client singleton
├── prisma/
│   ├── schema.prisma          # DB models
│   └── seed.ts                # Admin user seed
├── .env.example               # Environment variable template
├── vercel.json                # Vercel build config
├── docker-compose.yml         # Docker setup
└── Dockerfile
```

---

## Troubleshooting

**Map shows "Map unavailable"**
`NEXT_PUBLIC_MAPBOX_TOKEN` is missing or still the placeholder. Restart after changing it.

**Photos upload but don't appear on the map**
The photo has no GPS EXIF data. Enter latitude/longitude manually in the Admin entry form.

**`Invalid password` on login**
Check that `ADMIN_PASSWORD` is set and that you restarted after editing `.env`.

**`Error: connect ECONNREFUSED 127.0.0.1:5432`** (local dev)
PostgreSQL is not running.
```bash
brew services start postgresql@16   # macOS
sudo systemctl start postgresql     # Linux
```

**`relation "users" does not exist`**
Schema hasn't been pushed yet.
```bash
npm run db:push && npm run db:seed
```

**Supabase upload fails with 403**
The `media` bucket must be **private** (not public) and `SUPABASE_SERVICE_ROLE_KEY` must be the `service_role` key, not the `anon` key.

**Schema changes not reflected after Vercel deploy**
Vercel only runs `prisma generate` — it no longer auto-pushes schema changes. Run `npm run db:push` from your local machine before deploying.

---

## License

MIT — see [LICENSE](LICENSE)
