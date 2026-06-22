"use client"
import { useEffect, useState, useMemo } from "react"
import { getIncidents, getDiversionPlan, type Incident, type DiversionPlan } from "@/lib/api"

function buildTokenMap(incidents: Incident[]): Record<string, string> {
  const sorted = [...incidents].sort(
    (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  )
  return Object.fromEntries(sorted.map((inc, i) => [inc.id, `I${i + 1}`]))
}

const STATUS_COLOR: Record<string, string> = {
  CLOSED:            "text-red-700 bg-red-50 border-red-200",
  PARTIALLY_BLOCKED: "text-orange-700 bg-orange-50 border-orange-200",
  CONGESTED:         "text-amber-700 bg-amber-50 border-amber-200",
  UNKNOWN:           "text-gray-600 bg-gray-50 border-gray-200",
}

const SEV_COLOR: Record<string, string> = {
  HIGH:   "text-red-700",
  MEDIUM: "text-amber-700",
  LOW:    "text-emerald-700",
}

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "text-red-700 bg-red-50 border-red-200",
  High:     "text-orange-700 bg-orange-50 border-orange-200",
  Medium:   "text-amber-700 bg-amber-50 border-amber-200",
  Low:      "text-emerald-700 bg-emerald-50 border-emerald-200",
}

export default function DiversionPage() {
  const [incidents,  setIncidents]  = useState<Incident[]>([])
  const [loading,    setLoading]    = useState(true)
  const [plans,      setPlans]      = useState<Record<string, DiversionPlan>>({})
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [errors,     setErrors]     = useState<Record<string, string>>({})

  useEffect(() => {
    getIncidents("status=active&limit=500")
      .then(setIncidents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const tokenMap = useMemo(() => buildTokenMap(incidents), [incidents])

  const generatePlan = async (id: string) => {
    setGenerating(g => ({ ...g, [id]: true }))
    setErrors(e => { const n = { ...e }; delete n[id]; return n })
    try {
      const plan = await getDiversionPlan(id)
      setPlans(p => ({ ...p, [id]: plan }))
    } catch (err: unknown) {
      setErrors(e => ({ ...e, [id]: err instanceof Error ? err.message : "Failed" }))
    } finally {
      setGenerating(g => ({ ...g, [id]: false }))
    }
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-gray-400">
      <span className="w-3 h-3 rounded-full bg-gov-400 animate-pulse" />
      Loading active incidents…
    </div>
  )

  return (
    <div className="p-3 sm:p-6 max-w-4xl">

      <div className="mb-5">
        <h1 className="text-base font-medium text-gov-900">Diversion Plan</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Road network analysis and alternative route recommendations for active incidents
        </p>
      </div>

      {incidents.length === 0 ? (
        <div className="gov-card p-8 text-center">
          <p className="text-sm text-gray-400">No active incidents at this time.</p>
          <p className="text-xs text-gray-300 mt-1">Diversion plans will appear here once incidents are reported.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(inc => {
            const plan  = plans[inc.id]
            const busy  = generating[inc.id]
            const err   = errors[inc.id]
            const token = tokenMap[inc.id] ?? "?"
            return (
              <div key={inc.id} className="gov-card overflow-hidden">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-[11px] font-bold text-gov-700 bg-gov-50 border border-gov-200 px-2 py-0.5 rounded font-mono">
                        {token}
                      </span>
                      {inc.severity_label ? (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          SEVERITY_BADGE[inc.severity_label] ?? "text-gray-600 bg-gray-50 border-gray-200"
                        }`}>{inc.severity_label}</span>
                      ) : (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          inc.priority === "High"
                            ? SEVERITY_BADGE.High
                            : "text-gray-600 bg-gray-50 border-gray-200"
                        }`}>{inc.priority}</span>
                      )}
                      {inc.requires_road_closure && (
                        <span className="text-[10px] text-red-600 font-medium">Road closure</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{inc.address}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {inc.zone} · {inc.event_cause?.replace(/_/g, " ")}
                      {inc.closure_probability != null &&
                        ` · ${Math.round((inc.closure_probability as number) * 100)}% closure risk`}
                    </p>
                  </div>
                  {!plan && (
                    <button
                      onClick={() => generatePlan(inc.id)}
                      disabled={busy}
                      className="gov-btn text-xs flex-shrink-0 disabled:opacity-50"
                    >
                      {busy ? "Generating…" : "Generate plan"}
                    </button>
                  )}
                  {plan && (
                    <button
                      onClick={() => generatePlan(inc.id)}
                      disabled={busy}
                      className="text-xs text-gov-600 underline flex-shrink-0 disabled:opacity-50"
                    >
                      {busy ? "Refreshing…" : "Refresh"}
                    </button>
                  )}
                </div>

                {err && (
                  <div className="mx-4 mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {err}
                  </div>
                )}

                {plan && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap mb-3">
                      <div>
                        <p className="text-[10px] text-gray-400 mb-0.5">Affected road</p>
                        <p className="text-sm font-medium text-gray-900">{plan.affected_road}</p>
                      </div>
                      <div className="ml-4">
                        <p className="text-[10px] text-gray-400 mb-0.5">Road status</p>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[plan.road_status] ?? STATUS_COLOR.UNKNOWN}`}>
                          {plan.road_status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="ml-4">
                        <p className="text-[10px] text-gray-400 mb-0.5">Severity</p>
                        <p className={`text-sm font-semibold ${SEV_COLOR[plan.severity] ?? "text-gray-700"}`}>
                          {plan.severity}
                        </p>
                      </div>
                      <div className="ml-4">
                        <p className="text-[10px] text-gray-400 mb-0.5">Diversion</p>
                        <p className={`text-sm font-semibold ${plan.diversion_required ? "text-red-700" : "text-emerald-700"}`}>
                          {plan.diversion_required ? "Required" : "Not required"}
                        </p>
                      </div>
                    </div>

                    {plan.message && (
                      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{plan.message}</p>
                    )}

                    {plan.recommended_diversions.length > 0 ? (
                      <>
                        <p className="text-[10px] font-medium text-gray-500 mb-2">Alternative routes</p>
                        <div className="space-y-1.5">
                          {plan.recommended_diversions.map(road => (
                            <div
                              key={road.priority}
                              className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100"
                            >
                              <span className="w-5 h-5 rounded-full bg-gov-50 text-gov-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                {road.priority}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800">{road.road_name}</p>
                                <p className="text-[10px] text-gray-400">
                                  {road.road_type}
                                  {road.distance_from_incident_m != null &&
                                    ` · ${Math.round(road.distance_from_incident_m)}m away`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">No named alternative roads found in the immediate area.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
