import { NextResponse } from 'next/server'
import * as k8s from '@kubernetes/client-node'

const EXCLUDED = /^(kube-|monitoring$|ai-module$)/

export async function GET() {
  try {
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const api = kc.makeApiClient(k8s.CoreV1Api)

    const res = await api.listNamespace()
    const namespaces = res.items
      .map(ns => ns.metadata?.name ?? '')
      .filter(name => name && !EXCLUDED.test(name))
      .sort()

    return NextResponse.json({ namespaces })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[namespaces] Failed to list namespaces:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
