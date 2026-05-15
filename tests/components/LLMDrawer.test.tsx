import { render, screen, fireEvent } from '@testing-library/react'
import LLMDrawer from '@/components/ui/LLMDrawer'
import type { LLMStep } from '@/lib/types/dashboard'

const mockSteps: LLMStep[] = [
  {
    step: 1,
    prompt: 'Node "worker-1". CPU history: t-30min: 48%, t-25min: 51%.',
    raw: 'CPU shows an upward trend. {"cpu_percent": 71, "ram_percent": 74}',
  },
  {
    step: 2,
    prompt: 'Node "worker-1". CPU history: t-25min: 51%, t-20min: 55%.',
    raw: '{"cpu_percent": 73, "ram_percent": 75}',
  },
]

describe('LLMDrawer', () => {
  it('affiche le nodeId dans le titre', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={() => {}} />)
    expect(screen.getByText(/k8s-worker-1/)).toBeInTheDocument()
  })

  it('affiche un bloc Prompt et Réponse par step', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={() => {}} />)
    expect(screen.getAllByText(/Prompt →/)).toHaveLength(2)
    expect(screen.getAllByText(/Réponse brute ←/)).toHaveLength(2)
  })

  it('affiche le contenu du prompt et de la réponse brute', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={() => {}} />)
    expect(screen.getByText(/CPU shows an upward trend/)).toBeInTheDocument()
  })

  it('appelle onClose au clic sur le bouton fermer', () => {
    const onClose = jest.fn()
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Fermer le drawer'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('affiche un message si steps est vide', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={[]} onClose={() => {}} />)
    expect(screen.getByText(/Aucune donnée disponible/)).toBeInTheDocument()
  })
})
