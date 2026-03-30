/**
 * Tests unitaires du service kubernetes-reserve.
 *
 * Challenge de mock : @kubernetes/client-node initialise les clients K8s au niveau
 * du module (code exécuté à l'import). On doit donc mocker le module AVANT l'import
 * du service, et exposer les fonctions mock via un objet partagé (_mockApi).
 *
 * Approche choisie :
 * - On crée un objet mockApi avec toutes les méthodes K8s dans la factory jest.mock
 * - makeApiClient retourne toujours ce même objet (k8sApi et k8sAppsApi pointent dessus)
 * - On expose _mockApi dans le retour du mock pour y accéder dans les tests
 */

// Le mock doit être déclaré AVANT les imports pour que jest le hisse correctement
jest.mock('@kubernetes/client-node', () => {
  // Un seul objet partagé — k8sApi et k8sAppsApi pointeront tous les deux dessus
  const mockApi = {
    readNode: jest.fn(),
    createNamespacedResourceQuota: jest.fn(),
    createNamespacedLimitRange: jest.fn(),
    readNamespacedDeployment: jest.fn(),
    patchNamespacedDeployment: jest.fn(),
  }

  return {
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromDefault: jest.fn(),
      // makeApiClient retourne toujours le même objet mock
      makeApiClient: jest.fn().mockReturnValue(mockApi),
    })),
    CoreV1Api: jest.fn(),
    AppsV1Api: jest.fn(),
    // Exposé pour que les tests puissent configurer les retours
    _mockApi: mockApi,
  }
})

import {
  checkNodeCapacity,
  createResourceQuota,
  createLimitRange,
  scaleDeployment,
} from '@/app/services/kubernetes-reserve'

// Récupérer le _mockApi exposé par la factory
const { _mockApi: mockApi } = jest.requireMock('@kubernetes/client-node') as {
  _mockApi: {
    readNode: jest.Mock
    createNamespacedResourceQuota: jest.Mock
    createNamespacedLimitRange: jest.Mock
    readNamespacedDeployment: jest.Mock
    patchNamespacedDeployment: jest.Mock
  }
}

// Reset les implémentations de chaque mock avant chaque test
beforeEach(() => {
  mockApi.readNode.mockReset()
  mockApi.createNamespacedResourceQuota.mockReset()
  mockApi.createNamespacedLimitRange.mockReset()
  mockApi.readNamespacedDeployment.mockReset()
  mockApi.patchNamespacedDeployment.mockReset()
})

// ─── checkNodeCapacity ───────────────────────────────────────────────────────

describe('checkNodeCapacity', () => {

  describe('Parsing CPU', () => {
    it('parse le format entier "4" (4 cores) — ressources suffisantes', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '4', memory: '16Gi' } },
      })
      const result = await checkNodeCapacity('k8s-worker-1', 2, 8)
      expect(result.available).toBe(true)
    })

    it('parse le format millicores "4000m" (= 4 cores)', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '4000m', memory: '32Gi' } },
      })
      // On demande exactement 4 cores → doit passer
      const result = await checkNodeCapacity('k8s-worker-1', 4, 16)
      expect(result.available).toBe(true)
    })

    it('parse le format millicores "2000m" (= 2 cores) — insuffisant si on demande 3', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '2000m', memory: '32Gi' } },
      })
      const result = await checkNodeCapacity('k8s-worker-1', 3, 4)
      expect(result.available).toBe(false)
      expect(result.reason).toContain('CPU')
      expect(result.reason).toContain('2')   // valeur disponible
      expect(result.reason).toContain('3')   // valeur demandée
    })

    it('retourne available: false avec raison si CPU insuffisant (format entier)', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '2', memory: '16Gi' } },
      })
      const result = await checkNodeCapacity('k8s-worker-1', 4, 8)
      expect(result.available).toBe(false)
      expect(result.reason).toContain('CPU')
    })
  })

  describe('Parsing RAM', () => {
    it('parse le format "16Gi" — ressources suffisantes', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '8', memory: '16Gi' } },
      })
      const result = await checkNodeCapacity('k8s-worker-1', 1, 16)
      expect(result.available).toBe(true)
    })

    it('parse le format "16384Mi" (= 16 Gi)', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '8', memory: '16384Mi' } },
      })
      // 16384 Mi / 1024 = 16 Gi — on demande 16 → doit passer
      const result = await checkNodeCapacity('k8s-worker-1', 1, 16)
      expect(result.available).toBe(true)
    })

    it('retourne available: false avec raison si RAM insuffisante (format Gi)', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '8', memory: '8Gi' } },
      })
      const result = await checkNodeCapacity('k8s-worker-1', 1, 16)
      expect(result.available).toBe(false)
      expect(result.reason).toContain('RAM')
      expect(result.reason).toContain('16') // valeur demandée
    })

    it('retourne available: false si RAM insuffisante (format Mi)', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '8', memory: '4096Mi' } }, // = 4Gi
      })
      const result = await checkNodeCapacity('k8s-worker-1', 1, 8)
      expect(result.available).toBe(false)
      expect(result.reason).toContain('RAM')
    })
  })

  describe('Cas limites et erreurs', () => {
    it('retourne available: true si CPU et RAM sont exactement à la limite demandée', async () => {
      mockApi.readNode.mockResolvedValue({
        status: { allocatable: { cpu: '4', memory: '8Gi' } },
      })
      // Demande exactement 4 cpu et 8 ram — borderline doit passer
      const result = await checkNodeCapacity('k8s-worker-1', 4, 8)
      expect(result.available).toBe(true)
    })

    it('retourne available: false si le node n\'a aucune info allocatable', async () => {
      mockApi.readNode.mockResolvedValue({ status: {} })
      // allocatable absent → cpu="0" et memory="0" → insufficient
      const result = await checkNodeCapacity('k8s-worker-1', 1, 1)
      expect(result.available).toBe(false)
    })

    it('retourne available: false si l\'API K8s lève une exception', async () => {
      mockApi.readNode.mockRejectedValue(new Error('Node not found in cluster'))
      const result = await checkNodeCapacity('k8s-worker-1', 1, 1)
      expect(result.available).toBe(false)
      expect(result.reason).toContain('Failed to check node capacity')
    })

    it('inclut le message d\'erreur K8s dans reason', async () => {
      mockApi.readNode.mockRejectedValue(new Error('Unauthorized'))
      const result = await checkNodeCapacity('k8s-master', 1, 1)
      expect(result.reason).toContain('Unauthorized')
    })
  })
})

