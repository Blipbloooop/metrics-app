import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

const API_PROTECTED = ['/api/reserve', '/api/release', '/api/predict', '/api/forecast', '/api/namespaces']

async function extractJWT(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  const cookie = req.cookies.get('session')
  if (cookie?.value) return cookie.value
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rate limiting on all /api routes
  if (pathname.startsWith('/api')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    const rl = checkRateLimit(ip)

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
        }},
      )
    }
  }

  // Protect /dashboard/* — require session cookie
  if (pathname.startsWith('/dashboard')) {
    const token = req.cookies.get('session')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    try {
      await verifyJWT(token)
    } catch {
      const res = NextResponse.redirect(new URL('/login', req.url))
      res.cookies.delete('session')
      return res
    }
  }

  // Protect API routes — accept Bearer token OR session cookie
  if (API_PROTECTED.some(p => pathname.startsWith(p))) {
    const token = await extractJWT(req)
    if (!token) {
      return NextResponse.json({ error: 'Authorization manquante' }, { status: 401 })
    }
    try {
      await verifyJWT(token)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
}
