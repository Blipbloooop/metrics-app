import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  const alerts = await prisma.alert.findMany({
    where: { acknowledged: false },
    orderBy: { triggered_at: 'desc' },
    take: 20,
  })
  return NextResponse.json(alerts)
}

export async function PATCH() {
  await prisma.alert.updateMany({
    where: { acknowledged: false },
    data: { acknowledged: true, resolved_at: new Date() },
  })
  return NextResponse.json({ ok: true })
}
