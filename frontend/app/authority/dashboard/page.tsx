"use client"
import { useEffect, useState } from "react"
import { getIncidentStats, getIncidents, getWeather, getPriorityRanking, type Incident, type IncidentStats, type Weather } from "@/lib/api"

const CORRIDORS = [
  { name: "Hosur Road", risk: 87, color: "#E24B4A" },
  { name: "ORR North", risk: 71, color: "#EF9F27" },
  { name: "Bellary Road", risk: 64, color: "#EF9F27" },
  { name: "Mysore Road", risk: 42, color: "#1D9E75" },
]

const badge = (p: string) => p === "High" ? "badge-critical" : "badge-low"
const severityBadge = (s?: string | null) =>
  s === "Critical" ? "badge-critical" : s === "High" ? "badge-high" : s === "Medium" ? "badge-medium" : "badge-low"
const dot = (p: string, status: string) =>
  status !== "active" ? "#1D9E75" : p === "High" ? "#E24B4A" : "#EF9F27"

export default function Dashboard() {
  const [stats, setStats] = useState<IncidentStats | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [weather, setWeather] = useState<Weather | null>(null)
  const [topPriority, setTopPriority] = useState<Incident[]>([])

  useEffect(() => {
    getIncidentStats().then(setStats).catch(() => {})
    getIncidents("limit=6").then(setIncidents).catch(() => {})
    getWeather().then(setWeather).catch(() => {})
    getPriorityRanking(5).then(setTopPriority).catch(() => {})
  }, [])

  const kpis = [
    { label: "Active incidents", value: stats?.active ?? "—", color: "text-amber-700" },
    { label: "High priority", value: stats?.high_priority ?? "—", color: "text-red-700" },
    { label: "Road closures", value: stats?.road_closures ?? "—", color: "text-red-700" },
    { label: "Total tracked", value: stats?.total ?? "—", color: "text-gov-900" },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-medium text-gov-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bengaluru Traffic Police · Live operations</p>
        </div>
        <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Live
        </span>
      </div>

      {weather?.monsoon_alert && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex gap-2">
          <span>⚠️</span><span>IMD alert: {weather.max_rain_24h_mm}mm rain in 24h — waterlogging risk flagged.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="gov-card p-4">
            <p className="text-[11px] text-gray-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-medium ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">Live incidents</p>
          {incidents.length === 0 ? <p className="text-xs text-gray-400">Connecting to API…</p> :
            incidents.map(inc => (
              <div key={inc.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: dot(inc.priority, inc.status) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{inc.event_cause?.replace(/_/g, " ")} — {inc.address}</p>
                  <p className="text-[11px] text-gray-400">{inc.zone} · {inc.corridor}</p>
                </div>
                {inc.severity_label && <span className={severityBadge(inc.severity_label)}>{inc.severity_label}</span>}
                <span className={inc.status !== "active" ? "badge-resolved" : badge(inc.priority)}>
                  {inc.status !== "active" ? "Resolved" : inc.priority === "High" ? "Critical" : "Active"}
                </span>
              </div>
            ))}
        </div>

        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">Risk by corridor</p>
          {CORRIDORS.map(c => (
            <div key={c.name} className="mb-3">
              <div className="flex justify-between text-[11px] text-gray-500 mb-1"><span>{c.name}</span><span>{c.risk}</span></div>
              <div className="h-1.5 bg-gray-100 rounded"><div className="h-1.5 rounded" style={{ width: `${c.risk}%`, background: c.color }} /></div>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 mt-3 text-[11px] space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Clean model AUC</span><span className="text-emerald-700 font-medium">0.7841</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Leaky AUC</span><span className="text-red-500">0.9967 ✗</span></div>
          </div>
        </div>
      </div>

      <div className="gov-card p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gov-900">Top priority incidents</p>
          <span className="text-[10px] text-gray-400">severity × congestion impact × emergency proximity</span>
        </div>
        {topPriority.length === 0 ? <p className="text-xs text-gray-400">No active incidents to rank.</p> : (
          <div className="space-y-2">
            {topPriority.map((inc, i) => (
              <div key={inc.id} className="flex items-center gap-3 py-1.5">
                <span className="w-5 h-5 rounded-full bg-gov-50 text-gov-600 text-[11px] font-medium flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{inc.address}</p>
                  <p className="text-[11px] text-gray-400">{inc.zone} · congestion impact {inc.congestion_impact_score}% · emergency proximity {inc.emergency_proximity_score}%</p>
                </div>
                {inc.severity_label && <span className={severityBadge(inc.severity_label)}>{inc.severity_label}</span>}
                <span className="text-sm font-medium text-gov-900 w-12 text-right">{inc.priority_score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
