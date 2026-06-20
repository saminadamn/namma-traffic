"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  getIncidentStats, getIncidents, getWeather, getPriorityRanking,
  getCorridorRisk, getPendingReports,
  getCommandCenter, generateDemoData,
  type Incident, type IncidentStats, type Weather, type CorridorRisk, type CommandCenterSummary,
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

const DEMO_ITEMS = [
  { label: "4 accidents",         dot: "bg-red-400" },
  { label: "3 roadblocks",        dot: "bg-amber-400" },
  { label: "4 congestion spikes", dot: "bg-orange-400" },
  { label: "2 emergency calls",   dot: "bg-gov-500" },
]

export default function Dashboard() {
  const [stats,        setStats]        = useState<IncidentStats | null>(null)
  const [incidents,    setIncidents]    = useState<Incident[]>([])
  const [weather,      setWeather]      = useState<Weather | null>(null)
  const [topPriority,  setTopPriority]  = useState<Incident[]>([])
  const [corridors,    setCorridors]    = useState<CorridorRisk[]>([])
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [summary,      setSummary]      = useState<CommandCenterSummary | null>(null)
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null)
  const [demoLoading,  setDemoLoading]  = useState(false)
  const [demoMsg,      setDemoMsg]      = useState("")
  const [demoOk,       setDemoOk]       = useState(false)

  const load = () => {
    getIncidentStats().then(setStats).catch(() => {})
    getIncidents("status=active&limit=6").then(setIncidents).catch(() => {})
    getWeather().then(setWeather).catch(() => {})
    getPriorityRanking(5).then(setTopPriority).catch(() => {})
    getCorridorRisk().then(setCorridors).catch(() => {})
    getPendingReports().then(r => setPendingCount(r.length)).catch(() => {})
    getCommandCenter().then(s => { setSummary(s); setLastRefresh(new Date()) }).catch(() => {})
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const runDemo = async () => {
    setDemoLoading(true); setDemoMsg(""); setDemoOk(false)
    try {
      const r = await generateDemoData()
      setDemoMsg(`Generated ${r.total_created} demo incidents`)
      setDemoOk(true)
      load()
    } catch {
      setDemoMsg("Generation failed — is the backend running?")
      setDemoOk(false)
    } finally {
      setDemoLoading(false)
    }
  }

  const officersPct = summary ? Math.round((summary.officers_available / summary.officers_total) * 100) : 0
  const get = (key: keyof CommandCenterSummary) => summary ? String(summary[key]) : "—"

  const incidentKpis = [
    { label: "Active incidents", value: stats?.active        ?? "—", color: "text-amber-700" },
    { label: "High priority",    value: stats?.high_priority ?? "—", color: "text-red-700"   },
    { label: "Road closures",    value: stats?.road_closures ?? "—", color: "text-red-700"   },
    { label: "Total tracked",    value: stats?.total         ?? "—", color: "text-gov-900"   },
  ]

  const opsKpis = [
    { label: "Predicted Hotspots", value: get("predicted_hotspots"),      color: "text-amber-700"   },
    { label: "Officers Available",  value: get("officers_available"),      color: "text-gov-900"     },
    { label: "Emergency Routes",    value: get("emergency_routes_active"), color: "text-orange-700"  },
    { label: "Advisories Issued",   value: get("advisories_generated"),   color: "text-emerald-700" },
  ]

  return (
    <div className="p-3 sm:p-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <h1 className="text-base font-medium text-gov-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bengaluru Traffic Police · City operations overview</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[11px] text-gray-400 hidden sm:inline">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            Live · 15s
          </span>
        </div>
      </div>

      {/* Alerts */}
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

      {/* Incident KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {incidentKpis.map(k => (
          <div key={k.label} className="gov-card p-4">
            <p className="text-[11px] text-gray-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-medium ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Operations KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {opsKpis.map(k => (
          <div key={k.label} className="gov-card p-4">
            <p className="text-[11px] text-gray-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-medium ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Live incidents + Corridor risk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <span className="text-[10px] text-gray-400">live</span>
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
        </div>
      </div>

      {/* Top priority incidents */}
      <div className="gov-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gov-900">Top priority incidents</p>
          <span className="text-[10px] text-gray-400">severity · congestion · proximity · closure probability</span>
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

      {/* Officer deployment + System status + Demo generator */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">Officer deployment</p>
          {summary ? (
            <>
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Deployed</span>
                  <span className="font-medium text-gray-700">{summary.officers_total - summary.officers_available}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 rounded-full bg-red-400 transition-all" style={{ width: `${100 - officersPct}%` }} />
                </div>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Available</span>
                  <span className="font-medium text-gray-700">{summary.officers_available}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 rounded-full bg-emerald-400 transition-all" style={{ width: `${officersPct}%` }} />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">Updates when events are ended in Resources.</p>
            </>
          ) : <p className="text-xs text-gray-400">Loading…</p>}
        </div>

        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">System status</p>
          <div className="space-y-2.5">
            {[
              ["Incident pipeline",   "Operational"],
              ["Citizen reporting",   "Operational"],
              ["WebSocket broadcast", "Operational"],
              ["ML risk scoring",     "CatBoost active"],
              ["Advisory engine",     "BRE active"],
            ].map(([system, status]) => (
              <div key={system} className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{system}</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="gov-card p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-medium text-gov-900 mb-1">Demo data generator</p>
          <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
            Populates the system with realistic traffic events for the presentation.
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-gray-500 mb-4">
            {DEMO_ITEMS.map(({ label, dot }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          {demoMsg && (
            <p className={`text-[11px] mb-3 px-2.5 py-1.5 rounded-lg border ${
              demoOk
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-red-600 bg-red-50 border-red-100"
            }`}>{demoMsg}</p>
          )}
          <button onClick={runDemo} disabled={demoLoading} className="gov-btn w-full disabled:opacity-50">
            {demoLoading ? "Generating…" : "Generate demo data"}
          </button>
        </div>

      </div>
    </div>
  )
}
