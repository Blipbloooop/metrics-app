/**
 * Tests unitaires du schema Zod ReserveRequestSchema.
 * Aucun mock nécessaire ici — on teste uniquement la logique de validation.
 */
import { ReserveRequestSchema } from '@/lib/validators/reserve'

describe('ReserveRequestSchema', () => {
  // Requête de base valide utilisée comme référence dans tous les tests
  const validInput = {
    node_id: 'k8s-worker-1',
    namespace: 'production',
    deployment_name: 'my-app',
    replica_count: 2,
    cpu_per_replica: 1,
    ram_per_replica: 2,
    duration_minutes: 60,
    reason: 'Test',
  }

  // ─── Cas valides ────────────────────────────────────────────────────────────

  describe('Cas valides', () => {
    it('accepte une requête complète valide', () => {
      const result = ReserveRequestSchema.safeParse(validInput)
      expect(result.success).toBe(true)
    })

    it('accepte les 3 node_id autorisés', () => {
      const nodeIds = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']
      for (const node_id of nodeIds) {
        expect(ReserveRequestSchema.safeParse({ ...validInput, node_id }).success).toBe(true)
      }
    })

    it('utilise duration_minutes=60 par défaut si le champ est absent', () => {
      const { duration_minutes: _omit, ...withoutDuration } = validInput
      const result = ReserveRequestSchema.safeParse(withoutDuration)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.duration_minutes).toBe(60)
      }
    })

    it('accepte reason absent (champ optionnel)', () => {
      const { reason: _omit, ...withoutReason } = validInput
      expect(ReserveRequestSchema.safeParse(withoutReason).success).toBe(true)
    })

    it('accepte les valeurs limites de replica_count (1 et 100)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, replica_count: 1 }).success).toBe(true)
      expect(ReserveRequestSchema.safeParse({ ...validInput, replica_count: 100 }).success).toBe(true)
    })

    it('accepte les valeurs limites de cpu_per_replica (0.1 et 32)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, cpu_per_replica: 0.1 }).success).toBe(true)
      expect(ReserveRequestSchema.safeParse({ ...validInput, cpu_per_replica: 32 }).success).toBe(true)
    })

    it('accepte les valeurs limites de duration_minutes (5 et 1440)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, duration_minutes: 5 }).success).toBe(true)
      expect(ReserveRequestSchema.safeParse({ ...validInput, duration_minutes: 1440 }).success).toBe(true)
    })
  })

  // ─── node_id ────────────────────────────────────────────────────────────────

  describe('node_id invalide', () => {
    it('rejette un node_id absent de l\'enum', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, node_id: 'k8s-worker-99' }).success).toBe(false)
    })

    it('rejette un node_id vide', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, node_id: '' }).success).toBe(false)
    })
  })

  // ─── namespace ──────────────────────────────────────────────────────────────

  describe('namespace invalide', () => {
    it('rejette un namespace vide', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, namespace: '' }).success).toBe(false)
    })

    it('rejette un namespace > 63 caractères', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, namespace: 'a'.repeat(64) }).success).toBe(false)
    })

    it('accepte un namespace de exactement 63 caractères', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, namespace: 'a'.repeat(63) }).success).toBe(true)
    })
  })

  // ─── deployment_name ────────────────────────────────────────────────────────

  describe('deployment_name invalide', () => {
    it('rejette un deployment_name vide', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, deployment_name: '' }).success).toBe(false)
    })

    it('rejette un deployment_name > 63 caractères', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, deployment_name: 'a'.repeat(64) }).success).toBe(false)
    })
  })

  // ─── replica_count ──────────────────────────────────────────────────────────

  describe('replica_count invalide', () => {
    it('rejette 0 (min est 1)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, replica_count: 0 }).success).toBe(false)
    })

    it('rejette 101 (max est 100)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, replica_count: 101 }).success).toBe(false)
    })

    it('rejette un nombre décimal (doit être entier)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, replica_count: 1.5 }).success).toBe(false)
    })
  })

  // ─── cpu_per_replica ────────────────────────────────────────────────────────

  describe('cpu_per_replica invalide', () => {
    it('rejette une valeur < 0.1', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, cpu_per_replica: 0.05 }).success).toBe(false)
    })

    it('rejette une valeur > 32', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, cpu_per_replica: 33 }).success).toBe(false)
    })
  })

  // ─── ram_per_replica ────────────────────────────────────────────────────────

  describe('ram_per_replica invalide', () => {
    it('rejette une valeur < 0.1', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, ram_per_replica: 0.05 }).success).toBe(false)
    })

    it('rejette une valeur > 256', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, ram_per_replica: 257 }).success).toBe(false)
    })
  })

  // ─── duration_minutes ───────────────────────────────────────────────────────

  describe('duration_minutes invalide', () => {
    it('rejette une valeur < 5', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, duration_minutes: 4 }).success).toBe(false)
    })

    it('rejette une valeur > 1440', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, duration_minutes: 1441 }).success).toBe(false)
    })

    it('rejette un nombre décimal (doit être entier)', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, duration_minutes: 30.5 }).success).toBe(false)
    })
  })

  // ─── reason ─────────────────────────────────────────────────────────────────

  describe('reason invalide', () => {
    it('rejette un reason > 500 caractères', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, reason: 'a'.repeat(501) }).success).toBe(false)
    })

    it('accepte un reason de exactement 500 caractères', () => {
      expect(ReserveRequestSchema.safeParse({ ...validInput, reason: 'a'.repeat(500) }).success).toBe(true)
    })
  })
})
