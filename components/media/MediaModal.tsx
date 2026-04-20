'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface MediaItem {
  id: string
  url: string
  thumbnailUrl?: string | null
  type: string
  filename: string
  width?: number | null
  height?: number | null
  takenAt?: string | null
}

interface MediaModalProps {
  media: MediaItem[]
  initialIndex?: number
  onClose: () => void
}

// Cap full-res at 2400px wide — proxy resizes + converts to WebP automatically
function fullResUrl(url: string) {
  return `${url}?w=2400`
}

export default function MediaModal({ media, initialIndex = 0, onClose }: MediaModalProps) {
  const [index, setIndex] = useState(initialIndex)
  const [isFullReady, setIsFullReady] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : media.length - 1)), [media.length])
  const next = useCallback(() => setIndex((i) => (i < media.length - 1 ? i + 1 : 0)), [media.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  const current = media[index]

  // Reset full-res state and imperatively preload adjacent images on index change.
  // Using new Image() instead of hidden <img> tags — display:none prevents fetching.
  useEffect(() => {
    if (!current || current.type !== 'IMAGE') return
    setIsFullReady(false)

    const prevItem = media[index > 0 ? index - 1 : media.length - 1]
    const nextItem = media[index < media.length - 1 ? index + 1 : 0]
    const preloads = [prevItem, nextItem]
      .filter((item): item is MediaItem => !!item && item !== current && item.type === 'IMAGE')
      .map((item) => {
        const img = new window.Image()
        img.src = fullResUrl(item.url)
        return img
      })

    return () => { preloads.forEach((img) => { img.src = '' }) }
  }, [index, current, media])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) dx < 0 ? next() : prev()
    touchStartX.current = null
  }

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-16 sm:top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Counter */}
      {media.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium">
          {index + 1} / {media.length}
        </div>
      )}

      {/* Prev button */}
      {media.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev() }}
          className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      )}

      {/* Media */}
      <div
        className="max-w-5xl max-h-[85vh] w-full h-full flex items-center justify-center sm:px-16"
        onClick={(e) => e.stopPropagation()}
      >
        {current.type === 'VIDEO' ? (
          <video
            src={current.url}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-xl"
          />
        ) : current.thumbnailUrl ? (
          // Thumbnail-first crossfade: thumbnail stays in-flow to size the container,
          // full-res overlays it absolutely and fades in when ready.
          <div className="relative max-w-full max-h-[85vh]">
            <img
              src={current.thumbnailUrl}
              alt=""
              width={current.width ?? 1200}
              height={current.height ?? 800}
              className={`block max-w-full max-h-[85vh] object-contain rounded-xl transition-opacity duration-500 ${isFullReady ? 'opacity-0' : 'opacity-100'}`}
              style={{ filter: 'blur(8px)' }}
            />
            <img
              key={current.url}
              src={fullResUrl(current.url)}
              alt={current.filename}
              className={`absolute inset-0 w-full h-full object-contain rounded-xl transition-opacity duration-500 ${isFullReady ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setIsFullReady(true)}
            />
          </div>
        ) : (
          // No thumbnail: load full-res directly
          <img
            key={current.url}
            src={fullResUrl(current.url)}
            alt={current.filename}
            width={current.width ?? 1200}
            height={current.height ?? 800}
            className="max-w-full max-h-[85vh] object-contain rounded-xl"
          />
        )}
      </div>

      {/* Next button */}
      {media.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next() }}
          className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      )}

      {/* Date caption */}
      {current.takenAt != null && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs">
          {new Date(current.takenAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  )
}
