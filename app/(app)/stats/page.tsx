import { prisma } from '@/lib/prisma'

export const revalidate = 60

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default async function StatsPage() {
  const [entries, mediaStats, tripCount] = await Promise.all([
    prisma.entry.findMany({
      select: { date: true, country: true, city: true, latitude: true, longitude: true },
      orderBy: { date: 'asc' },
    }),
    prisma.media.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.trip.count(),
  ])

  const countries = [...new Set(entries.map(e => e.country).filter(Boolean))] as string[]
  const cities    = new Set(entries.map(e => e.city).filter(Boolean))
  const days      = new Set(entries.map(e => e.date.toISOString().split('T')[0]))

  const photoCount = mediaStats.find(m => m.type === 'IMAGE')?._count._all ?? 0
  const videoCount = mediaStats.find(m => m.type === 'VIDEO')?._count._all ?? 0

  const gpsEntries = entries.filter(e => e.latitude != null && e.longitude != null)
  let distanceKm = 0
  for (let i = 1; i < gpsEntries.length; i++) {
    distanceKm += haversineKm(
      gpsEntries[i - 1].latitude!, gpsEntries[i - 1].longitude!,
      gpsEntries[i].latitude!,     gpsEntries[i].longitude!,
    )
  }

  const firstDate = entries[0]?.date
  const lastDate  = entries[entries.length - 1]?.date

  const stats = [
    { label: 'Entries',          value: entries.length.toString() },
    { label: 'Trips',            value: tripCount.toString() },
    { label: 'Countries',        value: countries.length.toString() },
    { label: 'Cities',           value: cities.size.toString() },
    { label: 'Days on the road', value: days.size.toString() },
    { label: 'Distance',         value: `${Math.round(distanceKm).toLocaleString()} km` },
    { label: 'Photos',           value: photoCount.toLocaleString() },
    { label: 'Videos',           value: videoCount.toLocaleString() },
  ]

  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen pt-24 pb-16 page-enter">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-10">
          <h1 className="text-4xl font-['Playfair_Display'] font-semibold text-[#171717] tracking-tight">Stats</h1>
          {firstDate && lastDate && (
            <p className="mt-2 text-[#737373]">{fmt(firstDate)} → {fmt(lastDate)}</p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#e5e5e5] p-5 flex flex-col gap-1">
              <p className="text-2xl font-semibold text-[#171717] font-['Playfair_Display']">{value}</p>
              <p className="text-sm text-[#737373]">{label}</p>
            </div>
          ))}
        </div>

        {countries.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#e5e5e5] p-5">
            <h2 className="text-xs font-medium text-[#a3a3a3] uppercase tracking-wider mb-3">Countries visited</h2>
            <div className="flex flex-wrap gap-2">
              {countries.sort().map(c => (
                <span key={c} className="px-3 py-1 rounded-full bg-[#f5f5f4] text-sm text-[#171717]">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
