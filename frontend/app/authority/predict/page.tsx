"use client"
import { useState } from "react"
import dynamic from "next/dynamic"
import {
  predictEvent, mlPredict, explainPrediction,
  type EventInput, type PredictionOutput, type ExplainResponse,
  type MLPredictInput, type MLPredictOutput,
} from "@/lib/api"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

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
  const [form, setForm]     = useState<FormState>(DEFAULT)
  const [result, setResult] = useState<PredictionOutput | null>(null)
  const [mlResult, setML]   = useState<MLPredictOutput | null>(null)
  const [explain, setExplain] = useState<ExplainResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState("")

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    setLoading(true); setError(""); setML(null); setExplain(null)
    try {
      const eventInput: EventInput = {
        event_type: form.event_cause,
        latitude: form.latitude, longitude: form.longitude, address: form.address,
        corridor: form.corridor, police_station: form.police_station, zone: form.zone,
        date: form.date, time: form.time, weather: form.weather, description: form.description,
      }
      const mlInput: MLPredictInput = {
        event_type: form.incident_type,
        latitude: form.latitude, longitude: form.longitude,
        event_cause: form.event_cause,
        authenticated: form.authenticated_reporter,
        veh_type: form.veh_type || undefined,
        start_datetime: buildStartDatetime(form.date, form.time),
        description: form.description,
      }
      const [pred, ml, xp] = await Promise.allSettled([
        predictEvent(eventInput),
        mlPredict(mlInput),
        explainPrediction(eventInput),
      ])
      if (pred.status === "fulfilled") setResult(pred.value)
      if (ml.status   === "fulfilled") setML(ml.value)
      if (xp.status   === "fulfilled") setExplain(xp.value)
      if (pred.status === "rejected" && ml.status === "rejected")
        setError("API unavailable — is the backend running?")
    } finally { setLoading(false) }
  }

  const riskKey = result?.risk_band as keyof typeof RISK_TX | undefined
  const closurePct  = mlResult ? Math.round(mlResult.closure_probability * 100) : 0
  const priorityPct = mlResult ? Math.round(mlResult.priority_probability * 100) : 0

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

            {/* Map picker */}
            <LocationPicker
              lat={String(form.latitude)}
              lon={String(form.longitude)}
              onPick={(lat, lon, addr) => {
                set("latitude",  parseFloat(lat))
                set("longitude", parseFloat(lon))
                if (addr) set("address", addr)
              }}
            />

            {/* Address (auto-filled by map, editable) */}
            <Field label="Address">
              <input
                className="gov-input"
                placeholder="Click map to auto-fill, or type manually"
                value={form.address}
                onChange={e => set("address", e.target.value)}
              />
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
            <div className="grid grid-cols-2 gap-3">
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
          {!mlResult && !result && !loading && (
            <div className="gov-card p-8 text-center border-dashed">
              <div className="w-10 h-10 rounded-full bg-gov-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gov-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-gray-500">No prediction yet</p>
              <p className="text-[11px] text-gray-400 mt-1">Fill in the details and run prediction</p>
            </div>
          )}

          {/* ── Authority ML Score ───────────────────────────────────── */}
          {mlResult && (
            <div className={`gov-card p-4 border-l-4 ${mlResult.priority_prediction === "High" ? "border-l-red-500" : "border-l-emerald-500"}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Authority ML Score</p>
                  <p className="text-xs text-gray-500 mt-0.5">CatBoost · official model</p>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                  mlResult.priority_prediction === "High"
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}>
                  {mlResult.priority_prediction} Priority
                </span>
              </div>

              <div className="space-y-3">
                {/* Road closure probability */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-gray-500">Road closure probability</span>
                    <span className={`font-semibold ${closurePct > 50 ? "text-red-600" : "text-emerald-600"}`}>
                      {closurePct}%
                    </span>
                  </div>
                  <ProbBar pct={closurePct} color={closurePct > 50 ? "bg-red-500" : "bg-emerald-500"} />
                </div>

                {/* Priority confidence */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-gray-500">Priority confidence</span>
                    <span className="font-semibold text-gov-700">{priorityPct}%</span>
                  </div>
                  <ProbBar pct={priorityPct} color="bg-gov-500" />
                </div>

                {/* Closure predicted */}
                <div className="flex justify-between items-center text-[11px] pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Closure predicted</span>
                  <span className={`font-medium px-2 py-0.5 rounded-full text-[10px] ${
                    mlResult.closure_prediction
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {mlResult.closure_prediction ? "Yes — close road" : "No closure needed"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Risk score (existing model) ───────────────────────────── */}
          {result && riskKey && (
            <>
              <div className={`gov-card p-4 border-l-4 ${RISK_BORDER[riskKey]}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Risk score</p>
                    <p className={`text-4xl font-semibold mt-1 ${RISK_TX[riskKey]}`}>{result.risk_score}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${RISK_BG[riskKey]} ${RISK_TX[riskKey]}`}>
                    {result.risk_band}
                  </span>
                </div>
                <div className="space-y-2 pt-3 border-t border-gray-100">
                  {([
                    ["Officers required", result.officers_required],
                    ["Barricades",        result.barricades_required],
                    ["Priority level",    result.monitoring_priority],
                    ["Closure prob.",     `${Math.round(result.road_closure_probability * 100)}%`],
                    ["Diversion",         result.diversion_required ? "Required" : "Not needed"],
                  ] as [string, string | number][]).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-medium text-gov-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SHAP explanation */}
              {explain && (
                <div className="gov-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-gov-900">Why this score</p>
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                      {explain.explanation_method === "shap_tree_explainer" ? "SHAP" : "Rule-based"}
                    </span>
                  </div>
                  {explain.contributing_factors.map(f => (
                    <div key={f.factor} className="mb-2.5">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span className="truncate pr-2">{f.factor}</span>
                        <span className="text-gov-500 font-medium flex-shrink-0">{f.contribution_pct}%</span>
                      </div>
                      <ProbBar pct={Math.min(f.contribution_pct, 100)} color="bg-gov-500" />
                    </div>
                  ))}
                  <div className="flex justify-between text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-100">
                    <span>Model confidence</span>
                    <span className="font-medium text-gov-900">{explain.confidence_pct}%</span>
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {result.reasoning.length > 0 && (
                <div className="gov-card p-4 border-l-4 border-l-amber-400 bg-amber-50">
                  <p className="text-xs font-medium text-amber-900 mb-2">Reasoning</p>
                  <ul className="space-y-1.5">
                    {result.reasoning.map((r, i) => (
                      <li key={i} className="text-[11px] text-amber-800 flex gap-2">
                        <span className="flex-shrink-0 mt-0.5">·</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
