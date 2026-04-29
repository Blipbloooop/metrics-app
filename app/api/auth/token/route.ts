import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { signJWT } from '@/lib/auth'

function safeCompare(a: string, b: string): boolean {
  const bA = Buffer.from(a)
  const bB = Buffer.from(b)
  if (bA.length !== bB.length) return false
  return timingSafeEqual(bA, bB)
}

// POST /api/auth/token — génère un JWT admin
// Input: { username, password }
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { username, password } = body as { username?: string; password?: string }

  const adminUser = process.env.ADMIN_USERNAME
  const adminPass = process.env.ADMIN_PASSWORD

  if (!adminUser || !adminPass) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (!safeCompare(username ?? '', adminUser) || !safeCompare(password ?? '', adminPass)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signJWT({ sub: username!, role: 'admin' }, 86400) // 24h

  return NextResponse.json({ token, expires_in: 86400 })
}
