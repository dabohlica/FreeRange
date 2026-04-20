'use client'

import { decode } from 'blurhash'

const cache = new Map<string, string>()

export function blurhashToDataURL(hash: string, width = 32, height = 32): string {
  if (typeof document === 'undefined') return ''
  const key = `${hash}:${width}x${height}`
  if (cache.has(key)) return cache.get(key)!
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
    const url = canvas.toDataURL()
    cache.set(key, url)
    return url
  } catch {
    return ''
  }
}
