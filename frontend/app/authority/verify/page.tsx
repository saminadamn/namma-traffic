"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { getPendingReports, verifyReport, getReports, type Report } from "@/lib/api"

// Derive consistent 4-level label from raw risk_score using the same
// thresholds as severity_service.py (30 / 55 / 75) so the verify page
// matches incident labels. "Moderate" from the old BRE is renamed "Medium".
function severityLabel(score: number | null | undefined): string {
  if (score == null) return "Low"
  if (score < 30) return "Low"
  if (score < 55) return "Medium"
  if (score < 75) return "High"
  return "Critical"
}

// CatBoost priority_probability → binary label
function mlPriorityLabel(pp: number | null | undefined): string | null {
  if (pp == null) return null
  return pp >= 0.5 ? "High" : "Low"
}

const BAND_BG: Record<string, string> = {
  Low:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium:   "bg-amber-50 text-amber-700 border-amber-200",
  High:     "bg-orange-50 text-orange-700 border-orange-200",
  Critical: "bg-red-50 text-red-700 border-red-200",
  Moderate: "bg-amber-50 text-amber-700 border-amber-200", // legacy fallback
}
const BAND_BORDER: Record<string, string> = {
  Low: "border-l-emerald-500", Medium: "border-l-amber-500",
  High: "border-l-orange-500", Critical: "border-l-red-500",
  Moderate: "border-l-amber-500",
}
const BAND_NUM: Record<string, string> = {
  Low: "text-emerald-700", Medium: "text-amber-700",
  High: "text-orange-700", Critical: "text-red-700",
  Moderate: "text-amber-700",
}
const BAND_BAR: Record<string, string> = {
  Low: "bg-emerald-500", Medium: "bg-amber-500",
  High: "bg-orange-500", Critical: "bg-red-500",
  Moderate: "bg-amber-500",
}

