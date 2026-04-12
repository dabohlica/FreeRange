import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchWeather } from '@/lib/weather'

export const maxDuration = 60
export const runtime = 'nodejs'

const BATCH_SIZE = 5

export async function POST(req: Request) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const entryId = searchParams.get('entryId')

  // Single-entry fetch mode
  if (entryId) {
    const entry = await prisma.entry.findUnique({ where: { id: entryId } })
    if (!entry) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!entry.latitude || !entry.longitude) {
      return NextResponse.json({ error: 'no GPS' }, { status: 422 })
    }
    const dateStr = new Date(entry.date).toISOString().slice(0, 10)
    const weather = await fetchWeather(entry.latitude, entry.longitude, dateStr)
    if (!weather) return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
    await prisma.entry.update({ where: { id: entryId }, data: { weather } })
    return NextResponse.json({ ok: true, weather })
  }

  // Batch backfill mode — entries with GPS that lack weather
  const remainingBefore = await prisma.entry.count({
    where: { weather: { equals: Prisma.DbNull }, latitude: { not: null }, longitude: { not: null } },
  })

  const batch = await prisma.entry.findMany({
    where: { weather: { equals: Prisma.DbNull }, latitude: { not: null }, longitude: { not: null } },
    take: BATCH_SIZE,
    orderBy: { date: 'desc' },
  })

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const entry of batch) {
    try {
      const dateStr = new Date(entry.date).toISOString().slice(0, 10)
      const weather = await fetchWeather(entry.latitude!, entry.longitude!, dateStr)
      if (!weather) throw new Error('no data returned')
      await prisma.entry.update({ where: { id: entry.id }, data: { weather } })
      processed++
    } catch (err) {
      failed++
      errors.push(`${entry.id}: ${(err as Error).message}`)
      console.error('[backfill-weather] failed', entry.id, err)
    }
  }

  const remaining = Math.max(0, remainingBefore - processed)
  return NextResponse.json({ processed, failed, remaining, errors })
}
