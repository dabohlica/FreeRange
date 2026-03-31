import exifr from 'exifr'

export interface ExifData {
  latitude?: number
  longitude?: number
  altitude?: number
  takenAt?: Date
  width?: number
  height?: number
}

export async function extractExif(file: Buffer | File): Promise<ExifData> {
  try {
    const data = await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      pick: ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'DateTimeOriginal', 'ExifImageWidth', 'ExifImageHeight', 'ImageWidth', 'ImageHeight'],
    })

    if (!data) return {}

    return {
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      altitude: data.altitude ?? undefined,
      takenAt: data.DateTimeOriginal ? new Date(data.DateTimeOriginal) : undefined,
      width: data.ExifImageWidth ?? data.ImageWidth ?? undefined,
      height: data.ExifImageHeight ?? data.ImageHeight ?? undefined,
    }
  } catch {
    return {}
  }
}
