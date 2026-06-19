"use client"
import { useState, useEffect } from "react"
import { getReports, type Report } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

export default function TrackPage() {
  const { t } = useLanguage()
  const [query, setQuery]     = useState("")
  const [reports, setReports] = useState<Report[]>([])

  useEffect(() => { getReports().then(setReports).catch(() => {}) }, [])

  const filtered = query
    ? reports.filter(r => r.tracking_id.toLowerCase().includes(query.toLowerCase()))
    : reports

  const badgeClass = (s: string) => s === "pending" ? "badge-pending" : s === "approved" ? "badge-approved" : "badge-low"

  const STEPS = ["pending", "approved", "resolved"]
  const stepIndex = (s: string) => s === "rejected" ? -1 : STEPS.indexOf(s)

  return (
    <div>
      <h1 className="text-xl font-medium text-gov-900">{t("trk_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t("trk_desc")}</p>

      <div className="flex bg-white border border-gray-300 rounded-xl p-1.5 max-w-md items-center mb-6">
        <span className="px-3 text-gray-400">🔍</span>
        <input className="flex-1 text-sm outline-none" placeholder={t("trk_placeholder")} value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <div className="space-y-3">
        {filtered.map(r => {
          const idx = stepIndex(r.status)
          return (
            <div key={r.id} className="gov-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gov-900">{r.category} — {r.address}</p>
                  <p className="text-[11px] text-gray-400">{r.tracking_id} · {new Date(r.created_at).toLocaleString("en-IN")}</p>
                </div>
                <span className={badgeClass(r.status)}>{r.status}</span>
              </div>
              {r.status === "rejected" ? (
                <p className="text-xs text-red-600">This report was not approved.</p>
              ) : (
                <div className="flex items-center gap-1">
                  {STEPS.map((step, i) => (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        i <= idx ? "bg-gov-500 text-white" : "bg-gray-200 text-gray-400"
                      }`}>{i <= idx ? "✓" : i + 1}</div>
                      {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${i < idx ? "bg-gov-500" : "bg-gray-200"}`} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{t("trk_not_found")}</p>}
      </div>
    </div>
  )
}
