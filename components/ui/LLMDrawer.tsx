'use client'

import type { LLMStep } from '@/lib/types/dashboard'

interface LLMDrawerProps {
  nodeId: string
  steps: LLMStep[]
  onClose: () => void
}

export default function LLMDrawer({ nodeId, steps, onClose }: LLMDrawerProps) {
  return (
    <div className="w-72 bg-gray-900 border border-gray-700 rounded-lg p-3 flex-shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          🤖 Dialogue IA — {nodeId}
        </span>
        <button
          onClick={onClose}
          aria-label="Fermer le drawer"
          className="text-gray-600 hover:text-gray-300 text-sm leading-none"
        >
          ✕
        </button>
      </div>

      {steps.length === 0 ? (
        <p className="text-xs text-gray-600">Aucune donnée disponible.</p>
      ) : (
        <div className="space-y-4 overflow-y-auto max-h-[480px]">
          {steps.map(s => (
            <div key={s.step}>
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-1 font-semibold">
                Step {s.step}/{steps.length} (+{s.step * 5}min)
              </p>

              <p className="text-xs text-gray-500 font-bold mb-1">Prompt →</p>
              <pre className="text-xs font-mono text-green-300 bg-black rounded p-2 whitespace-pre-wrap break-all border border-gray-800 leading-relaxed">
                {s.prompt}
              </pre>

              <p className="text-xs text-gray-500 font-bold mt-2 mb-1">Réponse brute ←</p>
              <pre className="text-xs font-mono text-yellow-300 bg-black rounded p-2 whitespace-pre-wrap break-all border border-gray-800 leading-relaxed">
                {s.raw || '(vide)'}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
