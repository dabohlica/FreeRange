'use client'

import { useState, useCallback } from 'react'
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

// A proposed group during bulk upload
interface BulkGroup {
  key: string
  files: File[]
  previews: string[]
  date: string          // YYYY-MM-DD
  latitude: string
  longitude: string
  city: string
  country: string
  title: string
  description: string
  tripId: string
}

// Per-file status from /api/upload response
interface FileUploadStatus {
  filename: string
  status: 'done' | 'skipped' | 'failed'
  error?: string
}

// Counts passed to onProgress callback during upload
interface BulkUploadProgress {
  done: number
  skipped: number
  failed: number
  uploading: number  // files currently in-flight
  total: number
}

// Return value of uploadInParallel
interface UploadSummary {
  done: number
  skipped: number
  failed: number
  failedFiles: string[]  // filenames of permanently-failed files
}

type Tab = 'entries' | 'new-entry' | 'bulk' | 'trips' | 'location'

// ── Client-side EXIF extraction ──────────────────────────────────────────────
async function extractExifFromFile(file: File): Promise<{ lat?: number; lng?: number; date?: Date }> {
  try {
    const exifr = (await import('exifr')).default
    // Do NOT use `pick` for GPS fields — omitting GPSLatitudeRef/GPSLongitudeRef
    // causes exifr to drop the sign, placing Western locations in the Mediterranean.
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

// ── Distance between two lat/lng points in km (Haversine) ───────────────────
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Auto-title from date + city/country ─────────────────────────────────────
function autoTitle(date: string, city?: string, country?: string): string {
  const d = new Date(date)
  const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  if (city && country) return `${city}, ${country}`
  if (city) return city
  return dateStr
}

// ── Group files by day + location proximity ──────────────────────────────────
async function groupFiles(files: File[]): Promise<BulkGroup[]> {
  // Extract EXIF for all files in parallel
  const metas = await Promise.all(files.map(async (f) => ({ file: f, exif: await extractExifFromFile(f) })))

  // Sort by date
  metas.sort((a, b) => {
    const da = a.exif.date?.getTime() ?? 0
    const db = b.exif.date?.getTime() ?? 0
    return da - db
  })

  const groups: Array<{ files: File[]; dates: Date[]; lats: number[]; lngs: number[] }> = []
  const LOCATION_THRESHOLD_KM = 8

  for (const { file, exif } of metas) {
    const day = exif.date ? exif.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

    // Try to find a matching group: same day + within location threshold
    let matched = false
    for (const g of groups) {
      const gDay = g.dates[0]?.toISOString().split('T')[0]
      if (gDay !== day) continue

      // If either has no GPS, group by day only
      if (exif.lat == null || exif.lng == null || g.lats.length === 0) {
        g.files.push(file)
        if (exif.date) g.dates.push(exif.date)
        if (exif.lat != null) g.lats.push(exif.lat)
        if (exif.lng != null) g.lngs.push(exif.lng)
        matched = true
        break
      }

      const avgLat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length
      const avgLng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length
      if (distanceKm(avgLat, avgLng, exif.lat, exif.lng) <= LOCATION_THRESHOLD_KM) {
        g.files.push(file)
        if (exif.date) g.dates.push(exif.date)
        g.lats.push(exif.lat)
        g.lngs.push(exif.lng)
        matched = true
        break
      }
    }

    if (!matched) {
      groups.push({
        files: [file],
        dates: exif.date ? [exif.date] : [],
        lats: exif.lat != null ? [exif.lat] : [],
        lngs: exif.lng != null ? [exif.lng] : [],
      })
    }
  }

  return groups.map((g, i) => {
    const date = g.dates[0]?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0]
    const avgLat = g.lats.length ? (g.lats.reduce((a, b) => a + b, 0) / g.lats.length).toFixed(6) : ''
    const avgLng = g.lngs.length ? (g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length).toFixed(6) : ''
    const previews = g.files.slice(0, 4).map(f => URL.createObjectURL(f))
    return {
      key: `group-${i}-${date}`,
      files: g.files,
      previews,
      date,
      latitude: avgLat,
      longitude: avgLng,
      city: '',
      country: '',
      title: autoTitle(date),
      description: '',
      tripId: '',
    }
  })
}

// ── Parallel upload with concurrency cap ─────────────────────────────────────
async function uploadInParallel(
  files: File[],
  entryId: string,
  onProgress: (progress: BulkUploadProgress) => void,
  concurrency = 4
): Promise<UploadSummary> {
  let done = 0
  let skipped = 0
  let failed = 0
  const failedFiles: string[] = []
  const total = files.length
  let inFlight = 0

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    inFlight = batch.length
    await Promise.all(batch.map(async (file) => {
      const form = new FormData()
      form.append('entryId', entryId)
      form.append('files', file)
      let fileStatus: FileUploadStatus['status'] = 'failed'
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        if (res.ok) {
          const body = await res.json() as { results: Array<{ success?: boolean; skipped?: boolean; error?: string; filename?: string }> }
          const result = body.results?.[0]
          if (result?.success) {
            fileStatus = 'done'
          } else if (result?.skipped) {
            fileStatus = 'skipped'
          } else {
            failedFiles.push(file.name)
          }
        } else {
          failedFiles.push(file.name)
        }
      } catch {
        failedFiles.push(file.name)
      }
      if (fileStatus === 'done') done++
      else if (fileStatus === 'skipped') skipped++
      else failed++
      inFlight--
      onProgress({ done, skipped, failed, uploading: inFlight, total })
    }))
  }

  return { done, skipped, failed, failedFiles }
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
  const [bulkGroups, setBulkGroups]       = useState<BulkGroup[]>([])
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkProgress, setBulkProgress]   = useState<string | null>(null)

  const [geoLocating, setGeoLocating]     = useState(false)
  // null = closed, 'entry' = single form, number = bulk group index
  const [pickerTarget, setPickerTarget]   = useState<'entry' | number | null>(null)

  // ── Bulk selection + delete ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null) // inline confirm for single
  const [bulkDeleting, setBulkDeleting]   = useState(false)

  const [locationForm, setLocationForm]   = useState({ latitude: '', longitude: '', altitude: '' })
  const [locationSaving, setLocationSaving] = useState(false)
  const [tripForm, setTripForm]           = useState({ name: '', description: '', color: '#3B82F6' })
  const [tripSubmitting, setTripSubmitting] = useState(false)

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

  // ── Bulk dropzone ────────────────────────────────────────────────────────
  const onBulkDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    setBulkAnalyzing(true)
    setBulkGroups([])
    try {
      const groups = await groupFiles(accepted)
      setBulkGroups(groups)
    } finally {
      setBulkAnalyzing(false)
    }
  }, [])

  const { getRootProps: getBulkRootProps, getInputProps: getBulkInputProps, isDragActive: isBulkDragActive } = useDropzone({
    onDrop: onBulkDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'], 'video/*': ['.mp4', '.mov', '.webm'] },
    multiple: true,
  })

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

      await uploadInParallel(uploadFiles, entry.id, ({ done, total }) =>
        setUploadProgress(`Uploading ${done}/${total} files…`)
      )

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

  // ── Edit: open form pre-filled ────────────────────────────────────────────
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
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)))
    }
  }

  async function handleDeleteMedia(mediaId: string, entryId: string) {
    const res = await fetch(`/api/media/${mediaId}`, { method: 'DELETE' })
    if (res.ok) setEntries(prev => prev.map(e => e.id === entryId ? { ...e, media: e.media.filter(m => m.id !== mediaId) } : e))
  }

  // ── Bulk create ───────────────────────────────────────────────────────────
  async function handleBulkCreate() {
    if (!bulkGroups.length) return
    setBulkSubmitting(true)
    try {
      for (let i = 0; i < bulkGroups.length; i++) {
        const g = bulkGroups[i]
        setBulkProgress(`Creating entry ${i + 1} of ${bulkGroups.length}: ${g.title}…`)

        const entryRes = await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:       g.title || undefined,
            description: g.description || null,
            date:        g.date,
            latitude:    g.latitude  || null,
            longitude:   g.longitude || null,
            city:        g.city    || null,
            country:     g.country || null,
            tripId:      g.tripId  || null,
          }),
        })
        if (!entryRes.ok) continue
        const entry = await entryRes.json()

        await uploadInParallel(g.files, entry.id, ({ done, total }) =>
          setBulkProgress(`Group ${i + 1}/${bulkGroups.length} · ${done}/${total} files: ${g.title}…`)
        )
      }

      setBulkGroups([])
      setBulkProgress(null)
      setTab('entries')
      router.refresh()
      const freshRes = await fetch('/api/entries')
      if (freshRes.ok) setEntries(await freshRes.json())
    } finally { setBulkSubmitting(false); setBulkProgress(null) }
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
            {entries.length === 0 && <div className="text-center py-16 text-[#a3a3a3]">No entries yet. Create your first entry!</div>}

            {/* Bulk action bar */}
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
                  {/* Checkbox */}
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

                {/* Upload zone */}
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

                {/* Title */}
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
            {/* Drop zone */}
            {bulkGroups.length === 0 && (
              <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
                <h2 className="text-lg font-semibold text-[#171717] mb-2">Bulk Upload</h2>
                <p className="text-sm text-[#737373] mb-5">Drop all your photos at once. They&apos;ll be grouped by day and location area automatically.</p>
                <div {...getBulkRootProps()} className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${isBulkDragActive ? 'border-[#171717] bg-[#171717]/5' : 'border-[#e5e5e5] hover:border-[#d4d4d4] hover:bg-[#fafaf9]'}`}>
                  <input {...getBulkInputProps()} />
                  {bulkAnalyzing ? (
                    <div>
                      <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-[#737373]">Analysing EXIF data and grouping…</p>
                    </div>
                  ) : (
                    <div>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <p className="text-sm text-[#737373]">{isBulkDragActive ? 'Drop photos here' : 'Drag & drop all your photos, or click to browse'}</p>
                      <p className="text-xs text-[#a3a3a3] mt-1">Groups by day + location (≤ 8 km) · EXIF required for smart grouping</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Groups review */}
            {bulkGroups.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#171717]">{bulkGroups.length} group{bulkGroups.length !== 1 ? 's' : ''} detected</p>
                    <p className="text-xs text-[#a3a3a3] mt-0.5">{bulkGroups.reduce((s, g) => s + g.files.length, 0)} photos total · Review and edit before creating</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setBulkGroups([])} className="px-4 py-2 rounded-xl border border-[#e5e5e5] text-sm text-[#737373] hover:text-[#171717] hover:border-[#d4d4d4] transition-colors cursor-pointer">Start over</button>
                    <button onClick={handleBulkCreate} disabled={bulkSubmitting} className="px-4 py-2 rounded-xl bg-[#171717] text-white text-sm font-medium hover:bg-[#404040] disabled:opacity-50 transition-colors cursor-pointer">
                      {bulkSubmitting ? bulkProgress ?? 'Creating…' : `Create ${bulkGroups.length} entr${bulkGroups.length !== 1 ? 'ies' : 'y'}`}
                    </button>
                  </div>
                </div>

                {bulkProgress && <p className="text-sm text-[#737373] bg-[#f5f5f4] rounded-xl px-4 py-2.5">{bulkProgress}</p>}

                {/* Banner: stamp all GPS-less groups with current location */}
                {bulkGroups.some(g => !g.latitude) && (
                  <div className="flex items-center justify-between gap-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3">
                    <p className="text-sm text-[#1d4ed8]">
                      {bulkGroups.filter(g => !g.latitude).length} group{bulkGroups.filter(g => !g.latitude).length !== 1 ? 's' : ''} have no GPS (phone upload strips EXIF).
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

                <div className="space-y-4">
                  {bulkGroups.map((group, gi) => (
                    <div key={group.key} className="bg-white rounded-2xl border border-[#e5e5e5] p-5">
                      {/* Preview thumbnails */}
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
                        <div className="ml-2 flex flex-col justify-center">
                          <span className="text-sm font-medium text-[#171717]">{group.files.length} photo{group.files.length !== 1 ? 's' : ''}</span>
                          <span className="text-xs text-[#a3a3a3]">{group.date}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[#404040] mb-1">Title</label>
                          <input type="text" value={group.title} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, title: e.target.value } : g))}
                            className={inputCls} placeholder="Auto-generated" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[#404040] mb-1">Description</label>
                          <textarea value={group.description} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, description: e.target.value } : g))}
                            placeholder="Optional notes…" rows={2} className={`${inputCls} resize-none`} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">City</label>
                          <input type="text" value={group.city} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, city: e.target.value, title: autoTitle(g.date, e.target.value, g.country) } : g))}
                            placeholder="Paris" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">Country</label>
                          <input type="text" value={group.country} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, country: e.target.value, title: autoTitle(g.date, g.city, e.target.value) } : g))}
                            placeholder="France" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">Trip</label>
                          <select value={group.tripId} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, tripId: e.target.value } : g))} className={inputCls}>
                            <option value="">No trip</option>
                            {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#404040] mb-1">Date</label>
                          <input type="date" value={group.date} onChange={e => setBulkGroups(prev => prev.map((g, i) => i === gi ? { ...g, date: e.target.value } : g))} className={inputCls} />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-3">
                          {group.latitude
                            ? <p className="text-xs text-[#a3a3a3]">GPS: {group.latitude}, {group.longitude}</p>
                            : <p className="text-xs text-[#f59e0b]">No GPS in EXIF</p>
                          }
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
                        </div>
                      </div>

                      <button onClick={() => setBulkGroups(prev => prev.filter((_, i) => i !== gi))}
                        className="mt-3 text-xs text-[#ef4444]/60 hover:text-[#ef4444] transition-colors cursor-pointer">
                        Remove this group
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button onClick={handleBulkCreate} disabled={bulkSubmitting} className="px-6 py-2.5 rounded-xl bg-[#171717] text-white text-sm font-medium hover:bg-[#404040] disabled:opacity-50 transition-colors cursor-pointer">
                    {bulkSubmitting ? bulkProgress ?? 'Creating…' : `Create ${bulkGroups.length} entr${bulkGroups.length !== 1 ? 'ies' : 'y'}`}
                  </button>
                </div>
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
