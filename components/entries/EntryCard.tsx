'use client'

import { useState } from 'react'
import Image from 'next/image'
import MediaModal from '@/components/media/MediaModal'
import { formatDate } from '@/lib/utils'

interface Media {
  id: string
  url: string
  type: string
  filename: string
  width?: number | null
  height?: number | null
  takenAt?: string | null
}

interface Trip {
  id: string
  name: string
  color: string
}

interface Entry {
  id: string
  title: string
  description?: string | null
  date: string
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  country?: string | null
  media: Media[]
  trip?: Trip | null
}

export default function EntryCard({ entry }: { entry: Entry }) {
  const [modalIndex, setModalIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  const images = entry.media.filter((m) => m.type === 'IMAGE')
  const videos = entry.media.filter((m) => m.type === 'VIDEO')
  const location = entry.city || entry.country
    ? [entry.city, entry.country].filter(Boolean).join(', ')
    : entry.latitude
    ? `${entry.latitude.toFixed(3)}°, ${entry.longitude?.toFixed(3)}°`
    : null

  return (
    <>
      <article className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden hover:border-[#d4d4d4] hover:shadow-md transition-all duration-300">
        {/* Media preview strip */}
        {images.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setModalIndex(0)}
              className="block w-full cursor-pointer"
            >
              <div className="relative aspect-[16/9] bg-[#f5f5f4] overflow-hidden">
                <Image
                  src={images[0].url}
                  alt={images[0].filename}
                  fill
                  sizes="(max-width: 768px) 100vw, 600px"
                  className="object-cover hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                {entry.media.length > 1 && (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/50 text-white text-xs font-medium backdrop-blur-sm">
                    +{entry.media.length - 1}
                  </div>
                )}
                {videos.length > 0 && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/50 text-white text-xs flex items-center gap-1 backdrop-blur-sm">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    {videos.length} video{videos.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </button>
          </div>
        )}

        <div className="p-5">
          {/* Trip badge */}
          {entry.trip && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3"
              style={{ background: `${entry.trip.color}15`, color: entry.trip.color }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: entry.trip.color }}
              />
              {entry.trip.name}
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[#171717] leading-snug truncate">
                {entry.title}
              </h3>
              <div className="flex items-center gap-3 mt-1">
                <time className="text-xs text-[#a3a3a3]">{formatDate(entry.date)}</time>
                {location && (
                  <span className="flex items-center gap-1 text-xs text-[#737373]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    {location}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {entry.description && (
            <div className="mt-3">
              <p className={`text-sm text-[#737373] leading-relaxed ${!expanded && 'line-clamp-3'}`}>
                {entry.description}
              </p>
              {entry.description.length > 120 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-[#a3a3a3] hover:text-[#171717] mt-1 transition-colors cursor-pointer"
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          {/* Multi-image strip (if more than 1) */}
          {images.length > 1 && (
            <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
              {images.slice(1, 5).map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setModalIndex(i + 1)}
                  className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-[#f5f5f4] cursor-pointer"
                >
                  <Image
                    src={img.url}
                    alt={img.filename}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                  {i === 3 && images.length > 5 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-medium">
                      +{images.length - 5}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </article>

      {modalIndex !== null && (
        <MediaModal
          media={entry.media}
          initialIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </>
  )
}
