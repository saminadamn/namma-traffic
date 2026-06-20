"use client"
import { useState, useRef } from "react"
import dynamic from "next/dynamic"
import {
  predictEvent,
  type EventInput, type PredictionOutput,
} from "@/lib/api"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

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
const RISK_BORDER = { Low: "border-l-emerald-500", Moderate: "border-l-amber-500", High: "border-l-orange-500", Critical: "border-l-red-500" } as const
const RISK_TX     = { Low: "text-emerald-700", Moderate: "text-amber-700", High: "text-orange-700", Critical: "text-red-700" } as const
const RISK_BG     = { Low: "bg-emerald-50 border-emerald-200", Moderate: "bg-amber-50 border-amber-200", High: "bg-orange-50 border-orange-200", Critical: "bg-red-50 border-red-200" } as const

// ── Static data ──────────────────────────────────────────────────────────────
const CORRIDORS  = ["Hosur Road","Bellary Road","ORR North","Outer Ring Road","Mysore Road","Tumkur Road","MG Road","Old Airport Road"]
const ZONES      = ["Central Zone 1","Central Zone 2","North Zone 1","North Zone 2","South Zone 1","South Zone 2","West Zone 1","East Zone 1"]
const STATIONS   = ["Upparpet","Shivajinagar","Malleshwaram","Indiranagar","Koramangala","Jayanagar","Yeshwanthpura","Hebbal","Sadashivanagar","Madiwala"]
const WEATHER    = [{ v: "clear", l: "Clear" },{ v: "light_rain", l: "Light rain" },{ v: "rain", l: "Rain" },{ v: "heavy_rain", l: "Heavy rain" }]
const CAUSES     = ["vehicle_breakdown","accident","procession","vip_movement","protest","construction","water_logging","tree_fall","debris","public_event","congestion","pot_holes","road_conditions","others"]

const VEH_GROUPS = [
  { label: "N/A", value: "" },
  { label: "Car", value: "private_car" },
  { label: "Auto", value: "auto" },
  { label: "Taxi", value: "taxi" },
  { label: "Truck", value: "truck" },
  { label: "Heavy", value: "heavy_vehicle" },
  { label: "LCV", value: "lcv" },
  { label: "BMTC", value: "bmtc_bus" },
  { label: "KSRTC", value: "ksrtc_bus" },
  { label: "Pvt bus", value: "private_bus" },
]

// ── Types ────────────────────────────────────────────────────────────────────
interface FormState {
  incident_type: "planned" | "unplanned"
  event_cause: string
  latitude: number; longitude: number; address: string
  date: string; time: string
  veh_type: string
  authenticated_reporter: boolean
  corridor: string; zone: string; police_station: string; weather: string
  description: string
}

const DEFAULT: FormState = {
  incident_type: "unplanned",
  event_cause: "vehicle_breakdown",
  latitude: 12.9716, longitude: 77.5946, address: "",
  date: new Date().toISOString().slice(0, 10), time: "17:30",
  veh_type: "",
  authenticated_reporter: true,
  corridor: "Bellary Road", zone: "Central Zone 1", police_station: "Sadashivanagar", weather: "clear",
  description: "",
}

// ── Small helpers ────────────────────────────────────────────────────────────
const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 py-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
)

