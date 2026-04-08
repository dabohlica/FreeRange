'use client'

import { decode } from 'blurhash'

/**
 * Decode a blurhash string into a base64 PNG data URL suitable for
 * next/image's `blurDataURL` prop. Browser-only (uses canvas).
 */
export function blurhashToDataURL(hash: string, width = 32, height = 32): string {
  if (typeof document === 'undefined') return ''
  try {
    const pixels = decode(hash, width, height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    const imageData = ctx.createImageData(width, height)
    imageData.data.set(pixels)
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL()
  } catch {
    return ''
  }
}
