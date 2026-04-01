# Testing Infrastructure

## Current Status: None

No test files, no testing framework, no test configuration exists in this project.

- No `*.test.ts` / `*.spec.tsx` files
- No Jest, Vitest, Cypress, or Playwright installed
- No `__tests__/` directories

## What Does Exist

### Type Checking
- **TypeScript strict mode** (`"strict": true` in tsconfig.json)
- Run manually: `npx tsc --noEmit`
- Also runs as part of `next build`

### Linting
- ESLint via `eslint-config-next/core-web-vitals` + TypeScript rules
- Run: `npm run lint`

## Key Testing Gaps

| Area | Gap | Priority |
|---|---|---|
| Utility functions (`lib/`) | No unit tests | High |
| API routes | No endpoint tests | High |
| Auth flow | No login/token tests | High |
| File upload pipeline | No upload tests | Medium |
| React components | No component tests | Medium |
| E2E workflows | No browser tests | Low |

## Recommended Setup (When Ready)

```bash
npm install -D jest @testing-library/react @testing-library/jest-dom \
  jest-environment-jsdom @types/jest
```

### High-value tests to write first
1. `lib/auth.ts` — JWT signing, session parsing, password hashing
2. `lib/upload.ts` — MIME type checks, file size validation, hash deduplication
3. `lib/utils.ts` — `formatDate`, `formatFileSize`, `cn`
4. API route auth guards — 401 without session, 403 for non-admin
5. `api/entries` CRUD — create, read, update, delete flows

### Coverage targets (when testing is added)
- Utilities: 90%+
- API routes: 80%+
- Components: 60%+
- Overall: 70%+
