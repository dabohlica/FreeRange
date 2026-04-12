'use client'

import {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle,
  CloudRain, CloudSnow, CloudLightning, Wind,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { WMO_MAP, degToCardinal } from '@/lib/weather'
import type { WeatherData } from '@/lib/weather'

type IconComponent = React.ComponentType<LucideProps>

const ICON_MAP: Record<string, IconComponent> = {
  Sun, Cloud, CloudSun, CloudFog, CloudDrizzle,
  CloudRain, CloudSnow, CloudLightning,
}

export default function WeatherBadge({ weather }: { weather: WeatherData }) {
  const iconName = WMO_MAP[weather.conditionCode]?.icon ?? 'Cloud'
  const Icon: IconComponent = ICON_MAP[iconName] ?? Cloud

  return (
    <div className="flex items-center gap-2 text-xs text-[#737373]">
      <Icon size={13} className="shrink-0 text-[#a3a3a3]" />
      <span>{Math.round(weather.tempMax)}° / {Math.round(weather.tempMin)}°</span>
      <span className="flex items-center gap-0.5">
        <Wind size={11} className="shrink-0 text-[#a3a3a3]" />
        {Math.round(weather.windSpeed)} km/h {degToCardinal(weather.windDirection)}
      </span>
    </div>
  )
}
