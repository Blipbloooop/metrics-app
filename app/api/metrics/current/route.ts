import { NextRequest, NextResponse } from 'next/server'
import { getAllCurrentMetrics } from '@/lib/dashboard-data'

const VALID_WINDOWS = [30, 60, 360] as const

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get('window')
  const window = VALID_WINDOWS.includes(Number(param) as typeof VALID_WINDOWS[number])
    ? Number(param)
    : 360

  const metrics = await getAllCurrentMetrics(window)
  return NextResponse.json(metrics)
}
