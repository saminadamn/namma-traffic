"use client"
import { useEffect, useState } from "react"
import { getCommandCenter, generateDemoData, type CommandCenterSummary } from "@/lib/api"

const CARD_CFG = [
  { key: "active_incidents",      label: "Active Incidents",       icon: "⚠",  color: "text-red-700",     bg: "bg-red-50"  },
  { key: "predicted_hotspots",    label: "Predicted Hotspots",     icon: "◉",  color: "text-amber-700",   bg: "bg-amber-50" },
  { key: "officers_available",    label: "Officers Available",     icon: "✦",  color: "text-gov-900",     bg: "bg-gov-50" },
  { key: "emergency_routes_active", label: "Emergency Routes",     icon: "⛌", color: "text-orange-700",  bg: "bg-orange-50" },
  { key: "advisories_generated",  label: "AI Advisories",          icon: "✉",  color: "text-emerald-700", bg: "bg-emerald-50" },
] as const

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 mr-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-50`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  )
}

export default function CommandCenter() {
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoMsg, setDemoMsg] = useState("")
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = () =>
    getCommandCenter().then(s => { setSummary(s); setLastRefresh(new Date()) }).catch(() => {})

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const runDemo = async () => {
    setDemoLoading(true); setDemoMsg("")
    try {
      const r = await generateDemoData()
      setDemoMsg(`✓ Generated ${r.total_created} demo incidents — refresh to see them live`)
      load()
    } catch { setDemoMsg("Demo data generation failed — is the backend running?") }
    finally { setDemoLoading(false) }
  }

  const get = (key: keyof CommandCenterSummary) => summary ? String(summary[key]) : "—"
  const officersPct = summary ? Math.round((summary.officers_available / summary.officers_total) * 100) : 0

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <h1 className="text-base font-medium text-gov-900">Executive command center</h1>
          <p className="text-xs text-gray-400 mt-0.5">Bengaluru Traffic Police · City operations overview</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[11px] text-gray-400 hidden sm:inline">
              Last refresh {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center">
            <PulsingDot color="bg-emerald-500" />Live · 15s
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {CARD_CFG.map(({ key, label, icon, color, bg }) => (
          <div key={key} className={`gov-card p-3 sm:p-4 ${bg} border-0`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] sm:text-[11px] text-gray-500 leading-tight">{label}</p>
              <span className="text-base sm:text-lg">{icon}</span>
            </div>
            <p className={`text-2xl sm:text-3xl font-medium ${color}`}>{get(key as keyof CommandCenterSummary)}</p>
            {key === "officers_available" && summary && (
              <div className="mt-2">
                <div className="h-1 bg-white/60 rounded">
                  <div className="h-1 rounded bg-gov-500" style={{ width: `${officersPct}%` }} />
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{officersPct}% of {summary.officers_total}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Control room bottom section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* System status */}
        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">System status</p>
          <div className="space-y-2.5">
            {[
              ["Incident pipeline",   "Operational",     true],
              ["Citizen reporting",   "Operational",     true],
              ["WebSocket broadcast", "Operational",     true],
              ["ML risk scoring",     "CatBoost ML",     true],
              ["Advisory engine",     "BRE Operational", true],
            ].map(([system, status, ok]) => (
              <div key={system as string} className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{system}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Officer roster */}
        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">Officer deployment</p>
          {summary ? (
            <>
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Deployed (estimated)</span>
                  <span className="font-medium">{summary.officers_total - summary.officers_available}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded">
                  <div className="h-2 rounded bg-red-400" style={{ width: `${100 - officersPct}%` }} />
                </div>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Available</span>
                  <span className="font-medium">{summary.officers_available}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded">
                  <div className="h-2 rounded bg-emerald-400" style={{ width: `${officersPct}%` }} />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-3">Deployment estimated from active-incident severity. Not a real HR/roster integration.</p>
            </>
          ) : <p className="text-xs text-gray-400">Loading…</p>}
        </div>

        {/* Demo data generator */}
        <div className="gov-card p-4 sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-medium text-gov-900 mb-1">Demo data generator</p>
          <p className="text-[11px] text-gray-400 mb-4">One click populates the system with realistic traffic events for the demo presentation.</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 mb-4">
            {[["4 accidents", "⛑"], ["3 roadblocks", "⛧"], ["4 congestion spikes", "↑"], ["2 emergency calls", "🔴"]].map(([l, ic]) => (
              <div key={l} className="flex items-center gap-1.5"><span>{ic}</span><span>{l}</span></div>
            ))}
          </div>
          {demoMsg && (
            <p className={`text-[11px] mb-3 ${demoMsg.startsWith("✓") ? "text-emerald-700" : "text-red-600"}`}>{demoMsg}</p>
          )}
          <button onClick={runDemo} disabled={demoLoading} className="gov-btn w-full">
            {demoLoading ? "Generating…" : "⚡ Generate demo data"}
          </button>
          <p className="text-[10px] text-gray-400 mt-2 text-center">Runs through real dedup, severity scoring & WebSocket broadcast</p>
        </div>
      </div>
    </div>
  )
}
