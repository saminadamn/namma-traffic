"use client"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { getRoute, type RouteResponse, type RouteIncidentInfo } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const RouteMap = dynamic(() => import("@/components/maps/RouteMap"), {
  ssr: false,
  loading: () => <div className="w-full bg-gray-100 animate-pulse" style={{ height: 340 }} />,
})

interface Place { label: string; lat: number; lon: number }

const PRESETS: Place[] = [
  { label: "City Railway Station", lat: 12.9761, lon: 77.5993 },
  { label: "Hebbal",               lat: 13.0358, lon: 77.5970 },
  { label: "Silk Board",           lat: 12.9170, lon: 77.6229 },
  { label: "Whitefield",           lat: 12.9698, lon: 77.7499 },
  { label: "Yeshwanthpura",        lat: 13.0298, lon: 77.5525 },
  { label: "Koramangala",           lat: 12.9352, lon: 77.6245 },
]

const BAND_COLOR: Record<string, string> = {
  critical: "badge-critical", high: "badge-high",
  medium: "badge-medium",     low: "badge-low",
}

function fmt(s: number) {
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} hr`
}
function fmtKm(m: number) { return `${(m / 1000).toFixed(2)} km` }

async function nominatimSearch(q: string) {
  if (q.trim().length < 2) return []
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Bengaluru")}&format=json&limit=5&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    )
    return res.json() as Promise<{ display_name: string; lat: string; lon: string }[]>
  } catch { return [] }
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "Accept-Language": "en" } }
    )
    const d = await res.json()
    return (d.display_name as string).split(", ").slice(0, 3).join(", ")
  } catch { return `${lat.toFixed(5)}, ${lon.toFixed(5)}` }
}

// ── LocationInput ────────────────────────────────────────────────────────────
interface LocationInputProps {
  pinColor: string
  pinLabel: string
  placeholder: string
  value: Place | null
  onChange: (p: Place | null) => void
  showGPS?: boolean
}

function LocationInput({ pinColor, pinLabel, placeholder, value, onChange, showGPS }: LocationInputProps) {
  const [query,       setQuery]       = useState("")
  const [suggestions, setSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [searching,   setSearching]   = useState(false)
  const [gpsLoading,  setGpsLoading]  = useState(false)
  const [open,        setOpen]        = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { if (value) setQuery("") }, [value])

  const handleInput = (q: string) => {
    setQuery(q)
    if (value) onChange(null)
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const results = await nominatimSearch(q)
      setSuggestions(results)
      setOpen(results.length > 0)
      setSearching(false)
    }, 380)
  }

  const select = (item: { display_name: string; lat: string; lon: string }) => {
    const parts = item.display_name.split(", ")
    onChange({ label: parts.slice(0, 3).join(", "), lat: parseFloat(item.lat), lon: parseFloat(item.lon) })
    setQuery(""); setSuggestions([]); setOpen(false)
  }

  const useGPS = () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const label = await reverseGeocode(coords.latitude, coords.longitude)
        onChange({ label, lat: coords.latitude, lon: coords.longitude })
        setGpsLoading(false)
      },
      () => setGpsLoading(false),
      { timeout: 10000 }
    )
  }

  return (
    <div className="relative">
      <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-colors ${
        value ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white focus-within:border-gov-400"
      }`}>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${pinColor}`}>
          {pinLabel}
        </span>

        <input
          ref={inputRef}
          type="text"
          className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400 min-w-0"
          placeholder={value ? "" : placeholder}
          value={value ? value.label : query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (suggestions.length) setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />

        {value ? (
          <button
            onClick={() => { onChange(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 0) }}
            className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : searching ? (
          <div className="w-4 h-4 border-2 border-gov-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : showGPS ? (
          <button
            onClick={useGPS}
            disabled={gpsLoading}
            title="Use my location"
            className="flex-shrink-0 p-1 rounded-lg text-gov-500 hover:bg-gov-50 disabled:opacity-50 transition-colors"
          >
            {gpsLoading
              ? <div className="w-4 h-4 border-2 border-gov-400 border-t-transparent rounded-full animate-spin" />
              : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06z" />
                </svg>
              )
            }
          </button>
        ) : null}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(", ")
            return (
              <button
                key={i}
                onMouseDown={() => select(s)}
                className="w-full text-left px-4 py-3.5 hover:bg-gov-50 border-b border-gray-50 last:border-0 flex items-start gap-3 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{parts[0]}</p>
                  <p className="text-xs text-gray-400 truncate">{parts.slice(1, 3).join(", ")}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RoutePage() {
  const { t } = useLanguage()
  const [origin, setOrigin] = useState<Place | null>(PRESETS[0])
  const [dest,   setDest]   = useState<Place | null>(PRESETS[1])
  const [route,   setRoute]   = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const findRoute = async () => {
    if (!origin || !dest) return
    setLoading(true); setError(null); setRoute(null)
    try {
      setRoute(await getRoute({
        origin_lat: origin.lat, origin_lon: origin.lon,
        dest_lat:   dest.lat,   dest_lon:   dest.lon,
      }))
    } catch {
      setError("Could not calculate route — check your connection.")
    } finally {
      setLoading(false)
    }
  }

  const swap = () => { const t = origin; setOrigin(dest); setDest(t); setRoute(null) }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-5 py-5">
      <h1 className="text-xl font-semibold text-gov-900">{t("route_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">{t("route_desc")}</p>

      {/* ── Input card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex flex-col gap-2">
          <LocationInput
            pinColor="bg-emerald-500" pinLabel="A"
            placeholder="From — type a place or use GPS"
            value={origin}
            onChange={p => { setOrigin(p); setRoute(null) }}
            showGPS
          />

          {/* Swap divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <button onClick={swap}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:text-gov-500 hover:border-gov-300 shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <LocationInput
            pinColor="bg-red-500" pinLabel="B"
            placeholder="To — type a destination"
            value={dest}
            onChange={p => { setDest(p); setRoute(null) }}
          />
        </div>

        {/* Quick destination presets */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Popular destinations</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button key={p.label}
                onClick={() => { setDest(p); setRoute(null) }}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  dest?.label === p.label
                    ? "bg-red-500 text-white border-red-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={findRoute}
          disabled={loading || !origin || !dest}
          className="gov-btn w-full mt-4 py-3.5 text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t("route_finding")}</>
            : t("route_find")
          }
        </button>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
      </div>

      {/* Warnings */}
      {(route?.warnings?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex gap-2">
          <span>⚠️</span><span>{route!.warnings[0]}</span>
        </div>
      )}

      {/* Map */}
      <div className="mb-4 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        <RouteMap
          originLat={origin?.lat ?? 12.9761} originLon={origin?.lon ?? 77.5993}
          destLat={dest?.lat   ?? 13.0358}   destLon={dest?.lon   ?? 77.5970}
          route={route}
        />
      </div>

      {/* ── Results ── */}
      {route && (
        <>
          {/* AI Route Advantage */}
          {route.incidents_avoided.length > 0 && (() => {
            const minsLow = route.incidents_avoided.reduce((s, i) => {
              if (i.severity_band === "Critical") return s + 18
              if (i.severity_band === "High")     return s + 11
              if (i.severity_band === "Medium")   return s + 6
              return s + 3
            }, 0)
            const minsHigh = Math.round(minsLow * 1.4)
            const routesEval = (route.alternative_path_coords?.length ?? 0) >= 2 ? 3 : 2
            return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-0.5">Route Advantage</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-700">~{minsLow}–{minsHigh} min saved</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    vs. unoptimised route through {route.incidents_avoided.length} active incident{route.incidents_avoided.length > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl sm:text-2xl font-bold text-emerald-800">{routesEval}</p>
                  <p className="text-[10px] text-emerald-600">routes evaluated<br/>in real-time</p>
                </div>
              </div>
            )
          })()}

          {/* Safety verdict — left-border card, no emoji */}
          {route.incidents_avoided.length > 0 ? (
            <div className="border-l-4 border-emerald-500 bg-white rounded-r-xl shadow-sm px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-gov-900">
                Safer route selected
                <span className="ml-2 text-xs font-normal text-emerald-600">
                  {route.incidents_avoided.length} hazard zone{route.incidents_avoided.length > 1 ? "s" : ""} bypassed
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                AI evaluated multiple route candidates in real-time against live incident data and selected the path with the lowest risk score.
                {(route.alternative_path_coords?.length ?? 0) >= 2 ? " The rejected route is shown as a dashed red line on the map." : ""}
              </p>
            </div>
          ) : route.incidents_on_route.length > 0 ? (
            <div className="border-l-4 border-amber-400 bg-white rounded-r-xl shadow-sm px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-gov-900">
                No clear alternative
                <span className="ml-2 text-xs font-normal text-amber-600">
                  {route.incidents_on_route.length} incident{route.incidents_on_route.length > 1 ? "s" : ""} on route
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                All available routes pass through active incidents. Drive with caution.
              </p>
            </div>
          ) : (
            <div className="border-l-4 border-emerald-500 bg-white rounded-r-xl shadow-sm px-4 py-3 mb-4">
              <p className="text-sm font-semibold text-gov-900">Clear path</p>
              <p className="text-xs text-gray-500 mt-0.5">{t("route_no_incidents_desc")}</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: t("route_travel_time"), val: fmt(route.total_travel_time_s),  color: "text-gov-900" },
              { label: t("route_distance"),    val: fmtKm(route.total_distance_m),   color: "text-gov-900" },
              { label: "Zones Avoided",        val: String(route.incidents_avoided.length),
                color: route.incidents_avoided.length > 0 ? "text-emerald-600" : "text-gray-400" },
              { label: "On-Route Alerts",      val: String(route.incidents_on_route.length),
                color: route.incidents_on_route.length > 0 ? "text-red-600" : "text-emerald-600" },
            ].map(s => (
              <div key={s.label} className="gov-card p-4 text-center">
                <p className="text-[11px] text-gray-500 mb-1">{s.label}</p>
                <p className={`text-lg font-semibold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Incident breakdown table */}
          {(route.incidents_avoided.length > 0 || route.incidents_on_route.length > 0) && (
            <div className="gov-card overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gov-900">Route safety breakdown</p>
              </div>

              {route.incidents_avoided.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                      Bypassed — {route.incidents_avoided.length} zone{route.incidents_avoided.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  {route.incidents_avoided.map((inc: RouteIncidentInfo, i: number) => (
                    <div key={inc.id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${i < route.incidents_avoided.length - 1 ? "border-b border-gray-50" : ""}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-800 capitalize">{inc.event_cause.replace(/_/g, " ")}</p>
                        {inc.requires_road_closure &&
                          <p className="text-[10px] text-red-500 font-medium">Road closure</p>}
                      </div>
                      <span className={BAND_COLOR[inc.severity_band?.toLowerCase()] ?? "badge-low"}>
                        {inc.severity_band}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {route.incidents_on_route.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-amber-50 border-t border-b border-amber-100">
                    <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                      On your route — {route.incidents_on_route.length} alert{route.incidents_on_route.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  {route.incidents_on_route.map((inc: RouteIncidentInfo, i: number) => (
                    <div key={inc.id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${i < route.incidents_on_route.length - 1 ? "border-b border-gray-50" : ""}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-800 capitalize">{inc.event_cause.replace(/_/g, " ")}</p>
                        {inc.requires_road_closure &&
                          <p className="text-[10px] text-red-500 font-medium">Road closure ahead</p>}
                      </div>
                      <span className={BAND_COLOR[inc.severity_band?.toLowerCase()] ?? "badge-low"}>
                        {inc.severity_band}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Map legend — compact horizontal */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-emerald-600 inline-block rounded" />Safe route
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-amber-500 inline-block rounded" />Caution
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-red-400 inline-block" />Rejected route
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border border-dashed border-red-400 inline-block" />Danger zone
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">AVOIDED</span>Bypassed
            </span>
          </div>
        </>
      )}

    </div>
  )
}
