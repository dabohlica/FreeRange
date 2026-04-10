import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { fetchWeather } from '@/lib/weather'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  const date = searchParams.get('date') || ''

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const weather = await fetchWeather(lat, lng, date)
  if (!weather) return NextResponse.json({ error: 'no data' }, { status: 404 })
  return NextResponse.json(weather)
}
