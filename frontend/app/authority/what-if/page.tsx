"use client"
import { useState } from "react"
import { whatIf, type WhatIfResponse } from "@/lib/api"

const CORRIDORS = ["Hosur Road", "Bellary Road", "ORR North", "Outer Ring Road", "Mysore Road", "Tumkur Road", "MG Road", "Old Airport Road"]

export default function WhatIf() {
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
    <div className="p-6">
      <h1 className="text-base font-medium text-gov-900">What-if analysis</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-5">&quot;What happens if {corridor} is closed?&quot;</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 gov-card p-5">
          <p className="text-sm font-medium text-gov-900 mb-3">Scenario</p>
          <div className="space-y-3">
            <div><label className="gov-label">Corridor to close</label>
              <select className="gov-input" value={corridor} onChange={e => setCorridor(e.target.value)}>
                {CORRIDORS.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className="gov-label">Closure duration (hours)</label>
              <input className="gov-input" type="number" step="0.5" value={duration ?? ""} onChange={e => setDuration(e.target.value ? parseFloat(e.target.value) : undefined)} /></div>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <button onClick={run} disabled={loading} className="gov-btn w-full mt-4">{loading ? "Computing…" : "Run what-if"}</button>
        </div>

        <div className="col-span-2 space-y-3">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="gov-card p-4 border border-red-100 bg-red-50">
                  <p className="text-[11px] text-gray-500 mb-1">New congestion estimate</p>
                  <p className="text-3xl font-medium text-red-700">{result.new_congestion_estimate_pct}%</p>
                </div>
                <div className="gov-card p-4">
                  <p className="text-[11px] text-gray-500 mb-1">Traffic increase on alternatives</p>
                  <p className="text-3xl font-medium text-amber-700">+{result.traffic_increase_pct}%</p>
                </div>
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
                          <span className="font-medium text-gov-900">{r.corridor}</span>
                          <span className="text-amber-700">+{r.expected_load_increase_pct}% load</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded"><div className="h-1.5 rounded bg-amber-400" style={{ width: `${Math.min(r.expected_load_increase_pct * 2, 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="gov-card p-3 bg-gray-50 border-gray-100">
                <p className="text-[10px] text-gray-400">{result.basis}</p>
              </div>
            </>
          ) : (
            <div className="gov-card p-10 text-center text-xs text-gray-400">Run a what-if scenario to see results</div>
          )}
        </div>
      </div>
    </div>
  )
}
