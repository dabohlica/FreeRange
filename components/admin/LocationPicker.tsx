'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface Props {
  initialLat?: number
  initialLng?: number
  onConfirm: (lat: number, lng: number) => void
  onClose: () => void
}

export default function LocationPicker({ initialLat, initialLng, onConfirm, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const markerRef    = useRef<mapboxgl.Marker | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: initialLng != null && initialLat != null ? [initialLng, initialLat] : [10, 20],
      zoom: initialLat != null ? 10 : 2,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    // Place initial marker if coords exist
    if (initialLat != null && initialLng != null) {
      markerRef.current = new mapboxgl.Marker({ color: '#171717', draggable: true })
        .setLngLat([initialLng, initialLat])
        .addTo(map)

      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLngLat()
        setCoords({ lat: pos.lat, lng: pos.lng })
      })
    }

    // Click to place / move marker
    map.on('click', (e) => {
      const { lat, lng } = e.lngLat
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat])
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#171717', draggable: true })
          .setLngLat([lng, lat])
          .addTo(map)
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLngLat()
          setCoords({ lat: pos.lat, lng: pos.lng })
        })
      }
      setCoords({ lat, lng })
    })

    map.getCanvas().style.cursor = 'crosshair'
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5]">
          <div>
            <h3 className="font-semibold text-[#171717]">Pick location</h3>
            <p className="text-xs text-[#a3a3a3] mt-0.5">Tap anywhere on the map to drop a pin · Drag to reposition</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#a3a3a3] hover:text-[#171717] hover:bg-[#f5f5f4] transition-colors cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Map */}
        <div ref={containerRef} className="flex-1" style={{ minHeight: '380px' }} />

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-[#e5e5e5] bg-[#fafaf9]">
          <p className="text-sm font-mono text-[#737373]">
            {coords
              ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
              : 'No pin placed yet'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[#e5e5e5] text-sm text-[#737373] hover:text-[#171717] hover:border-[#d4d4d4] transition-colors cursor-pointer">Cancel</button>
            <button
              disabled={!coords}
              onClick={() => coords && onConfirm(coords.lat, coords.lng)}
              className="px-4 py-2 rounded-xl bg-[#171717] text-white text-sm font-medium hover:bg-[#404040] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Confirm location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
