import { render, screen } from '@testing-library/react'
import StatusBadge from '@/components/ui/StatusBadge'

describe('StatusBadge', () => {
  it('affiche "low" en vert', () => {
    render(<StatusBadge level="low" />)
    const badge = screen.getByText('low')
    expect(badge).toHaveClass('bg-green-500')
  })

  it('affiche "medium" en orange', () => {
    render(<StatusBadge level="medium" />)
    const badge = screen.getByText('medium')
    expect(badge).toHaveClass('bg-yellow-500')
  })

  it('affiche "high" en rouge', () => {
    render(<StatusBadge level="high" />)
    const badge = screen.getByText('high')
    expect(badge).toHaveClass('bg-red-500')
  })

  it('accepte un label personnalisé', () => {
    render(<StatusBadge level="high" label="Critique" />)
    expect(screen.getByText('Critique')).toBeTruthy()
  })
})
