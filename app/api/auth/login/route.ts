import { NextRequest, NextResponse } from 'next/server'
import { signToken, verifyAdminPassword, verifyViewerPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 })
    }

    let role: 'admin' | 'viewer' | null = null

    if (verifyAdminPassword(password)) {
      role = 'admin'
    } else if (verifyViewerPassword(password)) {
      role = 'viewer'
    }

    if (!role) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    const token = await signToken({ role })

    const response = NextResponse.json({ success: true, role })
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
