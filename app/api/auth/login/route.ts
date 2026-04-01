import { NextRequest, NextResponse } from 'next/server'
import { signJWT } from '@/lib/auth'

// POST /api/auth/login
// Body: { username: string, password: string }
// Sets httpOnly cookie "session" with JWT (24h)
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { username, password } = body as { username?: string; password?: string }

  const adminUser = process.env.ADMIN_USERNAME
  const adminPass = process.env.ADMIN_PASSWORD

  if (!adminUser || !adminPass) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (username !== adminUser || password !== adminPass) {
    return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 })
  }

  const token = await signJWT({ sub: username, role: 'admin' }, 86400)

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  })
  return res
}
