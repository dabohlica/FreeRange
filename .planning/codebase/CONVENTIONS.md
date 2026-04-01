# Travel Journal — Code Conventions

## File Naming
- **Components**: PascalCase (`EntryCard.tsx`, `MediaModal.tsx`)
- **Pages/API routes**: lowercase (`/map/page.tsx`, `/api/entries/route.ts`)
- **Utilities**: camelCase (`auth.ts`, `upload.ts`, `exif.ts`)

## Naming
- Functions/variables: camelCase
- Constants: SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE`, `ALLOWED_MIME_TYPES`)
- React components: PascalCase
- Types/Interfaces: PascalCase (`JWTPayload`, `ExifData`)

## Component Structure
```
components/
  entries/    # Entry display components
  media/      # Media-related components
  map/        # Map components
  admin/      # Admin-specific components
  ui/         # Reusable UI primitives
```
Route group `(app)` wraps all authenticated pages.

## TypeScript Patterns
- Interfaces defined inline in the file that uses them
- Optional + nullable: `width?: number | null`
- Props typed inline: `function Foo({ entry }: { entry: Entry })`
- Union types for finite sets: `type Tab = 'entries' | 'new-entry' | 'bulk'`
- Dynamic route params: `{ params }: { params: Promise<{ id: string }> }` then `await params`

## API Route Patterns

### Auth check (viewer)
```typescript
const session = await getSession()
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### Auth check (admin only)
```typescript
if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

### Response format
- Success: `NextResponse.json(data)` or `NextResponse.json(data, { status: 201 })`
- Error: `NextResponse.json({ error: 'message' }, { status: N })`
- Standard codes: 400 bad request, 401 unauth, 403 forbidden, 404 not found, 500 server error

### Error handling
```typescript
try {
  await prisma.entry.delete({ where: { id } })
} catch (err) {
  console.error('Context:', err)
  return NextResponse.json({ error: String(err) }, { status: 500 })
}
```

## State Management
- `useState` / `useCallback` / `useEffect` only — no global store
- Client components marked with `'use client'`; default to Server Components
- Pagination via URL search params (`?limit=50&offset=0`)

## CSS / Tailwind Patterns

### Color palette (hex literals in class brackets)
| Token | Value | Usage |
|---|---|---|
| Background | `#fafaf9` | Page bg |
| Foreground | `#171717` | Text, buttons |
| Card | `#ffffff` | Card bg |
| Border | `#e5e5e5` | Dividers |
| Muted bg | `#f5f5f4` | Hover states |
| Muted text | `#737373` | Secondary text |
| Accent | `#d4af37` | Gold highlights |
| Destructive | `#ef4444` | Delete actions |

### Typography
- Body: `Inter`; Headings: `Playfair Display`
- Headings: `text-4xl font-['Playfair_Display'] font-semibold`

### Border radius scale
- Small UI: `rounded-lg` / `rounded-xl`
- Modals / large containers: `rounded-2xl`
- Circles: `rounded-full`

### Transitions
- Default: `transition-all duration-300`
- Color only: `transition-colors duration-200`

### Glass effect
`.glass` — `rgba(255,255,255,0.85)` + `backdrop-filter: blur(12px)`

### Page enter animation
`.page-enter` — CSS keyframe `fadeIn` defined in `globals.css`

## Import Patterns
- Alias: `@/*` → project root
- Dynamic imports for heavy client components:
  ```typescript
  const TravelMap = dynamic(() => import('@/components/map/TravelMap'), { ssr: false })
  ```
- Prisma singleton: `import { prisma } from '@/lib/prisma'`

## Git / Commits
- Conventional Commits style: `Fix modal keyboard navigation`, `Add bulk delete with checkboxes`
- Type-check before committing: `npx tsc --noEmit`
- Never commit `.next/`, `node_modules/`, or build artifacts
