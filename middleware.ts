import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

// Routes protégées par JWT
const PROTECTED = ['/api/reserve', '/api/release', '/api/predict', '/api/forecast']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rate limiting sur toutes les routes /api
  if (pathname.startsWith('/api')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
    const rl = checkRateLimit(ip)

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
          },
        },
      )
    }
  }

  // JWT sur les routes sensibles
  if (PROTECTED.some(p => pathname.startsWith(p))) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header manquant' }, { status: 401 })
    }

    try {
      await verifyJWT(authHeader.slice(7))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
