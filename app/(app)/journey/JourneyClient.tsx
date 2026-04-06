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
  const [activeIndex, setActiveIndex] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const timelinePanelRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const isProgrammaticScrollRef = useRef(false)

  const journeyEntries = useMemo(() => entries, [entries])

  // Sync activeIndex when activeId changes (from IO or pin click)
  useEffect(() => {
    if (!activeId) return
    const idx = journeyEntries.findIndex((e) => e.id === activeId)
    if (idx !== -1) setActiveIndex(idx)
  }, [activeId, journeyEntries])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapInstanceRef.current = map
    setMapReady(true)
  }, [])

  // Initial fly-to: zoom to the first GPS entry 5s after map loads
  useEffect(() => {
    if (!mapReady) return
    const first = journeyEntries.find((e) => e.latitude && e.longitude)
    if (!first) return
    const timer = setTimeout(() => {
      mapInstanceRef.current?.flyTo({
        center: [first.longitude!, first.latitude!],
        zoom: 10,
        duration: 1800,
      })
      setActiveId(first.id)
    }, 5000)
    return () => clearTimeout(timer)
  }, [mapReady, journeyEntries])

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

  const goNext = useCallback(() => {
    setActiveIndex((i) => {
      const next = Math.min(i + 1, journeyEntries.length - 1)
      const entry = journeyEntries[next]
      if (!entry) return i

      setActiveId(entry.id)

      // Fly map to entry (D-14: skip if no GPS)
      if (entry.latitude && entry.longitude) {
        mapInstanceRef.current?.flyTo({
          center: [entry.longitude, entry.latitude],
          zoom: 10,
          duration: 1200,
        })
      }

      // Scroll timeline to card
      isProgrammaticScrollRef.current = true
      cardRefs.current.get(entry.id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1000)

      return next
    })
  }, [journeyEntries])

  const goPrev = useCallback(() => {
    setActiveIndex((i) => {
      const prev = Math.max(i - 1, 0)
      const entry = journeyEntries[prev]
      if (!entry) return i

      setActiveId(entry.id)

      if (entry.latitude && entry.longitude) {
        mapInstanceRef.current?.flyTo({
          center: [entry.longitude, entry.latitude],
          zoom: 10,
          duration: 1200,
        })
      }

      isProgrammaticScrollRef.current = true
      cardRefs.current.get(entry.id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1000)

      return prev
    })
  }, [journeyEntries])

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
        <div className="relative h-[30vh] lg:h-full lg:flex-1 lg:order-2 shrink-0">
          <TravelMap
            entries={journeyEntries}
            liveLocation={liveLocation}
            onEntryClick={handleEntryClick}
            onMapReady={handleMapReady}
          />

          {/* Mobile arrow navigation (D-07) — hidden on desktop */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 lg:hidden">
            <button
              onClick={goPrev}
              disabled={activeIndex === 0}
              className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center disabled:opacity-30 transition-opacity cursor-pointer"
              aria-label="Previous entry"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <span className="text-xs font-medium text-[#171717] bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md tabular-nums">
              {activeIndex + 1} of {journeyEntries.length}
            </span>

            <button
              onClick={goNext}
              disabled={activeIndex === journeyEntries.length - 1}
              className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center disabled:opacity-30 transition-opacity cursor-pointer"
              aria-label="Next entry"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#171717" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
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
