'use client'

import { useEffect, useRef, useState } from 'react'

interface S3Settings {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
}

interface BucketObject {
  key: string
  size: number
}

// Everything except the secret is remembered on this device
const STORAGE_KEY = 'freerange-bucket-export'
const CONCURRENCY = 4

type DirectoryPickerWindow = Window & {
  showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

function objectUrl(s: S3Settings, key?: string) {
  const base = `${s.endpoint.replace(/\/$/, '')}/${encodeURIComponent(s.bucket)}`
  return key ? `${base}/${key.split('/').map(encodeURIComponent).join('/')}` : base
}

export default function BucketExport() {
  const [settings, setSettings] = useState<S3Settings>({ endpoint: '', bucket: '', region: '', accessKeyId: '' })
  const [secret, setSecret] = useState('')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const [progress, setProgress] = useState({ files: 0, totalFiles: 0, bytes: 0, totalBytes: 0, skipped: 0 })
  const [supported, setSupported] = useState(true)
  const cancelRef = useRef(false)

  // Prefill from this device, else from the server's storage config
  useEffect(() => {
    setSupported('showDirectoryPicker' in window)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setSettings(JSON.parse(saved))
        return
      }
    } catch {}
    fetch('/api/admin/export')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => d && setSettings((s) => ({ ...s, endpoint: d.endpoint, bucket: d.bucket, region: d.region })))
      .catch(() => {})
  }, [])

  const update = (field: keyof S3Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((s) => ({ ...s, [field]: e.target.value.trim() }))

  const run = async () => {
    setError(null)
    setFailed([])
    setStatus(null)
    cancelRef.current = false

    let root: FileSystemDirectoryHandle
    try {
      root = await (window as unknown as DirectoryPickerWindow).showDirectoryPicker({ mode: 'readwrite' })
    } catch {
      return // picker dismissed
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {}

    setRunning(true)
    try {
      const { AwsClient } = await import('aws4fetch')
      const client = new AwsClient({
        accessKeyId: settings.accessKeyId,
        secretAccessKey: secret,
        service: 's3',
        region: settings.region || 'auto',
      })

      // 1. List every object in the bucket
      setStatus('Listing bucket…')
      const objects: BucketObject[] = []
      let token: string | null = null
      do {
        const url = new URL(objectUrl(settings))
        url.searchParams.set('list-type', '2')
        url.searchParams.set('max-keys', '1000')
        if (token) url.searchParams.set('continuation-token', token)
        const res = await client.fetch(url.toString())
        if (!res.ok) throw new Error(`Listing failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
        const xml = new DOMParser().parseFromString(await res.text(), 'application/xml')
        for (const el of Array.from(xml.getElementsByTagName('Contents'))) {
          const key = el.getElementsByTagName('Key')[0]?.textContent ?? ''
          const size = Number(el.getElementsByTagName('Size')[0]?.textContent ?? 0)
          if (key && !key.endsWith('/')) objects.push({ key, size })
        }
        const truncated = xml.getElementsByTagName('IsTruncated')[0]?.textContent === 'true'
        token = truncated ? xml.getElementsByTagName('NextContinuationToken')[0]?.textContent ?? null : null
        setStatus(`Listing bucket… ${objects.length} files found`)
      } while (token && !cancelRef.current)

      const totalBytes = objects.reduce((n, o) => n + o.size, 0)
      setProgress({ files: 0, totalFiles: objects.length, bytes: 0, totalBytes, skipped: 0 })
      setStatus('Downloading…')

      // 2. Download each object into the chosen folder, mirroring the key's path
      const dirs = new Map<string, Promise<FileSystemDirectoryHandle>>()
      const getDir = (parts: string[]): Promise<FileSystemDirectoryHandle> => {
        if (parts.length === 0) return Promise.resolve(root)
        const key = parts.join('/')
        if (!dirs.has(key)) {
          dirs.set(key, getDir(parts.slice(0, -1)).then((parent) =>
            parent.getDirectoryHandle(parts[parts.length - 1], { create: true })))
        }
        return dirs.get(key)!
      }

      const download = async (obj: BucketObject) => {
        const parts = obj.key.split('/')
        const name = parts.pop()!
        const dir = await getDir(parts)

        // Resume support: skip files already downloaded in full
        try {
          const existing = await (await dir.getFileHandle(name)).getFile()
          if (existing.size === obj.size) {
            setProgress((p) => ({ ...p, files: p.files + 1, bytes: p.bytes + obj.size, skipped: p.skipped + 1 }))
            return
          }
        } catch {}

        const res = await client.fetch(objectUrl(settings, obj.key))
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable()
        await res.body.pipeTo(writable)
        setProgress((p) => ({ ...p, files: p.files + 1, bytes: p.bytes + obj.size }))
      }

      let next = 0
      const worker = async () => {
        while (next < objects.length && !cancelRef.current) {
          const obj = objects[next++]
          try {
            await download(obj)
          } catch (err) {
            setFailed((f) => [...f, `${obj.key}: ${(err as Error).message}`])
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))

      setStatus(cancelRef.current ? 'Cancelled — run again to resume.' : 'Done.')
    } catch (err) {
      const msg = (err as Error).message
      // A network-level TypeError from fetch almost always means the bucket's CORS blocks this site
      setError(err instanceof TypeError
        ? `Request blocked (${msg}). Check the bucket's CORS policy below.`
        : msg)
      setStatus(null)
    } finally {
      setRunning(false)
    }
  }

  const corsPolicy = JSON.stringify([{
    AllowedOrigins: [typeof window !== 'undefined' ? window.location.origin : ''],
    AllowedMethods: ['GET'],
    AllowedHeaders: ['*'],
  }], null, 2)

  const cliCommand =
    `AWS_ACCESS_KEY_ID=${settings.accessKeyId || '<key-id>'} AWS_SECRET_ACCESS_KEY=<secret> ` +
    `AWS_DEFAULT_REGION=${settings.region || 'auto'} ` +
    `aws s3 sync s3://${settings.bucket || '<bucket>'} ./freerange-backup --endpoint-url ${settings.endpoint || '<endpoint>'}`

  const input = 'w-full px-3 py-2 rounded-lg border border-[#e5e5e5] text-sm text-[#171717] bg-white focus:outline-none focus:border-[#171717]'

  return (
    <div className="mt-4 pt-4 border-t">
      <h3 className="font-medium text-[#171717]">Download entire bucket</h3>
      <p className="mt-1 text-sm text-[#737373]">
        Downloads every file in the bucket straight from storage to a folder on this computer — nothing goes through the app server.
        Your secret key is only used in this browser and is never saved or sent to the server.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-sm text-[#737373] sm:col-span-2">
          S3 endpoint URL
          <input className={input} value={settings.endpoint} onChange={update('endpoint')}
            placeholder="https://<account-id>.r2.cloudflarestorage.com" />
        </label>
        <label className="text-sm text-[#737373]">
          Bucket
          <input className={input} value={settings.bucket} onChange={update('bucket')} placeholder="my-bucket" />
        </label>
        <label className="text-sm text-[#737373]">
          Region
          <input className={input} value={settings.region} onChange={update('region')} placeholder="auto (R2) or e.g. eu-central-1" />
        </label>
        <label className="text-sm text-[#737373]">
          Access key ID
          <input className={input} value={settings.accessKeyId} onChange={update('accessKeyId')} autoComplete="off" />
        </label>
        <label className="text-sm text-[#737373]">
          Secret access key
          <input className={input} type="password" value={secret} onChange={(e) => setSecret(e.target.value.trim())} autoComplete="off" />
        </label>
      </div>

      <div className="mt-3 flex gap-2 items-center flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={running || !supported || !settings.endpoint || !settings.bucket || !settings.accessKeyId || !secret}
          className="px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
        >
          {running ? 'Downloading…' : 'Choose folder & download'}
        </button>
        {running && (
          <button type="button" onClick={() => { cancelRef.current = true }}
            className="px-4 py-2 border border-[#e5e5e5] rounded text-sm">
            Cancel
          </button>
        )}
        {status && <span className="text-sm">{status}</span>}
      </div>

      {!supported && (
        <p className="mt-2 text-sm text-[#b45309]">
          This browser can&apos;t save into a folder. Use Chrome or Edge on desktop, or the command below.
        </p>
      )}

      {progress.totalFiles > 0 && (
        <p className="mt-2 text-sm">
          {progress.files} / {progress.totalFiles} files · {formatBytes(progress.bytes)} / {formatBytes(progress.totalBytes)}
          {progress.skipped > 0 && ` · ${progress.skipped} already downloaded`}
          {failed.length > 0 && ` · ${failed.length} failed`}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-[#ef4444]">{error}</p>}
      {failed.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-[#ef4444]">Failed files</summary>
          <pre className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap">{failed.join('\n')}</pre>
        </details>
      )}

      <details className="mt-3 text-sm text-[#737373]">
        <summary className="cursor-pointer">Setup: bucket CORS policy &amp; command-line alternative</summary>
        <p className="mt-2">
          The bucket must allow this site to read from it. In Cloudflare R2: bucket → Settings → CORS policy:
        </p>
        <pre className="mt-1 p-2 bg-[#f5f5f4] rounded text-xs overflow-auto">{corsPolicy}</pre>
        <p className="mt-2">
          Use a read-only API token (R2: “Object Read only”). Or skip the browser and sync with the AWS CLI:
        </p>
        <pre className="mt-1 p-2 bg-[#f5f5f4] rounded text-xs overflow-auto whitespace-pre-wrap break-all">{cliCommand}</pre>
      </details>
    </div>
  )
}
