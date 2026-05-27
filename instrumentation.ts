import { prisma } from '@/lib/prisma'

export async function register() {
  // Only run in the Node.js server runtime, not the Edge runtime
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "midUrl" TEXT`
    )
  } catch (err) {
    // Non-fatal: log and continue. The column may already exist (caught by IF NOT EXISTS)
    // or the DB may be temporarily unreachable — the app will surface those errors per-request.
    console.error('[instrumentation] schema migration failed:', err)
  }
}
