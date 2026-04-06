'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import mapboxgl from 'mapbox-gl'
import JourneyCard from '@/components/journey/JourneyCard'

const TravelMap = dynamic(() => import('@/components/map/TravelMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#f5f5f4]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#737373]">Loading map...</p>
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

interface Trip {
  id: string
  name: string
  color: string
}

interface JourneyEntry {
  id: string
  title: string
  description?: string | null
  date: string
  latitude: number | null
  longitude: number | null
  city?: string | null
  country?: string | null
  media: Media[]
  trip?: Trip | null
}

interface LiveLocation {
  latitude: number
  longitude: number
  updatedAt?: string
}

interface JourneyClientProps {
  entries: JourneyEntry[]
  liveLocation: LiveLocation | null
}

export default function JourneyClient({ entries, liveLocation }: JourneyClientProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const timelinePanelRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const isProgrammaticScrollRef = useRef(false)

  const journeyEntries = useMemo(() => entries, [entries])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapInstanceRef.current = map
  }, [])

  const handleEntryClick = useCallback((entry: JourneyEntry) => {
    setActiveId(entry.id)
    const cardEl = cardRefs.current.get(entry.id)
    if (cardEl) {
      isProgrammaticScrollRef.current = true
      cardEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      // Clear the flag after scroll settles — setTimeout(0) lets the current
      // microtask queue (including any IO callbacks) drain first, but we use
      // a longer delay to account for the smooth scroll animation duration
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1000)
    }
  }, [])

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el)
    } else {
      cardRefs.current.delete(id)
    }
  }, [])

  // Scroll -> map sync via IntersectionObserver (D-10, D-11)
  useEffect(() => {
    const panel = timelinePanelRef.current
    // Observer can be set up even if map isn't ready yet — the callback guards with ?.
    if (!panel) return

    const observer = new IntersectionObserver(
      (ioEntries) => {
        // Guard: skip IO events triggered by programmatic scrollIntoView (Pitfall 4)
        if (isProgrammaticScrollRef.current) return

        // Pick the entry with the highest intersection ratio (most visible card)
        let bestEntry: IntersectionObserverEntry | null = null
        for (const ioEntry of ioEntries) {
          if (!ioEntry.isIntersecting) continue
          if (!bestEntry || ioEntry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = ioEntry
          }
        }
        if (!bestEntry) return

        const entryId = (bestEntry.target as HTMLElement).dataset.entryId
        if (!entryId) return

        const journeyEntry = journeyEntries.find((e) => e.id === entryId)
        if (!journeyEntry) return

        setActiveId(entryId)

        // D-14: skip flyTo for GPS-less entries
        if (!journeyEntry.latitude || !journeyEntry.longitude) return

        // D-08: smooth flyTo, D-09: zoom 10
        mapInstanceRef.current?.flyTo({
          center: [journeyEntry.longitude, journeyEntry.latitude],
          zoom: 10,
          duration: 1200,
        })
      },
      {
        root: panel,       // CRITICAL: panel root, not document (Pitfall 1)
        threshold: 0.5,    // D-10: fire at 50% visibility
      }
    )

    // Observe all cards with data-entry-id
    panel.querySelectorAll<HTMLElement>('[data-entry-id]').forEach((el) => {
      observer.observe(el)
    })

    return () => observer.disconnect()
  }, [journeyEntries])

  return (
    <main className="fixed inset-0 pt-16 bg-[#fafaf9]">
      {/* Desktop: side-by-side. Mobile: stacked with mini-map */}
      <div className="h-full flex flex-col lg:flex-row">
        {/* Map panel — desktop: right 55%, mobile: 30vh sticky top */}
        <div className="h-[30vh] lg:h-full lg:flex-1 lg:order-2 shrink-0">
          <TravelMap
            entries={journeyEntries}
            liveLocation={liveLocation}
            onEntryClick={handleEntryClick}
            onMapReady={handleMapReady}
          />
        </div>

        {/* Timeline panel — desktop: left 45%, mobile: below mini-map */}
        <div
          ref={timelinePanelRef}
          className="flex-1 overflow-y-auto lg:w-[45%] lg:shrink-0 lg:flex-none"
        >
          <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
            <div className="mb-4">
              <h1 className="text-3xl font-['Playfair_Display'] font-semibold text-[#171717] tracking-tight">
                Journey
              </h1>
              <p className="mt-1 text-sm text-[#737373]">
                {journeyEntries.length} {journeyEntries.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>
            {journeyEntries.map((entry) => (
              <JourneyCard
                key={entry.id}
                ref={(el) => setCardRef(entry.id, el)}
                entry={entry}
                isActive={activeId === entry.id}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
