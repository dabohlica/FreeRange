'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { formatCoordinates } from '@/lib/gps'

const TravelMap = dynamic(() => import('@/components/map/TravelMap'), { ssr: false })

interface LiveLocation {
  latitude: number
  longitude: number
  altitude?: number | null
  updatedAt?: string
}

export default function LiveView({
  pajUrl,
  liveLocation: initialLocation,
}: {
  pajUrl: string | null
  liveLocation: LiveLocation | null
}) {
  const [location, setLocation] = useState(initialLocation)
  const [view, setView] = useState<'map' | 'iframe'>(pajUrl ? 'iframe' : 'map')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Poll live location every 45s
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/location')
        if (res.ok) {
          const data = await res.json()
          if (data) { setLocation(data); setLastRefresh(new Date()) }
        }
      } catch { /* ignore */ }
    }
    const id = setInterval(tick, 45_000)
    return () => clearInterval(id)
  }, [])

  const coords = location ? formatCoordinates(location.latitude, location.longitude) : null
  const mapsUrl = location
    ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
    : null

  return (
    <main className="min-h-screen pt-24 pb-16 page-enter">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
              <span className="text-xs font-medium text-[#3b82f6] uppercase tracking-wider">Live</span>
            </div>
            <h1 className="text-4xl font-['Playfair_Display'] font-semibold text-[#171717] tracking-tight">
              Current Location
            </h1>
            {coords && <p className="mt-2 text-sm text-[#737373] font-mono">{coords}</p>}
          </div>

          {/* View toggle */}
          {pajUrl && (
            <div className="flex items-center bg-white rounded-xl border border-[#e5e5e5] p-1 gap-1">
              <button
                onClick={() => setView('iframe')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${view === 'iframe' ? 'bg-[#171717] text-white' : 'text-[#737373] hover:text-[#171717]'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                Tracker
              </button>
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${view === 'map' ? 'bg-[#171717] text-white' : 'text-[#737373] hover:text-[#171717]'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                </svg>
                Map
              </button>
            </div>
          )}
        </div>

        {/* Info bar */}
        {location && (
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-3">
              <div>
                <p className="text-xs text-[#a3a3a3]">Coordinates</p>
                <p className="text-sm font-mono text-[#171717]">{coords}</p>
              </div>
            </div>
            {location.altitude != null && (
              <div className="glass rounded-xl px-4 py-2.5">
                <p className="text-xs text-[#a3a3a3]">Altitude</p>
                <p className="text-sm font-medium text-[#171717]">{Math.round(location.altitude)} m</p>
              </div>
            )}
            {location.updatedAt && (
              <div className="glass rounded-xl px-4 py-2.5">
                <p className="text-xs text-[#a3a3a3]">Last updated</p>
                <p className="text-sm text-[#171717]">
                  {new Date(location.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-[#171717] hover:bg-white/95 transition-colors cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Maps
              </a>
            )}
          </div>
        )}

        {/* Main view */}
        <div className="rounded-2xl overflow-hidden border border-[#e5e5e5] shadow-sm" style={{ height: '65vh' }}>
          {view === 'iframe' && pajUrl ? (
            <iframe
              src={pajUrl}
              className="w-full h-full border-0"
              title="PAJ GPS Live Tracker"
              allow="geolocation"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : location ? (
            <TravelMap
              entries={[]}
              liveLocation={{ latitude: location.latitude, longitude: location.longitude }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#f5f5f4]">
              <div className="text-center p-8">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#e5e5e5] flex items-center justify-center mx-auto mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                </div>
                <p className="text-[#737373] font-medium text-sm">No live location set</p>
                <p className="text-[#a3a3a3] text-xs mt-1">
                  Set <code className="bg-[#f0f0f0] px-1 rounded">PAJ_GPS_SHARE_URL</code> in .env<br />
                  or update manually via Admin → Live Location
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-[#a3a3a3] text-center mt-4">
          Auto-refreshes every 45 seconds · Last checked {lastRefresh.toLocaleTimeString()}
        </p>
      </div>
    </main>
  )
}
