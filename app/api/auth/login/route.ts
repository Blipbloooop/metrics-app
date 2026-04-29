import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { signJWT } from '@/lib/auth'

function safeCompare(a: string, b: string): boolean {
  const bA = Buffer.from(a)
  const bB = Buffer.from(b)
  if (bA.length !== bB.length) return false
  return timingSafeEqual(bA, bB)
}

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

  if (!safeCompare(username ?? '', adminUser) || !safeCompare(password ?? '', adminPass)) {
    return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 })
  }

  const token = await signJWT({ sub: username!, role: 'admin' }, 86400)

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === 'true',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  })
  return res
}
