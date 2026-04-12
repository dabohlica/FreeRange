'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import MediaModal from '@/components/media/MediaModal'
import { formatDate } from '@/lib/utils'
import WeatherBadge from '@/components/weather/WeatherBadge'
import type { WeatherData } from '@/lib/weather'

const TravelMap = dynamic(() => import('@/components/map/TravelMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#f5f5f4]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#737373]">Loading map…</p>
      </div>
    </div>
  ),
})

interface Media {
  id: string
  url: string
  type: string
  filename: string
  width?: number | null
  height?: number | null
  takenAt?: string | null
}

interface Entry {
  id: string
  title: string
  description?: string | null
  date: string
  latitude: number | null
  longitude: number | null
  city?: string | null
  country?: string | null
  weather?: WeatherData | null
  media: Media[]
}

interface LiveLocation {
  latitude: number
  longitude: number
  updatedAt?: string
}

export default function MapView({
  entries,
  liveLocation: initialLiveLocation,
}: {
  entries: Entry[]
  liveLocation: LiveLocation | null
}) {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [modalIndex, setModalIndex] = useState<number | null>(null)
  const [liveLocation, setLiveLocation] = useState(initialLiveLocation)

  // Auto-refresh live location every 45s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/location')
        if (res.ok) {
          const data = await res.json()
          if (data) setLiveLocation(data)
        }
      } catch { /* silently ignore */ }
    }, 45000)
    return () => clearInterval(interval)
  }, [])

  const handleEntryClick = useCallback((entry: Entry) => {
    setSelectedEntry(entry)
  }, [])

  const location = selectedEntry
    ? [selectedEntry.city, selectedEntry.country].filter(Boolean).join(', ') ||
      (selectedEntry.latitude
        ? `${selectedEntry.latitude.toFixed(3)}°, ${selectedEntry.longitude?.toFixed(3)}°`
        : null)
    : null

  return (
    <main className="fixed inset-0 bg-[#fafaf9]">
      {/* Fullscreen map */}
      <TravelMap
        entries={entries}
        liveLocation={liveLocation}
        onEntryClick={handleEntryClick}
      />

      {/* Stats overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div className="glass rounded-2xl px-5 py-3 flex items-center gap-5">
          <div className="text-center">
            <div className="text-xl font-['Playfair_Display'] font-semibold text-[#171717]">
              {entries.length}
            </div>
            <div className="text-xs text-[#a3a3a3]">entries</div>
          </div>
          <div className="w-px h-8 bg-[#e5e5e5]" />
          <div className="text-center">
            <div className="text-xl font-['Playfair_Display'] font-semibold text-[#171717]">
              {entries.filter((e) => e.latitude).length}
            </div>
            <div className="text-xs text-[#a3a3a3]">mapped</div>
          </div>
          <div className="w-px h-8 bg-[#e5e5e5]" />
          <div className="text-center">
            <div className="text-xl font-['Playfair_Display'] font-semibold text-[#171717]">
              {entries.reduce((acc, e) => acc + e.media.length, 0)}
            </div>
            <div className="text-xs text-[#a3a3a3]">photos</div>
          </div>
          {liveLocation && (
            <>
              <div className="w-px h-8 bg-[#e5e5e5]" />
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
                <span className="text-xs text-[#737373]">Live</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Entry detail panel */}
      {selectedEntry && (
        <div className="absolute top-20 right-4 z-10 w-80 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-xl overflow-hidden">
            {/* Close */}
            <div className="relative">
              <button
                onClick={() => setSelectedEntry(null)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              {/* Cover image */}
              {selectedEntry.media.find((m) => m.type === 'IMAGE') ? (
                <button
                  onClick={() => setModalIndex(0)}
                  className="block w-full cursor-pointer"
                >
                  <div className="relative h-44 bg-[#f5f5f4]">
                    <Image
                      src={selectedEntry.media.find((m) => m.type === 'IMAGE')!.url}
                      alt={selectedEntry.title}
                      fill
                      sizes="320px"
                      className="object-cover"
                    />
                  </div>
                </button>
              ) : (
                <div className="h-2 bg-[#d4af37]" />
              )}
            </div>

            <div className="p-4">
              <h3 className="font-semibold text-[#171717] text-base leading-snug">{selectedEntry.title}</h3>
              <div className="flex items-center gap-3 mt-1">
                <time className="text-xs text-[#a3a3a3]">{formatDate(selectedEntry.date)}</time>
                {location && (
                  <span className="text-xs text-[#737373] flex items-center gap-1">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    {location}
                  </span>
                )}
              </div>

              {selectedEntry.weather && (
                <div className="mt-2">
                  <WeatherBadge weather={selectedEntry.weather} />
                </div>
              )}

              {selectedEntry.description && (
                <p className="mt-2 text-sm text-[#737373] leading-relaxed line-clamp-4">
                  {selectedEntry.description}
                </p>
              )}

              {/* Thumbnails */}
              {selectedEntry.media.length > 0 && (
                <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                  {selectedEntry.media.slice(0, 6).map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => setModalIndex(i)}
                      className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#f5f5f4] cursor-pointer"
                    >
                      {m.type === 'IMAGE' ? (
                        <Image src={m.url} alt={m.filename} fill sizes="48px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#171717] flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media modal */}
      {selectedEntry && modalIndex !== null && (
        <MediaModal
          media={selectedEntry.media}
          initialIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </main>
  )
}
