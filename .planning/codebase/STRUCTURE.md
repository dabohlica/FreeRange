# TravelTrace Codebase Structure

## Directory Tree

```
travel_journal/
├── app/
│   ├── (app)/                          # Protected route group (auth required)
│   │   ├── layout.tsx                  # Session check + Navigation render
│   │   ├── admin/
│   │   │   ├── page.tsx                # SSR: prefetch entries + trips
│   │   │   └── AdminClient.tsx         # Client: upload, edit, bulk ops (~900 lines)
│   │   ├── map/
│   │   │   ├── page.tsx                # SSR: fetch entries + live location
│   │   │   └── MapView.tsx             # Client: map interaction + entry sidebar
│   │   ├── timeline/
│   │   │   └── page.tsx                # SSR: entries grouped by date
│   │   ├── media/
│   │   │   ├── page.tsx                # SSR: all media + GPS media
│   │   │   └── MediaPageClient.tsx     # Client: grid/map toggle, modal
│   │   └── live/
│   │       └── page.tsx                # SSR: live location display
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts          # POST: verify password, set JWT cookie
│   │   │   ├── logout/route.ts         # POST: clear cookie
│   │   │   └── me/route.ts             # GET: current session
│   │   ├── entries/
│   │   │   ├── route.ts                # GET (list+paginate), POST (create)
│   │   │   └── [id]/route.ts           # GET, PATCH, DELETE
│   │   ├── media/
│   │   │   ├── route.ts                # GET (list, ?withGps=true)
│   │   │   ├── [id]/route.ts           # DELETE
│   │   │   └── url/[filename]/route.ts # GET: auth-gated signed URL proxy
│   │   ├── upload/route.ts             # POST: multipart upload + EXIF + dedup
│   │   ├── location/route.ts           # GET live loc, POST manual update
│   │   └── trips/route.ts              # GET list, POST create
│   ├── layout.tsx                      # Root layout + fonts + metadata
│   ├── page.tsx                        # Redirect → /map
│   ├── login/page.tsx                  # Public login page
│   └── globals.css                     # Tailwind imports + keyframes + .glass
├── components/
│   ├── map/
│   │   └── TravelMap.tsx               # Mapbox GL: sprites, clusters, pins, live dot
│   ├── admin/
│   │   └── LocationPicker.tsx          # Map-based lat/lng picker (dynamic, ssr:false)
│   ├── entries/
│   │   └── EntryCard.tsx               # Entry preview with media thumbnail
│   ├── media/
│   │   ├── MediaGrid.tsx               # Photo/video grid
│   │   └── MediaModal.tsx              # Fullscreen viewer + keyboard nav
│   └── Navigation.tsx                  # Top nav bar (scroll-aware bg)
├── lib/
│   ├── auth.ts                         # JWT sign/verify, getSession(), role checks
│   ├── prisma.ts                       # Singleton Prisma client
│   ├── upload.ts                       # saveUploadedFile(), deleteUploadedFile()
│   ├── exif.ts                         # extractExif(buffer) → GPS + dimensions
│   ├── gps.ts                          # fetchPAJLocation(), reverseGeocode()
│   └── utils.ts                        # cn(), formatDate(), formatFileSize()
├── prisma/
│   ├── schema.prisma                   # DB models: User, Entry, Media, Trip, Location, LiveLocation
│   └── seed.ts
├── public/uploads/                     # Local file storage (dev only)
├── .planning/codebase/                 # Codebase map documents
├── next.config.ts                      # images.unoptimized, serverActions.bodySizeLimit
├── prisma.config.ts                    # directUrl for db push (DIRECT_URL env var)
├── vercel.json                         # buildCommand: prisma generate + db push + next build
├── tailwind.config.ts
└── tsconfig.json                       # strict, paths: @/* → root
```

## API Routes Quick Reference

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | none | Password → JWT cookie |
| `/api/auth/logout` | POST | any | Clear cookie |
| `/api/auth/me` | GET | any | Current session |
| `/api/entries` | GET, POST | GET: any / POST: admin | List (paginated) / Create |
| `/api/entries/[id]` | GET, PATCH, DELETE | GET: any / rest: admin | Single entry CRUD |
| `/api/media` | GET | any | List media (`?withGps=true` filter) |
| `/api/media/[id]` | DELETE | admin | Delete media + file |
| `/api/media/url/[filename]` | GET | any | Signed URL proxy (1hr Supabase URL) |
| `/api/upload` | POST | admin | Multipart file upload |
| `/api/location` | GET, POST | GET: any / POST: admin | Live location |
| `/api/trips` | GET, POST | GET: any / POST: admin | Trip management |

## Key Lib Functions

| File | Function | Purpose |
|---|---|---|
| `auth.ts` | `getSession()` | Read + verify JWT from cookie |
| `auth.ts` | `signToken(payload)` | Create 7-day HS256 JWT |
| `upload.ts` | `saveUploadedFile(buf, name)` | Supabase or local storage |
| `upload.ts` | `deleteUploadedFile(url, filename)` | Remove from storage |
| `exif.ts` | `extractExif(buffer)` | GPS + date + dimensions |
| `gps.ts` | `reverseGeocode(lat, lng)` | Mapbox → city + country |
| `gps.ts` | `fetchPAJLocation(url)` | Scrape PAJ share page |
| `utils.ts` | `cn(...inputs)` | clsx + twMerge |
| `utils.ts` | `formatDate(date)` | "January 1, 2024" |

## Component Tree

```
RootLayout
├── AppLayout (app/(app)/layout.tsx) — auth guard
│   ├── Navigation
│   ├── MapPage → MapView → TravelMap (ssr:false) + MediaModal
│   ├── TimelinePage
│   ├── MediaPage → MediaPageClient → MediaGrid + MediaModal
│   ├── LivePage
│   └── AdminPage → AdminClient → LocationPicker (ssr:false)
└── LoginPage
```
