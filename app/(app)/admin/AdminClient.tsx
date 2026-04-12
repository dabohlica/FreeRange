'use client'

import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { formatDate, formatFileSize } from '@/lib/utils'

const LocationPicker = dynamic(() => import('@/components/admin/LocationPicker'), { ssr: false })

interface Media {
  id: string; url: string; type: string; filename: string
  size: number; width?: number | null; height?: number | null
  takenAt?: string | null; latitude?: number | null; longitude?: number | null
}
interface Trip { id: string; name: string; color: string; _count: { entries: number } }
interface Entry {
  id: string; title: string; description?: string | null; date: string
  latitude?: number | null; longitude?: number | null
  city?: string | null; country?: string | null
  media: Media[]; trip?: { id: string; name: string; color: string } | null
}

interface BulkGroup {
  key: string
  files: File[]
  previews: string[]
  date: string          // YYYY-MM-DD for display / input
  dateTime?: string     // full ISO timestamp from EXIF (preserves time-of-day for sorting)
  latitude: string
  longitude: string
  city: string
  country: string
  title: string
  description: string
  tripId: string
  // Set when this group matches an existing entry
  matchedEntryId?: string
  matchedEntryTitle?: string
}

type BulkStage = 'idle' | 'analyzing' | 'reviewing' | 'uploading' | 'resetting'

type Tab = 'entries' | 'new-entry' | 'bulk' | 'trips' | 'location'

// ── Client-side EXIF extraction ──────────────────────────────────────────────
async function extractExifFromFile(file: File): Promise<{ lat?: number; lng?: number; date?: Date }> {
  try {
    const exifr = (await import('exifr')).default
    const data = await exifr.parse(file, { gps: true, exif: true })
    if (!data) return {}
    return {
      lat: data.latitude  ?? undefined,
      lng: data.longitude ?? undefined,
      date: data.DateTimeOriginal ? new Date(data.DateTimeOriginal) : undefined,
    }
  } catch { return {} }
}

// ── Browser geolocation ──────────────────────────────────────────────────────
function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

// ── Haversine distance ───────────────────────────────────────────────────────
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function autoTitle(date: string, city?: string, country?: string): string {
  if (city && country) return `${city}, ${country}`
  if (city) return city
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Group files by day + location proximity ──────────────────────────────────
// existingEntries is used to detect whether a new group matches an already-stored entry.
// Format a Date as YYYY-MM-DD using LOCAL time (not UTC) to avoid timezone drift
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function groupFiles(
  files: File[],
  existingEntries: Entry[]
): Promise<BulkGroup[]> {
  const metas = await Promise.all(files.map(async (f) => ({ file: f, exif: await extractExifFromFile(f) })))
  metas.sort((a, b) => (a.exif.date?.getTime() ?? 0) - (b.exif.date?.getTime() ?? 0))

  const groups: Array<{ files: File[]; dates: Date[]; lats: number[]; lngs: number[] }> = []
  const THRESHOLD_KM = 8

  for (const { file, exif } of metas) {
    // Use local date string to avoid UTC shift for evening photos in UTC+ timezones
    const day = exif.date ? localDateStr(exif.date) : localDateStr(new Date())
    let matched = false

    for (const g of groups) {
      const gDay = g.dates[0]?.toISOString().split('T')[0]
      if (gDay !== day) continue

      if (exif.lat == null || exif.lng == null || g.lats.length === 0) {
        g.files.push(file)
        if (exif.date) g.dates.push(exif.date)
        if (exif.lat != null) g.lats.push(exif.lat)
        if (exif.lng != null) g.lngs.push(exif.lng)
        matched = true; break
      }

      const avgLat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length
      const avgLng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length
      if (distanceKm(avgLat, avgLng, exif.lat, exif.lng) <= THRESHOLD_KM) {
        g.files.push(file)
        if (exif.date) g.dates.push(exif.date)
        g.lats.push(exif.lat); g.lngs.push(exif.lng)
        matched = true; break
      }
    }

    if (!matched) groups.push({
      files: [file],
      dates: exif.date ? [exif.date] : [],
      lats: exif.lat != null ? [exif.lat] : [],
      lngs: exif.lng != null ? [exif.lng] : [],
    })
  }

  return groups.map((g, i) => {
    const date = g.dates[0] ? localDateStr(g.dates[0]) : localDateStr(new Date())
    const avgLat = g.lats.length ? (g.lats.reduce((a, b) => a + b, 0) / g.lats.length).toFixed(6) : ''
    const avgLng = g.lngs.length ? (g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length).toFixed(6) : ''

    // Check if this group matches an existing entry: same day, within 8 km (or same day + no GPS on either)
    let matchedEntryId: string | undefined
    let matchedEntryTitle: string | undefined
    const gLat = avgLat ? parseFloat(avgLat) : null
    const gLng = avgLng ? parseFloat(avgLng) : null
    for (const entry of existingEntries) {
      if (entry.date.split('T')[0] !== date) continue
      // Only apply distance check when BOTH sides have GPS — if either lacks GPS, match by day alone
      if (gLat != null && gLng != null && entry.latitude != null && entry.longitude != null) {
        if (distanceKm(gLat, gLng, entry.latitude, entry.longitude) > THRESHOLD_KM) continue
      }
      matchedEntryId    = entry.id
      matchedEntryTitle = entry.title
      break
    }

    return {
      key: `group-${i}-${date}`,
      files: g.files,
      previews: g.files.slice(0, 4).map(f => URL.createObjectURL(f)),
      date, dateTime: g.dates[0]?.toISOString(), latitude: avgLat, longitude: avgLng,
      city: '', country: '',
      title: autoTitle(date),
      description: '', tripId: '',
      matchedEntryId,
      matchedEntryTitle,
    }
  })
}

// ── Single file upload ────────────────────────────────────────────────────────
// Uses Supabase signed upload URLs (browser → Supabase directly, bypassing any
// Next.js body size limits), then registers the media record via /api/upload/register.
// Falls back to /api/upload (direct route) for local dev without Supabase.
type UploadResult = { status: 'done' | 'skipped' | 'failed'; error?: string }

async function uploadFile(file: File, entryId: string, signal: AbortSignal): Promise<UploadResult> {
  if (signal.aborted) return { status: 'failed', error: 'Cancelled' }
  try {
    // Step 1: request a signed upload URL
    const signedRes = await fetch('/api/upload/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name }),
      signal,
    })

    if (!signedRes.ok) {
      if (signedRes.status === 500) {
        const err = await signedRes.json().catch(() => ({}))
        // Supabase not configured — fall back to direct upload
        if ((err.error as string)?.includes('not configured')) {
          return uploadFileDirect(file, entryId, signal)
        }
        return { status: 'failed', error: err.error || 'Failed to get upload URL' }
      }
      return uploadFileDirect(file, entryId, signal)
    }

    const { signedUrl, storedFilename } = await signedRes.json()

    // Step 2: PUT the file directly to Supabase (no Next.js in the middle)
    const uploadRes = await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      signal,
    })
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '')
      return { status: 'failed', error: `Storage upload failed (${uploadRes.status}): ${text.slice(0, 200)}` }
    }

    // Step 3: register the media record (EXIF extraction, hash dedup, DB insert)
    const regRes = await fetch('/api/upload/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId, storedFilename, originalName: file.name, size: file.size }),
      signal,
    })
    const regData = await regRes.json()
    if (!regRes.ok) return { status: 'failed', error: regData.error || `Register failed (${regRes.status})` }
    if (regData.success)  return { status: 'done' }
    if (regData.skipped)  return { status: 'skipped' }
    return { status: 'failed', error: regData.error || 'Unexpected register response' }

  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return { status: 'failed', error: 'Cancelled' }
    return { status: 'failed', error: (e as Error).message }
  }
}

