"use client"
import { useEffect, useState, useCallback } from "react"
import { getIncidents, completeIncident, type Incident } from "@/lib/api"

const PLAN: Record<string, { officers: number; barricades: number; radius: string }> = {
  accident:          { officers: 4,  barricades: 3, radius: "1 km"   },
  public_event:      { officers: 8,  barricades: 6, radius: "3 km"   },
  water_logging:     { officers: 3,  barricades: 2, radius: "500 m"  },
  vehicle_breakdown: { officers: 2,  barricades: 1, radius: "300 m"  },
  tree_fall:         { officers: 3,  barricades: 2, radius: "500 m"  },
  construction:      { officers: 5,  barricades: 4, radius: "1 km"   },
  congestion:        { officers: 3,  barricades: 0, radius: "1 km"   },
  pot_holes:         { officers: 2,  barricades: 2, radius: "200 m"  },
  debris:            { officers: 2,  barricades: 2, radius: "300 m"  },
  signal_failure:    { officers: 2,  barricades: 0, radius: "200 m"  },
}
const planFor = (cause: string) => PLAN[cause] || { officers: 2, barricades: 1, radius: "—" }

interface ReleaseLog {
  key: string   // unique per entry: id + release timestamp
  id: string
  address: string
  officers: number
  barricades: number
  at: string
}

export default function Resources() {
  const [incidents,   setIncidents]  = useState<Incident[]>([])
  const [resolving,   setResolving]  = useState<string | null>(null)  // incident id being resolved
  const [confirmed,   setConfirmed]  = useState<string | null>(null)  // id awaiting confirmation
  const [released,    setReleased]   = useState<ReleaseLog[]>([])

  const load = useCallback(() => {
    getIncidents("status=active").then(setIncidents).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

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
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium pl-3 sm:pl-0">Incident</th>
                <th className="py-2 font-medium">Location</th>
                <th className="py-2 font-medium text-center">Officers</th>
                <th className="py-2 font-medium text-center">Barricades</th>
                <th className="py-2 font-medium text-center">Radius</th>
                <th className="py-2 font-medium text-right pr-3 sm:pr-0">Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => {
                const p = planFor(inc.event_cause)
                const isConfirming = confirmed === inc.id
                const isResolving  = resolving  === inc.id

                return (
                  <tr
                    key={inc.id}
                    className={`border-b border-gray-50 last:border-0 transition-colors ${isConfirming ? "bg-amber-50" : ""}`}
                  >
                    <td className="py-2.5 pl-3 sm:pl-0">
                      <span className="text-gray-800 capitalize">{inc.event_cause?.replace(/_/g, " ")}</span>
                      {inc.severity_label && (
                        <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          inc.severity_label === "Critical" ? "bg-red-100 text-red-700" :
                          inc.severity_label === "High"     ? "bg-orange-100 text-orange-700" :
                          inc.severity_label === "Medium"   ? "bg-amber-100 text-amber-700" :
                                                              "bg-gray-100 text-gray-500"
                        }`}>{inc.severity_label}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-gray-500 max-w-[180px] truncate">{inc.address}</td>
                    <td className="py-2.5 text-center font-medium">{p.officers}</td>
                    <td className="py-2.5 text-center font-medium">{p.barricades}</td>
                    <td className="py-2.5 text-center text-gray-500">{p.radius}</td>
                    <td className="py-2.5 text-right pr-3 sm:pr-0">
                      {isResolving ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                          Closing…
                        </span>
                      ) : isConfirming ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] text-amber-700">End event &amp; release?</span>
                          <button
                            onClick={() => handleResolve(inc)}
                            className="text-[10px] px-2 py-1 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
                          >
                            Yes, end event
                          </button>
                          <button
                            onClick={() => cancelConfirm(inc.id)}
                            className="text-[10px] px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleResolve(inc)}
                          className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors font-medium"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          End Event
                        </button>
                      )}
                    </td>
                  </tr>
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
