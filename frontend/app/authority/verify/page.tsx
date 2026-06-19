"use client"
import { useEffect, useState } from "react"
import { getReports, verifyReport, type Report } from "@/lib/api"

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-gray-100 text-gray-600",
}

const CATEGORY_SEVERITY: Record<string, string> = {
  "waterlogging": "Medium", "signal failure": "Low", "tree fall": "Medium",
  "accident": "High", "debris": "Critical", "construction": "Medium",
  "vehicle breakdown": "Low", "public event": "High", "protest": "High",
}
const severityBadge = (cat: string) => {
  const label = CATEGORY_SEVERITY[cat.toLowerCase()] ?? "Medium"
  return { label, cls: label === "Critical" ? "badge-critical" : label === "High" ? "badge-high" : label === "Medium" ? "badge-medium" : "badge-low" }
}

export default function VerifyPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [filter, setFilter]   = useState("pending")
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    getReports(filter).then(setReports).catch(() => setReports([])).finally(() => setLoading(false))
  }
  useEffect(load, [filter])

  const act = async (id: string, action: "approve" | "reject") => {
    await verifyReport({ report_id: id, action }).catch(() => {})
    setReports(rs => rs.map(r => r.id === id ? { ...r, status: action === "approve" ? "approved" : "rejected" } : r))
  }

  return (
    <div className="p-3 sm:p-6">
      {/* Header — stacks on mobile, side-by-side on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-base font-medium text-gov-900">Verify citizen reports</h1>
          <p className="text-xs text-gray-400 mt-0.5">Review and approve incoming reports</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["pending", "approved", "rejected"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${filter === s ? "bg-gov-500 text-white border-gov-500" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : reports.length === 0 ? (
        <div className="gov-card p-10 text-center text-xs text-gray-400">No {filter} reports</div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => {
            const sb = severityBadge(r.category)
            return (
              <div key={r.id} className="gov-card p-4">
                {/* Top row — meta + action buttons stack on mobile */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 mb-1">
                      {r.category} — <span className="text-gray-500">{r.address}</span>
                    </p>
                    {/* Badges on their own line so they don't overflow */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      <span className={sb.cls}>{sb.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-1">{r.tracking_id} · {new Date(r.created_at).toLocaleString("en-IN")}</p>
                    <p className="text-xs text-gray-700">{r.description}</p>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2 sm:flex-shrink-0">
                      <button onClick={() => act(r.id, "approve")}
                        className="flex-1 sm:flex-none text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 hover:bg-emerald-100">
                        Approve
                      </button>
                      <button onClick={() => act(r.id, "reject")}
                        className="flex-1 sm:flex-none text-xs px-3 py-1.5 bg-red-50 text-red-700 rounded-lg border border-red-200 hover:bg-red-100">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
