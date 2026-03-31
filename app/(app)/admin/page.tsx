import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getSession()
  if (session?.role !== 'admin') redirect('/')

  const [entries, trips] = await Promise.all([
    prisma.entry.findMany({
      include: {
        media: { orderBy: { createdAt: 'asc' } },
        trip: { select: { id: true, name: true, color: true } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.trip.findMany({
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <AdminClient
      initialEntries={entries.map((e) => ({
        ...e,
        date: e.date.toISOString(),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        media: e.media.map((m) => ({
          ...m,
          takenAt: m.takenAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
        })),
      }))}
      initialTrips={trips.map((t) => ({
        ...t,
        startDate: t.startDate?.toISOString() ?? null,
        endDate: t.endDate?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  )
}
