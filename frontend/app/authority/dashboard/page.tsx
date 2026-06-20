"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  getIncidentStats, getIncidents, getWeather, getPriorityRanking,
  getCorridorRisk, getPendingReports,
  type Incident, type IncidentStats, type Weather, type CorridorRisk,
} from "@/lib/api"

function corridorColor(risk: number): string {
  if (risk >= 75) return "#E24B4A"
  if (risk >= 50) return "#EF9F27"
  return "#1D9E75"
}

const badge = (p: string) => p === "High" ? "badge-critical" : "badge-low"
const severityBadge = (s?: string | null) =>
  s === "Critical" ? "badge-critical" : s === "High" ? "badge-high" : s === "Medium" ? "badge-medium" : "badge-low"
const dot = (p: string, status: string) =>
  status !== "active" ? "#1D9E75" : p === "High" ? "#E24B4A" : "#EF9F27"

export default function Dashboard() {
  const [stats,       setStats]       = useState<IncidentStats | null>(null)
  const [incidents,   setIncidents]   = useState<Incident[]>([])
  const [weather,     setWeather]     = useState<Weather | null>(null)
  const [topPriority, setTopPriority] = useState<Incident[]>([])
  const [corridors,   setCorridors]   = useState<CorridorRisk[]>([])
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => {
    getIncidentStats().then(setStats).catch(() => {})
    getIncidents("limit=6").then(setIncidents).catch(() => {})
    getWeather().then(setWeather).catch(() => {})
    getPriorityRanking(5).then(setTopPriority).catch(() => {})
    getCorridorRisk().then(setCorridors).catch(() => {})
    getPendingReports().then(r => setPendingCount(r.length)).catch(() => {})
  }, [])

  const kpis = [
    { label: "Active incidents", value: stats?.active ?? "—",        color: "text-amber-700" },
    { label: "High priority",    value: stats?.high_priority ?? "—", color: "text-red-700"   },
    { label: "Road closures",    value: stats?.road_closures ?? "—", color: "text-red-700"   },
    { label: "Total tracked",    value: stats?.total ?? "—",         color: "text-gov-900"   },
  ]

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <h1 className="text-base font-medium text-gov-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bengaluru Traffic Police · Live operations</p>
        </div>
        <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Live
        </span>
      </div>

      {weather?.monsoon_alert && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          IMD alert: {weather.max_rain_24h_mm}mm rain in 24h — waterlogging risk flagged.
        </div>
      )}

      {pendingCount !== null && pendingCount > 0 && (
        <Link
          href="/authority/verify"
          className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 hover:bg-amber-100 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {pendingCount}
            </span>
            <p className="text-xs font-medium text-amber-800">
              {pendingCount} citizen report{pendingCount !== 1 ? "s" : ""} awaiting verification
            </p>
          </div>
          <span className="text-[11px] text-amber-600 group-hover:underline">Review queue →</span>
        </Link>
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gov-900">Risk by corridor</p>
            <span className="text-[10px] text-gray-400">live · active incidents</span>
          </div>
          {corridors.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No active incidents by corridor</p>
          ) : corridors.map(c => (
            <div key={c.name} className="mb-3">
              <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                <span>{c.name}</span>
                <span className="font-medium" style={{ color: corridorColor(c.risk) }}>{c.risk}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded">
                <div className="h-1.5 rounded transition-all duration-700" style={{ width: `${c.risk}%`, background: corridorColor(c.risk) }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{c.count} active incident{c.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 mt-1 text-[11px] space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Clean model AUC</span><span className="text-emerald-700 font-medium">0.7841</span></div>
          </div>
        </div>
      </div>

      <div className="gov-card p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gov-900">Top priority incidents</p>
          <span className="text-[10px] text-gray-400">severity · congestion · proximity · ML closure probability</span>
        </div>
        {topPriority.length === 0 ? <p className="text-xs text-gray-400">No active incidents to rank.</p> : (
          <div className="space-y-2">
            {topPriority.map((inc, i) => (
              <div key={inc.id} className="flex items-center gap-3 py-1.5">
                <span className="w-5 h-5 rounded-full bg-gov-50 text-gov-600 text-[11px] font-medium flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{inc.address}</p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {inc.zone} · impact {inc.congestion_impact_score}%
                    {inc.closure_probability != null && ` · closure ${Math.round((inc.closure_probability as number) * 100)}%`}
                  </p>
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
