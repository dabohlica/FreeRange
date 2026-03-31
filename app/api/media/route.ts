import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const withGps = searchParams.get('withGps') === 'true'
  const limit = parseInt(searchParams.get('limit') || '100')

  const media = await prisma.media.findMany({
    where: withGps
      ? { latitude: { not: null }, longitude: { not: null } }
      : undefined,
    include: {
      entry: {
        select: { id: true, title: true, date: true, latitude: true, longitude: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(media)
}