// Fallback for local dev (no Supabase) — uploads through the Next.js route handler
async function uploadFileDirect(file: File, entryId: string, signal: AbortSignal): Promise<UploadResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) return { status: 'failed', error: 'Cancelled' }
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))
    try {
      const form = new FormData()
      form.append('entryId', entryId)
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form, signal })
      const data = await res.json()
      if (!res.ok) {
        if (res.status < 500) return { status: 'failed', error: data.error || `HTTP ${res.status}` }
        if (attempt < 2) continue
        return { status: 'failed', error: data.error || `Server error ${res.status}` }
      }
      if (data.success)  return { status: 'done' }
      if (data.skipped)  return { status: 'skipped' }
      return { status: 'failed', error: data.error || 'Unexpected response' }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return { status: 'failed', error: 'Cancelled' }
      if (attempt < 2) continue
      return { status: 'failed', error: (e as Error).message }
    }
  }
  return { status: 'failed', error: 'Max retries exceeded' }
}

// ── Bulk dropzone (separate component so key remount resets the file input) ──
function BulkDropzone({ onDrop }: { onDrop: (files: File[]) => void }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'], 'video/*': ['.mp4', '.mov', '.webm'] },
    multiple: true,
  })
  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${isDragActive ? 'border-[#171717] bg-[#171717]/5' : 'border-[#e5e5e5] hover:border-[#d4d4d4] hover:bg-[#fafaf9]'}`}>
      <input {...getInputProps()} />
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <p className="text-sm text-[#737373]">{isDragActive ? 'Drop photos here' : 'Drag & drop all your photos, or click to browse'}</p>
      <p className="text-xs text-[#a3a3a3] mt-1">Groups by day + location (≤ 8 km) · EXIF required for smart grouping</p>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminClient({ initialEntries, initialTrips }: { initialEntries: Entry[]; initialTrips: Trip[] }) {
  const router = useRouter()
  const [tab, setTab]         = useState<Tab>('entries')
  const [entries, setEntries] = useState(initialEntries)
  const [trips, setTrips]     = useState(initialTrips)

  const blankForm = () => ({
    title: '', description: '',
    date: new Date().toISOString().split('T')[0],
    latitude: '', longitude: '', city: '', country: '', tripId: '',
  })
  const [entryForm, setEntryForm]         = useState(blankForm)
  const [exifDetected, setExifDetected]   = useState(false)
  const [uploadFiles, setUploadFiles]     = useState<File[]>([])
  const [submitting, setSubmitting]       = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [editEntry, setEditEntry]         = useState<Entry | null>(null)

  // ── Bulk upload state ────────────────────────────────────────────────────
  const [bulkStage, setBulkStage]   = useState<BulkStage>('idle')
  const [bulkGroups, setBulkGroups] = useState<BulkGroup[]>([])
  const [bulkProgress, setBulkProgress] = useState<{
    groupIdx: number; groupCount: number
    fileDone: number; fileTotal: number; label: string
  } | null>(null)
  const [bulkDone, setBulkDone]       = useState(0)
  const [bulkSkipped, setBulkSkipped] = useState(0)
  const [bulkFailed, setBulkFailed]   = useState(0)
  const [bulkErrors, setBulkErrors]   = useState<string[]>([])
  const [dropzoneKey, setDropzoneKey] = useState(0)  // increment to remount file input
  const bulkAbortRef      = useRef<AbortController | null>(null)
  const bulkCreatedIdsRef = useRef<string[]>([])

  const [geoLocating, setGeoLocating]     = useState(false)
  const [pickerTarget, setPickerTarget]   = useState<'entry' | number | null>(null)

  // ── Bulk selection + delete ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting]   = useState(false)

  const [locationForm, setLocationForm]   = useState({ latitude: '', longitude: '', altitude: '' })
  const [locationSaving, setLocationSaving] = useState(false)
  const [tripForm, setTripForm]           = useState({ name: '', description: '', color: '#3B82F6' })
  const [tripSubmitting, setTripSubmitting] = useState(false)

  // ── Backfill thumbnails ──────────────────────────────────────────────────
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillStatus, setBackfillStatus] = useState<{
    processed: number
    failed: number
    remaining: number | null
  }>({ processed: 0, failed: 0, remaining: null })

  // ── Backfill handler ─────────────────────────────────────────────────────
  const runBackfill = async (reset = false) => {
    setBackfillRunning(true)
    setBackfillStatus({ processed: 0, failed: 0, remaining: null })
    let totalProcessed = 0
    let totalFailed = 0
    try {
      if (reset) {
        // Clear all existing thumbnails first so they get re-generated
        const res = await fetch('/api/admin/backfill-thumbnails?reset=true', { method: 'POST' })
        if (!res.ok) throw new Error(`reset failed: ${res.status}`)
      }
      while (true) {
        const res = await fetch('/api/admin/backfill-thumbnails', { method: 'POST' })
        if (!res.ok) throw new Error(`backfill failed: ${res.status}`)
        const json = (await res.json()) as {
          processed: number
          failed: number
          remaining: number
          errors: string[]
        }
        totalProcessed += json.processed
        totalFailed += json.failed
        setBackfillStatus({
          processed: totalProcessed,
          failed: totalFailed,
          remaining: json.remaining,
        })
        if (json.remaining === 0 || json.processed === 0) break
      }
    } catch (err) {
      console.error('[admin] backfill error', err)
    } finally {
      setBackfillRunning(false)
    }
  }

  // ── Single entry dropzone ────────────────────────────────────────────────
  const onDrop = useCallback(async (accepted: File[]) => {
    setUploadFiles(prev => [...prev, ...accepted])
    const firstImage = accepted.find(f => f.type.startsWith('image/'))
    if (!firstImage) return
    const exif = await extractExifFromFile(firstImage)
    let changed = false
    setEntryForm(prev => {
      const next = { ...prev }
      if (exif.lat != null && exif.lng != null && !prev.latitude && !prev.longitude) {
        next.latitude  = String(exif.lat.toFixed(6))
        next.longitude = String(exif.lng.toFixed(6))
        changed = true
      }
      if (exif.date && prev.date === new Date().toISOString().split('T')[0]) {
        next.date = exif.date.toISOString().split('T')[0]
        changed = true
      }
      return next
    })
    if (changed) setExifDetected(true)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'], 'video/*': ['.mp4', '.mov', '.webm'] },
    multiple: true,
  })

  // ── Bulk drop ────────────────────────────────────────────────────────────
  const onBulkDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    setBulkStage('analyzing')
    setBulkGroups([])
    try {
      const groups = await groupFiles(accepted, entries)
      setBulkGroups(groups)
      setBulkStage('reviewing')
    } catch {
      setBulkStage('idle')
    }
  }, [entries])

  // ── Start Over: abort + await cleanup + remount dropzone ─────────────────
  async function handleStartOver() {
    bulkAbortRef.current?.abort()
    const ids = bulkCreatedIdsRef.current.splice(0)
    setBulkStage('resetting')
    setBulkGroups([])
    setBulkProgress(null)
    setBulkDone(0); setBulkSkipped(0); setBulkFailed(0); setBulkErrors([])
    // Await cleanup so hashes are gone before the user can re-upload
    if (ids.length > 0) {
      await Promise.allSettled(ids.map(id => fetch(`/api/entries/${id}`, { method: 'DELETE' })))
    }
    setDropzoneKey(k => k + 1)  // remount file input so same files can be selected again
    setBulkStage('idle')
  }

  // ── Create / update single entry ─────────────────────────────────────────
  async function handleSubmitEntry(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      let entry: Entry
      if (editEntry) {
        const res = await fetch(`/api/entries/${editEntry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...entryForm,
            latitude:  entryForm.latitude  || null,
            longitude: entryForm.longitude || null,
          }),
        })
        if (!res.ok) { alert((await res.json()).error || 'Failed to update entry'); return }
        entry = await res.json()
      } else {
        const res = await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...entryForm,
            latitude:  entryForm.latitude  || null,
            longitude: entryForm.longitude || null,
          }),
        })
        if (!res.ok) { alert((await res.json()).error || 'Failed to create entry'); return }
        entry = await res.json()
      }

      const abort = new AbortController()
      for (let i = 0; i < uploadFiles.length; i++) {
        setUploadProgress(`Uploading ${i + 1}/${uploadFiles.length}…`)
        await uploadFile(uploadFiles[i], entry.id, abort.signal)
      }

      setEntryForm(blankForm())
      setUploadFiles([])
      setExifDetected(false)
      setUploadProgress(null)
      setEditEntry(null)
      setTab('entries')
      router.refresh()
      const freshRes = await fetch('/api/entries')
      if (freshRes.ok) setEntries(await freshRes.json())
    } finally { setSubmitting(false); setUploadProgress(null) }
  }

  function handleEditEntry(entry: Entry) {
    setEditEntry(entry)
    setEntryForm({
      title:       entry.title ?? '',
      description: entry.description ?? '',
      date:        entry.date.split('T')[0],
      latitude:    entry.latitude  != null ? String(entry.latitude)  : '',
      longitude:   entry.longitude != null ? String(entry.longitude) : '',
      city:        entry.city    ?? '',
      country:     entry.country ?? '',
      tripId:      entry.trip?.id ?? '',
    })
    setUploadFiles([])
    setExifDetected(false)
    setTab('new-entry')
  }

  async function deleteEntry(id: string): Promise<boolean> {
    const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`Delete failed: ${data.error || res.status}`)
      return false
    }
    return true
  }

  async function handleDeleteEntry(id: string) {
    if (pendingDeleteId !== id) { setPendingDeleteId(id); return }
    setPendingDeleteId(null)
    if (await deleteEntry(id)) {
      setEntries(prev => prev.filter(e => e.id !== id))
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function handleBulkDelete() {
    if (bulkDeleting || selectedIds.size === 0) return
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map(id => deleteEntry(id)))
    setEntries(prev => prev.filter(e => !ids.includes(e.id)))
    setSelectedIds(new Set())
    setBulkDeleting(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === entries.length ? new Set() : new Set(entries.map(e => e.id)))
  }

  async function handleDeleteMedia(mediaId: string, entryId: string) {
    const res = await fetch(`/api/media/${mediaId}`, { method: 'DELETE' })
    if (res.ok) setEntries(prev => prev.map(e => e.id === entryId ? { ...e, media: e.media.filter(m => m.id !== mediaId) } : e))
  }

  // ── Bulk create ───────────────────────────────────────────────────────────
  async function handleBulkCreate() {
    if (!bulkGroups.length || bulkStage === 'uploading') return
    const abort = new AbortController()
    bulkAbortRef.current = abort
    bulkCreatedIdsRef.current = []
    setBulkStage('uploading')
    setBulkDone(0); setBulkSkipped(0); setBulkFailed(0); setBulkErrors([])

    let totalDone = 0, totalSkipped = 0, totalFailed = 0

    try {
      for (let gi = 0; gi < bulkGroups.length; gi++) {
        if (abort.signal.aborted) break
        const g = bulkGroups[gi]

        setBulkProgress({ groupIdx: gi + 1, groupCount: bulkGroups.length, fileDone: 0, fileTotal: g.files.length, label: g.title })

        let entryId: string
        if (g.matchedEntryId) {
          // Add to existing entry — no new entry created
          entryId = g.matchedEntryId
        } else {
          const entryRes = await fetch('/api/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title:       g.title       || undefined,
              description: g.description || null,
              date:        g.dateTime ?? g.date,
              latitude:    g.latitude    || null,
              longitude:   g.longitude   || null,
              city:        g.city        || null,
              country:     g.country     || null,
              tripId:      g.tripId      || null,
            }),
            signal: abort.signal,
          })
          if (!entryRes.ok) continue
          const entry = await entryRes.json()
          entryId = entry.id
          bulkCreatedIdsRef.current.push(entryId)
        }

        // Upload files 3 at a time
        const CONCURRENCY = 3
        let fileDone = 0
        for (let fi = 0; fi < g.files.length; fi += CONCURRENCY) {
          if (abort.signal.aborted) break
          const batch = g.files.slice(fi, fi + CONCURRENCY)
          await Promise.all(batch.map(async (file) => {
            const result = await uploadFile(file, entryId, abort.signal)
            if (result.status === 'done')    { totalDone++;    setBulkDone(d => d + 1) }
            if (result.status === 'skipped') { totalSkipped++; setBulkSkipped(s => s + 1) }
            if (result.status === 'failed')  {
              totalFailed++
              setBulkFailed(f => f + 1)
              if (result.error) setBulkErrors(e => [...e, `${file.name}: ${result.error}`])
            }
            fileDone++
            setBulkProgress({ groupIdx: gi + 1, groupCount: bulkGroups.length, fileDone, fileTotal: g.files.length, label: g.title })
          }))
        }
      }
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error('Bulk create error:', e)
    }

    if (abort.signal.aborted) return

    setBulkProgress(null)
    setBulkStage('reviewing')

    // Navigate away only if everything succeeded
    if (totalFailed === 0 && totalSkipped === 0) {
      setBulkGroups([])
      setBulkStage('idle')
      setDropzoneKey(k => k + 1)
      setTab('entries')
      router.refresh()
      const freshRes = await fetch('/api/entries')
      if (freshRes.ok) setEntries(await freshRes.json())
    }
  }

  async function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault()
    setTripSubmitting(true)
    try {
      const res = await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tripForm) })
      if (res.ok) { const trip = await res.json(); setTrips(prev => [{ ...trip, _count: { entries: 0 } }, ...prev]); setTripForm({ name: '', description: '', color: '#3B82F6' }) }
    } finally { setTripSubmitting(false) }
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    setLocationSaving(true)
    try {
      const res = await fetch('/api/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(locationForm) })
      if (res.ok) alert('Live location updated!')
    } finally { setLocationSaving(false) }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-[#e5e5e5] bg-[#fafaf9] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] transition-colors text-sm'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'entries', label: 'Entries' },
    { id: 'new-entry', label: editEntry ? 'Edit Entry' : 'New Entry' },
    { id: 'bulk', label: 'Bulk Upload' },
    { id: 'trips', label: 'Trips' },
    { id: 'location', label: 'Live Location' },
  ]

  return (
    <main className="min-h-screen pt-24 pb-16 page-enter">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-['Playfair_Display'] font-semibold text-[#171717] tracking-tight">Admin</h1>
          <p className="mt-2 text-[#737373]">Manage your travel journal</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#f5f5f4] p-1 rounded-xl mb-8 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${tab === t.id ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Entries ── */}
        {tab === 'entries' && (
          <div className="space-y-3">
            <div className="my-4 p-4 border rounded">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => runBackfill(false)}
                  disabled={backfillRunning}
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {backfillRunning ? 'Generating...' : 'Generate missing thumbnails'}
                </button>
                <button
                  type="button"
                  onClick={() => runBackfill(true)}
                  disabled={backfillRunning}
                  className="px-4 py-2 bg-orange-600 text-white rounded disabled:opacity-50"
                >
                  Regenerate all thumbnails
                </button>
              </div>
              {(backfillRunning || backfillStatus.remaining !== null) && (
                <p className="mt-2 text-sm">
                  Processed: {backfillStatus.processed} · Failed: {backfillStatus.failed}
                  {backfillStatus.remaining !== null && ` · Remaining: ${backfillStatus.remaining}`}
                </p>
              )}
            </div>
            {entries.length === 0 && <div className="text-center py-16 text-[#a3a3a3]">No entries yet. Create your first entry!</div>}

            {entries.length > 0 && (
              <div className="flex items-center justify-between gap-3 pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === entries.length && entries.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[#d4d4d4] accent-[#171717] cursor-pointer"
                  />
                  <span className="text-sm text-[#737373]">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                  </span>
                </label>

                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    {pendingDeleteId === 'bulk' ? (
                      <>
                        <span className="text-sm text-[#ef4444]">Delete {selectedIds.size} entr{selectedIds.size !== 1 ? 'ies' : 'y'}?</span>
                        <button onClick={() => { setPendingDeleteId(null) }} className="px-3 py-1.5 rounded-lg text-sm border border-[#e5e5e5] text-[#737373] hover:text-[#171717] transition-colors cursor-pointer">Cancel</button>
                        <button onClick={async () => { setPendingDeleteId(null); await handleBulkDelete() }} disabled={bulkDeleting}
                          className="px-3 py-1.5 rounded-lg text-sm bg-[#ef4444] text-white font-medium hover:bg-[#dc2626] disabled:opacity-50 transition-colors cursor-pointer">
                          {bulkDeleting ? 'Deleting…' : 'Confirm'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setPendingDeleteId('bulk')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#ef4444] border border-[#ef4444]/30 hover:bg-[#ef4444]/5 transition-colors cursor-pointer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        Delete {selectedIds.size}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {entries.map(entry => (
              <div key={entry.id} className={`bg-white rounded-2xl border p-5 transition-colors ${selectedIds.has(entry.id) ? 'border-[#171717]' : 'border-[#e5e5e5] hover:border-[#d4d4d4]'}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => { toggleSelect(entry.id); setPendingDeleteId(null) }}
                    className="mt-1 w-4 h-4 rounded border-[#d4d4d4] accent-[#171717] shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[#171717]">{entry.title}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <span className="text-xs text-[#a3a3a3]">{formatDate(entry.date)}</span>
                          {(entry.city || entry.country) && <span className="text-xs text-[#737373]">{[entry.city, entry.country].filter(Boolean).join(', ')}</span>}
                          {entry.trip && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${entry.trip.color}20`, color: entry.trip.color }}>{entry.trip.name}</span>}
                          <span className="text-xs text-[#a3a3a3]">{entry.media.length} file{entry.media.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEditEntry(entry)} className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f4] transition-colors cursor-pointer" title="Edit">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        {pendingDeleteId === entry.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => setPendingDeleteId(null)} className="px-2 py-1 rounded-lg text-xs text-[#737373] hover:bg-[#f5f5f4] transition-colors cursor-pointer">Cancel</button>
                            <button onClick={() => handleDeleteEntry(entry.id)} className="px-2 py-1 rounded-lg text-xs bg-[#ef4444] text-white font-medium hover:bg-[#dc2626] transition-colors cursor-pointer">Delete</button>
                          </div>
                        ) : (
                          <button onClick={() => { setPendingDeleteId(entry.id); setSelectedIds(new Set()) }} className="p-2 rounded-lg text-[#ef4444]/50 hover:text-[#ef4444] hover:bg-[#ef4444]/5 transition-colors cursor-pointer" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {entry.media.length > 0 && (
                      <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                        {entry.media.map(m => (
                          <div key={m.id} className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-[#f5f5f4] group">
                            {m.type === 'IMAGE' ? <Image src={m.url} alt={m.filename} fill sizes="56px" className="object-cover" /> : <div className="w-full h-full bg-[#171717] flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>}
                            <button onClick={() => handleDeleteMedia(m.id, entry.id)} className="absolute inset-0 bg-black/0 hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── New / Edit Entry ── */}
        {tab === 'new-entry' && (
          <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
            <h2 className="text-lg font-semibold text-[#171717] mb-6">{editEntry ? 'Edit Entry' : 'New Entry'}</h2>
            <form onSubmit={handleSubmitEntry} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">
                    {editEntry ? 'Add More Photos & Videos' : 'Photos & Videos'}
                    <span className="ml-2 font-normal text-[#a3a3a3]">— location & date extracted automatically from EXIF</span>
                  </label>
                  <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragActive ? 'border-[#171717] bg-[#171717]/5' : 'border-[#e5e5e5] hover:border-[#d4d4d4] hover:bg-[#fafaf9]'}`}>
                    <input {...getInputProps()} />
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <p className="text-sm text-[#737373]">{isDragActive ? 'Drop files here' : 'Drag & drop photos/videos, or click to browse'}</p>
                    <p className="text-xs text-[#a3a3a3] mt-1">JPEG, PNG, WebP, HEIC, MP4, MOV · Max 100MB each</p>
                  </div>
                  {exifDetected && <p className="mt-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5">GPS & date extracted from photo EXIF</p>}
                  {uploadFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {uploadFiles.map((file, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-[#fafaf9] rounded-xl border border-[#e5e5e5]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          <span className="flex-1 text-sm text-[#404040] truncate">{file.name}</span>
                          <span className="text-xs text-[#a3a3a3]">{formatFileSize(file.size)}</span>
                          <button type="button" onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))} className="text-[#a3a3a3] hover:text-[#ef4444] transition-colors cursor-pointer">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">
                    Title <span className="ml-2 font-normal text-[#a3a3a3]">— auto-generated from date/location if blank</span>
                  </label>
                  <input type="text" value={entryForm.title} onChange={e => setEntryForm(p => ({ ...p, title: e.target.value }))} placeholder="Leave blank to auto-generate" className={inputCls} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Date</label>
                  <input type="date" value={entryForm.date} onChange={e => setEntryForm(p => ({ ...p, date: e.target.value }))} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Trip</label>
                  <select value={entryForm.tripId} onChange={e => setEntryForm(p => ({ ...p, tripId: e.target.value }))} className={inputCls}>
                    <option value="">No trip</option>
                    {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Description</label>
                  <textarea value={entryForm.description} onChange={e => setEntryForm(p => ({ ...p, description: e.target.value }))} placeholder="What happened here…" rows={3} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Latitude</label>
                  <input type="number" step="any" value={entryForm.latitude} onChange={e => setEntryForm(p => ({ ...p, latitude: e.target.value }))} placeholder="Auto from EXIF" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Longitude</label>
                  <input type="number" step="any" value={entryForm.longitude} onChange={e => setEntryForm(p => ({ ...p, longitude: e.target.value }))} placeholder="Auto from EXIF" className={inputCls} />
                </div>
                <div className="sm:col-span-2 flex items-center gap-4 flex-wrap">
                  <button type="button" disabled={geoLocating} onClick={async () => {
                    setGeoLocating(true)
                    try {
                      const { lat, lng } = await getCurrentLocation()
                      setEntryForm(p => ({ ...p, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))
                      setExifDetected(true)
                    } catch { alert('Could not get location. Please allow location access in your browser.') }
                    finally { setGeoLocating(false) }
                  }} className="flex items-center gap-1.5 text-sm text-[#3b82f6] hover:text-[#2563eb] disabled:opacity-50 transition-colors cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8" strokeDasharray="2 4"/></svg>
                    {geoLocating ? 'Getting location…' : 'Use current location'}
                  </button>
                  <button type="button" onClick={() => setPickerTarget('entry')} className="flex items-center gap-1.5 text-sm text-[#737373] hover:text-[#171717] transition-colors cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    Pick on map
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">City</label>
                  <input type="text" value={entryForm.city} onChange={e => setEntryForm(p => ({ ...p, city: e.target.value }))} placeholder="Paris" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Country</label>
                  <input type="text" value={entryForm.country} onChange={e => setEntryForm(p => ({ ...p, country: e.target.value }))} placeholder="France" className={inputCls} />
                </div>
              </div>

              {uploadProgress && <p className="text-sm text-[#737373] bg-[#f5f5f4] rounded-xl px-4 py-2.5">{uploadProgress}</p>}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 px-4 rounded-xl bg-[#171717] text-white font-medium text-sm hover:bg-[#404040] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                  {submitting ? 'Saving…' : editEntry ? 'Update Entry' : 'Create Entry'}
                </button>
                <button type="button" onClick={() => { setEditEntry(null); setEntryForm(blankForm()); setTab('entries') }} className="px-4 py-2.5 rounded-xl border border-[#e5e5e5] text-[#737373] hover:text-[#171717] hover:border-[#d4d4d4] font-medium text-sm transition-colors cursor-pointer">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* ── Bulk Upload ── */}
        {tab === 'bulk' && (
          <div className="space-y-6">

            {/* Resetting */}
            {bulkStage === 'resetting' && (
              <div className="bg-white rounded-2xl border border-[#e5e5e5] p-12 text-center">
                <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-[#737373]">Cleaning up…</p>
              </div>
            )}

            {/* Drop zone */}
            {bulkStage === 'idle' && (
              <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
                <h2 className="text-lg font-semibold text-[#171717] mb-2">Bulk Upload</h2>
                <p className="text-sm text-[#737373] mb-5">Drop all your photos at once. They&apos;ll be grouped by day and location area automatically.</p>
                <BulkDropzone key={dropzoneKey} onDrop={onBulkDrop} />
              </div>
            )}

            {/* Analyzing */}
            {bulkStage === 'analyzing' && (
              <div className="bg-white rounded-2xl border border-[#e5e5e5] p-12 text-center">
                <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-[#737373]">Analysing EXIF data and grouping…</p>
              </div>
            )}

            {/* Review + upload */}
            {(bulkStage === 'reviewing' || bulkStage === 'uploading') && bulkGroups.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#171717]">{bulkGroups.length} group{bulkGroups.length !== 1 ? 's' : ''} detected</p>
                    <p className="text-xs text-[#a3a3a3] mt-0.5">
                      {bulkGroups.reduce((s, g) => s + g.files.length, 0)} photos ·{' '}
                      {bulkGroups.filter(g => !g.matchedEntryId).length} new entr{bulkGroups.filter(g => !g.matchedEntryId).length !== 1 ? 'ies' : 'y'}{bulkGroups.some(g => g.matchedEntryId) ? `, ${bulkGroups.filter(g => g.matchedEntryId).length} adding to existing` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartOver}
                      disabled={bulkStage === 'uploading'}
                      className="px-4 py-2 rounded-xl border border-[#e5e5e5] text-sm text-[#737373] hover:text-[#171717] hover:border-[#d4d4d4] disabled:opacity-40 transition-colors cursor-pointer">
                      Start over
                    </button>
                    <button
                      onClick={handleBulkCreate}
                      disabled={bulkStage === 'uploading'}
                      className="px-4 py-2 rounded-xl bg-[#171717] text-white text-sm font-medium hover:bg-[#404040] disabled:opacity-50 transition-colors cursor-pointer">
                      {bulkStage === 'uploading' ? 'Uploading…' : `Create ${bulkGroups.length} entr${bulkGroups.length !== 1 ? 'ies' : 'y'}`}
                    </button>
                  </div>
                </div>

                {/* Progress */}
                {bulkStage === 'uploading' && bulkProgress && (
                  <div className="bg-[#f5f5f4] rounded-xl px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#171717] font-medium truncate">{bulkProgress.label}</span>
                      <span className="text-xs text-[#a3a3a3] shrink-0 ml-3">Group {bulkProgress.groupIdx}/{bulkProgress.groupCount}</span>
                    </div>
                    <div className="bg-[#e5e5e5] rounded-full h-1.5">
                      <div className="bg-[#171717] rounded-full h-1.5 transition-all duration-300"
                        style={{ width: `${bulkProgress.fileTotal > 0 ? Math.round((bulkProgress.fileDone / bulkProgress.fileTotal) * 100) : 0}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs text-[#737373]">
                      <span>{bulkDone} uploaded</span>
                      {bulkSkipped > 0 && <span>{bulkSkipped} skipped</span>}
                      {bulkFailed  > 0 && <span className="text-red-500">{bulkFailed} failed</span>}
                    </div>
                  </div>
                )}

                {/* Results after upload */}
                {bulkStage === 'reviewing' && (bulkDone > 0 || bulkSkipped > 0 || bulkFailed > 0) && (
                  <div className={`border rounded-xl px-4 py-3 space-y-2 ${bulkFailed > 0 ? 'bg-red-50 border-red-200' : 'bg-[#f0fdf4] border-[#86efac]'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex gap-4 text-sm flex-wrap">
                        {bulkDone    > 0 && <span className="text-[#166534]">{bulkDone} uploaded</span>}
                        {bulkSkipped > 0 && <span className="text-[#737373]">{bulkSkipped} skipped (duplicates)</span>}
                        {bulkFailed  > 0 && <span className="text-red-600 font-medium">{bulkFailed} failed</span>}
                      </div>
                      <button onClick={() => { setTab('entries'); router.refresh(); fetch('/api/entries').then(r => r.ok ? r.json() : null).then(d => d && setEntries(d)) }}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[#171717] text-white hover:bg-[#404040] transition-colors cursor-pointer">
                        Go to entries
                      </button>
                    </div>
                    {bulkErrors.length > 0 && (
                      <div className="space-y-1">
                        {bulkErrors.map((e, i) => (
                          <p key={i} className="text-xs text-red-700 font-mono break-all">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* GPS-less banner */}
                {bulkStage === 'reviewing' && bulkGroups.some(g => !g.latitude) && (
                  <div className="flex items-center justify-between gap-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3">
                    <p className="text-sm text-[#1d4ed8]">
                      {bulkGroups.filter(g => !g.latitude).length} group{bulkGroups.filter(g => !g.latitude).length !== 1 ? 's' : ''} have no GPS.
                    </p>
                    <button type="button" disabled={geoLocating} onClick={async () => {
                      setGeoLocating(true)
                      try {
                        const { lat, lng } = await getCurrentLocation()
                        setBulkGroups(prev => prev.map(g => g.latitude ? g : { ...g, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))
                      } catch { alert('Could not get location. Please allow location access in your browser.') }
                      finally { setGeoLocating(false) }
                    }} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1d4ed8] text-white text-xs font-medium hover:bg-[#1e40af] disabled:opacity-50 transition-colors cursor-pointer">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
                      {geoLocating ? 'Getting…' : 'Stamp all with current location'}
                    </button>
                  </div>
                )}

                {/* Matched groups — compact read-only, no new entry created */}
                {bulkGroups.some(g => g.matchedEntryId) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-emerald-800">Adding to existing entries</p>
                    {bulkGroups.filter(g => g.matchedEntryId).map(group => (
                      <div key={group.key} className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {group.previews.slice(0, 3).map((src, pi) => (
                            <div key={pi} className="w-8 h-8 shrink-0 rounded-md overflow-hidden bg-emerald-100">
                              <img src={src} alt="" className="w-full h-full object-cover" />
                            </div>
                          ))}
                          {group.files.length > 3 && (
                            <div className="w-8 h-8 shrink-0 rounded-md bg-emerald-100 flex items-center justify-center text-[10px] text-emerald-700 font-medium">
                              +{group.files.length - 3}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-emerald-700 flex-1 min-w-0">
                          <span className="font-medium">{group.files.length} photo{group.files.length !== 1 ? 's' : ''}</span>
                          {' → '}
                          <span className="truncate">&ldquo;{group.matchedEntryTitle}&rdquo;</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* New groups — full editable cards */}
                <div className="space-y-4">
                  {bulkGroups.filter(g => !g.matchedEntryId).map((group) => {
                    const gi = bulkGroups.indexOf(group)
                    return (
                    <div key={group.key} className="bg-white rounded-2xl border border-[#e5e5e5] p-5">
                      <div className="flex gap-1.5 mb-4">
                        {group.previews.map((src, pi) => (
                          <div key={pi} className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-[#f5f5f4]">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {group.files.length > 4 && (
                          <div className="w-14 h-14 shrink-0 rounded-lg bg-[#f5f5f4] flex items-center justify-center text-xs text-[#737373] font-medium">
                            +{group.files.length - 4}
                          </div>
                        )}
                        <div className="ml-2 flex flex-col justify-center gap-1">
                          <span className="text-sm font-medium text-[#171717]">{group.files.length} photo{group.files.length !== 1 ? 's' : ''}</span>
                          <span className="text-xs text-[#a3a3a3]">{group.date}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[#404040] mb-1">Title</label>
                          <input type="text" value={group.title} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, title: e.target.value } : g))}
                            className={inputCls} placeholder="Auto-generated" disabled={bulkStage === 'uploading'} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[#404040] mb-1">Description</label>
                          <textarea value={group.description} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, description: e.target.value } : g))}
                            placeholder="Optional notes…" rows={2} className={`${inputCls} resize-none`} disabled={bulkStage === 'uploading'} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">City</label>
                          <input type="text" value={group.city} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, city: e.target.value, title: autoTitle(g.date, e.target.value, g.country) } : g))}
                            placeholder="Paris" className={inputCls} disabled={bulkStage === 'uploading'} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">Country</label>
                          <input type="text" value={group.country} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, country: e.target.value, title: autoTitle(g.date, g.city, e.target.value) } : g))}
                            placeholder="France" className={inputCls} disabled={bulkStage === 'uploading'} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">Trip</label>
                          <select value={group.tripId} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, tripId: e.target.value } : g))} className={inputCls} disabled={bulkStage === 'uploading'}>
                            <option value="">No trip</option>
                            {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">Date</label>
                          <input type="date" value={group.date} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, date: e.target.value, dateTime: e.target.value } : g))} className={inputCls} disabled={bulkStage === 'uploading'} />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-3">
                          {group.latitude
                            ? <p className="text-xs text-[#a3a3a3]">GPS: {group.latitude}, {group.longitude}</p>
                            : <p className="text-xs text-[#f59e0b]">No GPS in EXIF</p>
                          }
                          {bulkStage !== 'uploading' && <>
                            <button type="button" disabled={geoLocating} onClick={async () => {
                              setGeoLocating(true)
                              try {
                                const { lat, lng } = await getCurrentLocation()
                                setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, latitude: lat.toFixed(6), longitude: lng.toFixed(6) } : g))
                              } catch { alert('Could not get location.') }
                              finally { setGeoLocating(false) }
                            }} className="text-xs text-[#3b82f6] hover:text-[#2563eb] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap">
                              {geoLocating ? 'Getting…' : 'Use current location'}
                            </button>
                            <button type="button" onClick={() => setPickerTarget(gi)} className="text-xs text-[#737373] hover:text-[#171717] transition-colors cursor-pointer whitespace-nowrap">
                              Pick on map
                            </button>
                          </>}
                        </div>
                      </div>

                      {bulkStage !== 'uploading' && (
                        <button onClick={() => setBulkGroups(prev => prev.filter((_, i) => i !== gi))}
                          className="mt-3 text-xs text-[#ef4444]/60 hover:text-[#ef4444] transition-colors cursor-pointer">
                          Remove this group
                        </button>
                      )}
                    </div>
                  )})}
                </div>

                {bulkStage === 'reviewing' && (
                  <div className="flex justify-end">
                    {(() => {
                      const newCount = bulkGroups.filter(g => !g.matchedEntryId).length
                      const addCount = bulkGroups.filter(g =>  g.matchedEntryId).length
                      const label = [
                        newCount > 0 && `Create ${newCount} entr${newCount !== 1 ? 'ies' : 'y'}`,
                        addCount > 0 && `add to ${addCount} existing`,
                      ].filter(Boolean).join(' & ')
                      return (
                        <button onClick={handleBulkCreate} className="px-6 py-2.5 rounded-xl bg-[#171717] text-white text-sm font-medium hover:bg-[#404040] transition-colors cursor-pointer">
                          {label}
                        </button>
                      )
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Trips ── */}
        {tab === 'trips' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
              <h2 className="text-base font-semibold text-[#171717] mb-4">New Trip</h2>
              <form onSubmit={handleCreateTrip} className="flex gap-3 flex-wrap">
                <input type="text" value={tripForm.name} onChange={e => setTripForm(p => ({ ...p, name: e.target.value }))} placeholder="Trip name" className="flex-1 min-w-40 px-4 py-2.5 rounded-xl border border-[#e5e5e5] bg-[#fafaf9] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#171717]/10 focus:border-[#171717] transition-colors text-sm" required />
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[#737373]">Color</label>
                  <input type="color" value={tripForm.color} onChange={e => setTripForm(p => ({ ...p, color: e.target.value }))} className="w-9 h-9 rounded-lg border border-[#e5e5e5] cursor-pointer" />
                </div>
                <button type="submit" disabled={tripSubmitting} className="px-5 py-2.5 rounded-xl bg-[#171717] text-white font-medium text-sm hover:bg-[#404040] disabled:opacity-50 transition-colors cursor-pointer">{tripSubmitting ? 'Creating…' : 'Create'}</button>
              </form>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {trips.map(trip => (
                <div key={trip.id} className="bg-white rounded-2xl border border-[#e5e5e5] p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl shrink-0" style={{ background: `${trip.color}20`, border: `2px solid ${trip.color}` }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#171717] truncate">{trip.name}</p>
                    <p className="text-xs text-[#a3a3a3]">{trip._count.entries} entries</p>
                  </div>
                </div>
              ))}
              {trips.length === 0 && <p className="text-[#a3a3a3] text-sm col-span-2 text-center py-8">No trips yet</p>}
            </div>
          </div>
        )}

        {/* ── Live Location ── */}
        {tab === 'location' && (
          <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
            <h2 className="text-base font-semibold text-[#171717] mb-2">Live Location</h2>
            <p className="text-sm text-[#737373] mb-6">Manually set your current location, or configure the PAJ GPS share URL in .env for automatic tracking.</p>
            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-[#404040] mb-1.5">Latitude *</label><input type="number" step="any" value={locationForm.latitude} onChange={e => setLocationForm(p => ({ ...p, latitude: e.target.value }))} placeholder="48.8566" className={inputCls} required /></div>
                <div><label className="block text-sm font-medium text-[#404040] mb-1.5">Longitude *</label><input type="number" step="any" value={locationForm.longitude} onChange={e => setLocationForm(p => ({ ...p, longitude: e.target.value }))} placeholder="2.3522" className={inputCls} required /></div>
                <div><label className="block text-sm font-medium text-[#404040] mb-1.5">Altitude (m)</label><input type="number" step="any" value={locationForm.altitude} onChange={e => setLocationForm(p => ({ ...p, altitude: e.target.value }))} placeholder="35" className={inputCls} /></div>
              </div>
              <button type="submit" disabled={locationSaving} className="py-2.5 px-6 rounded-xl bg-[#171717] text-white font-medium text-sm hover:bg-[#404040] disabled:opacity-50 transition-colors cursor-pointer">{locationSaving ? 'Saving…' : 'Update Live Location'}</button>
            </form>
            <div className="mt-6 p-4 bg-[#fafaf9] rounded-xl border border-[#e5e5e5]">
              <p className="text-xs font-medium text-[#404040] mb-1">PAJ GPS Auto-tracking</p>
              <p className="text-xs text-[#737373]">Set <code className="bg-[#f0f0f0] px-1 rounded">PAJ_GPS_SHARE_URL</code> in .env to enable automatic GPS updates every 45 seconds.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Location Picker Modal ── */}
      {pickerTarget !== null && (
        <LocationPicker
          initialLat={pickerTarget === 'entry' && entryForm.latitude ? parseFloat(entryForm.latitude) : undefined}
          initialLng={pickerTarget === 'entry' && entryForm.longitude ? parseFloat(entryForm.longitude) : undefined}
          onClose={() => setPickerTarget(null)}
          onConfirm={(lat, lng) => {
            if (pickerTarget === 'entry') {
              setEntryForm(p => ({ ...p, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))
            } else {
              setBulkGroups(prev => prev.map((g, i) => i === pickerTarget ? { ...g, latitude: lat.toFixed(6), longitude: lng.toFixed(6) } : g))
            }
            setPickerTarget(null)
          }}
        />
      )}
    </main>
  )
}
