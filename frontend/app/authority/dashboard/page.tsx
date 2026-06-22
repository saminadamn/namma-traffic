"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  getIncidentStats, getWeather, getPriorityRanking, getPendingReports,
  getCommandCenter, generateDemoData,
  type Incident, type IncidentStats, type Weather, type CommandCenterSummary,
} from "@/lib/api"

const severityBadge = (s?: string | null) =>
  s === "Critical" ? "badge-critical" : s === "High" ? "badge-high" : s === "Medium" ? "badge-medium" : "badge-low"

const DEMO_ITEMS = [
  { label: "4 accidents",         dot: "bg-red-400" },
  { label: "3 roadblocks",        dot: "bg-amber-400" },
  { label: "4 congestion spikes", dot: "bg-orange-400" },
  { label: "2 emergency calls",   dot: "bg-gov-500" },
]

export default function Dashboard() {
  const [stats,        setStats]        = useState<IncidentStats | null>(null)
  const [weather,      setWeather]      = useState<Weather | null>(null)
  const [topPriority,  setTopPriority]  = useState<Incident[]>([])
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [summary,      setSummary]      = useState<CommandCenterSummary | null>(null)
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null)
  const [demoLoading,  setDemoLoading]  = useState(false)
  const [demoMsg,      setDemoMsg]      = useState("")
  const [demoOk,       setDemoOk]       = useState(false)
  const [apiError,     setApiError]     = useState(false)

  const load = () => {
    setApiError(false)
    getIncidentStats().then(setStats).catch(() => setApiError(true))
    getWeather().then(setWeather).catch(() => {})
    getPriorityRanking(5).then(setTopPriority).catch(() => {})
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

      {/* API error banner */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-xs text-red-700 flex items-center justify-between gap-3">
          <span>Backend unreachable — start the FastAPI server to load live data.</span>
          <button onClick={load} className="flex-shrink-0 text-red-600 hover:underline font-medium">Retry</button>
        </div>
      )}

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

      {/* AI Recommendation card */}
      {topPriority.length > 0 && (() => {
        const top = topPriority[0]
        const risk = top.closure_probability != null ? Math.round((top.closure_probability as number) * 100) : null
        const officers = top.severity_label === "Critical" ? 4 : top.severity_label === "High" ? 3 : 2
        return (
          <div className="border border-gov-200 bg-gov-50 rounded-xl p-4 mb-4 flex items-start gap-3">
            <span className="text-gov-400 text-sm flex-shrink-0 mt-0.5">◈</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-gov-600 uppercase tracking-wider mb-0.5">Priority Alert</p>
              <p className="text-sm font-medium text-gov-900 truncate">
                {top.address.split(",")[0]} — immediate attention required
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {top.severity_label} severity · {top.congestion_impact_score}% congestion impact
                {risk !== null ? ` · ${risk}% road closure probability` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[11px] text-gov-700 font-medium bg-white border border-gov-200 px-2.5 py-0.5 rounded-full">
                  Deploy {officers} officers
                </span>
                {risk !== null && risk > 55 && (
                  <span className="text-[11px] text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    Activate advisory
                  </span>
                )}
                {top.severity_label === "Critical" && (
                  <span className="text-[11px] text-red-700 font-medium bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
                    Stage barricades
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* Quantified impact footer */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {[
            { label: "Incidents logged",      value: String(stats.total ?? 0),                            sub: "since deployment"    },
            { label: "Road closures managed", value: String(stats.road_closures ?? 0),                   sub: "requiring diversion" },
            { label: "Commuters warned",      value: `~${((stats.active ?? 0) * 350).toLocaleString()}`, sub: "via live advisories" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="gov-card p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
              <p className="text-lg font-semibold text-gov-900">{value}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Demo data generator — collapsed under Admin Tools */}
      <details className="group">
        <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 select-none w-fit mb-3">
          <span className="inline-block transition-transform duration-200 group-open:rotate-90">▶</span>
          Admin Tools
        </summary>
        <div className="gov-card p-4 max-w-sm">
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
      </details>

    </div>
  )
}