const Field = ({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) => (
  <div className={half ? "" : ""}>
    <label className="gov-label">{label}</label>
    {children}
  </div>
)

function buildStartDatetime(date: string, time: string): string {
  return `${date} ${time}:00+00`
}

// ── Bar component ────────────────────────────────────────────────────────────
function ProbBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Predict() {
  const [form, setForm]         = useState<FormState>(DEFAULT)
  const [result, setResult]     = useState<PredictionOutput | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  // geocoding state
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
  const [geoOpen, setGeoOpen]   = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [mapKey, setMapKey]     = useState(0)   // remounts LocationPicker at new coords
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleAddressInput = (val: string) => {
    set("address", val)
    if (geoTimer.current) clearTimeout(geoTimer.current)
    if (val.trim().length < 3) { setSuggestions([]); setGeoOpen(false); return }
    geoTimer.current = setTimeout(async () => {
      setGeoLoading(true)
      const results = await geocodeAddress(val)
      setSuggestions(results)
      setGeoOpen(results.length > 0)
      setGeoLoading(false)
    }, 450)
  }

  const pickSuggestion = (s: GeoSuggestion) => {
    const short = s.display_name.split(", ").slice(0, 2).join(", ")
    setForm(f => ({
      ...f,
      address: short,
      latitude: parseFloat(s.lat),
      longitude: parseFloat(s.lon),
    }))
    setSuggestions([])
    setGeoOpen(false)
    setMapKey(k => k + 1)   // remount map centred on new coords
  }

  const submit = async () => {
    setLoading(true); setError(""); setResult(null)
    try {
      const eventInput: EventInput = {
        event_type: form.event_cause,
        latitude: form.latitude, longitude: form.longitude, address: form.address,
        corridor: form.corridor, police_station: form.police_station, zone: form.zone,
        date: form.date, time: form.time, weather: form.weather, description: form.description,
        incident_type: form.incident_type,
        veh_type: form.veh_type || undefined,
        authenticated_reporter: form.authenticated_reporter,
      }
      const pred = await predictEvent(eventInput)
      setResult(pred)
    } catch {
      setError("API unavailable — is the backend running?")
    } finally { setLoading(false) }
  }

  const riskKey     = result?.risk_band as keyof typeof RISK_TX | undefined
  const closurePct  = result ? Math.round((result.closure_probability ?? 0) * 100) : 0
  const priorityPct = result ? Math.round((result.priority_probability ?? 0) * 100) : 0

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-base font-semibold text-gov-900">Event impact prediction</h1>
        <p className="text-xs text-gray-400 mt-0.5">Authority ML scoring · road closure &amp; priority assessment</p>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">

        {/* ══ FORM (2/3) ══════════════════════════════════════════════════ */}
        <div className="lg:col-span-2 gov-card p-4 sm:p-5 space-y-4">

          {/* ── 1. Incident classification ─────────────────────────────── */}
          <div className="space-y-3">
            <Divider label="Incident" />

            {/* Planned / Unplanned toggle */}
            <div>
              <label className="gov-label">Classification</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(["unplanned", "planned"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("incident_type", t)}
                    className={`flex-1 text-sm py-2.5 transition-colors font-medium ${
                      form.incident_type === t
                        ? "bg-gov-500 text-white"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Event cause */}
            <Field label="Event cause">
              <select className="gov-input" value={form.event_cause} onChange={e => set("event_cause", e.target.value)}>
                {CAUSES.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* ── 2. Location & Time ─────────────────────────────────────── */}
          <div className="space-y-3">
            <Divider label="Location & Time" />

            {/* Map picker — remounts at new coords when address is geocoded */}
            <LocationPicker
              key={mapKey}
              lat={String(form.latitude)}
              lon={String(form.longitude)}
              onPick={(lat, lon, addr) => {
                setForm(f => ({
                  ...f,
                  latitude:  parseFloat(lat),
                  longitude: parseFloat(lon),
                  address:   addr || f.address,
                }))
                setSuggestions([]); setGeoOpen(false)
              }}
            />

            {/* Address — typing triggers geocoding and updates lat/lon */}
            <Field label="Address">
              <div className="relative">
                <div className="relative">
                  <input
                    className="gov-input pr-8"
                    placeholder="Type address to geocode, or click map above"
                    value={form.address}
                    onChange={e => handleAddressInput(e.target.value)}
                    onFocus={() => { if (suggestions.length) setGeoOpen(true) }}
                    onBlur={() => setTimeout(() => setGeoOpen(false), 150)}
                  />
                  {geoLoading && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <span className="w-3.5 h-3.5 border-2 border-gov-400 border-t-transparent rounded-full animate-spin inline-block" />
                    </span>
                  )}
                </div>
                {geoOpen && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    {suggestions.map((s, i) => {
                      const parts = s.display_name.split(", ")
                      return (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => pickSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 hover:bg-gov-50 border-b border-gray-50 last:border-0 transition-colors"
                        >
                          <p className="text-xs font-medium text-gray-800 truncate">{parts[0]}</p>
                          <p className="text-[11px] text-gray-400 truncate">{parts.slice(1, 3).join(", ")}</p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Live lat/lon readout */}
              <p className="text-[11px] text-gray-400 mt-1">
                {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </p>
            </Field>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input className="gov-input" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
              </Field>
              <Field label="Time">
                <input className="gov-input" type="time" value={form.time} onChange={e => set("time", e.target.value)} />
              </Field>
            </div>
          </div>

          {/* ── 3. Vehicle & Reporter ──────────────────────────────────── */}
          <div className="space-y-3">
            <Divider label="Vehicle & Reporter" />

            {/* Vehicle type chip grid */}
            <div>
              <label className="gov-label">Vehicle type</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {VEH_GROUPS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("veh_type", value)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      form.veh_type === value
                        ? "bg-gov-500 border-gov-500 text-white font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gov-500 hover:text-gov-500 bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Authenticated reporter toggle */}
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-gray-700">Authenticated reporter</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Verified authority or registered citizen account</p>
              </div>
              <button
                type="button"
                onClick={() => set("authenticated_reporter", !form.authenticated_reporter)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ${
                  form.authenticated_reporter ? "bg-gov-500" : "bg-gray-300"
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
                  form.authenticated_reporter ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>
            </div>
          </div>

          {/* ── 4. Operations ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <Divider label="Operational details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Corridor">
                <select className="gov-input" value={form.corridor} onChange={e => set("corridor", e.target.value)}>
                  {CORRIDORS.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Zone">
                <select className="gov-input" value={form.zone} onChange={e => set("zone", e.target.value)}>
                  {ZONES.map(z => <option key={z}>{z}</option>)}
                </select>
              </Field>
              <Field label="Police station">
                <select className="gov-input" value={form.police_station} onChange={e => set("police_station", e.target.value)}>
                  {STATIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Weather">
                <select className="gov-input" value={form.weather} onChange={e => set("weather", e.target.value)}>
                  {WEATHER.map(w => <option key={w.v} value={w.v}>{w.l}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* ── Description ────────────────────────────────────────────── */}
          <div>
            <label className="gov-label">Description <span className="font-normal text-gray-400">(optional — helps vehicle detection)</span></label>
            <textarea
              className="gov-input h-16 resize-none"
              placeholder='e.g. "BMTC bus breakdown blocking lane near flyover"'
              value={form.description}
              onChange={e => set("description", e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={submit}
            disabled={loading}
            className="gov-btn w-full py-2.5 flex items-center justify-center gap-2"
          >
            {loading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</>
              : "Run prediction"
            }
          </button>
        </div>

        {/* ══ RESULTS (1/3) ════════════════════════════════════════════════ */}
        <div className="space-y-3">

          {/* Empty state */}
          {!result && !loading && (
            <div className="gov-card p-8 text-center border-dashed">
              <div className="w-10 h-10 rounded-full bg-gov-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gov-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-gray-500">No prediction yet</p>
              <p className="text-[11px] text-gray-400 mt-1">Fill the form and run prediction</p>
            </div>
          )}

          {result && riskKey && (() => {
            const SOLID_BG  = { Low: "bg-emerald-600", Moderate: "bg-amber-500", High: "bg-orange-600", Critical: "bg-red-600" } as const
            const TRACK_BG  = { Low: "bg-emerald-100", Moderate: "bg-amber-100", High: "bg-orange-100", Critical: "bg-red-100" } as const
            const FILL_BAR  = { Low: "bg-emerald-500", Moderate: "bg-amber-500", High: "bg-orange-500", Critical: "bg-red-500" } as const
            const LABEL_TX  = { Low: "text-emerald-700", Moderate: "text-amber-700", High: "text-orange-700", Critical: "text-red-700" } as const

            return (
              <>
                {/* ── Risk score card ──────────────────────────────────── */}
                <div className="gov-card overflow-hidden">
                  {/* Coloured header band */}
                  <div className={`${SOLID_BG[riskKey]} px-4 pt-4 pb-3`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-white/70">Risk Score</p>
                        <p className="text-5xl font-bold text-white leading-none mt-1">{result.risk_score}</p>
                        <p className="text-xs text-white/80 mt-1">out of 100</p>
                      </div>
                      <span className="text-sm font-bold text-white bg-white/20 rounded-lg px-3 py-1.5 mt-1">
                        {result.risk_band}
                      </span>
                    </div>
                    {/* Score fill bar */}
                    <div className={`mt-3 h-1.5 rounded-full ${TRACK_BG[riskKey]} overflow-hidden`}>
                      <div
                        className="h-full rounded-full bg-white/70 transition-all duration-700"
                        style={{ width: `${result.risk_score}%` }}
                      />
                    </div>
                  </div>

                  {/* Metric rows */}
                  <div className="p-4 space-y-0 divide-y divide-gray-50">
                    {/* Officers — most actionable, gets extra emphasis */}
                    <div className="flex justify-between items-center py-2.5">
                      <span className="text-xs text-gray-600 font-medium">Officers required</span>
                      <span className={`text-lg font-bold ${LABEL_TX[riskKey]}`}>{result.officers_required}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5">
                      <span className="text-xs text-gray-500">Barricades</span>
                      <span className="text-sm font-semibold text-gray-800">{result.barricades_required}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5">
                      <span className="text-xs text-gray-500">Priority level</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        result.monitoring_priority === "P1"
                          ? "bg-red-50 text-red-700"
                          : result.monitoring_priority === "P2"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-50 text-gray-600"
                      }`}>{result.monitoring_priority}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5">
                      <span className="text-xs text-gray-500">Closure prob.</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${closurePct > 50 ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${closurePct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold ${closurePct > 50 ? "text-red-600" : "text-emerald-600"}`}>
                          {closurePct}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Diversion — full-width alert row */}
                  <div className={`mx-4 mb-4 rounded-lg px-3 py-2.5 flex items-center justify-between ${
                    result.diversion_required
                      ? "bg-red-50 border border-red-200"
                      : "bg-emerald-50 border border-emerald-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      <svg className={`w-3.5 h-3.5 flex-shrink-0 ${result.diversion_required ? "text-red-500" : "text-emerald-500"}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        {result.diversion_required
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        }
                      </svg>
                      <span className={`text-xs font-medium ${result.diversion_required ? "text-red-700" : "text-emerald-700"}`}>
                        Traffic diversion
                      </span>
                    </div>
                    <span className={`text-xs font-semibold ${result.diversion_required ? "text-red-700" : "text-emerald-700"}`}>
                      {result.diversion_required ? "Required" : "Not needed"}
                    </span>
                  </div>
                </div>

                {/* ── ML confidence ──────────────────────────────────── */}
                <div className="gov-card p-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-3">ML Confidence · CatBoost</p>
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
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        result.closure_prediction ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {result.closure_prediction ? "Close road" : "No closure"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-500">Priority verdict</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        result.priority_prediction === "High" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {result.priority_prediction} priority
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Reasoning ──────────────────────────────────────── */}
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
    </div>
  )
}
