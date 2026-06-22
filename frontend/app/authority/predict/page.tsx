"use client"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  predictEvent, simulateEvent, whatIf,
  type EventInput, type PredictionOutput,
  type SimulateEventRequest, type SimulateEventResponse, type WhatIfResponse,
} from "@/lib/api"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

// ── Shared constants ─────────────────────────────────────────────────────────
const CORRIDORS  = ["Hosur Road","Bellary Road","ORR North","Outer Ring Road","Mysore Road","Tumkur Road","MG Road","Old Airport Road"]
const ZONES      = ["Central Zone 1","Central Zone 2","North Zone 1","North Zone 2","South Zone 1","South Zone 2","West Zone 1","East Zone 1"]
const STATIONS   = ["Upparpet","Shivajinagar","Malleshwaram","Indiranagar","Koramangala","Jayanagar","Yeshwanthpura","Hebbal","Sadashivanagar","Madiwala"]
const WEATHER    = [{ v: "clear", l: "Clear" },{ v: "light_rain", l: "Light rain" },{ v: "rain", l: "Rain" },{ v: "heavy_rain", l: "Heavy rain" }]
const CAUSES     = ["vehicle_breakdown","accident","procession","vip_movement","protest","construction","water_logging","tree_fall","debris","public_event","congestion","pot_holes","road_conditions","others"]
const VEH_GROUPS = [
  { label: "N/A", value: "" },{ label: "Car", value: "private_car" },{ label: "Auto", value: "auto" },
  { label: "Taxi", value: "taxi" },{ label: "Truck", value: "truck" },{ label: "Heavy", value: "heavy_vehicle" },
  { label: "LCV", value: "lcv" },{ label: "BMTC", value: "bmtc_bus" },{ label: "KSRTC", value: "ksrtc_bus" },
  { label: "Pvt bus", value: "private_bus" },
]
const SIM_EVENT_TYPES: { value: SimulateEventRequest["event_type"]; label: string }[] = [
  { value: "political_rally", label: "Political Rally" },{ value: "concert", label: "Concert" },
  { value: "cricket_match", label: "Cricket Match" },{ value: "road_closure", label: "Road Closure" },
]

interface GeoSuggestion { display_name: string; lat: string; lon: string }
async function geocodeAddress(q: string): Promise<GeoSuggestion[]> {
  if (q.trim().length < 3) return []
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Bengaluru")}&format=json&limit=4&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    )
    return res.json()
  } catch { return [] }
}

// ── Design tokens ────────────────────────────────────────────────────────────
const RISK_TX   = { Low: "text-emerald-700", Moderate: "text-amber-700", High: "text-orange-700", Critical: "text-red-700" } as const
const SOLID_BG  = { Low: "bg-emerald-600", Moderate: "bg-amber-500", High: "bg-orange-600", Critical: "bg-red-600" } as const
const TRACK_BG  = { Low: "bg-emerald-100", Moderate: "bg-amber-100", High: "bg-orange-100", Critical: "bg-red-100" } as const
const FILL_BAR  = { Low: "bg-emerald-500", Moderate: "bg-amber-500", High: "bg-orange-500", Critical: "bg-red-500" } as const

type Tab = "predict" | "simulate" | "whatif"

