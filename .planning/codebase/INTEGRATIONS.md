# External Integrations - Travel Journal

## External Services

### Supabase
**Purpose**: Cloud database and file storage  
**Client Library**: `@supabase/supabase-js@^2.101.0`  
**Integration Points**:
- Database: PostgreSQL backend via Supabase (configured in `DATABASE_URL`)
- Storage: Media uploads to `media` bucket (images and videos)
- Connection: Created dynamically in `lib/upload.ts` using service role credentials

**Configuration**:
- Service role key required for server-side operations
- Fallback to local file storage when Supabase credentials absent
- Remote image pattern: `*.supabase.co` (allowed in next.config.ts)

**Usage**:
```typescript
// From lib/upload.ts
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
supabase.storage.from('media').upload(filename, buffer, { contentType })
```

---

### Mapbox
**Purpose**: Map rendering and reverse geocoding  
**Libraries**:
- `mapbox-gl@^3.20.0` - Core map library
- `react-map-gl@^8.1.0` - React wrapper

**Integration Points**:
- Map display for trip visualization
- Reverse geocoding: coordinates → city/country lookup
- Uses Mapbox Geocoding API v5

**API Endpoints Used**:
- `https://api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json`

**Configuration**:
- Public token: `NEXT_PUBLIC_MAPBOX_TOKEN`
- Token format: `pk.eyJ...` (public key, safe to expose)
- Cache: Reverse geocoding results cached for 24 hours

**Usage** (from `lib/gps.ts`):
```typescript
const res = await fetch(
  `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,country&access_token=${token}`,
  { next: { revalidate: 86400 } }
)
```

---

### PAJ GPS Tracker
**Purpose**: Live location tracking integration  
**Share Link**: `PAJ_GPS_SHARE_URL` environment variable  
**Integration**: Optional web scraping of share page

**Details**:
- Fetches HTML from PAJ share URL
- Parses coordinates from embedded JSON or meta tags
- Patterns: `lat/lng` JSON, `latitude/longitude` fields, URL params, data attributes
- Graceful fallback if parsing fails

**Usage** (from `lib/gps.ts`):
```typescript
export async function fetchPAJLocation(shareUrl: string): Promise<GPSCoordinates | null>
```

---

## Authentication Approach

### Hybrid JWT + Password-Based Auth
**Framework**: NextAuth.js 4.24.13 + custom JWT implementation

**Architecture**:
1. **Role-Based Access Control (RBAC)**:
   - Admin role: Full access to create/edit/delete entries
   - Viewer role: Read-only access

2. **Token Management**:
   - JWT implementation using JOSE library (`jose@^6.2.2`)
   - Token format: HS256 algorithm
   - Expiration: 7 days
   - Stored in HTTP-only cookie: `auth_token`

3. **Password Verification**:
   - Admin password: `ADMIN_PASSWORD` env var
   - Viewer password: `VIEWER_PASSWORD` env var
   - Password comparison using `bcryptjs@^3.0.3` (12 salt rounds)

4. **Session Functions** (from `lib/auth.ts`):
   - `getSession()` - Retrieve current user session from cookie
   - `isAdmin()` - Check admin role
   - `isAuthenticated()` - Check if user logged in
   - `signToken()` - Create JWT token
   - `verifyToken()` - Validate JWT token
   - `hashPassword()` - Secure password hashing
   - `comparePassword()` - Compare plain vs hashed password

5. **Login Flow** (via `app/api/auth/login/route.ts`):
   - Compare provided password against env variables
   - Create JWT payload with user role
   - Set auth_token cookie
   - Return token to client

---

## Storage Integration

### Dual Storage Architecture
**Logic Location**: `lib/upload.ts`

#### Production (Vercel): Supabase Storage
- **Bucket**: `media`
- **Provider**: Supabase
- **Authentication**: Service role key (server-side only)
- **Access Pattern**: Via authenticated API route `/api/media/url/{filename}` (privacy layer)
- **Operations**:
  - Upload: `supabase.storage.from('media').upload(filename, buffer, { contentType, upsert: false })`
  - Delete: `supabase.storage.from('media').remove([filename])`

#### Development (Local): Filesystem
- **Location**: `public/uploads/`
- **Access Pattern**: Static file serving via `/uploads/{filename}`
- **Operations**: Direct fs/promises read/write

### File Processing
- **Validation**:
  - Max size: 100MB
  - Allowed types: JPEG, PNG, WebP, HEIC, HEIF, GIF (images); MP4, MOV, AVI, WebM, MKV, M4V (video)

- **Processing**:
  - EXIF extraction: `exifr@^7.1.3`
  - Image optimization: `sharp@^0.34.5`
  - UUID filenames: `uuid@^13.0.0`

---

## Database ORM & Connection

### Prisma ORM
**Version**: 6.19.2  
**Schema**: `prisma/schema.prisma`  
**Client**: `@prisma/client@^6.19.2`

#### Connection Configuration
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

**Connection Modes**:
- `DATABASE_URL`: Connection pooler (Supabase pooler for production)
- `DIRECT_URL`: Direct connection (optional, for migrations)

#### Database Schema

**Users** (Role-based):
```prisma
model User {
  id, email, password, name, role (ADMIN|VIEWER)
  entries (relationship)
}
```

