'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

interface MediaItem {
  id: string
  url: string
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

export default function MediaModal({ media, initialIndex = 0, onClose }: MediaModalProps) {
  const [index, setIndex] = useState(initialIndex)
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

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) dx < 0 ? next() : prev()
    touchStartX.current = null
  }

  const current = media[index]
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
        ) : (
          <div className="relative max-w-full max-h-[85vh] flex items-center justify-center">
            <Image
              src={current.url}
              alt={current.filename}
              width={current.width ?? 1200}
              height={current.height ?? 800}
              className="max-w-full max-h-[85vh] object-contain rounded-xl"
              priority
            />
          </div>
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
