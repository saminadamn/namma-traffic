"use client"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { getHotspots, getWeather, type Hotspot, type Weather } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const TrafficMap = dynamic(() => import("@/components/maps/TrafficMap"), {
  ssr: false, loading: () => <div className="h-[480px] bg-gray-100 rounded-xl animate-pulse" />,
})

export default function HeatmapPage() {
  const { t } = useLanguage()
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [weather, setWeather]   = useState<Weather | null>(null)
  useEffect(() => {
    getHotspots().then(setHotspots).catch(() => {})
    getWeather().then(setWeather).catch(() => {})
  }, [])

  return (
    <div>
      <h1 className="text-xl font-medium text-gov-900">{t("hmap_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t("hmap_desc")}</p>

      {weather?.monsoon_alert && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex gap-2">
          <span>⚠️</span><span>IMD alert: {weather.max_rain_24h_mm}mm rain forecast in 24h. Waterlogging risk at low-lying junctions.</span>
        </div>
      )}

      <TrafficMap />

      <div className="grid grid-cols-4 gap-3 mt-4">
        {hotspots.slice(0, 4).map(h => (
          <div key={h.junction} className="gov-card p-4">
            <p className="text-xs font-medium text-gov-900 truncate">{h.junction}</p>
            <p className="text-xl font-medium text-red-600 mt-1">{h.count}</p>
            <p className="text-[11px] text-gray-400">{h.dominant_cause.replace(/_/g, " ")} {t("hmap_incidents")}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
