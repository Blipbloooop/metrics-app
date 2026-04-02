import { getActiveReservations } from '@/lib/dashboard-data'
import ReservationCard from '@/components/ui/ReservationCard'
import Header from '@/components/layout/Header'
import ReservationForm from './ReservationForm'

export const revalidate = 30

export default async function ReservationsPage() {
  const reservations = await getActiveReservations()

  return (
    <div className="flex flex-col h-full">
      <Header title="Réservations" />
      <div className="p-6 space-y-8">

        <section>
          <h2 className="text-gray-300 font-semibold mb-4">
            Réservations actives
            <span className="ml-2 text-xs font-normal text-gray-500">({reservations.length})</span>
          </h2>
          {reservations.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune réservation active.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {reservations.map(r => (
                <ReservationCard key={r.id} reservation={r} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-gray-300 font-semibold mb-4">Réservation manuelle</h2>
          <ReservationForm />
        </section>

      </div>
    </div>
  )
}
