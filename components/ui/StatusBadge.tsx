interface StatusBadgeProps {
  level: 'low' | 'medium' | 'high' | 'active' | 'released' | 'pending' | 'failed'
  label?: string
}

const COLOR_MAP: Record<StatusBadgeProps['level'], string> = {
  low:      'bg-green-500 text-white',
  active:   'bg-green-500 text-white',
  medium:   'bg-yellow-500 text-gray-900',
  pending:  'bg-yellow-500 text-gray-900',
  high:     'bg-red-500 text-white',
  failed:   'bg-red-500 text-white',
  released: 'bg-gray-500 text-white',
}

export default function StatusBadge({ level, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLOR_MAP[level]}`}>
      {label ?? level}
    </span>
  )
}
