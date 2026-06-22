"use client"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useState } from "react"
import { getWeather, type Hotspot, type Weather } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const TrafficMap = dynamic(() => import("@/components/maps/TrafficMap"), {
  ssr: false,
  loading: () => <div className="h-[360px] sm:h-[480px] bg-gray-100 rounded-xl animate-pulse" />,
})

export default function HeatmapPage() {
  const { t } = useLanguage()
  const [hotspots,   setHotspots]   = useState<Hotspot[]>([])
  const [weather,    setWeather]    = useState<Weather | null>(null)
  const [newFlash,   setNewFlash]   = useState(false)
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lon: number } | null>(null)

  useEffect(() => {
    getWeather().then(setWeather).catch(() => {})
  }, [])

  const handleHotspotsChange = useCallback((spots: Hotspot[]) => {
    setHotspots(spots)
    setNewFlash(true)
    setTimeout(() => setNewFlash(false), 1000)
  }, [])

  const uniqueHotspots = hotspots.filter((h, i, arr) =>
    arr.findIndex(x => x.junction === h.junction) === i
  )

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-5 py-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gov-900">{t("hmap_title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("hmap_desc")}</p>
        </div>
      </div>

      {weather?.monsoon_alert && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 flex gap-2 items-start">
          <span className="flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </span>
          <span>IMD alert: {weather.max_rain_24h_mm}mm rain forecast in 24h. Waterlogging risk at low-lying junctions.</span>
        </div>
      )}

      <div className="mb-4">
        <TrafficMap onHotspotsChange={handleHotspotsChange} focusPoint={focusPoint} />
      </div>

      {/* Live hotspot cards */}
      {uniqueHotspots.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Top congestion hotspots
            <span className="ml-2 text-gray-400 font-normal">— click to zoom map</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {uniqueHotspots.slice(0, 4).map(h => (
              <button
                key={h.junction}
                onClick={() => setFocusPoint({ lat: h.lat, lon: h.lon })}
                className={`gov-card p-3 sm:p-4 text-left transition-all duration-300 cursor-pointer hover:border-gov-300 ${
                  newFlash ? "ring-1 ring-emerald-200 bg-emerald-50/30" : ""
                } ${focusPoint?.lat === h.lat && focusPoint?.lon === h.lon
                    ? "border-gov-400 ring-1 ring-gov-300"
                    : ""
                }`}
              >
                <p className="text-xs font-medium text-gov-900 truncate">{h.junction}</p>
                <p className="text-xl font-semibold text-red-600 mt-1">{h.count}</p>
                <p className="text-[11px] text-gray-400 capitalize">{h.dominant_cause.replace(/_/g, " ")} {t("hmap_incidents")}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
