import Header from '@/components/layout/Header'
import ForecastPanel from '@/components/charts/ForecastPanel'

export default function PredictionsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Charge prédite" />
      <div className="p-6">
        <p className="text-gray-400 text-sm mb-6">
          Prévisions CPU/RAM à 30 minutes par nœud — modèle qwen2:0.5b via prediction-service.
        </p>
        <ForecastPanel />
      </div>
    </div>
  )
}
