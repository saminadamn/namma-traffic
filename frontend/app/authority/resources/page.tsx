"use client"
import { useEffect, useState } from "react"
import { getIncidents, type Incident } from "@/lib/api"

const PLAN: Record<string, { officers: number; barricades: number; radius: string }> = {
  accident:          { officers: 4, barricades: 3, radius: "1 km" },
  public_event:      { officers: 8, barricades: 6, radius: "3 km" },
  water_logging:     { officers: 3, barricades: 2, radius: "500 m" },
  vehicle_breakdown: { officers: 2, barricades: 1, radius: "300 m" },
  tree_fall:         { officers: 3, barricades: 2, radius: "500 m" },
}

export default function Resources() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  useEffect(() => { getIncidents("status=active").then(setIncidents).catch(() => {}) }, [])

  const totals = incidents.reduce((acc, inc) => {
    const p = PLAN[inc.event_cause] || { officers: 2, barricades: 1, radius: "—" }
    acc.officers += p.officers; acc.barricades += p.barricades
    return acc
  }, { officers: 0, barricades: 0 })

  return (
    <div className="p-6">
      <h1 className="text-base font-medium text-gov-900">Resource allocation</h1>
      <p className="text-xs text-gray-400 mt-0.5 mb-5">Recommended deployment for active incidents</p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Officers needed</p><p className="text-2xl font-medium text-gov-900">{totals.officers}</p></div>
        <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Barricades needed</p><p className="text-2xl font-medium text-gov-900">{totals.barricades}</p></div>
        <div className="gov-card p-4"><p className="text-[11px] text-gray-500 mb-1">Active incidents</p><p className="text-2xl font-medium text-amber-700">{incidents.length}</p></div>
      </div>

      <div className="gov-card p-4">
        <p className="text-sm font-medium text-gov-900 mb-3">Per-incident deployment plan</p>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="py-2 font-medium">Incident</th><th className="py-2 font-medium">Location</th>
            <th className="py-2 font-medium text-center">Officers</th><th className="py-2 font-medium text-center">Barricades</th><th className="py-2 font-medium text-center">Radius</th>
          </tr></thead>
          <tbody>
            {incidents.map(inc => {
              const p = PLAN[inc.event_cause] || { officers: 2, barricades: 1, radius: "—" }
              return (
                <tr key={inc.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 text-gray-800 capitalize">{inc.event_cause?.replace(/_/g, " ")}</td>
                  <td className="py-2.5 text-gray-500">{inc.address}</td>
                  <td className="py-2.5 text-center font-medium">{p.officers}</td>
                  <td className="py-2.5 text-center font-medium">{p.barricades}</td>
                  <td className="py-2.5 text-center text-gray-500">{p.radius}</td>
                </tr>
              )
            })}
            {incidents.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">No active incidents</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
