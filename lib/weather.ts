export type WeatherData = {
  conditionCode: number
  conditionLabel: string
  tempMin: number
  tempMax: number
  windSpeed: number
  windDirection: number
}

export const WMO_MAP: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear sky', icon: 'Sun' },
  1: { label: 'Mainly clear', icon: 'CloudSun' },
  2: { label: 'Partly cloudy', icon: 'CloudSun' },
  3: { label: 'Overcast', icon: 'Cloud' },
  45: { label: 'Fog', icon: 'CloudFog' },
  48: { label: 'Icy fog', icon: 'CloudFog' },
  51: { label: 'Light drizzle', icon: 'CloudDrizzle' },
  53: { label: 'Moderate drizzle', icon: 'CloudDrizzle' },
  55: { label: 'Dense drizzle', icon: 'CloudDrizzle' },
  56: { label: 'Freezing light drizzle', icon: 'CloudDrizzle' },
  57: { label: 'Freezing dense drizzle', icon: 'CloudDrizzle' },
  61: { label: 'Slight rain', icon: 'CloudRain' },
  63: { label: 'Moderate rain', icon: 'CloudRain' },
  65: { label: 'Heavy rain', icon: 'CloudRain' },
  66: { label: 'Freezing light rain', icon: 'CloudRain' },
  67: { label: 'Freezing heavy rain', icon: 'CloudRain' },
  71: { label: 'Slight snowfall', icon: 'CloudSnow' },
  73: { label: 'Moderate snowfall', icon: 'CloudSnow' },
  75: { label: 'Heavy snowfall', icon: 'CloudSnow' },
  77: { label: 'Snow grains', icon: 'CloudSnow' },
  80: { label: 'Slight showers', icon: 'CloudRain' },
  81: { label: 'Moderate showers', icon: 'CloudRain' },
  82: { label: 'Violent showers', icon: 'CloudRain' },
  85: { label: 'Slight snow showers', icon: 'CloudSnow' },
  86: { label: 'Heavy snow showers', icon: 'CloudSnow' },
  95: { label: 'Thunderstorm', icon: 'CloudLightning' },
  96: { label: 'Thunderstorm with slight hail', icon: 'CloudLightning' },
  99: { label: 'Thunderstorm with heavy hail', icon: 'CloudLightning' },
}

export function degToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((deg % 360) / 45)) % 8]
}

export async function fetchWeather(
  lat: number,
  lng: number,
  date: string
): Promise<WeatherData | null> {
  try {
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${lat}&longitude=${lng}` +
      `&start_date=${date}&end_date=${date}` +
      `&daily=temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant` +
      `&hourly=weathercode` +
      `&timezone=UTC`

    const res = await fetch(url)
    if (!res.ok) return null

    const data = await res.json()
    if (data.error) return null

    const daily = data.daily
    const tempMax = daily.temperature_2m_max[0]
    const tempMin = daily.temperature_2m_min[0]
    const windSpeed = daily.windspeed_10m_max[0]
    const windDirection = daily.winddirection_10m_dominant[0]

    // Pick the most frequent WMO code across all 24 hours instead of the daily worst
    const hourlyCodes: number[] = data.hourly?.weathercode ?? []
    const freq: Record<number, number> = {}
    for (const c of hourlyCodes) if (c != null) freq[c] = (freq[c] ?? 0) + 1
    const code = hourlyCodes.length
      ? parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0])
      : null

    if (
      tempMax == null || tempMax === undefined ||
      tempMin == null || tempMin === undefined ||
      code == null || code === undefined ||
      windSpeed == null || windSpeed === undefined ||
      windDirection == null || windDirection === undefined
    ) {
      return null
    }

    const conditionLabel = WMO_MAP[code]?.label ?? 'Unknown'

    return {
      conditionCode: code,
      conditionLabel,
      tempMin,
      tempMax,
      windSpeed,
      windDirection,
    }
  } catch {
    return null
  }
}