**Entries** (Travel journal entries):
```prisma
model Entry {
  id, title, description, date
  latitude, longitude, altitude (GPS)
  city, country (reverse geocoding)
  tripId, authorId
  media (relationship), author (relationship), trip (relationship)
  indexes: date, (latitude, longitude)
}
```

**Media** (Images/videos):
```prisma
model Media {
  id, filename, url, type (IMAGE|VIDEO)
  size, width, height, latitude, longitude, altitude
  takenAt, hash (EXIF data), createdAt
  entryId
}
```

**Locations** (GPS track history):
```prisma
model Location {
  id, latitude, longitude, altitude, speed, accuracy
  source, recordedAt, createdAt
  index: recordedAt
}
```

**LiveLocation** (Current position):
```prisma
model LiveLocation {
  id (singleton), latitude, longitude, altitude
  speed, accuracy, source, updatedAt
}
```

**Trips** (Trip grouping):
```prisma
model Trip {
  id, name, description, startDate, endDate
  coverImage, color (hex), createdAt, updatedAt
  entries (relationship)
}
```

#### Database Commands
```bash
npm run db:migrate    # Run migrations with Prisma
npm run db:push      # Push schema changes to DB
npm run db:seed      # Seed with initial data
npm run db:studio    # Open Prisma Studio GUI
```

---

## Environment Variables Required

### Database
- `DATABASE_URL` (required)
  - Format: `postgresql://[user]:[password]@[host]:[port]/[database]`
  - For Supabase pooler: Connection string from dashboard
- `DIRECT_URL` (optional)
  - Direct PostgreSQL URL for migrations (Supabase: disable pooling)

### Authentication
- `JWT_SECRET` (required)
  - Description: Secret key for JWT signing/verification
  - Recommendation: 32+ random characters (generate: `openssl rand -base64 32`)
- `ADMIN_PASSWORD` (required)
  - Description: Password for admin role login
- `VIEWER_PASSWORD` (required)
  - Description: Password for viewer role login

### Maps & Geolocation
- `NEXT_PUBLIC_MAPBOX_TOKEN` (required for maps)
  - Format: `pk.eyJ...` (public token)
  - Source: Mapbox dashboard
  - Public (safe to expose in frontend)
- `PAJ_GPS_SHARE_URL` (optional)
  - Description: PAJ GPS tracker share page URL
  - Format: Full HTTPS URL to share page

### Cloud Storage
- `SUPABASE_URL` (required for production/Vercel)
  - Format: `https://[project-ref].supabase.co`
  - Source: Supabase dashboard
- `SUPABASE_SERVICE_ROLE_KEY` (required for production/Vercel)
  - Description: Service role key (server-side auth)
  - Source: Supabase project settings → API
  - Security: Keep on server only, never expose

### Application
- `NEXT_PUBLIC_APP_URL` (required)
  - Description: Application base URL
  - Local: `http://localhost:3000`
  - Production: Auto-set on Vercel, or custom domain

---

## Third-Party Libraries for Specific Features

### EXIF Data Extraction
- **Library**: `exifr@^7.1.3`
- **Purpose**: Extract GPS, timestamp, dimensions from photos
- **API** (from `lib/exif.ts`):
  ```typescript
  const data = await exifr.parse(file, {
    gps: true,
    tiff: true,
    exif: true,
    pick: ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'DateTimeOriginal', ...]
  })
  ```
- **Returns**: `ExifData { latitude, longitude, altitude, takenAt, width, height }`

### Drag-and-Drop File Upload
- **Library**: `react-dropzone@^15.0.0`
- **Purpose**: User-friendly file selection UI
- **Integration**: Used in media upload components
- **API**: Provides `getRootProps()` and `getInputProps()` for drop zones

### Image Processing
- **Library**: `sharp@^0.34.5`
- **Purpose**: Server-side image optimization and resizing
- **Use Case**: Prepare media before Supabase upload
- **Formats**: JPEG, PNG, WebP, HEIC, GIF, etc.

### Animations
- **Library**: `framer-motion@^12.38.0`
- **Purpose**: Smooth UI transitions and component animations
- **Scope**: Used throughout frontend for polish

### UUID Generation
- **Library**: `uuid@^13.0.0`
- **Purpose**: Generate unique IDs for uploaded files
- **Usage**: `const filename = \`${uuidv4()}${ext}\``

### JWT Utilities
- **JOSE** (`jose@^6.2.2`):
  - JWT signing/verification with HS256
  - `SignJWT`, `jwtVerify` for token operations
  - Expiration: 7 days

- **jsonwebtoken** (`jsonwebtoken@^9.0.3`):
  - Additional JWT utilities (backup/legacy support)

### Password Security
- **bcryptjs** (`bcryptjs@^3.0.3`):
  - Password hashing with 12 salt rounds
  - Constant-time comparison
  - API: `bcrypt.hash()`, `bcrypt.compare()`

---

## API Authentication Layer

All API routes protected with middleware checking JWT token:
- Location: `app/api/` routes
- Methods: Verify `auth_token` cookie before processing
- Scope: User ID from token payload
- Roles: Admin routes may have additional RBAC checks

**Protected Routes**:
- POST `/api/entries` - Create entry (admin)
- PUT `/api/entries/{id}` - Update entry (admin)
- DELETE `/api/entries/{id}` - Delete entry (admin)
- POST `/api/upload` - Upload media (admin)
- DELETE `/api/media/{id}` - Delete media (admin)
- GET `/api/media/url/{filename}` - Serve media (authenticated)

