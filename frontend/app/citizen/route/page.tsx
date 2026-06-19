"use client"
import { useState } from "react"
import dynamic from "next/dynamic"
import { getRoute, type RouteResponse, type RouteIncidentInfo } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const RouteMap = dynamic(() => import("@/components/maps/RouteMap"), {
  ssr: false,
  loading: () => <div className="w-full rounded-xl border border-gray-200 bg-gray-100 animate-pulse" style={{ height: 420 }} />,
})

const PRESETS = [
  { label: "City Railway Station", lat: 12.9761, lon: 77.5993 },
  { label: "Hebbal",               lat: 13.0358, lon: 77.5970 },
  { label: "Silk Board",           lat: 12.9170, lon: 77.6229 },
  { label: "Whitefield",           lat: 12.9698, lon: 77.7499 },
  { label: "Yeshwanthpura",        lat: 13.0298, lon: 77.5525 },
  { label: "KR Circle",            lat: 12.9767, lon: 77.5713 },
]

const BAND_COLOR: Record<string, string> = {
  critical: "badge-critical",
  high:     "badge-high",
  medium:   "badge-medium",
  low:      "badge-low",
}

function fmt(seconds: number) {
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} hr`
}

function fmtKm(metres: number) {
  return `${(metres / 1000).toFixed(2)} km`
}

export default function RoutePage() {
  const { t } = useLanguage()
  const [originLat, setOriginLat] = useState("12.9761")
  const [originLon, setOriginLon] = useState("77.5993")
  const [destLat,   setDestLat]   = useState("13.0358")
  const [destLon,   setDestLon]   = useState("77.5970")

  // track which preset is active for each side (-1 = custom)
  const [originPreset, setOriginPreset] = useState(0)   // City Railway Station
  const [destPreset,   setDestPreset]   = useState(1)   // Hebbal

  const [route,   setRoute]   = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const originLatN = parseFloat(originLat) || 12.9761
  const originLonN = parseFloat(originLon) || 77.5993
  const destLatN   = parseFloat(destLat)   || 13.0358
  const destLonN   = parseFloat(destLon)   || 77.5970

  const findRoute = async () => {
    setLoading(true)
    setError(null)
    setRoute(null)
    try {
      const result = await getRoute({
        origin_lat: originLatN, origin_lon: originLonN,
        dest_lat:   destLatN,   dest_lon:   destLonN,
      })
      setRoute(result)
    } catch {
      setError("Could not calculate route — is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  const applyPreset = (which: "origin" | "dest", idx: number) => {
    const p = PRESETS[idx]
    if (which === "origin") {
      setOriginLat(String(p.lat)); setOriginLon(String(p.lon)); setOriginPreset(idx)
    } else {
      setDestLat(String(p.lat)); setDestLon(String(p.lon)); setDestPreset(idx)
    }
    setRoute(null)
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-gov-900">{t("route_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t("route_desc")}</p>

      {/* Origin / Destination inputs */}
      <div className="gov-card p-5 mb-4">
        <div className="grid grid-cols-2 gap-5">
          {/* Origin */}
          <div>
            <p className="gov-label mb-1.5">{t("route_from")}</p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <input className="gov-input text-xs" placeholder={t("route_lat")} value={originLat}
                  onChange={e => { setOriginLat(e.target.value); setOriginPreset(-1); setRoute(null) }} />
              </div>
              <div className="flex-1">
                <input className="gov-input text-xs" placeholder={t("route_lon")} value={originLon}
                  onChange={e => { setOriginLon(e.target.value); setOriginPreset(-1); setRoute(null) }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => applyPreset("origin", i)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    originPreset === i
                      ? "bg-emerald-600 text-white border-emerald-600 font-medium"
                      : "border-gray-200 text-gray-600 hover:bg-gov-50 hover:border-gov-300"
                  }`}>
                  {originPreset === i ? "A · " : ""}{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Destination */}
          <div>
            <p className="gov-label mb-1.5">{t("route_to")}</p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <input className="gov-input text-xs" placeholder={t("route_lat")} value={destLat}
                  onChange={e => { setDestLat(e.target.value); setDestPreset(-1); setRoute(null) }} />
              </div>
              <div className="flex-1">
                <input className="gov-input text-xs" placeholder={t("route_lon")} value={destLon}
                  onChange={e => { setDestLon(e.target.value); setDestPreset(-1); setRoute(null) }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => applyPreset("dest", i)}
                  className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                    destPreset === i
                      ? "bg-red-500 text-white border-red-500 font-medium"
                      : "border-gray-200 text-gray-600 hover:bg-gov-50 hover:border-gov-300"
                  }`}>
                  {destPreset === i ? "B · " : ""}{p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={findRoute} disabled={loading}
          className="gov-btn w-full mt-4 disabled:opacity-50">
          {loading ? t("route_finding") : t("route_find")}
        </button>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{t("route_error")}</div>
        )}
      </div>

      {/* Route warnings */}
      {route?.warnings && route.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex gap-2">
          <span>⚠️</span>
          <span>{route.warnings[0]}</span>
        </div>
      )}

      {/* Map */}
      <div className="mb-4">
        <RouteMap
          originLat={originLatN} originLon={originLonN}
          destLat={destLatN}     destLon={destLonN}
          route={route}
        />
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          {t("route_legend")}
        </p>
      </div>

      {/* Stats row */}
      {route && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="gov-card p-4 text-center">
              <p className="text-[11px] text-gray-500 mb-1">{t("route_travel_time")}</p>
              <p className="text-xl font-medium text-gov-900">{fmt(route.total_travel_time_s)}</p>
            </div>
            <div className="gov-card p-4 text-center">
              <p className="text-[11px] text-gray-500 mb-1">{t("route_distance")}</p>
              <p className="text-xl font-medium text-gov-900">{fmtKm(route.total_distance_m)}</p>
            </div>
            <div className="gov-card p-4 text-center">
              <p className="text-[11px] text-gray-500 mb-1">{t("route_avoided")}</p>
              <p className="text-xl font-medium text-emerald-700">{route.incidents_avoided.length}</p>
            </div>
            <div className="gov-card p-4 text-center">
              <p className="text-[11px] text-gray-500 mb-1">{t("route_on_route")}</p>
              <p className={`text-xl font-medium ${route.incidents_on_route.length > 0 ? "text-red-600" : "text-emerald-700"}`}>
                {route.incidents_on_route.length}
              </p>
            </div>
          </div>

          {/* Avoided incidents list */}
          {route.incidents_avoided.length > 0 && (
            <div className="gov-card p-4">
              <p className="text-sm font-medium text-gov-900 mb-3">
                {t("route_avoided_list")} ({route.incidents_avoided.length})
              </p>
              <div className="space-y-2">
                {route.incidents_avoided.map((inc: RouteIncidentInfo) => (
                  <div key={inc.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: inc.requires_road_closure ? "#E24B4A" : "#EF9F27" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">
                        {inc.event_cause.replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}
                        {inc.requires_road_closure ? " · Road closure" : ""}
                      </p>
                    </div>
                    <span className={BAND_COLOR[inc.severity_band] ?? "badge-low"}>
                      {inc.severity_band}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {route.incidents_avoided.length === 0 && (
            <div className="gov-card p-4 text-center">
              <p className="text-emerald-700 text-sm font-medium">✓ {t("route_no_incidents")}</p>
              <p className="text-xs text-gray-400 mt-1">{t("route_no_incidents_desc")}</p>
            </div>
          )}
        </>
      )}

      {/* How it works */}
      {!route && !loading && (
        <div className="bg-gov-50 rounded-xl p-4 mt-2">
          <p className="text-xs font-medium text-gov-700 mb-2">{t("route_how_title")}</p>
          <p className="text-[11px] text-gov-600 leading-relaxed">{t("route_how_body")}</p>
        </div>
      )}
    </div>
  )
}