// ── Predict form state ───────────────────────────────────────────────────────
interface PredictForm {
  incident_type: "planned" | "unplanned"; event_cause: string
  latitude: number; longitude: number; address: string
  date: string; time: string; veh_type: string; authenticated_reporter: boolean
  corridor: string; zone: string; police_station: string; weather: string; description: string
}
const DEFAULT_PREDICT: PredictForm = {
  incident_type: "unplanned", event_cause: "vehicle_breakdown",
  latitude: 12.9716, longitude: 77.5946, address: "",
  date: new Date().toISOString().slice(0, 10), time: "17:30",
  veh_type: "", authenticated_reporter: true,
  corridor: "Bellary Road", zone: "Central Zone 1", police_station: "Sadashivanagar", weather: "clear",
  description: "",
}

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 py-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
)
function ProbBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Predict tab ──────────────────────────────────────────────────────────────
function PredictTab() {
  const [form, setForm]       = useState<PredictForm>(DEFAULT_PREDICT)
  const [result, setResult]   = useState<PredictionOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
  const [geoOpen, setGeoOpen]   = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [mapKey, setMapKey]     = useState(0)
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = <K extends keyof PredictForm>(k: K, v: PredictForm[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleAddressInput = (val: string) => {
    set("address", val)
    if (geoTimer.current) clearTimeout(geoTimer.current)
    if (val.trim().length < 3) { setSuggestions([]); setGeoOpen(false); return }
    geoTimer.current = setTimeout(async () => {
      setGeoLoading(true)
      const results = await geocodeAddress(val)
      setSuggestions(results); setGeoOpen(results.length > 0); setGeoLoading(false)
    }, 450)
  }
  const pickSuggestion = (s: GeoSuggestion) => {
    const short = s.display_name.split(", ").slice(0, 2).join(", ")
    setForm(f => ({ ...f, address: short, latitude: parseFloat(s.lat), longitude: parseFloat(s.lon) }))
    setSuggestions([]); setGeoOpen(false); setMapKey(k => k + 1)
  }
  const submit = async () => {
    setLoading(true); setError(""); setResult(null)
    try {
      const eventInput: EventInput = {
        event_type: form.event_cause, latitude: form.latitude, longitude: form.longitude,
        address: form.address, corridor: form.corridor, police_station: form.police_station,
        zone: form.zone, date: form.date, time: form.time, weather: form.weather,
        description: form.description, incident_type: form.incident_type,
        veh_type: form.veh_type || undefined, authenticated_reporter: form.authenticated_reporter,
      }
      setResult(await predictEvent(eventInput))
    } catch { setError("API unavailable — is the backend running?") }
    finally { setLoading(false) }
  }

  const riskKey    = result?.risk_band as keyof typeof RISK_TX | undefined
  const closurePct = result ? Math.round((result.closure_probability ?? 0) * 100) : 0
  const priorityPct= result ? Math.round((result.priority_probability ?? 0) * 100) : 0

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 gov-card p-4 sm:p-5 space-y-4">
        <div className="space-y-3">
          <Divider label="Incident" />
          <div>
            <label className="gov-label">Classification</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["unplanned","planned"] as const).map(t => (
                <button key={t} type="button" onClick={() => set("incident_type", t)}
                  className={`flex-1 text-sm py-2.5 transition-colors font-medium ${form.incident_type === t ? "bg-gov-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="gov-label">Event cause</label>
            <select className="gov-input" value={form.event_cause} onChange={e => set("event_cause", e.target.value)}>
              {CAUSES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <Divider label="Location & Time" />
          <LocationPicker key={mapKey} lat={String(form.latitude)} lon={String(form.longitude)}
            onPick={(lat, lon, addr) => {
              setForm(f => ({ ...f, latitude: parseFloat(lat), longitude: parseFloat(lon), address: addr || f.address }))
              setSuggestions([]); setGeoOpen(false)
            }} />
          <div>
            <label className="gov-label">Address</label>
            <div className="relative">
              <input className="gov-input pr-8" placeholder="Type address to geocode, or click map above"
                value={form.address} onChange={e => handleAddressInput(e.target.value)}
                onFocus={() => { if (suggestions.length) setGeoOpen(true) }}
                onBlur={() => setTimeout(() => setGeoOpen(false), 150)} />
              {geoLoading && <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <span className="w-3.5 h-3.5 border-2 border-gov-400 border-t-transparent rounded-full animate-spin inline-block" />
              </span>}
              {geoOpen && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  {suggestions.map((s, i) => {
                    const parts = s.display_name.split(", ")
                    return (
                      <button key={i} type="button" onMouseDown={() => pickSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gov-50 border-b border-gray-50 last:border-0 transition-colors">
                        <p className="text-xs font-medium text-gray-800 truncate">{parts[0]}</p>
                        <p className="text-[11px] text-gray-400 truncate">{parts.slice(1,3).join(", ")}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="gov-label">Date</label><input className="gov-input" type="date" value={form.date} onChange={e => set("date", e.target.value)} /></div>
            <div><label className="gov-label">Time</label><input className="gov-input" type="time" value={form.time} onChange={e => set("time", e.target.value)} /></div>
          </div>
        </div>

        <div className="space-y-3">
          <Divider label="Vehicle & Reporter" />
          <div>
            <label className="gov-label">Vehicle type</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {VEH_GROUPS.map(({ label, value }) => (
                <button key={value} type="button" onClick={() => set("veh_type", value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.veh_type === value ? "bg-gov-500 border-gov-500 text-white font-medium" : "border-gray-200 text-gray-600 hover:border-gov-500 hover:text-gov-500 bg-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs font-medium text-gray-700">Authenticated reporter</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Verified authority or registered citizen account</p>
            </div>
            <button type="button" onClick={() => set("authenticated_reporter", !form.authenticated_reporter)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ${form.authenticated_reporter ? "bg-gov-500" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${form.authenticated_reporter ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <Divider label="Operational details" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="gov-label">Corridor</label><select className="gov-input" value={form.corridor} onChange={e => set("corridor", e.target.value)}>{CORRIDORS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="gov-label">Zone</label><select className="gov-input" value={form.zone} onChange={e => set("zone", e.target.value)}>{ZONES.map(z => <option key={z}>{z}</option>)}</select></div>
            <div><label className="gov-label">Police station</label><select className="gov-input" value={form.police_station} onChange={e => set("police_station", e.target.value)}>{STATIONS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className="gov-label">Weather</label><select className="gov-input" value={form.weather} onChange={e => set("weather", e.target.value)}>{WEATHER.map(w => <option key={w.v} value={w.v}>{w.l}</option>)}</select></div>
          </div>
        </div>

        <div>
          <label className="gov-label">Description <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea className="gov-input h-16 resize-none" placeholder='e.g. "BMTC bus breakdown blocking lane near flyover"'
            value={form.description} onChange={e => set("description", e.target.value)} />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={submit} disabled={loading} className="gov-btn w-full py-2.5 flex items-center justify-center gap-2">
          {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</> : "Run prediction"}
        </button>
      </div>

      <div className="space-y-3">
        {!result && !loading && (
          <div className="gov-card p-8 text-center border-dashed">
            <div className="w-10 h-10 rounded-full bg-gov-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-gov-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-xs font-medium text-gray-500">No prediction yet</p>
            <p className="text-[11px] text-gray-400 mt-1">Fill the form and run prediction</p>
          </div>
        )}
        {result && riskKey && (() => {
          return (
            <>
              <div className="gov-card overflow-hidden">
                <div className={`${SOLID_BG[riskKey]} px-4 pt-4 pb-3`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-white/70">Risk Score</p>
                      <p className="text-5xl font-bold text-white leading-none mt-1">{result.risk_score}</p>
                      <p className="text-xs text-white/80 mt-1">out of 100</p>
                    </div>
                    <span className="text-sm font-bold text-white bg-white/20 rounded-lg px-3 py-1.5 mt-1">{result.risk_band}</span>
                  </div>
                  <div className={`mt-3 h-1.5 rounded-full ${TRACK_BG[riskKey]} overflow-hidden`}>
                    <div className="h-full rounded-full bg-white/70 transition-all duration-700" style={{ width: `${result.risk_score}%` }} />
                  </div>
                </div>
                <div className="p-4 space-y-0 divide-y divide-gray-50">
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-xs text-gray-600 font-medium">Officers required</span>
                    <span className={`text-lg font-bold ${RISK_TX[riskKey]}`}>{result.officers_required}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-xs text-gray-500">Barricades</span>
                    <span className="text-sm font-semibold text-gray-800">{result.barricades_required}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-xs text-gray-500">Priority level</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${result.monitoring_priority === "P1" ? "bg-red-50 text-red-700" : result.monitoring_priority === "P2" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}`}>{result.monitoring_priority}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-xs text-gray-500">Closure prob.</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${closurePct > 50 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${closurePct}%` }} />
                      </div>
                      <span className={`text-xs font-semibold ${closurePct > 50 ? "text-red-600" : "text-emerald-600"}`}>{closurePct}%</span>
                    </div>
                  </div>
                </div>
                <div className={`mx-4 mb-4 rounded-lg px-3 py-2.5 flex items-center justify-between ${result.diversion_required ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"}`}>
                  <div className="flex items-center gap-2">
                    <svg className={`w-3.5 h-3.5 flex-shrink-0 ${result.diversion_required ? "text-red-500" : "text-emerald-500"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {result.diversion_required
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      }
                    </svg>
                    <span className={`text-xs font-medium ${result.diversion_required ? "text-red-700" : "text-emerald-700"}`}>Traffic diversion</span>
                  </div>
                  <span className={`text-xs font-semibold ${result.diversion_required ? "text-red-700" : "text-emerald-700"}`}>{result.diversion_required ? "Required" : "Not needed"}</span>
                </div>
              </div>
              <div className="gov-card p-4">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-3">Model Confidence</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-500">Closure probability</span>
                      <span className={`font-semibold ${closurePct > 50 ? "text-red-600" : "text-emerald-600"}`}>{closurePct}%</span>
                    </div>
                    <ProbBar pct={closurePct} color={closurePct > 50 ? "bg-red-500" : "bg-emerald-500"} />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-500">Priority confidence</span>
                      <span className="font-semibold text-gov-700">{priorityPct}%</span>
                    </div>
                    <ProbBar pct={priorityPct} color="bg-gov-500" />
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-[11px] text-gray-500">Closure verdict</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${result.closure_prediction ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{result.closure_prediction ? "Close road" : "No closure"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-500">Priority verdict</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${result.priority_prediction === "High" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{result.priority_prediction} priority</span>
                  </div>
                </div>
              </div>
              {result.reasoning.length > 0 && (
                <div className="gov-card p-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2.5">Reasoning</p>
                  <ul className="space-y-2">
                    {result.reasoning.map((r, i) => (
                      <li key={i} className="text-[11px] text-gray-700 flex gap-2.5 leading-relaxed">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${FILL_BAR[riskKey]}`} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

// ── Simulate tab ─────────────────────────────────────────────────────────────
function SimulateTab() {
  const [eventType, setEventType] = useState<SimulateEventRequest["event_type"]>("cricket_match")
  const [zone, setZone] = useState(ZONES[0])
  const [attendance, setAttendance] = useState<number | undefined>(20000)
  const [duration, setDuration] = useState<number | undefined>(3)
  const [result, setResult] = useState<SimulateEventResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const run = async () => {
    setLoading(true); setError("")
    try { setResult(await simulateEvent({ event_type: eventType, zone, expected_attendance: attendance, duration_hours: duration })) }
    catch { setError("API unavailable — is the backend running on :8000?") }
    finally { setLoading(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 gov-card p-4 sm:p-5">
        <p className="text-sm font-medium text-gov-900 mb-3">Event details</p>
        <div className="space-y-3">
          <div><label className="gov-label">Event type</label>
            <select className="gov-input" value={eventType} onChange={e => setEventType(e.target.value as SimulateEventRequest["event_type"])}>
              {SIM_EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div><label className="gov-label">Zone</label>
            <select className="gov-input" value={zone} onChange={e => setZone(e.target.value)}>
              {ZONES.map(z => <option key={z}>{z}</option>)}
            </select>
          </div>
          <div><label className="gov-label">Expected attendance</label>
            <input className="gov-input" type="number" value={attendance ?? ""} onChange={e => setAttendance(e.target.value ? parseInt(e.target.value) : undefined)} />
          </div>
          <div><label className="gov-label">Duration (hours)</label>
            <input className="gov-input" type="number" step="0.5" value={duration ?? ""} onChange={e => setDuration(e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <button onClick={run} disabled={loading} className="gov-btn w-full mt-4">
          {loading ? "Simulating…" : "Run simulation"}
        </button>
      </div>

      <div className="lg:col-span-2 space-y-3">
        {result ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Congestion increase</p><p className="text-2xl font-medium text-amber-700">+{result.expected_congestion_increase_pct}%</p></div>
              <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Projected congestion</p><p className="text-2xl font-medium text-red-700">{result.projected_congestion_pct}%</p><p className="text-[10px] text-gray-400 mt-0.5">baseline {result.baseline_congestion_pct}%</p></div>
              <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Recommended officers</p><p className="text-2xl font-medium text-gov-900">{result.recommended_officers}</p><p className="text-[10px] text-gray-400 mt-0.5">{result.recommended_barricades} barricades</p></div>
            </div>
            <div className="gov-card p-4">
              <p className="text-sm font-medium text-gov-900 mb-3">Affected zones</p>
              <div className="flex flex-wrap gap-2">
                {result.affected_zones.map((z, i) => (
                  <span key={z} className={`text-xs px-3 py-1.5 rounded-full ${i === 0 ? "bg-gov-50 text-gov-600 font-medium" : "bg-gray-100 text-gray-600"}`}>{z}{i === 0 ? " (epicenter)" : ""}</span>
                ))}
              </div>
            </div>
            <div className="gov-card p-3 bg-gray-50 border-gray-100"><p className="text-[10px] text-gray-400">{result.basis}</p></div>
          </>
        ) : (
          <div className="gov-card p-8 sm:p-10 text-center text-xs text-gray-400">Run a simulation to see projected impact</div>
        )}
      </div>
    </div>
  )
}

// ── What-If tab ──────────────────────────────────────────────────────────────
function WhatIfTab() {
  const [corridor, setCorridor] = useState(CORRIDORS[0])
  const [duration, setDuration] = useState<number | undefined>(4)
  const [result, setResult] = useState<WhatIfResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const run = async () => {
    setLoading(true); setError("")
    try { setResult(await whatIf({ corridor, closure_duration_hours: duration })) }
    catch { setError("API unavailable — is the backend running on :8000?") }
    finally { setLoading(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 gov-card p-4 sm:p-5">
        <p className="text-sm font-medium text-gov-900 mb-3">Scenario</p>
        <div className="space-y-3">
          <div><label className="gov-label">Corridor to close</label>
            <select className="gov-input" value={corridor} onChange={e => setCorridor(e.target.value)}>
              {CORRIDORS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="gov-label">Closure duration (hours)</label>
            <input className="gov-input" type="number" step="0.5" value={duration ?? ""} onChange={e => setDuration(e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <button onClick={run} disabled={loading} className="gov-btn w-full mt-4">{loading ? "Computing…" : "Run what-if"}</button>
      </div>

      <div className="lg:col-span-2 space-y-3">
        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="gov-card p-4 border border-red-100 bg-red-50"><p className="text-[11px] text-gray-500 mb-1">New congestion estimate</p><p className="text-2xl sm:text-3xl font-medium text-red-700">{result.new_congestion_estimate_pct}%</p></div>
              <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Traffic increase</p><p className="text-2xl sm:text-3xl font-medium text-amber-700">+{result.traffic_increase_pct}%</p></div>
            </div>
            <div className="gov-card p-4">
              <p className="text-sm font-medium text-gov-900 mb-3">Alternative routes</p>
              {result.alternative_routes.length === 0 ? (
                <p className="text-xs text-gray-400">No alternative corridors mapped for this closure.</p>
              ) : (
                <div className="space-y-3">
                  {result.alternative_routes.map(r => (
                    <div key={r.corridor}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gov-900 truncate pr-2">{r.corridor}</span>
                        <span className="text-amber-700 flex-shrink-0">+{r.expected_load_increase_pct}% load</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded">
                        <div className="h-1.5 rounded bg-amber-400" style={{ width: `${Math.min(r.expected_load_increase_pct * 2, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="gov-card p-3 bg-gray-50 border-gray-100"><p className="text-[10px] text-gray-400">{result.basis}</p></div>
          </>
        ) : (
          <div className="gov-card p-8 sm:p-10 text-center text-xs text-gray-400">Run a what-if scenario to see results</div>
        )}
      </div>
    </div>
  )
}

// ── Page shell with tab bar ───────────────────────────────────────────────────
const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "predict",  label: "Predict",       sub: "ML impact scoring" },
  { id: "simulate", label: "Simulate Event", sub: "Planned event impact" },
  { id: "whatif",   label: "What-If",        sub: "Corridor closure analysis" },
]

export default function AnalysisPage() {
  const [tab, setTab] = useState<Tab>("predict")
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get("tab")
    if (t === "simulate" || t === "whatif") setTab(t as Tab)
  }, [])

  const switchTab = (t: Tab) => {
    setTab(t)
    router.replace(t === "predict" ? "/authority/predict" : `/authority/predict?tab=${t}`, { scroll: false })
  }

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-gov-900">Analysis</h1>
        <p className="text-xs text-gray-400 mt-0.5">Predict · Simulate · What-If — all in one place</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-full sm:w-auto sm:inline-flex">
        {TABS.map(({ id, label, sub }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`flex-1 sm:flex-none text-left px-4 py-2 rounded-lg transition-all ${
              tab === id
                ? "bg-white shadow-sm text-gov-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <p className={`text-xs font-semibold ${tab === id ? "text-gov-700" : ""}`}>{label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 hidden sm:block">{sub}</p>
          </button>
        ))}
      </div>

      {tab === "predict"  && <PredictTab />}
      {tab === "simulate" && <SimulateTab />}
      {tab === "whatif"   && <WhatIfTab />}
    </div>
  )
}
