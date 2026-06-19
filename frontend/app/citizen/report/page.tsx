"use client"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { submitReport, getReports, type Report } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

const CATEGORIES = [
  { label: "Accident",      icon: "🚗" },
  { label: "Waterlogging",  icon: "💧" },
  { label: "Tree fall",     icon: "🌳" },
  { label: "Breakdown",     icon: "🔧" },
  { label: "Signal failure",icon: "🚦" },
  { label: "Obstruction",   icon: "🚧" },
]

export default function ReportPage() {
  const { t } = useLanguage()
  const [category, setCategory] = useState("Accident")
  const [description, setDesc]   = useState("")
  const [address, setAddress]    = useState("")
  const [lat, setLat]            = useState("12.9716")
  const [lon, setLon]            = useState("77.5946")
  const [loading, setLoading]    = useState(false)
  const [trackingId, setTracking]= useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [recent, setRecent]      = useState<Report[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { getReports().then(r => setRecent(r.slice(0, 3))).catch(() => {}) }, [trackingId])

  const submit = async () => {
    if (!description || !address) return
    setLoading(true)
    setSubmitError(null)
    try {
      const fd = new FormData()
      fd.append("category", category); fd.append("description", description)
      fd.append("address", address); fd.append("latitude", lat); fd.append("longitude", lon)
      if (fileRef.current?.files?.[0]) fd.append("photo", fileRef.current.files[0])
      const res = await submitReport(fd)
      if (!res.tracking_id) throw new Error("No tracking ID in response")
      setTracking(res.tracking_id)
    } catch {
      setSubmitError("Submission failed — is the backend running? Check your connection and try again.")
    } finally { setLoading(false) }
  }

  const badgeClass = (s: string) => s === "pending" ? "badge-pending" : s === "approved" ? "badge-approved" : "badge-low"

  return (
    <div>
      <h1 className="text-xl font-medium text-gov-900">{t("rpt_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t("rpt_desc")}</p>

      {trackingId ? (
        <div className="gov-card p-10 text-center border-emerald-200 bg-emerald-50">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm font-medium text-emerald-800">{t("rpt_success_title")}</p>
          <p className="text-2xl font-medium text-emerald-700 mt-2 tracking-wider">{trackingId}</p>
          <p className="text-xs text-emerald-600 mt-1">{t("rpt_tracking_label")}</p>
          <button onClick={() => { setTracking(null); setDesc(""); setAddress(""); setSubmitError(null) }} className="gov-btn-outline mt-6">{t("rpt_submit")}</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 gov-card p-5 space-y-4">
            <div>
              <p className="gov-label">{t("rpt_category")}</p>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(c => (
                  <button key={c.label} onClick={() => setCategory(c.label)}
                    className={`py-3 px-2 rounded-lg border text-center transition-colors ${
                      category === c.label ? "border-gov-500 bg-gov-50" : "border-gray-200 hover:bg-gray-50"
                    }`}>
                    <div className="text-xl">{c.icon}</div>
                    <p className={`text-[11px] mt-1 ${category === c.label ? "text-gov-600 font-medium" : "text-gray-600"}`}>{c.label}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="gov-label">{t("rpt_address")}</label>
              <LocationPicker lat={lat} lon={lon} onPick={(la, lo, addr) => {
                setLat(la); setLon(lo); if (addr) setAddress(addr)
              }} />
              <input className="gov-input mt-2" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="Junction name or landmark…" />
              <p className="text-[10px] text-gray-400 mt-1">Coords: {lat}, {lon}</p>
            </div>
            <div>
              <label className="gov-label">{t("rpt_description")}</label>
              <textarea className="gov-input h-20 resize-none" value={description} onChange={e => setDesc(e.target.value)} placeholder={t("rpt_desc_placeholder")} />
            </div>
            <div>
              <label className="gov-label">{t("rpt_photo")}</label>
              <div onClick={() => fileRef.current?.click()} className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:bg-gray-50">
                <div className="text-2xl text-gray-300">📷</div>
                <p className="text-xs text-gray-400 mt-1">{t("rpt_photo")}</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" />
              </div>
            </div>
            {submitError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">{submitError}</div>
            )}
            <button onClick={submit} disabled={loading || !description || !address} className="gov-btn w-full disabled:opacity-50">
              {loading ? t("rpt_submitting") : t("rpt_submit")}
            </button>
          </div>

          <div className="space-y-4">
            <div className="gov-card p-4">
              <p className="text-xs font-medium text-gov-900 mb-3">My recent reports</p>
              {recent.length === 0 ? <p className="text-xs text-gray-400">No reports yet</p> :
                recent.map(r => (
                  <div key={r.id} className="bg-[#FAFAF8] rounded-lg p-2.5 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-medium text-gray-800">{r.category} — {r.address}</span>
                      <span className={badgeClass(r.status)}>{r.status}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.tracking_id}</p>
                  </div>
                ))}
            </div>
            <div className="bg-gov-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gov-600 mb-1.5">How it works</p>
              <p className="text-[11px] text-gov-500 leading-loose">
                1. Submit with photo<br />2. Officer reviews<br />3. Appears on live map<br />4. You're notified on resolution
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
