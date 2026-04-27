import { NextRequest, NextResponse } from 'next/server'
import { ReserveRequestSchema } from '@/lib/validators/reserve'
import {
  createResourceQuota,
  createLimitRange,
  scaleDeployment,
  checkNodeCapacity,
} from '@/app/services/kubernetes-reserve'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // 1. Parse + validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ReserveRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 }
    )
  }

  const input = parsed.data

  // 2. Vérifier que le node existe en DB
  const node = await prisma.node.findUnique({ where: { id: input.node_id } })
  if (!node) {
    return NextResponse.json({ error: `Node '${input.node_id}' not found` }, { status: 404 })
  }

  // 3. Vérifier la capacité des ressources du node
  const totalCpuNeeded = input.cpu_per_replica * input.replica_count
  const totalRamNeeded = input.ram_per_replica * input.replica_count

  const capacityCheck = await checkNodeCapacity(input.node_id, totalCpuNeeded, totalRamNeeded)

  // Capacité insuffisante → mise en file d'attente (PRV-43)
  if (!capacityCheck.available) {
    const queued = await prisma.reservation.create({
      data: {
        node_id: input.node_id,
        triggered_by: 'manual',
        status: 'queued',
        cpu_reserved: totalCpuNeeded,
        ram_reserved_gb: totalRamNeeded,
        namespace: input.namespace,
        deployment_name: input.deployment_name,
        expires_at: new Date(Date.now() + input.duration_minutes * 60 * 1000),
        notes: input.reason ?? null,
      },
    })
    return NextResponse.json(
      {
        reservation_id: queued.id,
        status: 'queued',
        message: 'Capacité insuffisante — réservation mise en file d\'attente',
        detail: capacityCheck.reason,
      },
      { status: 202 }
    )
  }

  // 4. Créer la réservation en DB (status: pending)
  let reservation
  try {
    reservation = await prisma.reservation.create({
      data: {
        node_id: input.node_id,
        triggered_by: 'manual',
        status: 'pending',
        cpu_reserved: totalCpuNeeded,
        ram_reserved_gb: totalRamNeeded,
        namespace: input.namespace,
        deployment_name: input.deployment_name,
        expires_at: new Date(Date.now() + input.duration_minutes * 60 * 1000),
        notes: input.reason,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[reserve] Failed to create reservation in DB:', message)
    return NextResponse.json(
      { error: 'Failed to create reservation', detail: message },
      { status: 500 }
    )
  }

  // 5. Appliquer les changements K8s
  let resourceQuotaCreated = false
  let limitRangeCreated = false
  let deploymentScaled = false

  try {
    // Créer ResourceQuota
    resourceQuotaCreated = await createResourceQuota({
      namespace: input.namespace,
      deployment_name: input.deployment_name,
      replica_count: input.replica_count,
      cpu_per_replica: input.cpu_per_replica,
      ram_per_replica: input.ram_per_replica,
    })

    // Créer LimitRange
    limitRangeCreated = await createLimitRange({
      namespace: input.namespace,
      deployment_name: input.deployment_name,
      replica_count: input.replica_count,
      cpu_per_replica: input.cpu_per_replica,
      ram_per_replica: input.ram_per_replica,
    })

    // Scaler le Deployment
    deploymentScaled = await scaleDeployment(
      input.namespace,
      input.deployment_name,
      input.replica_count,
    )

    // Tous les changements ont réussi → status: active
    if (resourceQuotaCreated && limitRangeCreated && deploymentScaled) {
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'active' },
      })
    } else {
      // Au moins un changement a échoué → status: failed
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'failed' },
      })

      return NextResponse.json(
        {
          error: 'Partial failure in resource reservation',
          reservation_id: reservation.id,
          details: {
            resource_quota_created: resourceQuotaCreated,
            limit_range_created: limitRangeCreated,
            deployment_scaled: deploymentScaled,
          },
        },
        { status: 207 } // Multi-status
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[reserve] Unexpected error during K8s operations:', message)
    
    // Marquer la réservation comme failed
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'failed' },
    })

    return NextResponse.json(
      { error: 'Kubernetes operation failed', detail: message },
      { status: 502 }
    )
  }

  // 6. Retourner la réponse de succès
  return NextResponse.json(
    {
      reservation_id: reservation.id,
      node_id: input.node_id,
      namespace: input.namespace,
      deployment_name: input.deployment_name,
      status: 'active',
      cpu_reserved: totalCpuNeeded,
      ram_reserved_gb: totalRamNeeded,
      details: {
        resource_quota_created: resourceQuotaCreated,
        limit_range_created: limitRangeCreated,
        deployment_scaled: deploymentScaled,
        expires_at: reservation.expires_at?.toISOString(),
        replica_count: input.replica_count,
      },
    },
    { status: 201 }
  )
}
