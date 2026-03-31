import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TravelTrace — Your Private Travel Journal',
  description: 'A private, self-hosted travel journal with live GPS tracking and photo maps.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#fafaf9] text-[#171717] antialiased">{children}</body>
    </html>
  )
}
