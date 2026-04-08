'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import MediaModal from '@/components/media/MediaModal'

const TravelMap = dynamic(() => import('@/components/map/TravelMap'), { ssr: false })

type ViewMode = 'grid' | 'map'

interface MediaItem {
  id: string
  url: string
  thumbnailUrl?: string | null
  type: string
  filename: string
  width?: number | null
  height?: number | null
  latitude?: number | null
  longitude?: number | null
  takenAt?: string | null
  entry?: {
    id: string
    title: string
    date: string
    latitude?: number | null
    longitude?: number | null
  } | null
}

interface EntryWithLocation {
  id: string
  title: string
  date: string
  latitude: number
  longitude: number
  media: Array<{ id: string; url: string; type: string; filename: string; takenAt?: string | null }>
}

export default function MediaPageClient({
  allMedia,
  gpsMedia,
  entriesWithLocation,
}: {
  allMedia: MediaItem[]
  gpsMedia: MediaItem[]
  entriesWithLocation: EntryWithLocation[]
}) {
  const [view, setView] = useState<ViewMode>('grid')
  const [filter, setFilter] = useState<'all' | 'photos' | 'videos'>('all')
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  const filtered = allMedia.filter((m) => {
    if (filter === 'photos') return m.type === 'IMAGE'
    if (filter === 'videos') return m.type === 'VIDEO'
    return true
  })

  return (
    <main className="min-h-screen pt-24 pb-16 page-enter">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-['Playfair_Display'] font-semibold text-[#171717] tracking-tight">
              Photos & Videos
            </h1>
            <p className="mt-2 text-[#737373]">
              {allMedia.length} files · {gpsMedia.length} with GPS location
            </p>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white rounded-xl border border-[#e5e5e5] p-1 gap-1">
              <button
                onClick={() => setView('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  view === 'grid' ? 'bg-[#171717] text-white' : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
                Grid
              </button>
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  view === 'map' ? 'bg-[#171717] text-white' : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                </svg>
                Map
              </button>
            </div>
          </div>
        </div>

        {/* Filter tabs (grid only) */}
        {view === 'grid' && (
          <div className="flex gap-2 mb-6">
            {(['all', 'photos', 'videos'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                  filter === f
                    ? 'bg-[#171717] text-white'
                    : 'bg-white border border-[#e5e5e5] text-[#737373] hover:text-[#171717] hover:border-[#d4d4d4]'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1.5 text-xs opacity-60">
                  {f === 'all' ? allMedia.length : f === 'photos' ? allMedia.filter(m => m.type === 'IMAGE').length : allMedia.filter(m => m.type === 'VIDEO').length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Grid view */}
        {view === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
            {filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => setModalIndex(i)}
                className="relative aspect-square rounded-xl overflow-hidden bg-[#f5f5f4] group cursor-pointer"
              >
                {item.type === 'VIDEO' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#171717]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white" className="opacity-80">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </div>
                ) : (
                  <Image
                    src={item.thumbnailUrl ?? item.url}
                    alt={item.filename}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                {item.latitude && (
                  <div className="absolute bottom-1.5 right-1.5 p-1 rounded-full bg-black/40 backdrop-blur-sm">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    </svg>
                  </div>
                )}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full text-center py-20 text-[#a3a3a3]">
                No {filter === 'videos' ? 'videos' : 'photos'} yet
              </div>
            )}
          </div>
        )}

        {/* Map view */}
        {view === 'map' && (
          <div className="rounded-2xl overflow-hidden border border-[#e5e5e5] shadow-sm" style={{ height: '70vh' }}>
            <TravelMap entries={entriesWithLocation} />
          </div>
        )}
      </div>

      {/* Modal */}
      {modalIndex !== null && (
        <MediaModal
          media={filtered}
          initialIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </main>
  )
}
