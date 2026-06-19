"use client"
import { useState } from "react"
import { predictEvent, explainPrediction, type EventInput, type PredictionOutput, type ExplainResponse } from "@/lib/api"

const RISK_BG = { Low: "bg-emerald-50 border-emerald-200", Moderate: "bg-amber-50 border-amber-200", High: "bg-orange-50 border-orange-200", Critical: "bg-red-50 border-red-200" } as const
const RISK_TX = { Low: "text-emerald-700", Moderate: "text-amber-700", High: "text-orange-700", Critical: "text-red-700" } as const
const RISK_DOT = { Low: "bg-emerald-500", Moderate: "bg-amber-500", High: "bg-orange-500", Critical: "bg-red-500" } as const

const CORRIDORS = ["Hosur Road","Bellary Road","ORR North","Outer Ring Road","Mysore Road","Tumkur Road","MG Road","Old Airport Road"]
const ZONES     = ["Central Zone 1","Central Zone 2","North Zone 1","North Zone 2","South Zone 1","South Zone 2","West Zone 1","East Zone 1"]
const STATIONS  = ["Upparpet","Shivajinagar","Malleshwaram","Indiranagar","Koramangala","Jayanagar","Yeshwanthpura","Hebbal","Sadashivanagar","Madiwala"]
const TYPES     = ["public_event","vehicle_breakdown","procession","vip_movement","protest","construction","accident","water_logging","tree_fall","debris"]
const WEATHER   = ["clear","light_rain","rain","heavy_rain"]

const DEFAULT: EventInput = {
  event_type: "public_event", latitude: 13.0108, longitude: 77.5858, address: "Mekhri Circle",
  corridor: "Bellary Road", police_station: "Sadashivanagar", zone: "Central Zone 1",
  date: new Date().toISOString().slice(0, 10), time: "17:30", crowd_size: 5000, weather: "clear", description: "",
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="gov-label">{label}</label>
    {children}
  </div>
)

export default function Predict() {
  const [form, setForm]           = useState<EventInput>(DEFAULT)
  const [result, setResult]       = useState<PredictionOutput | null>(null)
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState("")
  const set = (k: keyof EventInput, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    setLoading(true); setError(""); setExplanation(null)
    try {
      const [pred, explain] = await Promise.all([predictEvent(form), explainPrediction(form)])
      setResult(pred); setExplanation(explain)
    } catch { setError("API unavailable — is the backend running?") }
    finally { setLoading(false) }
  }

  const riskKey = result?.risk_band as keyof typeof RISK_BG | undefined

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-base font-semibold text-gov-900">Event impact prediction</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-5">AI risk assessment and resource recommendations</p>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">
        {/* ── Form ── */}
        <div className="lg:col-span-2 gov-card p-4 sm:p-5">
          <p className="text-sm font-medium text-gov-900 mb-4">Event details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Event type">
              <select className="gov-input" value={form.event_type} onChange={e => set("event_type", e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="Address">
              <input className="gov-input" value={form.address} onChange={e => set("address", e.target.value)} />
            </Field>
            <Field label="Latitude">
              <input className="gov-input" type="number" step="0.0001" value={form.latitude} onChange={e => set("latitude", parseFloat(e.target.value))} />
            </Field>
            <Field label="Longitude">
              <input className="gov-input" type="number" step="0.0001" value={form.longitude} onChange={e => set("longitude", parseFloat(e.target.value))} />
            </Field>
            <Field label="Date">
              <input className="gov-input" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </Field>
            <Field label="Time">
              <input className="gov-input" type="time" value={form.time} onChange={e => set("time", e.target.value)} />
            </Field>
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
            <Field label="Crowd size">
              <input className="gov-input" type="number" value={form.crowd_size || ""} onChange={e => set("crowd_size", parseInt(e.target.value))} />
            </Field>
            <Field label="Weather">
              <select className="gov-input" value={form.weather} onChange={e => set("weather", e.target.value)}>
                {WEATHER.map(w => <option key={w} value={w}>{w.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <label className="gov-label">Description (optional)</label>
            <textarea className="gov-input h-16 resize-none" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600 mt-2 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={submit} disabled={loading} className="gov-btn w-full mt-4 py-2.5 flex items-center justify-center gap-2">
            {loading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Running…</>
              : "Run prediction"
            }
          </button>
        </div>

        {/* ── Results ── */}
        <div className="space-y-3">
          {result && riskKey ? (
            <>
              {/* Risk score card */}
              <div className={`gov-card p-4 border-l-4 ${
                riskKey === "Low" ? "border-l-emerald-500" :
                riskKey === "Moderate" ? "border-l-amber-500" :
                riskKey === "High" ? "border-l-orange-500" : "border-l-red-500"
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide">Risk score</p>
                    <p className={`text-4xl font-semibold mt-0.5 ${RISK_TX[riskKey]}`}>{result.risk_score}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${RISK_BG[riskKey]} ${RISK_TX[riskKey]}`}>
                    {result.risk_band}
                  </span>
                </div>
                <div className="space-y-2 pt-3 border-t border-gray-100">
                  {[
                    ["Officers required", result.officers_required],
                    ["Barricades",        result.barricades_required],
                    ["Priority level",    result.monitoring_priority],
                    ["Closure prob.",     `${Math.round(result.road_closure_probability * 100)}%`],
                    ["Diversion",         result.diversion_required ? "Required" : "Not needed"],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-medium text-gov-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SHAP explanation */}
              {explanation && (
                <div className="gov-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gov-900">Why this score</p>
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                      {explanation.explanation_method === "shap_tree_explainer" ? "SHAP" : "Rule-based"}
                    </span>
                  </div>
                  {explanation.contributing_factors.map(f => (
                    <div key={f.factor} className="mb-2.5">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span className="truncate pr-2">{f.factor}</span>
                        <span className="text-gov-500 font-medium">{f.contribution_pct}%</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full">
                        <div className="h-1 rounded-full bg-gov-500 transition-all"
                          style={{ width: `${Math.min(f.contribution_pct, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-100">
                    <span>Model confidence</span>
                    <span className="font-medium text-gov-900">{explanation.confidence_pct}%</span>
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {result.reasoning.length > 0 && (
                <div className="gov-card p-4 border-l-4 border-l-amber-400 bg-amber-50">
                  <p className="text-sm font-medium text-amber-900 mb-2">Reasoning</p>
                  <ul className="space-y-1.5">
                    {result.reasoning.map((r, i) => (
                      <li key={i} className="text-[11px] text-amber-800 flex gap-2">
                        <span className="flex-shrink-0 mt-0.5">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="gov-card p-8 text-center text-xs text-gray-400 border-dashed">
              <p className="font-medium text-gray-500 mb-1">No prediction yet</p>
              <p>Fill in the event details and run the prediction</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
