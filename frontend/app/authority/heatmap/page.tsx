"use client"
import dynamic from "next/dynamic"

const TrafficMap = dynamic(() => import("@/components/maps/TrafficMap"), {
  ssr: false, loading: () => <div className="h-[480px] bg-gray-100 rounded-xl animate-pulse" />,
})

export default function AuthorityHeatmap() {
  return (
    <div className="p-6">
      <h1 className="text-base font-medium text-gov-900">Incident heatmap</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-5">Live incidents and historical hotspots</p>
      <TrafficMap height={520} />
    </div>
  )
}
