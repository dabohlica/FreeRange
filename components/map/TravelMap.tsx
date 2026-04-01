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

const SOURCE_ID  = 'entries-source'
const PIN_SIZE   = 44   // circle diameter
const TIP_HEIGHT = 11   // downward triangle
const SPRITE_DEFAULT = '__default-pin__'

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

// ── Draw a circular pin onto a canvas ────────────────────────────────────────
// Returns HTMLImageElement loaded from canvas data URL — compatible with Mapbox GL JS v3
async function buildPinSprite(imgUrl: string | null): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas')
  canvas.width  = PIN_SIZE
  canvas.height = PIN_SIZE + TIP_HEIGHT
  const ctx = canvas.getContext('2d')!
  const cx = PIN_SIZE / 2
  const cy = PIN_SIZE / 2
  const r  = PIN_SIZE / 2 - 2

  // ── Circle body ──
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)

  if (imgUrl) {
    try {
      // Fetch through our auth proxy so the session cookie is sent
      const res  = await fetch(imgUrl, { credentials: 'include' })
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          ctx.save()
          ctx.clip()
          // Fill the circle background first
          ctx.fillStyle = '#171717'
          ctx.fillRect(0, 0, PIN_SIZE, PIN_SIZE)
          // Draw photo scaled to fill
          const scale = Math.max(PIN_SIZE / img.width, PIN_SIZE / img.height)
          const sw = img.width  * scale
          const sh = img.height * scale
          ctx.drawImage(img, (PIN_SIZE - sw) / 2, (PIN_SIZE - sh) / 2, sw, sh)
          ctx.restore()
          URL.revokeObjectURL(blobUrl)
          resolve()
        }
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject() }
        img.src = blobUrl
      })
    } catch {
      // Fallback: solid dark circle
      ctx.fillStyle = '#171717'
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#171717'
    ctx.fill()
  }

  // ── White border ──
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth   = 2.5
  ctx.stroke()

  // ── Downward tip ──
  ctx.beginPath()
  ctx.moveTo(cx - 5, PIN_SIZE - 1)
  ctx.lineTo(cx + 5, PIN_SIZE - 1)
  ctx.lineTo(cx,     PIN_SIZE + TIP_HEIGHT)
  ctx.fillStyle = '#171717'
  ctx.fill()

  // Return HTMLImageElement loaded from canvas data URL (not ImageData)
  const result = new Image(canvas.width, canvas.height)
  return new Promise<HTMLImageElement>((resolve) => {
    result.onload = () => resolve(result)
    result.src = canvas.toDataURL()
  })
}

function buildGeojson(entries: Entry[], loadedSprites?: Set<string>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: entries
      .filter(e => e.latitude != null && e.longitude != null)
      .map(e => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.longitude!, e.latitude!] },
        properties: {
          id: e.id,
          spriteId: (loadedSprites?.has(e.id)) ? e.id : SPRITE_DEFAULT,
        },
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function TravelMap({ entries, liveLocation, onEntryClick }: TravelMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const entriesRef    = useRef<Entry[]>(entries)
  const onClickRef    = useRef(onEntryClick)

  entriesRef.current = entries
  onClickRef.current = onEntryClick

  // Helper: return set of entry IDs that have a loaded sprite on the map
  function getLoadedSpriteIds(map: mapboxgl.Map, ents: Entry[]): Set<string> {
    const loaded = new Set<string>()
    for (const e of ents) {
      if (map.hasImage(e.id)) loaded.add(e.id)
    }
    return loaded
  }

  // Fire-and-forget progressive photo sprite loading
  function loadSpritesProgressive(map: mapboxgl.Map, ents: Entry[]) {
    for (const entry of ents.filter(e => e.latitude != null && e.longitude != null)) {
      if (map.hasImage(entry.id)) continue
      const firstImg = entry.media.find(m => m.type === 'IMAGE')
      if (!firstImg) continue  // no photo — stays on SPRITE_DEFAULT

      buildPinSprite(firstImg.url).then(img => {
        if (map.hasImage(entry.id)) return  // race guard
        map.addImage(entry.id, img)
        // Update GeoJSON to point this feature at its new sprite
        const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
        if (!src) return
        const currentEntries = entriesRef.current
        src.setData(buildGeojson(currentEntries, getLoadedSpriteIds(map, currentEntries)))
      }).catch(() => {
        // Silently degrade to default pin
      })
    }
  }

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

    map.on('load', async () => {
      // Register default sprite first (fast — no network fetch)
      if (!map.hasImage(SPRITE_DEFAULT)) {
        const defaultImg = await buildPinSprite(null)
        map.addImage(SPRITE_DEFAULT, defaultImg)
      }

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: buildGeojson(entriesRef.current),  // all pins start as SPRITE_DEFAULT
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

      // ── Individual entry pins (GL symbol layer — photo sprite or default) ──
      map.addLayer({
        id: 'entry-pins',
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'spriteId'],
          'icon-anchor':           'bottom',
          'icon-allow-overlap':    true,
          'icon-ignore-placement': true,
          'icon-size':             1,
        },
        paint: {
          'icon-opacity': 1,
          'icon-opacity-transition': { duration: 200, delay: 0 },
        },
      })

      // ── Cluster click → expand ──
      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        if (!features.length) return
        const clusterId = features[0].properties?.cluster_id as number
        const coords    = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
        ;(map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
          clusterId,
          (err?: Error | null, zoom?: number | null) => {
            if (err || zoom == null) return
            map.easeTo({ center: coords, zoom: zoom + 0.5, duration: 500 })
          }
        )
      })

      // ── Pin click → select entry ──
      map.on('click', 'entry-pins', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['entry-pins'] })
        if (!features.length) return
        const id    = features[0].properties?.id as string
        const entry = entriesRef.current.find(en => en.id === id)
        if (!entry) return
        onClickRef.current?.(entry)
        map.flyTo({ center: [entry.longitude!, entry.latitude!], zoom: Math.max(map.getZoom(), 10), duration: 700 })
      })

      // ── Cursors ──
      map.on('mouseenter', 'entry-pins', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'entry-pins', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'clusters',   () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters',   () => { map.getCanvas().style.cursor = '' })

      fitEntries(map, entriesRef.current)

      // Progressive photo sprite loading (fire-and-forget, non-blocking)
      loadSpritesProgressive(map, entriesRef.current)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 2. Sync entries → update GeoJSON source + kick off new sprite loads ─────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SOURCE_ID)) return

    // Update GeoJSON with current loaded states
    const loaded = getLoadedSpriteIds(map, entries)
    ;(map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).setData(buildGeojson(entries, loaded))

    // Kick off loading for any new entries
    loadSpritesProgressive(map, entries)
  }, [entries])

  // ── 3. Live location marker ────────────────────────────────────────────────
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
