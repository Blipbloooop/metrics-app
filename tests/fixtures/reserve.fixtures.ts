import type { ReserveRequest } from '@/lib/validators/reserve'

// Requête valide complète avec tous les champs
export const validReserveRequest: ReserveRequest = {
  node_id: 'k8s-worker-1',
  namespace: 'production',
  deployment_name: 'my-app',
  replica_count: 2,
  cpu_per_replica: 1,
  ram_per_replica: 2,
  duration_minutes: 60,
  reason: 'Test de réservation',
}

// Requête minimale sans les champs optionnels
export const minimalReserveRequest: ReserveRequest = {
  node_id: 'k8s-worker-1',
  namespace: 'staging',
  deployment_name: 'my-app',
  replica_count: 1,
  cpu_per_replica: 0.5,
  ram_per_replica: 1,
  duration_minutes: 60,
}

// Mock du node tel qu'il apparaît en DB
export const mockNode = {
  id: 'k8s-worker-1',
  ip: '192.168.10.243',
  role: 'worker',
  cpu_cores: 8,
  ram_gb: 16,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
}

// Mock de la réservation créée en DB (status initial: pending)
// cpu_reserved = 1 cpu * 2 replicas = 2
// ram_reserved_gb = 2 ram * 2 replicas = 4
export const mockReservation = {
  id: 'cres-test-abc123',
  node_id: 'k8s-worker-1',
  prediction_id: null,
  triggered_by: 'manual',
  status: 'pending',
  cpu_reserved: 2,
  ram_reserved_gb: 4,
  reserved_at: new Date('2026-03-24T10:00:00Z'),
  released_at: null,
  expires_at: new Date('2026-03-24T11:00:00Z'),
  notes: 'Test de réservation',
}
