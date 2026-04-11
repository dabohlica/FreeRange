import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { getSession } from '@/lib/auth'
import { createUploadUrl } from '@/lib/storage'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { filename } = await req.json()
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })

  const ext = path.extname(filename).toLowerCase()
  const storedFilename = `${uuidv4()}${ext}`

  try {
    const signedUrl = await createUploadUrl(storedFilename)
    return NextResponse.json({ signedUrl, storedFilename })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
