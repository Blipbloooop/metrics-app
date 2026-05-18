import { NextRequest, NextResponse } from 'next/server'
import * as k8s from '@kubernetes/client-node'

export async function GET(req: NextRequest) {
  const namespace = req.nextUrl.searchParams.get('namespace')
  if (!namespace) {
    return NextResponse.json({ error: 'namespace requis' }, { status: 400 })
  }

  try {
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const appsApi = kc.makeApiClient(k8s.AppsV1Api)

    const res = await appsApi.listNamespacedDeployment({ namespace })
    const deployments = res.items
      .map(d => d.metadata?.name ?? '')
      .filter(Boolean)
      .sort()

    return NextResponse.json({ deployments })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[deployments] Failed to list deployments:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
