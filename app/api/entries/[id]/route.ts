import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      trip: { select: { id: true, name: true, color: true } },
    },
  })

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(entry)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { title, description, date, latitude, longitude, altitude, city, country, tripId } = body

  const entry = await prisma.entry.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(date && { date: new Date(date) }),
      ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
      ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
      ...(altitude !== undefined && { altitude: altitude ? parseFloat(altitude) : null }),
      ...(city !== undefined && { city }),
      ...(country !== undefined && { country }),
      ...(tripId !== undefined && { tripId: tripId || null }),
    },
    include: {
      media: true,
      trip: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(entry)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    await prisma.entry.delete({ where: { id } })
  } catch (err) {
    console.error('Entry delete failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
