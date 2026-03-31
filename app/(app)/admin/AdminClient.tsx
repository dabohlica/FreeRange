'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { formatDate, formatFileSize } from '@/lib/utils'

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
type Tab = 'entries' | 'new-entry' | 'trips' | 'location'

// ── Client-side EXIF extraction ──────────────────────────────────────────────
async function extractExifFromFile(file: File): Promise<{ lat?: number; lng?: number; date?: Date }> {
  try {
    const exifr = (await import('exifr')).default
    const data = await exifr.parse(file, { gps: true, exif: true, pick: ['GPSLatitude', 'GPSLongitude', 'DateTimeOriginal'] })
    if (!data) return {}
    return {
      lat: data.latitude  ?? undefined,
      lng: data.longitude ?? undefined,
      date: data.DateTimeOriginal ? new Date(data.DateTimeOriginal) : undefined,
    }
  } catch { return {} }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminClient({ initialEntries, initialTrips }: { initialEntries: Entry[]; initialTrips: Trip[] }) {
  const router = useRouter()
  const [tab, setTab]       = useState<Tab>('entries')
  const [entries, setEntries] = useState(initialEntries)
  const [trips, setTrips]   = useState(initialTrips)

  const blankForm = () => ({
    title: '', description: '',
    date: new Date().toISOString().split('T')[0],
    latitude: '', longitude: '', city: '', country: '', tripId: '',
  })
  const [entryForm, setEntryForm] = useState(blankForm)
  const [exifDetected, setExifDetected] = useState(false)
  const [uploadFiles, setUploadFiles]   = useState<File[]>([])
  const [submitting, setSubmitting]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState<Entry | null>(null)

  const [locationForm, setLocationForm] = useState({ latitude: '', longitude: '', altitude: '' })
  const [locationSaving, setLocationSaving] = useState(false)
  const [tripForm, setTripForm]         = useState({ name: '', description: '', color: '#3B82F6' })
  const [tripSubmitting, setTripSubmitting] = useState(false)

  // ── Dropzone — extract EXIF from first image automatically ──
  const onDrop = useCallback(async (accepted: File[]) => {
    setUploadFiles(prev => [...prev, ...accepted])

    // Only attempt EXIF on the first new image file
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

  // ── Create entry ─────────────────────────────────────────────────────────
  async function handleCreateEntry(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
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

      const entry = await res.json()

      if (uploadFiles.length > 0) {
        setUploadProgress(`Uploading ${uploadFiles.length} file(s)…`)
        const form = new FormData()
        form.append('entryId', entry.id)
        uploadFiles.forEach(f => form.append('files', f))
        await fetch('/api/upload', { method: 'POST', body: form })
      }

      setEntryForm(blankForm())
      setUploadFiles([])
      setExifDetected(false)
      setUploadProgress(null)
      setTab('entries')
      router.refresh()

      const freshRes = await fetch('/api/entries')
      if (freshRes.ok) setEntries(await freshRes.json())
    } finally { setSubmitting(false); setUploadProgress(null) }
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry and all its media?')) return
    await fetch(`/api/entries/${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  async function handleDeleteMedia(mediaId: string, entryId: string) {
    if (!confirm('Delete this photo?')) return
    await fetch(`/api/media/${mediaId}`, { method: 'DELETE' })
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, media: e.media.filter(m => m.id !== mediaId) } : e))
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
    { id: 'entries', label: 'Entries' }, { id: 'new-entry', label: 'New Entry' },
    { id: 'trips', label: 'Trips' }, { id: 'location', label: 'Live Location' },
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
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${tab === t.id ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Entries ── */}
        {tab === 'entries' && (
          <div className="space-y-4">
            {entries.length === 0 && <div className="text-center py-16 text-[#a3a3a3]">No entries yet. Create your first entry!</div>}
            {entries.map(entry => (
              <div key={entry.id} className="bg-white rounded-2xl border border-[#e5e5e5] p-5 hover:border-[#d4d4d4] transition-colors">
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
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => { setEditEntry(entry); setTab('new-entry') }} className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f4] transition-colors cursor-pointer" title="Edit">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 rounded-lg text-[#ef4444]/60 hover:text-[#ef4444] hover:bg-[#ef4444]/5 transition-colors cursor-pointer" title="Delete">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </div>
                {entry.media.length > 0 && (
                  <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
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
            ))}
          </div>
        )}

        {/* ── New Entry ── */}
        {tab === 'new-entry' && (
          <div className="bg-white rounded-2xl border border-[#e5e5e5] p-6">
            <h2 className="text-lg font-semibold text-[#171717] mb-6">{editEntry ? 'Edit Entry' : 'New Entry'}</h2>
            <form onSubmit={handleCreateEntry} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Upload zone first — EXIF auto-fills fields below */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">
                    Photos & Videos
                    <span className="ml-2 font-normal text-[#a3a3a3]">— location & date extracted automatically from EXIF</span>
                  </label>
                  <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragActive ? 'border-[#171717] bg-[#171717]/5' : 'border-[#e5e5e5] hover:border-[#d4d4d4] hover:bg-[#fafaf9]'}`}>
                    <input {...getInputProps()} />
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <p className="text-sm text-[#737373]">{isDragActive ? 'Drop files here' : 'Drag & drop photos/videos, or click to browse'}</p>
                    <p className="text-xs text-[#a3a3a3] mt-1">JPEG, PNG, WebP, HEIC, MP4, MOV · Max 100MB each</p>
                  </div>

                  {exifDetected && (
                    <p className="mt-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5">
                      GPS & date extracted from photo EXIF
                    </p>
                  )}

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

                {/* Title — optional */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">
                    Title
                    <span className="ml-2 font-normal text-[#a3a3a3]">— auto-generated from date/location if blank</span>
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

                {/* Location — auto-filled from EXIF, editable */}
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Latitude</label>
                  <input type="number" step="any" value={entryForm.latitude} onChange={e => setEntryForm(p => ({ ...p, latitude: e.target.value }))} placeholder="Auto from EXIF" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#404040] mb-1.5">Longitude</label>
                  <input type="number" step="any" value={entryForm.longitude} onChange={e => setEntryForm(p => ({ ...p, longitude: e.target.value }))} placeholder="Auto from EXIF" className={inputCls} />
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
                <button type="button" onClick={() => { setEditEntry(null); setTab('entries') }} className="px-4 py-2.5 rounded-xl border border-[#e5e5e5] text-[#737373] hover:text-[#171717] hover:border-[#d4d4d4] font-medium text-sm transition-colors cursor-pointer">Cancel</button>
              </div>
            </form>
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
    </main>
  )
}
