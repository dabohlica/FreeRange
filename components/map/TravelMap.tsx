'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface Entry {
  id: string
  title: string
  date: string
  latitude: number | null
  longitude: number | null
  city?: string | null
  country?: string | null
  media: Array<{ id: string; url: string; type: string; filename: string }>
}

interface LiveLocation {
  latitude: number
  longitude: number
  updatedAt?: string
}

interface TravelMapProps {
  entries: Entry[]
  liveLocation?: LiveLocation | null
  onEntryClick?: (entry: Entry) => void
}

export default function TravelMap({ entries, liveLocation, onEntryClick }: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || token.startsWith('pk.your-mapbox')) {
      console.warn('Mapbox token not configured')
      return
    }

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      zoom: 2,
      center: [10, 20],
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', () => {
      setMapLoaded(true)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Render entry markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const validEntries = entries.filter((e) => e.latitude != null && e.longitude != null)

    validEntries.forEach((entry) => {
      const el = document.createElement('div')
      el.className = 'travel-marker'
      el.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 4px;
        transform: rotate(-45deg);
        background: #171717;
        border: 2px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `

      // If has photo, show thumbnail
      const firstImage = entry.media.find((m) => m.type === 'IMAGE')
      if (firstImage) {
        const inner = document.createElement('div')
        inner.style.cssText = `
          width: 100%;
          height: 100%;
          transform: rotate(45deg);
          background-image: url(${firstImage.url});
          background-size: cover;
          background-position: center;
        `
        el.appendChild(inner)
      } else {
        const dot = document.createElement('div')
        dot.style.cssText = `
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #d4af37;
          transform: rotate(45deg);
        `
        el.appendChild(dot)
      }

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'rotate(-45deg) scale(1.15)'
        el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)'
        el.style.zIndex = '10'
      })
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'rotate(-45deg) scale(1)'
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
        el.style.zIndex = ''
      })

      el.addEventListener('click', () => {
        onEntryClick?.(entry)
        map.flyTo({
          center: [entry.longitude!, entry.latitude!],
          zoom: Math.max(map.getZoom(), 10),
          duration: 800,
        })
      })

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([entry.longitude!, entry.latitude!])
        .addTo(map)

      markersRef.current.push(marker)
    })

    // Fit map to entries
    if (validEntries.length > 0) {
      if (validEntries.length === 1) {
        map.flyTo({
          center: [validEntries[0].longitude!, validEntries[0].latitude!],
          zoom: 8,
          duration: 1000,
        })
      } else {
        const bounds = new mapboxgl.LngLatBounds()
        validEntries.forEach((e) => bounds.extend([e.longitude!, e.latitude!]))
        map.fitBounds(bounds, { padding: 80, duration: 1000, maxZoom: 10 })
      }
    }
  }, [entries, mapLoaded, onEntryClick])

  // Render live location marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (liveMarkerRef.current) {
      liveMarkerRef.current.remove()
      liveMarkerRef.current = null
    }

    if (!liveLocation) return

    const el = document.createElement('div')
    el.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #3b82f6;
      border: 3px solid white;
      box-shadow: 0 0 0 4px rgba(59,130,246,0.3);
      animation: pulse 2s infinite;
    `

    // Add pulse animation
    const style = document.createElement('style')
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
        70% { box-shadow: 0 0 0 12px rgba(59,130,246,0); }
        100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
      }
    `
    document.head.appendChild(style)

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([liveLocation.longitude, liveLocation.latitude])
      .addTo(map)

    liveMarkerRef.current = marker
  }, [liveLocation, mapLoaded])

  return (
    <div ref={containerRef} className="w-full h-full">
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.') && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f5f5f4] z-10">
          <div className="text-center p-8">
            <p className="text-[#737373] text-sm">Map unavailable</p>
            <p className="text-[#a3a3a3] text-xs mt-1">Configure NEXT_PUBLIC_MAPBOX_TOKEN in .env</p>
          </div>
        </div>
      )}
    </div>
  )
}
