"use client"
import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts"
import { getAnalytics, type Analytics } from "@/lib/api"

const COLORS = ["#185FA5", "#E24B4A", "#EF9F27", "#1D9E75", "#7F77DD", "#0891b2"]

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  useEffect(() => { getAnalytics().then(setData).catch(() => {}) }, [])
  if (!data) return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="h-5 w-24 bg-gray-100 rounded animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="gov-card p-3 sm:p-4 space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
            <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="gov-card p-4 space-y-3">
          <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
          <div className="h-[200px] bg-gray-50 rounded-lg animate-pulse" />
        </div>
        <div className="gov-card p-4 space-y-3">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-[200px] bg-gray-50 rounded-lg animate-pulse" />
        </div>
        <div className="gov-card p-4 col-span-1 sm:col-span-2 space-y-3">
          <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
          <div className="h-[160px] bg-gray-50 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-3 sm:p-6">
      <h1 className="text-base font-medium text-gov-900 mb-4">Analytics</h1>

      {/* KPI strip — 2 cols on mobile, 4 on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          ["Total incidents", data.total_incidents.toLocaleString()],
          ["High priority",   data.high_priority.toLocaleString()],
          ["Road closures",   data.road_closures],
          ["Active now",      data.active],
        ].map(([l, v]) => (
          <div key={l as string} className="gov-card p-3 sm:p-4">
            <p className="text-[11px] text-gray-500 mb-1">{l}</p>
            <p className="text-xl sm:text-2xl font-medium text-gov-900">{v}</p>
          </div>
        ))}
      </div>

      {/* Charts — 1 col on mobile, 2 on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">Incidents by cause</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.top_causes} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="cause" tick={{ fontSize: 10 }} width={68} tickFormatter={(v: string) => { const s = v.replace(/_/g, " "); return s.length > 9 ? s.slice(0, 8) + "…" : s }} />
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
              <Bar dataKey="count" fill="#185FA5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="gov-card p-4">
          <p className="text-sm font-medium text-gov-900 mb-3">Incidents by zone</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.top_zones} dataKey="count" nameKey="zone" cx="50%" cy="50%" outerRadius={75}
                label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {data.top_zones.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly trend — full width on all sizes */}
        <div className="gov-card p-4 col-span-1 sm:col-span-2">
          <p className="text-sm font-medium text-gov-900 mb-3">Monthly trend</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data.monthly_trend}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#185FA5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
