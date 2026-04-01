import * as k8s from '@kubernetes/client-node'

const kc = new k8s.KubeConfig()
kc.loadFromDefault()

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api)

interface ReservationSpec {
  namespace: string
  deployment_name: string
  replica_count: number
  cpu_per_replica: number
  ram_per_replica: number
}

export async function createResourceQuota(spec: ReservationSpec): Promise<boolean> {
  try {
    const quota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: `quota-${spec.deployment_name}-${Date.now()}`,
        namespace: spec.namespace,
        labels: {
          app: 'metrics-app',
          managed_by: 'reserve-endpoint',
        },
      },
      spec: {
        hard: {
          requests: {
            cpu: `${spec.cpu_per_replica * spec.replica_count}`,
            memory: `${spec.ram_per_replica * spec.replica_count}Gi`,
          },
          limits: {
            cpu: `${spec.cpu_per_replica * spec.replica_count * 1.5}`,
            memory: `${spec.ram_per_replica * spec.replica_count * 1.5}Gi`,
          },
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
 await k8sApi.createNamespacedResourceQuota(spec.namespace, quota as any)
    console.log(`[reserve] ResourceQuota created for ${spec.deployment_name}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[reserve] Failed to create ResourceQuota: ${message}`)
    return false
  }
}

export async function createLimitRange(spec: ReservationSpec): Promise<boolean> {
  try {
    const limitRange = {
      apiVersion: 'v1',
      kind: 'LimitRange',
      metadata: {
        name: `limits-${spec.deployment_name}-${Date.now()}`,
        namespace: spec.namespace,
        labels: {
          app: 'metrics-app',
          managed_by: 'reserve-endpoint',
        },
      },
      spec: {
        limits: [
          {
            type: 'Pod',
            max: {
              cpu: `${spec.cpu_per_replica}`,
              memory: `${spec.ram_per_replica}Gi`,
            },
            min: {
              cpu: '100m',
              memory: '64Mi',
            },
            default: {
              cpu: `${spec.cpu_per_replica}`,
              memory: `${spec.ram_per_replica}Gi`,
            },
            defaultRequest: {
              cpu: `${spec.cpu_per_replica * 0.5}`,
              memory: `${spec.ram_per_replica * 0.5}Gi`,
            },
          },
        ],
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
 await k8sApi.createNamespacedLimitRange(spec.namespace, limitRange as any)
    console.log(`[reserve] LimitRange created for ${spec.deployment_name}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[reserve] Failed to create LimitRange: ${message}`)
    return false
  }
}

export async function scaleDeployment(
  namespace: string,
  deploymentName: string,
  replicas: number,
): Promise<boolean> {
  try {
    const deployment = await k8sAppsApi.readNamespacedDeployment(deploymentName, namespace)
    if (!deployment.spec) {
      console.error(`[reserve] Deployment ${deploymentName} has no spec`)
      return false
    }

    deployment.spec.replicas = replicas
    await k8sAppsApi.patchNamespacedDeployment(deploymentName, namespace, deployment)
    console.log(`[reserve] Deployment ${deploymentName} scaled to ${replicas} replicas`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[reserve] Failed to scale deployment: ${message}`)
    return false
  }
}

export async function deleteReservationResources(
  namespace: string,
  deploymentName: string,
): Promise<{ quotas_deleted: number; limits_deleted: number }> {
  let quotas_deleted = 0
  let limits_deleted = 0

  try {
    const quotas = await k8sApi.listNamespacedResourceQuota(namespace)
    for (const q of quotas.items) {
      if (q.metadata?.labels?.['managed_by'] === 'reserve-endpoint' &&
          q.metadata?.name?.startsWith(`quota-${deploymentName}-`)) {
        await k8sApi.deleteNamespacedResourceQuota(q.metadata.name, namespace)
        quotas_deleted++
      }
    }
  } catch (err) {
    console.error(`[release] Failed to delete ResourceQuotas: ${err instanceof Error ? err.message : err}`)
  }

  try {
    const limits = await k8sApi.listNamespacedLimitRange(namespace)
    for (const l of limits.items) {
      if (l.metadata?.labels?.['managed_by'] === 'reserve-endpoint' &&
          l.metadata?.name?.startsWith(`limits-${deploymentName}-`)) {
        await k8sApi.deleteNamespacedLimitRange(l.metadata.name, namespace)
        limits_deleted++
      }
    }
  } catch (err) {
    console.error(`[release] Failed to delete LimitRanges: ${err instanceof Error ? err.message : err}`)
  }

  return { quotas_deleted, limits_deleted }
}

export async function checkNodeCapacity(
  node_id: string,
  cpu_needed: number,
  ram_needed: number,
): Promise<{ available: boolean; reason?: string }> {
  try {
    const node = await k8sApi.readNode(node_id)
    const allocatable = node.status?.allocatable || {}
    
    const cpuString = String(allocatable['cpu'] || '0')
    const ramString = String(allocatable['memory'] || '0')
    
    // Parse CPU (format: "4" ou "4000m")
    const cpuValue = cpuString.endsWith('m')
      ? parseInt(cpuString) / 1000
      : parseInt(cpuString)
    
    // Parse RAM (format: "16Gi" ou "16000Mi")
    const ramValue = ramString.endsWith('Gi')
      ? parseInt(ramString)
      : ramString.endsWith('Mi')
        ? parseInt(ramString) / 1024
        : parseInt(ramString) // assume bytes
    
    if (cpuValue < cpu_needed) {
      return {
        available: false,
        reason: `Insufficient CPU: need ${cpu_needed}, available ${cpuValue}`,
      }
    }
    
    if (ramValue < ram_needed) {
      return {
        available: false,
        reason: `Insufficient RAM: need ${ram_needed}Gi, available ${ramValue}Gi`,
      }
    }
    
    return { available: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      available: false,
      reason: `Failed to check node capacity: ${message}`,
    }
  }
}
