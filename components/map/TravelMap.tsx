'use client'

import { useEffect, useRef, useState } from 'react'
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

// Inject pulse keyframe once
let pulseInjected = false
function injectPulse() {
  if (pulseInjected || typeof document === 'undefined') return
  pulseInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes livePulse {
      0%   { box-shadow: 0 0 0 0   rgba(59,130,246,0.5); }
      70%  { box-shadow: 0 0 0 10px rgba(59,130,246,0);   }
      100% { box-shadow: 0 0 0 0   rgba(59,130,246,0);    }
    }
  `
  document.head.appendChild(style)
}

export default function TravelMap({ entries, liveLocation, onEntryClick }: TravelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  // Map from entry.id → { marker, entry }
  const markerMapRef  = useRef<Map<string, { marker: mapboxgl.Marker; entry: Entry }>>(new Map())
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [mapLoaded, setMapLoaded]   = useState(false)
  const SOURCE_ID = 'entries-source'

  // ── 1. Init map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || token.startsWith('pk.your-mapbox')) return

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
    map.on('load', () => setMapLoaded(true))
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── 2. Entries: GeoJSON clusters + HTML markers ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const validEntries = entries.filter(e => e.latitude != null && e.longitude != null)

    // Build GeoJSON feature collection
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: validEntries.map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.longitude!, e.latitude!] },
        properties: { id: e.id },
      })),
    }

    // ── Add / update GeoJSON source ──
    if (map.getSource(SOURCE_ID)) {
      ;(map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson)
    } else {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 60,
      })

      // Cluster bubble
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#171717',
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 20, 30],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      })

      // Cluster count label
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      })

      // Invisible layer used only for queryRenderedFeatures
      map.addLayer({
        id: 'unclustered-points',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-opacity': 0, 'circle-radius': 1 },
      })

      // Zoom into cluster on click
      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        if (!features.length) return
        const clusterId = features[0].properties?.cluster_id as number
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
        ;(map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
          clusterId,
          (err?: Error | null, zoom?: number | null) => {
            if (err || zoom == null) return
            map.easeTo({ center: coords, zoom: zoom + 0.5, duration: 500 })
          }
        )
      })

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = '' })
    }

    // ── Remove HTML markers no longer in entries ──
    const validIds = new Set(validEntries.map(e => e.id))
    markerMapRef.current.forEach((val, id) => {
      if (!validIds.has(id)) { val.marker.remove(); markerMapRef.current.delete(id) }
    })

    // ── Add / update HTML markers for each entry ──
    validEntries.forEach(entry => {
      if (markerMapRef.current.has(entry.id)) {
        // Update stored entry reference (media may have changed)
        markerMapRef.current.get(entry.id)!.entry = entry
        return
      }

      const el = buildMarkerEl(entry, () => {
        onEntryClick?.(entry)
        map.flyTo({ center: [entry.longitude!, entry.latitude!], zoom: Math.max(map.getZoom(), 10), duration: 700 })
      })

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([entry.longitude!, entry.latitude!])
        .addTo(map)

      markerMapRef.current.set(entry.id, { marker, entry })
    })

    // ── Toggle marker visibility based on cluster state ──
    const syncMarkers = () => {
      if (!map.getLayer('unclustered-points')) return
      const canvas = map.getCanvas()
      const bounds: [mapboxgl.PointLike, mapboxgl.PointLike] = [
        [0, 0],
        [canvas.width, canvas.height],
      ]
      const unclustered = map.queryRenderedFeatures(bounds, { layers: ['unclustered-points'] })
      const visibleIds = new Set(unclustered.map(f => f.properties?.id as string))
      markerMapRef.current.forEach((val, id) => {
        val.marker.getElement().style.display = visibleIds.has(id) ? 'block' : 'none'
      })
    }

    map.on('idle', syncMarkers)

    // ── Fit bounds ──
    if (validEntries.length === 1) {
      map.flyTo({ center: [validEntries[0].longitude!, validEntries[0].latitude!], zoom: 8, duration: 900 })
    } else if (validEntries.length > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      validEntries.forEach(e => bounds.extend([e.longitude!, e.latitude!]))
      map.fitBounds(bounds, { padding: 80, duration: 1000, maxZoom: 10 })
    }

    return () => { map.off('idle', syncMarkers) }
  }, [entries, mapLoaded, onEntryClick])

  // ── 3. Live location marker ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    liveMarkerRef.current?.remove()
    liveMarkerRef.current = null
    if (!liveLocation) return

    injectPulse()

    const el = document.createElement('div')
    el.style.cssText = `
      width: 14px; height: 14px; border-radius: 50%;
      background: #3b82f6; border: 2.5px solid white;
      animation: livePulse 2s infinite;
    `
    liveMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([liveLocation.longitude, liveLocation.latitude])
      .addTo(map)
  }, [liveLocation, mapLoaded])

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.') && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f5f5f4] z-10">
          <div className="text-center p-8">
            <p className="text-[#737373] text-sm">Map unavailable</p>
            <p className="text-[#a3a3a3] text-xs mt-1">Set NEXT_PUBLIC_MAPBOX_TOKEN in .env</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Marker DOM builder ─────────────────────────────────────────────────────
function buildMarkerEl(entry: Entry, onClick: () => void): HTMLElement {
  const firstImage = entry.media.find(m => m.type === 'IMAGE')

  // Outer wrapper: positions the pin tip at the bottom anchor point
  const wrap = document.createElement('div')
  wrap.style.cssText = `
    position: relative;
    width: 44px;
    height: 52px;
    cursor: pointer;
  `

  // Pin body (diamond square)
  const pin = document.createElement('div')
  pin.style.cssText = `
    position: absolute;
    top: 0; left: 2px;
    width: 40px; height: 40px;
    border-radius: 50% 50% 4px 50%;
    transform: rotate(-45deg);
    background: #171717;
    border: 2px solid white;
    overflow: hidden;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  `

  if (firstImage) {
    const img = document.createElement('div')
    img.style.cssText = `
      position: absolute; inset: 0;
      transform: rotate(45deg) scale(1.45);
      background-image: url('${firstImage.url}');
      background-size: cover;
      background-position: center;
    `
    pin.appendChild(img)
  } else {
    const dot = document.createElement('div')
    dot.style.cssText = `
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
    `
    dot.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:#d4af37;transform:rotate(45deg)"></div>`
    pin.appendChild(dot)
  }

  // Tip triangle
  const tip = document.createElement('div')
  tip.style.cssText = `
    position: absolute;
    bottom: 0; left: 50%;
    transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 13px solid #171717;
  `

  wrap.appendChild(pin)
  wrap.appendChild(tip)

  // Hover: only change visual properties that don't affect layout/position
  wrap.addEventListener('mouseenter', () => {
    pin.style.borderColor = '#d4af37'
    pin.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)'
    const container = wrap.parentElement
    if (container) container.style.zIndex = '10'
  })
  wrap.addEventListener('mouseleave', () => {
    pin.style.borderColor = 'white'
    pin.style.boxShadow = ''
    const container = wrap.parentElement
    if (container) container.style.zIndex = ''
  })
  wrap.addEventListener('click', (e) => { e.stopPropagation(); onClick() })

  return wrap
}
