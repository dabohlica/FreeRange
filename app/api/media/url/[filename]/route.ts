import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  // Require authentication
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename } = await params

  // Validate filename — no path traversal
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(filename, 3600) // 1-hour expiry

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Proxy the image bytes — redirect causes CORS failures for fetch() with credentials
  const imageRes = await fetch(data.signedUrl)
  if (!imageRes.ok) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
  const buffer = await imageRes.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': imageRes.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
