"use client"
import React, { useEffect, useState, useCallback, useMemo } from "react"
import { getIncidents, completeIncident, getDiversionPlan, type Incident, type DiversionPlan } from "@/lib/api"

function buildTokenMap(incidents: Incident[]): Record<string, string> {
  const sorted = [...incidents].sort(
    (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  )
  return Object.fromEntries(sorted.map((inc, i) => [inc.id, `I${i + 1}`]))
}

const PLAN: Record<string, { officers: number; barricades: number; radius: string; basis: string }> = {
  accident:          { officers: 4,  barricades: 3, radius: "1 km",  basis: "Traffic diversion + crowd control + emergency vehicle clearance" },
  public_event:      { officers: 8,  barricades: 6, radius: "3 km",  basis: "Perimeter management + multi-lane control + crowd flow" },
  water_logging:     { officers: 3,  barricades: 2, radius: "500 m", basis: "Hazard warning + emergency vehicle coordination" },
  vehicle_breakdown: { officers: 2,  barricades: 1, radius: "300 m", basis: "Lane clearance + tow coordination" },
  tree_fall:         { officers: 3,  barricades: 2, radius: "500 m", basis: "Road clearance + debris containment" },
  construction:      { officers: 5,  barricades: 4, radius: "1 km",  basis: "Zone enforcement + alternate route management" },
  congestion:        { officers: 3,  barricades: 0, radius: "1 km",  basis: "Signal override + manual flow optimisation" },
  pot_holes:         { officers: 2,  barricades: 2, radius: "200 m", basis: "Hazard marking + repair team coordination" },
  debris:            { officers: 2,  barricades: 2, radius: "300 m", basis: "Road clearing + lane restriction" },
  signal_failure:    { officers: 2,  barricades: 0, radius: "200 m", basis: "Manual traffic control at junction" },
}
const planFor = (cause: string) => PLAN[cause] || { officers: 2, barricades: 1, radius: "—" }

interface ReleaseLog {
  key: string
  id: string
  token: string
  address: string
  officers: number
  barricades: number
  at: string
}

const ROAD_STATUS_COLOR: Record<string, string> = {
  CLOSED:            "bg-red-100 text-red-700 border-red-200",
  PARTIALLY_BLOCKED: "bg-orange-100 text-orange-700 border-orange-200",
  CONGESTED:         "bg-amber-100 text-amber-700 border-amber-200",
  UNKNOWN:           "bg-gray-100 text-gray-500 border-gray-200",
}

const SEVERITY_COLOR: Record<string, string> = {
  HIGH:   "text-red-700",
  MEDIUM: "text-orange-600",
  LOW:    "text-amber-600",
}

export default function Resources() {
  const [incidents,     setIncidents]    = useState<Incident[]>([])
  const [resolving,     setResolving]    = useState<string | null>(null)
  const [confirmed,     setConfirmed]    = useState<string | null>(null)
  const [released,      setReleased]     = useState<ReleaseLog[]>([])
  // diversion plan state
  const [divPlanning,   setDivPlanning]  = useState<string | null>(null)   // incident id being planned
  const [divPlans,      setDivPlans]     = useState<Record<string, DiversionPlan>>({})   // id → plan
  const [divErrors,     setDivErrors]    = useState<Record<string, string>>({})          // id → error
  const [divOpen,       setDivOpen]      = useState<string | null>(null)   // id whose panel is open

  const load = useCallback(() => {
    getIncidents("status=active&limit=500").then(setIncidents).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const tokenMap = useMemo(() => buildTokenMap(incidents), [incidents])

  const totals = incidents.reduce((acc, inc) => {
    const p = planFor(inc.event_cause)
    acc.officers += p.officers; acc.barricades += p.barricades
    return acc
  }, { officers: 0, barricades: 0 })

  const totalReleased = released.reduce(
    (acc, r) => ({ officers: acc.officers + r.officers, barricades: acc.barricades + r.barricades }),
    { officers: 0, barricades: 0 }
  )

  const handleResolve = async (inc: Incident) => {
    if (confirmed !== inc.id) { setConfirmed(inc.id); return }
    setConfirmed(null)
    setResolving(inc.id)
    try {
      await completeIncident(inc.id)
      const p = planFor(inc.event_cause)
      setReleased(prev => [{
        key: `${inc.id}-${Date.now()}`,
        id: inc.id,
        token: tokenMap[inc.id] ?? "?",
        address: inc.address,
        officers: p.officers,
        barricades: p.barricades,
        at: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      }, ...prev])
      setIncidents(prev => prev.filter(i => i.id !== inc.id))
    } catch {
      // silently restore — next load will reflect true state
      load()
    } finally {
      setResolving(null)
    }
  }

  const cancelConfirm = (id: string) => {
    if (confirmed === id) setConfirmed(null)
  }

  const handleGetDiversionPlan = async (inc: Incident) => {
    // Toggle off if already open
    if (divOpen === inc.id) { setDivOpen(null); return }
    // Show cached plan if we have it
    if (divPlans[inc.id]) { setDivOpen(inc.id); return }
    setDivPlanning(inc.id)
    setDivErrors(prev => { const n = { ...prev }; delete n[inc.id]; return n })
    try {
      const plan = await getDiversionPlan(inc.id)
      setDivPlans(prev => ({ ...prev, [inc.id]: plan }))
      setDivOpen(inc.id)
    } catch (err: any) {
      setDivErrors(prev => ({ ...prev, [inc.id]: err?.message || "Failed to generate plan" }))
    } finally {
      setDivPlanning(null)
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-base font-medium text-gov-900">Resource allocation</h1>
        <p className="text-xs text-gray-400 mt-0.5">Recommended deployment · end events to release officers and barricades</p>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
        <div className="gov-card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 mb-1">Officers deployed</p>
          <p className="text-2xl font-medium text-gov-900">{totals.officers}</p>
        </div>
        <div className="gov-card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 mb-1">Barricades deployed</p>
          <p className="text-2xl font-medium text-gov-900">{totals.barricades}</p>
        </div>
        <div className="gov-card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 mb-1">Active incidents</p>
          <p className="text-2xl font-medium text-amber-700">{incidents.length}</p>
        </div>
        <div className="gov-card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 mb-1">Officers released</p>
          <p className="text-2xl font-medium text-emerald-700">{totalReleased.officers}</p>
        </div>
      </div>

      {/* ── Release log banner ─────────────────────────────────────────────── */}
      {released.length > 0 && (
        <div className="gov-card p-4 mb-4 border-l-4 border-emerald-400">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-emerald-800">
              {totalReleased.officers} officers · {totalReleased.barricades} barricades released this session
            </p>
            <button onClick={() => setReleased([])} className="text-[10px] text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div className="space-y-1">
            {released.map(r => (
              <div key={r.key} className="flex items-center gap-2 text-[11px] text-gray-600">
                <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-gray-400">{r.at}</span>
                <span className="text-[10px] font-bold text-gov-600 font-mono">{r.token}</span>
                <span className="truncate flex-1">{r.address}</span>
                <span className="text-emerald-700 font-medium whitespace-nowrap">
                  +{r.officers} officers · +{r.barricades} barricades freed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-incident deployment table ──────────────────────────────────── */}
      <div className="gov-card p-3 sm:p-4">
        <p className="text-sm font-medium text-gov-900 mb-3">Per-incident deployment plan</p>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-xs min-w-[340px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium pl-3 sm:pl-0">Incident · Allocation basis</th>
                <th className="py-2 font-medium hidden sm:table-cell">Location</th>
                <th className="py-2 font-medium text-center">Officers</th>
                <th className="py-2 font-medium text-center">Barricades</th>
                <th className="py-2 font-medium text-center hidden sm:table-cell">Radius</th>
                <th className="py-2 font-medium text-right pr-3 sm:pr-0">Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => {
                const p              = planFor(inc.event_cause)
                const isConfirming   = confirmed    === inc.id
                const isResolving    = resolving    === inc.id
                const isPlanning     = divPlanning  === inc.id
                const isPlanOpen     = divOpen      === inc.id
                const plan           = divPlans[inc.id]
                const planErr        = divErrors[inc.id]
                const token          = tokenMap[inc.id] ?? "?"

                return (
                  <React.Fragment key={inc.id}>
                    <tr className={`border-b ${isPlanOpen ? "border-gov-100" : "border-gray-50"} last:border-0 transition-colors ${isConfirming ? "bg-amber-50" : ""}`}>
                      <td className="py-2.5 pl-3 sm:pl-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-gov-700 bg-gov-50 border border-gov-200 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                            {token}
                          </span>
                          <span className="text-gray-800 capitalize">{inc.event_cause?.replace(/_/g, " ")}</span>
                          {inc.severity_label ? (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              inc.severity_label === "Critical" ? "bg-red-100 text-red-700" :
                              inc.severity_label === "High"     ? "bg-orange-100 text-orange-700" :
                              inc.severity_label === "Medium"   ? "bg-amber-100 text-amber-700" :
                                                                  "bg-emerald-100 text-emerald-700"
                            }`}>{inc.severity_label}</span>
                          ) : (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              inc.priority === "High" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"
                            }`}>{inc.priority}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 max-w-[160px] leading-snug">{p.basis}</p>
                        {inc.closure_probability != null && (inc.closure_probability as number) > 0.55 && (
                          <p className="text-[10px] text-amber-600 font-medium">
                            {Math.round((inc.closure_probability as number) * 100)}% closure risk
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 text-gray-500 max-w-[160px] truncate hidden sm:table-cell">{inc.address}</td>
                      <td className="py-2.5 text-center font-medium">{p.officers}</td>
                      <td className="py-2.5 text-center font-medium">{p.barricades}</td>
                      <td className="py-2.5 text-center text-gray-500 hidden sm:table-cell">{p.radius}</td>
                      <td className="py-2.5 text-right pr-3 sm:pr-0">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleGetDiversionPlan(inc)}
                            disabled={isPlanning}
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-1.5 rounded-lg border transition-colors font-medium ${
                              isPlanOpen
                                ? "border-gov-300 bg-gov-50 text-gov-700"
                                : "border-gray-200 text-gray-500 hover:border-gov-300 hover:text-gov-600 hover:bg-gov-50"
                            }`}
                          >
                            {isPlanning
                              ? <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                                </svg>
                            }
                            {isPlanOpen ? "Hide plan" : "Diversion plan"}
                          </button>
                          {isResolving ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                              <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            </span>
                          ) : isConfirming ? (
                            <span className="inline-flex items-center gap-1">
                              <button onClick={() => handleResolve(inc)} className="text-[10px] px-2 py-1 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors">Confirm</button>
                              <button onClick={() => cancelConfirm(inc.id)} className="text-[10px] px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                            </span>
                          ) : (
                            <button onClick={() => handleResolve(inc)} className="inline-flex items-center gap-1 text-[10px] px-2 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              End event
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Diversion plan expansion row ────────────────── */}
                    {isPlanOpen && (
                      <tr className="bg-gov-50/40">
                        <td colSpan={6} className="px-3 sm:px-4 py-3">
                          {planErr ? (
                            <p className="text-xs text-red-600">{planErr}</p>
                          ) : plan ? (
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-[11px] font-semibold text-gov-800">
                                  Affected road: <span className="font-bold">{plan.affected_road}</span>
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ROAD_STATUS_COLOR[plan.road_status] || ROAD_STATUS_COLOR.UNKNOWN}`}>
                                  {plan.road_status.replace(/_/g, " ")}
                                </span>
                                <span className={`text-[10px] font-semibold ${SEVERITY_COLOR[plan.severity] || "text-gray-500"}`}>
                                  {plan.severity} severity
                                </span>
                                {plan.diversion_required
                                  ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">Diversion required</span>
                                  : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Monitor only</span>
                                }
                              </div>
                              {plan.recommended_diversions.length > 0 ? (
                                <div className="space-y-1">
                                  <p className="text-[10px] text-gray-500 font-medium mb-1">Recommended diversions (best first):</p>
                                  {plan.recommended_diversions.map(rd => (
                                    <div key={rd.priority} className="flex items-center gap-2 text-[11px]">
                                      <span className="w-4 h-4 rounded-full bg-gov-100 text-gov-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{rd.priority}</span>
                                      <span className="font-medium text-gray-800">{rd.road_name}</span>
                                      {rd.road_type && <span className="text-gray-400">{rd.road_type}</span>}
                                      {rd.distance_from_incident_m != null && (
                                        <span className="text-gray-400">{Math.round(rd.distance_from_incident_m)} m away</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[11px] text-gray-400">No alternative roads found in the immediate area.</p>
                              )}
                              {plan.message && (
                                <p className="text-[10px] text-gray-500 mt-2 italic border-t border-gray-100 pt-2">{plan.message}</p>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    {released.length > 0
                      ? "All incidents resolved — all resources released."
                      : "No active incidents"
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {incidents.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-3 border-t border-gray-50 pt-3">
            Click <strong>End Event</strong> to mark an incident completed — this releases all officers and barricades
            from the deployment count and removes it from the priority ranking and routing engine.
          </p>
        )}
      </div>
    </div>
  )
}
