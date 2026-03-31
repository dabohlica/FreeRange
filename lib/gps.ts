export interface GPSCoordinates {
  latitude: number
  longitude: number
  altitude?: number
  speed?: number
  accuracy?: number
  updatedAt?: string
}

/**
 * Attempts to fetch live GPS coordinates from a PAJ GPS share URL.
 * PAJ GPS tracker share pages embed coordinates in their HTML.
 * Falls back gracefully if parsing fails.
 */
export async function fetchPAJLocation(shareUrl: string): Promise<GPSCoordinates | null> {
  if (!shareUrl) return null

  try {
    const res = await fetch(shareUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 0 },
    })

    if (!res.ok) return null

    const html = await res.text()

    // PAJ embeds coords in JSON data or meta tags
    // Try common patterns
    const patterns = [
      /\"lat\"\s*:\s*([-\d.]+)\s*,\s*\"lng\"\s*:\s*([-\d.]+)/i,
      /\"latitude\"\s*:\s*([-\d.]+)\s*,\s*\"longitude\"\s*:\s*([-\d.]+)/i,
      /lat=([-\d.]+)&lng=([-\d.]+)/i,
      /data-lat="([-\d.]+)"\s+data-lng="([-\d.]+)"/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        const lat = parseFloat(match[1])
        const lng = parseFloat(match[2])
        if (!isNaN(lat) && !isNaN(lng)) {
          return { latitude: lat, longitude: lng }
        }
      }
    }

    return null
  } catch {
    return null
  }
}

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ city?: string; country?: string }> {
  try {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || token.startsWith('pk.your-mapbox')) return {}

    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,country&access_token=${token}`,
      { next: { revalidate: 86400 } }
    )

    if (!res.ok) return {}

    const data = await res.json()
    const features = data.features as Array<{ place_type: string[]; text: string }>

    const city = features.find((f) => f.place_type.includes('place'))?.text
    const country = features.find((f) => f.place_type.includes('country'))?.text

    return { city, country }
  } catch {
    return {}
  }
}
