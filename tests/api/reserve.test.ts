/**
 * Tests unitaires du route handler POST /api/reserve.
 *
 * Stratégie de mock :
 * - Prisma est entièrement mocké (pas de vraie DB dans les tests unitaires)
 * - Le service kubernetes-reserve est entièrement mocké (pas de vrai cluster K8s)
 * - On appelle directement la fonction POST exportée, en lui passant un NextRequest forgé
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reserve/route'
import prisma from '@/lib/prisma'
import {
  createResourceQuota,
  createLimitRange,
  scaleDeployment,
  checkNodeCapacity,
} from '@/app/services/kubernetes-reserve'
import { validReserveRequest, mockNode, mockReservation } from '../fixtures/reserve.fixtures'

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock du client Prisma (default export)
// On simule uniquement les méthodes utilisées par la route
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    node: { findUnique: jest.fn() },
    reservation: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

// Mock complet du service K8s — on veut tester le handler, pas le vrai client K8s
jest.mock('@/app/services/kubernetes-reserve', () => ({
  createResourceQuota: jest.fn(),
  createLimitRange: jest.fn(),
  scaleDeployment: jest.fn(),
  checkNodeCapacity: jest.fn(),
}))

// Casts TypeScript pour accéder aux méthodes jest.Mock
const mockFindUnique = prisma.node.findUnique as jest.Mock
const mockCreate = prisma.reservation.create as jest.Mock
const mockUpdate = prisma.reservation.update as jest.Mock
const mockCheckNodeCapacity = checkNodeCapacity as jest.Mock
const mockCreateResourceQuota = createResourceQuota as jest.Mock
const mockCreateLimitRange = createLimitRange as jest.Mock
const mockScaleDeployment = scaleDeployment as jest.Mock

// ─── Helper ─────────────────────────────────────────────────────────────────

// Crée un NextRequest POST avec le body sérialisé en JSON
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reserve', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Setup ──────────────────────────────────────────────────────────────────

// Avant chaque test : reset de l'historique des appels et configuration du "chemin heureux"
// (toutes les opérations réussissent par défaut, on surcharge au cas par cas)
beforeEach(() => {
  jest.clearAllMocks()
  mockFindUnique.mockResolvedValue(mockNode)
  mockCheckNodeCapacity.mockResolvedValue({ available: true })
  mockCreate.mockResolvedValue(mockReservation)
  mockUpdate.mockResolvedValue({ ...mockReservation, status: 'active' })
  mockCreateResourceQuota.mockResolvedValue(true)
  mockCreateLimitRange.mockResolvedValue(true)
  mockScaleDeployment.mockResolvedValue(true)
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/reserve', () => {

  // ─── Validation des entrées (400 / 422) ──────────────────────────────────

  describe('Validation des entrées', () => {
    it('retourne 400 si le body n\'est pas du JSON valide', async () => {
      // On bypasse makeRequest pour envoyer du texte brut invalide
      const req = new NextRequest('http://localhost/api/reserve', {
        method: 'POST',
        body: 'ceci-nest-pas-du-json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Invalid JSON body')
    })

    it('retourne 422 si node_id n\'est pas dans l\'enum autorisé', async () => {
      const res = await POST(makeRequest({ ...validReserveRequest, node_id: 'k8s-worker-99' }))
      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.error).toBe('Validation error')
      // details doit contenir les erreurs Zod aplaties
      expect(data.details).toBeDefined()
    })

    it('retourne 422 si namespace est vide', async () => {
      const res = await POST(makeRequest({ ...validReserveRequest, namespace: '' }))
      expect(res.status).toBe(422)
    })

    it('retourne 422 si replica_count vaut 0', async () => {
      const res = await POST(makeRequest({ ...validReserveRequest, replica_count: 0 }))
      expect(res.status).toBe(422)
    })

    it('retourne 422 si cpu_per_replica est < 0.1', async () => {
      const res = await POST(makeRequest({ ...validReserveRequest, cpu_per_replica: 0.05 }))
      expect(res.status).toBe(422)
    })

    it('retourne 422 si des champs obligatoires sont absents', async () => {
      // Requête avec uniquement node_id — tous les autres champs manquent
      const res = await POST(makeRequest({ node_id: 'k8s-worker-1' }))
      expect(res.status).toBe(422)
    })

    it('ne contacte pas la DB si la validation Zod échoue', async () => {
      await POST(makeRequest({ ...validReserveRequest, replica_count: 0 }))
      expect(mockFindUnique).not.toHaveBeenCalled()
    })
  })

  // ─── Vérification du node (404) ──────────────────────────────────────────

  describe('Vérification du node', () => {
    it('retourne 404 si le node n\'existe pas en DB', async () => {
      mockFindUnique.mockResolvedValue(null)
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(404)
      const data = await res.json()
      // Le message d'erreur doit mentionner le node_id concerné
      expect(data.error).toContain('k8s-worker-1')
    })

    it('ne vérifie pas la capacité K8s si le node est inconnu', async () => {
      mockFindUnique.mockResolvedValue(null)
      await POST(makeRequest(validReserveRequest))
      expect(mockCheckNodeCapacity).not.toHaveBeenCalled()
    })
  })

  // ─── Vérification de la capacité (409) ───────────────────────────────────

  describe('Vérification de la capacité', () => {
    it('retourne 409 si la capacité CPU est insuffisante', async () => {
      mockCheckNodeCapacity.mockResolvedValue({
        available: false,
        reason: 'Insufficient CPU: need 8, available 4',
      })
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('Insufficient node capacity')
      expect(data.detail).toContain('CPU')
    })

    it('retourne 409 si la capacité RAM est insuffisante', async () => {
      mockCheckNodeCapacity.mockResolvedValue({
        available: false,
        reason: 'Insufficient RAM: need 32Gi, available 16Gi',
      })
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.detail).toContain('RAM')
    })

    it('appelle checkNodeCapacity avec le total CPU et RAM (replicas * par_replica)', async () => {
      // 2 replicas * 1 cpu/replica = 2 cpu ; 2 replicas * 2 ram/replica = 4 ram
      await POST(makeRequest(validReserveRequest))
      expect(mockCheckNodeCapacity).toHaveBeenCalledWith('k8s-worker-1', 2, 4)
    })

    it('calcule correctement le total pour 3 replicas avec 2 cpu et 4 ram chacun', async () => {
      await POST(makeRequest({
        ...validReserveRequest,
        replica_count: 3,
        cpu_per_replica: 2,
        ram_per_replica: 4,
      }))
      expect(mockCheckNodeCapacity).toHaveBeenCalledWith('k8s-worker-1', 6, 12)
    })

    it('ne crée pas de réservation DB si la capacité est insuffisante', async () => {
      mockCheckNodeCapacity.mockResolvedValue({ available: false, reason: 'CPU' })
      await POST(makeRequest(validReserveRequest))
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  // ─── Création en DB (500) ─────────────────────────────────────────────────

  describe('Création de la réservation en DB', () => {
    it('retourne 500 si prisma.reservation.create lève une exception', async () => {
      mockCreate.mockRejectedValue(new Error('Connection timeout'))
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Failed to create reservation')
    })

    it('crée la réservation avec status pending, node_id correct et triggered_by=manual', async () => {
      await POST(makeRequest(validReserveRequest))
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          node_id: 'k8s-worker-1',
          status: 'pending',
          triggered_by: 'manual',
          cpu_reserved: 2,
          ram_reserved_gb: 4,
        }),
      })
    })

    it('stocke le reason dans notes', async () => {
      await POST(makeRequest({ ...validReserveRequest, reason: 'Besoin pour la démo' }))
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ notes: 'Besoin pour la démo' }),
      })
    })

    it('calcule expires_at à partir de duration_minutes (30 min → +30min)', async () => {
      const before = Date.now()
      await POST(makeRequest({ ...validReserveRequest, duration_minutes: 30 }))
      const after = Date.now()

      const callData = mockCreate.mock.calls[0][0].data as { expires_at: Date }
      const expiresMs = callData.expires_at.getTime()
      const expectedMin = before + 30 * 60 * 1000
      const expectedMax = after + 30 * 60 * 1000

      // Tolérance de 1 seconde pour éviter des flaps liés à la vitesse d'exécution
      expect(expiresMs).toBeGreaterThanOrEqual(expectedMin - 1000)
      expect(expiresMs).toBeLessThanOrEqual(expectedMax + 1000)
    })

    it('ne démarre pas les opérations K8s si la création DB échoue', async () => {
      mockCreate.mockRejectedValue(new Error('DB error'))
      await POST(makeRequest(validReserveRequest))
      expect(mockCreateResourceQuota).not.toHaveBeenCalled()
    })
  })

  // ─── Succès complet (201) ─────────────────────────────────────────────────

  describe('Succès complet — toutes les ops K8s réussissent', () => {
    it('retourne 201 avec status active', async () => {
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.status).toBe('active')
    })

    it('retourne reservation_id, node_id, namespace, deployment_name', async () => {
      const res = await POST(makeRequest(validReserveRequest))
      const data = await res.json()
      expect(data.reservation_id).toBe('cres-test-abc123')
      expect(data.node_id).toBe('k8s-worker-1')
      expect(data.namespace).toBe('production')
      expect(data.deployment_name).toBe('my-app')
    })

    it('retourne cpu_reserved et ram_reserved_gb calculés correctement', async () => {
      const res = await POST(makeRequest(validReserveRequest))
      const data = await res.json()
      expect(data.cpu_reserved).toBe(2)    // 1 cpu * 2 replicas
      expect(data.ram_reserved_gb).toBe(4) // 2 ram * 2 replicas
    })

    it('retourne les détails des 3 opérations K8s à true', async () => {
      const res = await POST(makeRequest(validReserveRequest))
      const data = await res.json()
      expect(data.details.resource_quota_created).toBe(true)
      expect(data.details.limit_range_created).toBe(true)
      expect(data.details.deployment_scaled).toBe(true)
    })

    it('met à jour la réservation DB avec status active', async () => {
      await POST(makeRequest(validReserveRequest))
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'cres-test-abc123' },
        data: { status: 'active' },
      })
    })

    it('passe le bon namespace/deployment_name/specs à createResourceQuota', async () => {
      await POST(makeRequest(validReserveRequest))
      expect(mockCreateResourceQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: 'production',
          deployment_name: 'my-app',
          replica_count: 2,
          cpu_per_replica: 1,
          ram_per_replica: 2,
        }),
      )
    })

    it('appelle scaleDeployment avec le bon namespace, deployment_name et replica_count', async () => {
      await POST(makeRequest(validReserveRequest))
      expect(mockScaleDeployment).toHaveBeenCalledWith('production', 'my-app', 2)
    })
  })

  // ─── Succès partiel (207) ─────────────────────────────────────────────────

  describe('Succès partiel — une op K8s retourne false (207)', () => {
    it('retourne 207 et error="Partial failure" si createResourceQuota retourne false', async () => {
      mockCreateResourceQuota.mockResolvedValue(false)
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(207)
      const data = await res.json()
      expect(data.error).toBe('Partial failure in resource reservation')
      expect(data.details.resource_quota_created).toBe(false)
    })

    it('retourne 207 si createLimitRange retourne false', async () => {
      mockCreateLimitRange.mockResolvedValue(false)
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(207)
      const data = await res.json()
      expect(data.details.limit_range_created).toBe(false)
    })

    it('retourne 207 si scaleDeployment retourne false', async () => {
      mockScaleDeployment.mockResolvedValue(false)
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(207)
      const data = await res.json()
      expect(data.details.deployment_scaled).toBe(false)
    })

    it('met à jour la réservation DB avec status failed en cas de succès partiel', async () => {
      mockCreateResourceQuota.mockResolvedValue(false)
      await POST(makeRequest(validReserveRequest))
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'cres-test-abc123' },
        data: { status: 'failed' },
      })
    })

    it('inclut reservation_id dans la réponse 207 pour permettre le suivi', async () => {
      mockScaleDeployment.mockResolvedValue(false)
      const res = await POST(makeRequest(validReserveRequest))
      const data = await res.json()
      expect(data.reservation_id).toBe('cres-test-abc123')
    })
  })

  // ─── Exception K8s (502) ─────────────────────────────────────────────────

  describe('Exception K8s inattendue (502)', () => {
    it('retourne 502 si createResourceQuota lève une exception', async () => {
      mockCreateResourceQuota.mockRejectedValue(new Error('K8s API unreachable'))
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(502)
      const data = await res.json()
      expect(data.error).toBe('Kubernetes operation failed')
    })

    it('retourne 502 si scaleDeployment lève une exception', async () => {
      mockScaleDeployment.mockRejectedValue(new Error('Timeout'))
      const res = await POST(makeRequest(validReserveRequest))
      expect(res.status).toBe(502)
    })

    it('met à jour la réservation DB avec status failed après une exception K8s', async () => {
      mockCreateResourceQuota.mockRejectedValue(new Error('K8s API unreachable'))
      await POST(makeRequest(validReserveRequest))
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'cres-test-abc123' },
        data: { status: 'failed' },
      })
    })
  })
})
