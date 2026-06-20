"use client"
import { useEffect, useState } from "react"
import { getCommandCenter, generateDemoData, type CommandCenterSummary } from "@/lib/api"

const CARD_CFG = [
  { key: "active_incidents",        label: "Active Incidents",   color: "text-red-700",     bg: "bg-red-50",     border: "border-red-100" },
  { key: "predicted_hotspots",      label: "Predicted Hotspots", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-100" },
  { key: "officers_available",      label: "Officers Available", color: "text-gov-900",     bg: "bg-gov-50",     border: "border-gov-100" },
  { key: "emergency_routes_active", label: "Emergency Routes",   color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-100" },
  { key: "advisories_generated",    label: "Advisories Issued",  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
] as const

const CARD_ICONS: Record<string, React.ReactNode> = {
  active_incidents: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  predicted_hotspots: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  officers_available: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  emergency_routes_active: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  ),
  advisories_generated: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
}

const DEMO_ITEMS = [
  { label: "4 accidents",         dot: "bg-red-400" },
  { label: "3 roadblocks",        dot: "bg-amber-400" },
  { label: "4 congestion spikes", dot: "bg-orange-400" },
  { label: "2 emergency calls",   dot: "bg-gov-500" },
]

export default function CommandCenter() {
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoMsg, setDemoMsg]     = useState("")
  const [demoOk,  setDemoOk]     = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = () =>
    getCommandCenter().then(s => { setSummary(s); setLastRefresh(new Date()) }).catch(() => {})

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
  const officersPct = summary ? Math.round((summary.officers_available / summary.officers_total) * 100) : 0

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <h1 className="text-base font-medium text-gov-900">Executive command center</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bengaluru Traffic Police · City operations overview</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[11px] text-gray-400 hidden sm:inline">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            Live · 15s
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {CARD_CFG.map(({ key, label, color, bg, border }) => (
          <div key={key} className={`gov-card p-3 sm:p-4 ${bg} ${border}`}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] sm:text-[11px] text-gray-500 leading-tight">{label}</p>
              <span className={color}>{CARD_ICONS[key]}</span>
            </div>
            <p className={`text-2xl sm:text-3xl font-medium ${color}`}>{get(key as keyof CommandCenterSummary)}</p>
            {key === "officers_available" && summary && (
              <div className="mt-2">
                <div className="h-1 bg-white/60 rounded">
                  <div className="h-1 rounded bg-gov-500 transition-all" style={{ width: `${officersPct}%` }} />
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{officersPct}% of {summary.officers_total}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* System status */}
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

        {/* Officer deployment */}
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
              <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                Estimated from active-incident severity scores. Not a live HR integration.
              </p>
            </>
          ) : <p className="text-xs text-gray-400">Loading…</p>}
        </div>

        {/* Demo data generator */}
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
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Runs through real dedup, severity scoring &amp; WebSocket broadcast
          </p>
        </div>

      </div>
    </div>
  )
}
