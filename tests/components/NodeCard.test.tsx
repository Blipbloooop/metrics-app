import { render, screen } from '@testing-library/react'
import NodeCard from '@/components/ui/NodeCard'
import type { NodeCurrentMetrics } from '@/lib/types/dashboard'

const mockNode: NodeCurrentMetrics = {
  nodeId: 'k8s-worker-1',
  cpu: 45.5,
  ram: 62.3,
  disk: 30.0,
  lastCollectedAt: new Date().toISOString(),
  isOnline: true,
  history: [],
}

describe('NodeCard', () => {
  it('affiche le nom du nœud', () => {
    render(<NodeCard metrics={mockNode} />)
    expect(screen.getByText('k8s-worker-1')).toBeTruthy()
  })

  it('affiche les valeurs CPU et RAM', () => {
    render(<NodeCard metrics={mockNode} />)
    expect(screen.getByText(/45\.5/)).toBeTruthy()
    expect(screen.getByText(/62\.3/)).toBeTruthy()
  })

  it('affiche "Hors ligne" si isOnline est false', () => {
    render(<NodeCard metrics={{ ...mockNode, isOnline: false }} />)
    expect(screen.getByText('Hors ligne')).toBeTruthy()
  })

  it('affiche "En ligne" si isOnline est true', () => {
    render(<NodeCard metrics={mockNode} />)
    expect(screen.getByText('En ligne')).toBeTruthy()
  })
})
