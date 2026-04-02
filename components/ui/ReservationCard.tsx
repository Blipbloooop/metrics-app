import type { ActiveReservation } from '@/lib/types/dashboard'
import StatusBadge from './StatusBadge'

interface ReservationCardProps {
  reservation: ActiveReservation
}

function formatCountdown(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now()
  if (diff <= 0) return 'Expiré'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

export default function ReservationCard({ reservation }: ReservationCardProps) {
  const { nodeId, triggeredBy, cpuReserved, ramReservedGb, reservedAt, expiresAt, notes } = reservation

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-gray-100 font-medium text-sm">{nodeId}</h3>
          <p className="text-gray-500 text-xs mt-0.5">
            Depuis {new Date(reservedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <StatusBadge level="active" label={triggeredBy === 'manual' ? 'Manuelle' : 'Automatique'} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-gray-500 text-xs">CPU réservé</p>
          <p className="text-gray-100 font-medium">{cpuReserved} cores</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-gray-500 text-xs">RAM réservée</p>
          <p className="text-gray-100 font-medium">{ramReservedGb} GB</p>
        </div>
      </div>

      {expiresAt && (
        <p className="text-xs text-gray-500 mt-3">
          Expire dans : <span className="text-yellow-400">{formatCountdown(expiresAt)}</span>
        </p>
      )}

      {notes && (
        <p className="text-xs text-gray-500 mt-2 italic">Note : {notes}</p>
      )}
    </div>
  )
}