function StatusPill({ status }: { status: string }) {
  const cfg =
    status === "pending"  ? "bg-amber-50 text-amber-700 border-amber-200" :
    status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            "bg-gray-100 text-gray-500 border-gray-200"
  const label =
    status === "pending"  ? "Awaiting verification" :
    status === "approved" ? "Verified" : "Rejected"
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg}`}>{label}</span>
  )
}

export default function ReportsQueuePage() {
  const [pending,    setPending]    = useState<Report[]>([])
  const [verified,   setVerified]   = useState<Report[]>([])
  const [tab,        setTab]        = useState<"pending" | "verified">("pending")
  const [loading,    setLoading]    = useState(true)
  const [verifying,  setVerifying]  = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const [p, v] = await Promise.all([
        getPendingReports(),
        getReports("approved"),
      ])
      setPending(p)
      setVerified(v)
    } catch { /* keep stale data */ }
    finally { if (showSpinner) setLoading(false) }
  }, [])

  const reload = useCallback(() => fetchData(true), [fetchData])

  // Track verifying ref so the interval can skip refresh during active action
  const verifyingRef = useRef<string | null>(null)

  useEffect(() => {
    fetchData(true)
    const t = setInterval(() => {
      if (!verifyingRef.current) fetchData(false) // silent background refresh
    }, 10000)
    return () => clearInterval(t)
  }, [fetchData])

  const act = async (report: Report, action: "approve" | "reject") => {
    setVerifying(report.id)
    setActionError(null)
    setLastSuccess(null)
    verifyingRef.current = report.id
    try {
      await verifyReport({ report_id: report.id, action })
      setLastSuccess(action === "approve" ? "Report verified — incident created" : "Report rejected")
      await fetchData(true)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Verification failed — please try again")
    } finally {
      setVerifying(null)
      verifyingRef.current = null
    }
  }

  const displayed = tab === "pending" ? pending : verified

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold text-gov-900">Reports queue</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Citizen reports sorted by ML risk score — verify to promote to active incident
          </p>
        </div>
        <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live · 10s
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {([
          { key: "pending",  label: "Awaiting verification", count: pending.length,  active: "bg-amber-500 text-white",   badge: "bg-white/20 text-white" },
          { key: "verified", label: "Verified",              count: verified.length, active: "bg-emerald-600 text-white", badge: "bg-white/20 text-white" },
        ] as const).map(({ key, label, count, active, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === key ? active : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
              tab === key ? badge : "bg-gray-100 text-gray-600"
            }`}>{count}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={reload}
          className="text-[11px] text-gray-400 hover:text-gov-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg">
          <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span><strong>Verification failed:</strong> {actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto flex-shrink-0 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {lastSuccess && (
        <div className="mb-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2.5 rounded-lg">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{lastSuccess}</span>
          <button onClick={() => setLastSuccess(null)} className="ml-auto flex-shrink-0 text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {loading && (
          <div className="gov-card p-10 text-center">
            <span className="w-5 h-5 border-2 border-gov-400 border-t-transparent rounded-full animate-spin inline-block" />
            <p className="text-xs text-gray-400 mt-2">Loading…</p>
          </div>
        )}

        {!loading && displayed.length === 0 && (
          <div className="gov-card p-10 text-center border-dashed">
            <p className="text-xs text-gray-500 font-medium">
              {tab === "pending" ? "No pending reports" : "No verified reports yet"}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {tab === "pending"
                ? "All citizen reports have been reviewed."
                : "Approve a pending report to see it here."}
            </p>
          </div>
        )}

        {!loading && displayed.map((r, idx) => {
          const hasScore    = r.risk_score != null
          // Derive severity label from risk_score using same thresholds as severity_service.py
          const band        = severityLabel(r.risk_score)
          const mlPriority  = mlPriorityLabel(r.priority_probability)
          const closurePct  = r.closure_probability != null ? Math.round(r.closure_probability * 100) : null
          const isActioning = verifying === r.id
          // Sequential index per tab (R1, R2…)
          const token       = `R${idx + 1}`

          return (
            <div
              key={r.id}
              className={`gov-card p-4 border-l-4 ${hasScore ? (BAND_BORDER[band] || "border-l-gray-200") : "border-l-gray-200"}`}
            >
              <div className="flex items-start gap-4">
                {/* Left: report info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {/* Sequential token */}
                    <span className="text-[10px] font-bold text-gov-700 bg-gov-50 border border-gov-200 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                      {token}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">{r.tracking_id}</span>
                    <span className="text-[10px] text-gray-300">·</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {!hasScore && tab === "pending" && (
                      <span className="text-[10px] text-gray-400 italic">· Scoring in progress</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-gray-900 capitalize">
                    {r.category?.replace(/_/g, " ")}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{r.address}</p>
                  {r.description && (
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{r.description}</p>
                  )}
                </div>

                {/* Middle: ML scores */}
                <div className="flex-shrink-0 text-right space-y-1.5 min-w-[130px]">
                  {hasScore ? (
                    <>
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden w-16">
                          <div
                            className={`h-full rounded-full ${BAND_BAR[band] || "bg-gray-400"}`}
                            style={{ width: `${r.risk_score}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${BAND_NUM[band] || "text-gray-600"}`}>
                          {r.risk_score}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] text-gray-400">Closure</span>
                        <span className={`text-[10px] font-semibold ${(closurePct ?? 0) > 50 ? "text-red-600" : "text-emerald-600"}`}>
                          {closurePct != null ? `${closurePct}%` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border inline-block ${BAND_BG[band] || "bg-gray-50 text-gray-500 border-gray-200"}`}>
                          {band}
                        </span>
                        {mlPriority && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border inline-block ${
                            mlPriority === "High"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-gray-50 text-gray-500 border-gray-200"
                          }`}>
                            {mlPriority} priority
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-[10px] text-gray-400 italic">Scoring…</span>
                  )}
                </div>

                {/* Right: action buttons or status */}
                <div className="flex-shrink-0 flex flex-col items-end justify-center gap-1.5 min-w-[100px]">
                  {tab === "pending" ? (
                    <>
                      <button
                        onClick={() => act(r, "approve")}
                        disabled={!!verifying}
                        className="w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {isActioning ? "…" : "✓ Approve"}
                      </button>
                      <button
                        onClick={() => act(r, "reject")}
                        disabled={!!verifying}
                        className="w-full text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {isActioning ? "…" : "Reject"}
                      </button>
                    </>
                  ) : (
                    <StatusPill status={r.status} />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!loading && tab === "pending" && pending.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Sorted highest risk first · verifying a report creates a live incident on the map
        </p>
      )}
    </div>
  )
}
