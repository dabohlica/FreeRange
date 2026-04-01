# Tech Stack - Travel Journal

## Runtime & Framework

- **Node.js**: LTS version (as per TypeScript config targeting ES2017)
- **Next.js**: 16.2.1
- **React**: 19.2.4
- **React DOM**: 19.2.4

## Language & Type System

- **TypeScript**: 5.x
- **Strictness**: Strict mode enabled
  - `strict: true` in tsconfig.json
  - `noEmit: true`
  - `esModuleInterop: true`
  - `isolatedModules: true`
- **JSX Compiler**: React 17+ (react-jsx)
- **Module Resolution**: bundler
- **Target**: ES2017

## Styling Approach

- **Tailwind CSS**: 4.x
  - PostCSS integration with `@tailwindcss/postcss` plugin
  - Uses Tailwind merge for class merging (`tailwind-merge@^3.5.0`)
  - Class variance authority for component variants (`class-variance-authority@^0.7.1`)
- **Radix UI Components**: For accessible UI primitives
  - `@radix-ui/react-dialog@^1.1.15`
  - `@radix-ui/react-dropdown-menu@^2.1.16`
  - `@radix-ui/react-slot@^1.2.4`
  - `@radix-ui/react-toast@^1.2.15`
- **Lucide React**: Icon library (`lucide-react@^1.7.0`)
- **CSS**: PostCSS configured for Tailwind

## Build Tooling

- **Build System**: Next.js built-in (no manual webpack/Turbopack config)
- **Output Mode**: Standalone (optimized for containerization and deployment)
- **Image Optimization**: Disabled (`unoptimized: true`) to support Supabase remote image patterns
- **Server Actions**: Enabled with 100MB body size limit for large file uploads

## Package Manager & Key Dependencies

### Package Manager
- **npm** (npm-lock.json present)

### Core Dependencies (v0.1.0)

| Package | Version | Purpose |
|---------|---------|---------|
| next | 16.2.1 | Framework |
| react | 19.2.4 | UI library |
| react-dom | 19.2.4 | DOM rendering |
| @prisma/client | 6.19.2 | Database ORM |
| prisma | 6.19.2 | ORM CLI & migrations |

### Database & ORM
| Package | Version | Purpose |
|---------|---------|---------|
| @prisma/client | 6.19.2 | PostgreSQL ORM client |
| prisma | 6.19.2 | Prisma CLI |
| @auth/prisma-adapter | 2.11.1 | Auth adapter (NextAuth compatibility) |

### Authentication & Security
| Package | Version | Purpose |
|---------|---------|---------|
| next-auth | 4.24.13 | Authentication framework |
| jose | 6.2.2 | JWT signing & verification |
| jsonwebtoken | 9.0.3 | JWT utilities |
| bcryptjs | 3.0.3 | Password hashing |

### File Upload & Storage
| Package | Version | Purpose |
|---------|---------|---------|
| @supabase/supabase-js | 2.101.0 | Supabase client (storage/database) |
| multer | 2.1.1 | File upload middleware |
| react-dropzone | 15.0.0 | Drag-and-drop file component |
| sharp | 0.34.5 | Image processing & optimization |

### Geolocation & Maps
| Package | Version | Purpose |
|---------|---------|---------|
| mapbox-gl | 3.20.0 | Map library |
| react-map-gl | 8.1.0 | React wrapper for Mapbox |

### Media & EXIF
| Package | Version | Purpose |
|---------|---------|---------|
| exifr | 7.1.3 | EXIF metadata extraction |

### UI & Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| framer-motion | 12.38.0 | Animation library |
| clsx | 2.1.1 | Class name utilities |
| uuid | 13.0.0 | UUID generation |
| tailwind-merge | 3.5.0 | Tailwind class merging |
| class-variance-authority | 0.7.1 | Component variant system |
| @radix-ui/react-dialog | 1.1.15 | Dialog component |
| @radix-ui/react-dropdown-menu | 2.1.16 | Dropdown menu |
| @radix-ui/react-slot | 1.2.4 | Slot composition |
| @radix-ui/react-toast | 1.2.15 | Toast notifications |
| lucide-react | 1.7.0 | Icon library |

### Dev Dependencies (TypeScript, Linting, Styling)
| Package | Version | Purpose |
|---------|---------|---------|
| typescript | 5.x | Type checking |
| @types/node | 20.x | Node.js types |
| @types/react | 19.x | React types |
| @types/react-dom | 19.x | React DOM types |
| @types/bcryptjs | 2.4.6 | bcryptjs types |
| @types/jsonwebtoken | 9.0.10 | JWT types |
| @types/multer | 2.1.0 | Multer types |
| @types/uuid | 10.0.0 | UUID types |
| eslint | 9.x | Linting |
| eslint-config-next | 16.2.1 | Next.js ESLint config |
| tailwindcss | 4.x | CSS framework |
| @tailwindcss/postcss | 4.x | Tailwind PostCSS plugin |

## Deployment Platform & Configuration

### Deployment Target: Vercel

**Configuration File**: `vercel.json`
```json
{
  "framework": "nextjs",
  "buildCommand": "prisma generate && prisma db push --accept-data-loss && next build",
  "installCommand": "npm install"
}
```

### Key Deployment Settings
- **Framework**: Next.js
- **Build Command**: Includes Prisma code generation and database schema push
- **Install Command**: Standard npm install
- **Output**: Standalone mode enables Docker containerization
- **Environment**: Vercel automatically sets `NEXT_PUBLIC_APP_URL` for deployment domain

### Docker Support
- Dockerfile present for containerized deployment
- docker-compose.yml for local development PostgreSQL setup
- .dockerignore for optimized image size

### Key Environment Variables for Deployment
- `DATABASE_URL`: PostgreSQL connection string
- `SUPABASE_URL`: For production storage (Vercel-friendly)
- `SUPABASE_SERVICE_ROLE_KEY`: For file uploads to Supabase
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Map rendering token
- `JWT_SECRET`: Authentication secret
- `NEXT_PUBLIC_APP_URL`: App deployment URL (auto-set on Vercel)

