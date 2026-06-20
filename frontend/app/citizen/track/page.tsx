"use client"
import { useState, useEffect } from "react"
import { getReports, type Report } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

export default function TrackPage() {
  const { t } = useLanguage()
  const [query, setQuery]     = useState("")
  const [reports, setReports] = useState<Report[]>([])

  useEffect(() => {
    const fetchReports = () => getReports().then(setReports).catch(() => {})
    fetchReports()
    // Poll every 8 s so status updates (pending → approved → resolved) appear live
    const t = setInterval(fetchReports, 8000)
    return () => clearInterval(t)
  }, [])

  const filtered = query
    ? reports.filter(r => r.tracking_id.toLowerCase().includes(query.toLowerCase()))
    : reports

  const STATUS_LABEL: Record<string, string> = {
    pending:  "Pending",
    approved: "Approved",
    resolved: "Resolved",
    rejected: "Rejected",
  }

  const STATUS_BADGE: Record<string, string> = {
    pending:  "bg-amber-50 text-amber-700 border border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    rejected: "bg-red-50 text-red-600 border border-red-200",
  }

  // pending=0, approved=1, resolved=2, rejected=-1
  const STEPS: { key: string; label: string }[] = [
    { key: "pending",  label: "Submitted" },
    { key: "approved", label: "Approved"  },
    { key: "resolved", label: "Resolved"  },
  ]
  const stepIndex = (s: string) =>
    s === "rejected" ? -1 : STEPS.findIndex(st => st.key === s)

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-5 py-5">
      <h1 className="text-xl font-semibold text-gov-900">{t("trk_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">{t("trk_desc")}</p>

      {/* Search */}
      <div className="flex bg-white border border-gray-200 rounded-xl p-1.5 max-w-md items-center mb-5 shadow-sm">
        <svg className="w-4 h-4 text-gray-400 mx-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          className="flex-1 text-sm outline-none bg-transparent py-1"
          placeholder={t("trk_placeholder")}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map(r => {
          const idx = stepIndex(r.status)
          const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending

          return (
            <div key={r.id} className="gov-card p-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gov-900 truncate">
                    {r.category} — {r.address}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {r.tracking_id} · {new Date(r.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>

              {/* Stepper */}
              {r.status === "rejected" ? (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  This report was not approved by authorities.
                </p>
              ) : (
                <div className="flex items-center gap-0">
                  {STEPS.map((step, i) => {
                    const done    = i <= idx
                    const current = i === idx
                    return (
                      <div key={step.key} className="flex items-center flex-1 last:flex-none">
                        {/* Circle */}
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                            done
                              ? "bg-emerald-500 text-white"
                              : "bg-gray-100 text-gray-400"
                          } ${current ? "ring-2 ring-emerald-200 ring-offset-1" : ""}`}>
                            {done
                              ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              : <span>{i + 1}</span>
                            }
                          </div>
                          <span className={`text-[9px] font-medium whitespace-nowrap ${
                            done ? "text-emerald-600" : "text-gray-400"
                          }`}>
                            {step.label}
                          </span>
                        </div>

                        {/* Connector line */}
                        {i < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mb-4 mx-1 transition-colors ${
                            i < idx ? "bg-emerald-500" : "bg-gray-200"
                          }`} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">{t("trk_not_found")}</p>
        )}
      </div>
    </div>
  )
}
