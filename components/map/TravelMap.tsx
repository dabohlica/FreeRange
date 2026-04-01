'use client'

import { useEffect, useRef } from 'react'
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

const SOURCE_ID = 'entries-source'

export default function TravelMap({ entries, liveLocation, onEntryClick }: TravelMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null)
  // Keep a live reference to entries so GL event callbacks always see current data
  const entriesRef    = useRef<Entry[]>(entries)
  const onClickRef    = useRef(onEntryClick)

  // Sync refs on every render
  entriesRef.current = entries
  onClickRef.current = onEntryClick

  // ── 1. Init map ──────────────────────────────────────────────────────────────
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

    map.on('load', () => {
      // ── GeoJSON source (with clustering) ──
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: buildGeojson(entriesRef.current),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 60,
      })

      // ── Cluster bubble ──
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

      // ── Cluster count label ──
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

      // ── Individual point dot (GL-rendered — no HTML markers, no visibility sync) ──
      map.addLayer({
        id: 'unclustered-points',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#171717',
          'circle-radius': 8,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      })

      // ── Hover: enlarge point ──
      map.addLayer({
        id: 'unclustered-points-hover',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', 'id', ''],   // nothing selected initially
        paint: {
          'circle-color': '#404040',
          'circle-radius': 10,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1,
        },
      })

      // ── Cluster click → expand ──
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

      // ── Point click → select entry ──
      map.on('click', 'unclustered-points', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['unclustered-points'] })
        if (!features.length) return
        const id = features[0].properties?.id as string
        const entry = entriesRef.current.find(en => en.id === id)
        if (!entry) return
        onClickRef.current?.(entry)
        map.flyTo({
          center: [entry.longitude!, entry.latitude!],
          zoom: Math.max(map.getZoom(), 10),
          duration: 700,
        })
      })

      // ── Point hover ──
      map.on('mousemove', 'unclustered-points', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['unclustered-points'] })
        const id = features[0]?.properties?.id ?? ''
        map.setFilter('unclustered-points-hover', ['==', 'id', id])
        map.getCanvas().style.cursor = id ? 'pointer' : ''
      })
      map.on('mouseleave', 'unclustered-points', () => {
        map.setFilter('unclustered-points-hover', ['==', 'id', ''])
        map.getCanvas().style.cursor = ''
      })

      // ── Cluster hover ──
      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = '' })

      // Fit to initial entries
      fitEntries(map, entriesRef.current)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 2. Sync entries data into the GL source ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SOURCE_ID)) return
    ;(map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).setData(buildGeojson(entries))
  }, [entries])

  // ── 3. Live location marker ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
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
  }, [liveLocation])

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

function buildGeojson(entries: Entry[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: entries
      .filter(e => e.latitude != null && e.longitude != null)
      .map(e => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.longitude!, e.latitude!] },
        properties: { id: e.id },
      })),
  }
}

function fitEntries(map: mapboxgl.Map, entries: Entry[]) {
  const valid = entries.filter(e => e.latitude != null && e.longitude != null)
  if (valid.length === 1) {
    map.flyTo({ center: [valid[0].longitude!, valid[0].latitude!], zoom: 8, duration: 900 })
  } else if (valid.length > 1) {
    const bounds = new mapboxgl.LngLatBounds()
    valid.forEach(e => bounds.extend([e.longitude!, e.latitude!]))
    map.fitBounds(bounds, { padding: 80, duration: 1000, maxZoom: 10 })
  }
}
