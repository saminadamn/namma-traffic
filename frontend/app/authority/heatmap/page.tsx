"use client"
import dynamic from "next/dynamic"

const TrafficMap = dynamic(() => import("@/components/maps/TrafficMap"), {
  ssr: false, loading: () => <div className="h-[300px] sm:h-[480px] bg-gray-100 rounded-xl animate-pulse" />,
})

export default function AuthorityHeatmap() {
  return (
    <div className="p-3 sm:p-6">
      <h1 className="text-base font-medium text-gov-900">Incident heatmap</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">Live incidents and historical hotspots</p>
      {/* Responsive map height via CSS wrapper — 300px on mobile, 480px on sm+ */}
      <div className="h-[300px] sm:h-[480px] rounded-xl overflow-hidden">
        <TrafficMap height={480} />
      </div>
    </div>
  )
}
