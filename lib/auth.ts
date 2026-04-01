'use strict'

// JWT HS256 natif via Web Crypto API — pas de dépendance externe

function b64urlEncode(buf: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(buf))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const buf = Buffer.from(b64, 'base64')
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export interface JWTPayload {
  sub: string
  role: string
  iat: number
  exp: number
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresInSeconds = 3600): Promise<string> {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not configured')

  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer as ArrayBuffer)
  const body = b64urlEncode(
    new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).buffer as ArrayBuffer
  )
  const signingInput = `${header}.${body}`
  const key = await getKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${b64urlEncode(sig)}`
}

export async function verifyJWT(token: string): Promise<JWTPayload> {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not configured')

  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')

  const [header, body, signature] = parts
  const signingInput = `${header}.${body}`
  const key = await getKey(secret)

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(signature),
    new TextEncoder().encode(signingInput),
  )
  if (!valid) throw new Error('Invalid JWT signature')

  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as JWTPayload
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired')

  return payload
}
