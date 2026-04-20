'use client'

import { useState } from 'react'
import Image from 'next/image'
import MediaModal from './MediaModal'
import { blurhashToDataURL } from '@/lib/blurhash-to-data-url'

interface MediaItem {
  id: string
  url: string
  thumbnailUrl?: string | null
  webUrl?: string | null
  blurhash?: string | null
  type: string
  filename: string
  width?: number
  height?: number
  takenAt?: string
}

export default function MediaGrid({ media }: { media: MediaItem[] }) {
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  if (!media.length) return null

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {media.map((item, i) => (
          <button
            key={item.id}
            onClick={() => setModalIndex(i)}
            className="relative aspect-square rounded-xl overflow-hidden bg-[#f5f5f4] group cursor-pointer"
          >
            {item.type === 'VIDEO' ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#171717]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white" className="opacity-80">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
            ) : (
              <Image
                src={item.thumbnailUrl ?? item.url}
                alt={item.filename}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                placeholder={item.blurhash ? 'blur' : 'empty'}
                blurDataURL={item.blurhash ? blurhashToDataURL(item.blurhash) : undefined}
              />
            )}
          </button>
        ))}
      </div>

      {modalIndex !== null && (
        <MediaModal
          media={media}
          initialIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </>
  )
}
