"use client"
import { useState } from "react"
import { predictEvent, explainPrediction, type EventInput, type PredictionOutput, type ExplainResponse } from "@/lib/api"

const RISK_BG = { Low: "bg-emerald-50 border-emerald-200", Moderate: "bg-amber-50 border-amber-200", High: "bg-orange-50 border-orange-200", Critical: "bg-red-50 border-red-200" }
const RISK_TX = { Low: "text-emerald-700", Moderate: "text-amber-700", High: "text-orange-700", Critical: "text-red-700" }
const CORRIDORS = ["Hosur Road","Bellary Road","ORR North","Outer Ring Road","Mysore Road","Tumkur Road","MG Road","Old Airport Road"]
const ZONES = ["Central Zone 1","Central Zone 2","North Zone 1","North Zone 2","South Zone 1","South Zone 2","West Zone 1","East Zone 1"]
const STATIONS = ["Upparpet","Shivajinagar","Malleshwaram","Indiranagar","Koramangala","Jayanagar","Yeshwanthpura","Hebbal","Sadashivanagar","Madiwala"]
const TYPES = ["public_event","vehicle_breakdown","procession","vip_movement","protest","construction","accident","water_logging","tree_fall","debris"]
const WEATHER = ["clear","light_rain","rain","heavy_rain"]

const DEFAULT: EventInput = {
  event_type: "public_event", latitude: 13.0108, longitude: 77.5858, address: "Mekhri Circle",
  corridor: "Bellary Road", police_station: "Sadashivanagar", zone: "Central Zone 1",
  date: new Date().toISOString().slice(0, 10), time: "17:30", crowd_size: 5000, weather: "clear", description: "",
}

export default function Predict() {
  const [form, setForm] = useState<EventInput>(DEFAULT)
  const [result, setResult] = useState<PredictionOutput | null>(null)
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const set = (k: keyof EventInput, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    setLoading(true); setError(""); setExplanation(null)
    try {
      const [pred, explain] = await Promise.all([predictEvent(form), explainPrediction(form)])
      setResult(pred)
      setExplanation(explain)
    }
    catch { setError("API unavailable — is the backend running on :8000?") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-6">
      <h1 className="text-base font-medium text-gov-900">Event impact prediction</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-5">AI risk assessment and resource recommendations</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 gov-card p-5">
          <p className="text-sm font-medium text-gov-900 mb-3">Event details</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="gov-label">Event type</label>
              <select className="gov-input" value={form.event_type} onChange={e => set("event_type", e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select></div>
            <div><label className="gov-label">Address</label><input className="gov-input" value={form.address} onChange={e => set("address", e.target.value)} /></div>
            <div><label className="gov-label">Latitude</label><input className="gov-input" type="number" step="0.0001" value={form.latitude} onChange={e => set("latitude", parseFloat(e.target.value))} /></div>
            <div><label className="gov-label">Longitude</label><input className="gov-input" type="number" step="0.0001" value={form.longitude} onChange={e => set("longitude", parseFloat(e.target.value))} /></div>
            <div><label className="gov-label">Date</label><input className="gov-input" type="date" value={form.date} onChange={e => set("date", e.target.value)} /></div>
            <div><label className="gov-label">Time</label><input className="gov-input" type="time" value={form.time} onChange={e => set("time", e.target.value)} /></div>
            <div><label className="gov-label">Corridor</label><select className="gov-input" value={form.corridor} onChange={e => set("corridor", e.target.value)}>{CORRIDORS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="gov-label">Zone</label><select className="gov-input" value={form.zone} onChange={e => set("zone", e.target.value)}>{ZONES.map(z => <option key={z}>{z}</option>)}</select></div>
            <div><label className="gov-label">Police station</label><select className="gov-input" value={form.police_station} onChange={e => set("police_station", e.target.value)}>{STATIONS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className="gov-label">Crowd size</label><input className="gov-input" type="number" value={form.crowd_size || ""} onChange={e => set("crowd_size", parseInt(e.target.value))} /></div>
            <div><label className="gov-label">Weather</label>
              <select className="gov-input" value={form.weather} onChange={e => set("weather", e.target.value)}>
                {WEATHER.map(w => <option key={w} value={w}>{w.replace(/_/g, " ")}</option>)}
              </select></div>
          </div>
          <div className="mt-3"><label className="gov-label">Description (optional)</label>
            <textarea className="gov-input h-16 resize-none" value={form.description} onChange={e => set("description", e.target.value)} /></div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <button onClick={submit} disabled={loading} className="gov-btn w-full mt-3">{loading ? "Running…" : "Run prediction"}</button>
        </div>

        <div className="space-y-3">
          {result ? (
            <>
              <div className={`gov-card p-4 border ${RISK_BG[result.risk_band]}`}>
                <div className="text-center">
                  <p className={`text-4xl font-medium ${RISK_TX[result.risk_band]}`}>{result.risk_score}</p>
                  <p className="text-xs text-gray-500">Risk score</p>
                  <span className={`inline-block mt-2 text-xs font-medium px-3 py-1 rounded-full ${RISK_BG[result.risk_band]} ${RISK_TX[result.risk_band]}`}>{result.risk_band} risk</span>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  {[["Officers", result.officers_required], ["Barricades", result.barricades_required], ["Priority", result.monitoring_priority], ["Closure prob.", `${Math.round(result.road_closure_probability * 100)}%`], ["Diversion", result.diversion_required ? "Yes" : "No"]].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
              </div>
              {explanation && (
                <div className="gov-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gov-900">Why this score</p>
                    <span className="text-[10px] text-gray-400">{explanation.explanation_method === "shap_tree_explainer" ? "SHAP" : "Rule-based"}</span>
                  </div>
                  {explanation.contributing_factors.map(f => (
                    <div key={f.factor} className="mb-2">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-0.5">
                        <span className="truncate pr-2">{f.factor}</span>
                        <span className="text-gov-500">{f.contribution_pct}%</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded"><div className="h-1 rounded bg-gov-500" style={{ width: `${Math.min(f.contribution_pct, 100)}%` }} /></div>
                    </div>
                  ))}
                  <div className="flex justify-between text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-100">
                    <span>Confidence</span><span className="font-medium text-gov-900">{explanation.confidence_pct}%</span>
                  </div>
                </div>
              )}
              {result.reasoning.length > 0 && (
                <div className="gov-card p-4 bg-amber-50 border-amber-100">
                  <p className="text-sm font-medium text-amber-900 mb-2">Reasoning</p>
                  <ul className="space-y-1.5">{result.reasoning.map((r, i) => <li key={i} className="text-[11px] text-amber-800 flex gap-1.5"><span>•</span>{r}</li>)}</ul>
                </div>
              )}
            </>
          ) : (
            <div className="gov-card p-10 text-center text-xs text-gray-400">Run prediction to see results</div>
          )}
        </div>
      </div>
    </div>
  )
}
