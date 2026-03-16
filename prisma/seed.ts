import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter })

async function main() {
  const nodes = [
    { id: 'k8s-master',   ip: '192.168.10.213', role: 'master', cpu_cores: 2, ram_gb: 4 },
    { id: 'k8s-worker-1', ip: '192.168.10.243', role: 'worker', cpu_cores: 4, ram_gb: 8 },
    { id: 'k8s-worker-2', ip: '192.168.10.126', role: 'worker', cpu_cores: 4, ram_gb: 8 },
  ]

  for (const node of nodes) {
    await prisma.node.upsert({
      where:  { id: node.id },
      update: { ip: node.ip, role: node.role },
      create: node,
    })
    console.log(`[seed] Node upserted: ${node.id}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())