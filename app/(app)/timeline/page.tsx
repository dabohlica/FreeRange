import { prisma } from '@/lib/prisma'
import EntryCard from '@/components/entries/EntryCard'

export const dynamic = 'force-dynamic'

export default async function TimelinePage() {
  const entries = await prisma.entry.findMany({
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      trip: { select: { id: true, name: true, color: true } },
    },
    orderBy: { date: 'desc' },
  })

  type CardEntry = React.ComponentProps<typeof EntryCard>['entry']

  const serialized: CardEntry[] = entries.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date.toISOString(),
    latitude: e.latitude,
    longitude: e.longitude,
    city: e.city,
    country: e.country,
    trip: e.trip,
    media: e.media.map((m) => ({
      id: m.id,
      url: m.url,
      type: m.type as string,
      filename: m.filename,
      width: m.width,
      height: m.height,
      takenAt: m.takenAt?.toISOString() ?? null,
    })),
  }))

  // Group by month
  const groupedSerialized: Record<string, CardEntry[]> = {}
  for (const entry of serialized) {
    const key = new Date(entry.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!groupedSerialized[key]) groupedSerialized[key] = []
    groupedSerialized[key].push(entry)
  }

  return (
    <main className="min-h-screen pt-24 pb-16 page-enter">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-10">
          <h1 className="text-4xl font-['Playfair_Display'] font-semibold text-[#171717] tracking-tight">
            Timeline
          </h1>
          <p className="mt-2 text-[#737373]">
            {entries.length} {entries.length === 1 ? 'memory' : 'memories'} captured
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-[#f5f5f4] flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <p className="text-[#737373] font-medium">No entries yet</p>
            <p className="text-[#a3a3a3] text-sm mt-1">Start adding entries from the Admin panel</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedSerialized).map(([month, monthEntries]) => (
              <section key={month}>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-sm font-semibold text-[#a3a3a3] uppercase tracking-widest">
                    {month}
                  </h2>
                  <div className="flex-1 h-px bg-[#e5e5e5]" />
                  <span className="text-xs text-[#a3a3a3]">{monthEntries.length}</span>
                </div>
                <div className="space-y-4">
                  {monthEntries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
