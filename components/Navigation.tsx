'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  {
    href: '/journey',
    label: 'Journey',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
      </svg>
    ),
  },
  {
    href: '/map',
    label: 'Map',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        <line x1="9" y1="3" x2="9" y2="18"/>
        <line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
  },
  {
    href: '/timeline',
    label: 'Timeline',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
  },
  {
    href: '/media',
    label: 'Photos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
  },
  {
    href: '/live',
    label: 'Live',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    ),
  },
]

export default function Navigation({ role }: { role?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <nav
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        scrolled ? 'shadow-lg' : 'shadow-sm'
      }`}
      style={{ width: 'calc(100% - 2rem)', maxWidth: '800px' }}
    >
      <div className="glass rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
        {/* Logo */}
        <Link href="/journey" className="flex items-center gap-2 pl-1 shrink-0 cursor-pointer">
          <div className="w-7 h-7 rounded-lg bg-[#171717] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#d4af37"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
          </div>
          <span className="text-sm font-['Playfair_Display'] font-semibold text-[#171717] hidden sm:block">
            FreeRange
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href === '/journey' && pathname === '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                  active
                    ? 'bg-[#171717] text-white'
                    : 'text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f4]'
                }`}
              >
                {item.icon}
                <span className="hidden sm:block">{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 shrink-0">
          {role === 'admin' && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                pathname.startsWith('/admin')
                  ? 'bg-[#d4af37] text-[#171717]'
                  : 'text-[#737373] hover:text-[#171717] hover:bg-[#f5f5f4]'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <span className="hidden sm:block">Admin</span>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-xl text-[#a3a3a3] hover:text-[#171717] hover:bg-[#f5f5f4] transition-all duration-200 cursor-pointer"
            title="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