// ─── createResourceQuota ─────────────────────────────────────────────────────

describe('createResourceQuota', () => {
  const spec = {
    namespace: 'test-ns',
    deployment_name: 'my-app',
    replica_count: 2,
    cpu_per_replica: 1,
    ram_per_replica: 2,
  }

  it('retourne true si l\'API K8s crée la ResourceQuota avec succès', async () => {
    mockApi.createNamespacedResourceQuota.mockResolvedValue({})
    const result = await createResourceQuota(spec)
    expect(result).toBe(true)
  })

  it('appelle createNamespacedResourceQuota dans le bon namespace', async () => {
    mockApi.createNamespacedResourceQuota.mockResolvedValue({})
    await createResourceQuota(spec)
    expect(mockApi.createNamespacedResourceQuota).toHaveBeenCalledWith(
      'test-ns',
      expect.objectContaining({
        kind: 'ResourceQuota',
        metadata: expect.objectContaining({ namespace: 'test-ns' }),
      }),
    )
  })

  it('retourne false sans throw si l\'API K8s rejette la création', async () => {
    mockApi.createNamespacedResourceQuota.mockRejectedValue(new Error('Forbidden'))
    // Ne doit pas propager l'exception
    const result = await createResourceQuota(spec)
    expect(result).toBe(false)
  })
})

// ─── createLimitRange ────────────────────────────────────────────────────────

describe('createLimitRange', () => {
  const spec = {
    namespace: 'test-ns',
    deployment_name: 'my-app',
    replica_count: 1,
    cpu_per_replica: 0.5,
    ram_per_replica: 1,
  }

  it('retourne true si l\'API K8s crée le LimitRange avec succès', async () => {
    mockApi.createNamespacedLimitRange.mockResolvedValue({})
    const result = await createLimitRange(spec)
    expect(result).toBe(true)
  })

  it('appelle createNamespacedLimitRange dans le bon namespace', async () => {
    mockApi.createNamespacedLimitRange.mockResolvedValue({})
    await createLimitRange(spec)
    expect(mockApi.createNamespacedLimitRange).toHaveBeenCalledWith(
      'test-ns',
      expect.objectContaining({ kind: 'LimitRange' }),
    )
  })

  it('retourne false sans throw si l\'API K8s échoue', async () => {
    mockApi.createNamespacedLimitRange.mockRejectedValue(new Error('Already exists'))
    const result = await createLimitRange(spec)
    expect(result).toBe(false)
  })
})

// ─── scaleDeployment ─────────────────────────────────────────────────────────

describe('scaleDeployment', () => {
  it('retourne true après lecture + patch du Deployment', async () => {
    mockApi.readNamespacedDeployment.mockResolvedValue({
      spec: { replicas: 1 },
    })
    mockApi.patchNamespacedDeployment.mockResolvedValue({})

    const result = await scaleDeployment('test-ns', 'my-app', 3)
    expect(result).toBe(true)
  })

  it('appelle patch avec le bon namespace, deployment et nombre de replicas', async () => {
    mockApi.readNamespacedDeployment.mockResolvedValue({
      spec: { replicas: 1 },
    })
    mockApi.patchNamespacedDeployment.mockResolvedValue({})

    await scaleDeployment('test-ns', 'my-app', 5)
    expect(mockApi.patchNamespacedDeployment).toHaveBeenCalledWith(
      'my-app',
      'test-ns',
      expect.objectContaining({ spec: { replicas: 5 } }),
    )
  })

  it('retourne false si le Deployment n\'a pas de spec', async () => {
    // Un Deployment sans .spec est anormal — le service doit le gérer proprement
    mockApi.readNamespacedDeployment.mockResolvedValue({})
    const result = await scaleDeployment('test-ns', 'my-app', 3)
    expect(result).toBe(false)
    // Pas de patch si spec est absent
    expect(mockApi.patchNamespacedDeployment).not.toHaveBeenCalled()
  })

  it('retourne false sans throw si readNamespacedDeployment lève une exception', async () => {
    mockApi.readNamespacedDeployment.mockRejectedValue(new Error('Not found'))
    const result = await scaleDeployment('test-ns', 'my-app', 3)
    expect(result).toBe(false)
  })

  it('retourne false sans throw si patchNamespacedDeployment lève une exception', async () => {
    mockApi.readNamespacedDeployment.mockResolvedValue({ spec: { replicas: 1 } })
    mockApi.patchNamespacedDeployment.mockRejectedValue(new Error('Conflict'))
    const result = await scaleDeployment('test-ns', 'my-app', 3)
    expect(result).toBe(false)
  })
})
