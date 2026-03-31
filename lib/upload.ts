import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export function getMediaType(filename: string): 'IMAGE' | 'VIDEO' {
  const ext = path.extname(filename).toLowerCase()
  const videoExts = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']
  return videoExts.includes(ext) ? 'VIDEO' : 'IMAGE'
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

/**
 * Saves a file either to Supabase Storage (when SUPABASE_URL is set)
 * or to the local public/uploads directory for local development.
 */
export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string
): Promise<{ filename: string; url: string }> {
  const ext = path.extname(originalName).toLowerCase()
  const filename = `${uuidv4()}${ext}`

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return saveToSupabase(buffer, filename, originalName)
  }

  return saveToLocal(buffer, filename)
}

async function saveToSupabase(
  buffer: Buffer,
  filename: string,
  originalName: string
): Promise<{ filename: string; url: string }> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const contentType = getContentType(originalName)
  const { error } = await supabase.storage
    .from('media')
    .upload(filename, buffer, { contentType, upsert: false })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data } = supabase.storage.from('media').getPublicUrl(filename)
  return { filename, url: data.publicUrl }
}

async function saveToLocal(
  buffer: Buffer,
  filename: string
): Promise<{ filename: string; url: string }> {
  const fs = await import('fs/promises')
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), buffer)
  return { filename, url: `/uploads/${filename}` }
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.heic': 'image/heic', '.heif': 'image/heif',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  }
  return map[ext] || 'application/octet-stream'
}

/**
 * Deletes a file from either Supabase Storage or local disk.
 */
export async function deleteUploadedFile(url: string, filename: string): Promise<void> {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.storage.from('media').remove([filename])
    return
  }

  const fs = await import('fs/promises')
  const filepath = path.join(process.cwd(), 'public', url)
  await fs.unlink(filepath).catch(() => {/* already deleted */})
}
