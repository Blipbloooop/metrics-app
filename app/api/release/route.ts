import { NextRequest, NextResponse } from 'next/server'
import { ReleaseRequestSchema } from '@/lib/validators/release'
import { deleteReservationResources, scaleDeployment } from '@/app/services/kubernetes-reserve'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ReleaseRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { reservation_id, namespace, deployment_name } = parsed.data

  // 1. Vérifier que la réservation existe et est active
  const reservation = await prisma.reservation.findUnique({ where: { id: reservation_id } })
  if (!reservation) {
    return NextResponse.json({ error: `Reservation '${reservation_id}' not found` }, { status: 404 })
  }
  if (reservation.status !== 'active') {
    return NextResponse.json(
      { error: `Reservation is not active (status: ${reservation.status})` },
      { status: 409 },
    )
  }

  // 2. Scale down le Deployment à 1 replica
  const scaled = await scaleDeployment(namespace, deployment_name, 1)

  // 3. Supprimer ResourceQuota + LimitRange créés lors de la réservation
  const { quotas_deleted, limits_deleted } = await deleteReservationResources(namespace, deployment_name)

  // 4. Mettre à jour la réservation en DB
  const released = await prisma.reservation.update({
    where: { id: reservation_id },
    data: {
      status: 'released',
      released_at: new Date(),
    },
  })

  return NextResponse.json({
    reservation_id: released.id,
    node_id: released.node_id,
    status: 'released',
    released_at: released.released_at?.toISOString(),
    details: {
      deployment_scaled_down: scaled,
      quotas_deleted,
      limits_deleted,
    },
  })
}
