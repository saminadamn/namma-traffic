"use client"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { submitReport, getReports, type Report } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

const CATEGORIES = [
  { label: "Accident",       icon: "🚗" },
  { label: "Waterlogging",   icon: "💧" },
  { label: "Tree fall",      icon: "🌳" },
  { label: "Breakdown",      icon: "🔧" },
  { label: "Signal failure", icon: "🚦" },
  { label: "Obstruction",    icon: "🚧" },
]

export default function ReportPage() {
  const { t } = useLanguage()
  const [category,    setCategory]  = useState("Accident")
  const [description, setDesc]      = useState("")
  const [address,     setAddress]   = useState("")
  const [lat,         setLat]       = useState("12.9716")
  const [lon,         setLon]       = useState("77.5946")
  const [loading,     setLoading]   = useState(false)
  const [trackingId,  setTracking]  = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [recent,      setRecent]    = useState<Report[]>([])
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getReports().then(r => setRecent(r.slice(0, 3))).catch(() => {})
  }, [trackingId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
  }

  const removePhoto = () => {
    setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const submit = async () => {
    if (!description || !address) return
    setLoading(true)
    setSubmitError(null)
    try {
      const fd = new FormData()
      fd.append("category", category)
      fd.append("description", description)
      fd.append("address", address)
      fd.append("latitude", lat)
      fd.append("longitude", lon)
      if (fileRef.current?.files?.[0]) fd.append("photo", fileRef.current.files[0])
      const res = await submitReport(fd)
      if (!res.tracking_id) throw new Error("No tracking ID")
      setTracking(res.tracking_id)
      setPhotoPreview(null)
    } catch {
      setSubmitError("Submission failed — check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const badgeClass = (s: string) =>
    s === "pending" ? "badge-pending" : s === "approved" ? "badge-approved" : "badge-low"

  if (trackingId) {
    return (
      <div className="max-w-md mx-auto">
        <div className="gov-card p-10 text-center border-emerald-200 bg-emerald-50">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-sm font-medium text-emerald-800">{t("rpt_success_title")}</p>
          <p className="text-2xl font-semibold text-emerald-700 mt-2 tracking-widest">{trackingId}</p>
          <p className="text-xs text-emerald-600 mt-1">{t("rpt_tracking_label")}</p>
          <button
            onClick={() => { setTracking(null); setDesc(""); setAddress(""); setSubmitError(null) }}
            className="gov-btn-outline mt-6"
          >
            {t("rpt_submit")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-gov-900">{t("rpt_title")}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">{t("rpt_desc")}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* ── Main form ── */}
        <div className="md:col-span-2 gov-card p-5 space-y-5">

          {/* Category */}
          <div>
            <p className="gov-label mb-2">{t("rpt_category")}</p>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(c => (
                <button key={c.label} onClick={() => setCategory(c.label)}
                  className={`py-3 px-2 rounded-xl border text-center transition-colors ${
                    category === c.label
                      ? "border-gov-500 bg-gov-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}>
                  <div className="text-2xl">{c.icon}</div>
                  <p className={`text-[11px] mt-1 ${category === c.label ? "text-gov-600 font-medium" : "text-gray-600"}`}>
                    {c.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="gov-label">{t("rpt_address")}</label>
            <LocationPicker lat={lat} lon={lon} onPick={(la, lo, addr) => {
              setLat(la); setLon(lo); if (addr) setAddress(addr)
            }} />
            <input className="gov-input mt-2" value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Junction name or landmark…" />
            <p className="text-[10px] text-gray-400 mt-1">Coords: {lat}, {lon}</p>
          </div>

          {/* Description */}
          <div>
            <label className="gov-label">{t("rpt_description")}</label>
            <textarea className="gov-input h-20 resize-none" value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder={t("rpt_desc_placeholder")} />
          </div>

          {/* Photo upload with preview */}
          <div>
            <label className="gov-label">{t("rpt_photo")}</label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                <img src={photoPreview} alt="Preview" className="w-full max-h-56 object-cover" />
                <button
                  onClick={removePhoto}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
                  <p className="text-xs text-white font-medium">
                    {fileRef.current?.files?.[0]?.name ?? "Photo selected"}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:bg-gray-50 hover:border-gov-300 transition-colors group"
              >
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📷</div>
                <p className="text-sm text-gray-500">Tap to add a photo</p>
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG — optional but helps</p>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || !description || !address}
            className="gov-btn w-full py-3.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t("rpt_submitting")}</>
              : t("rpt_submit")
            }
          </button>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          <div className="gov-card p-4">
            <p className="text-xs font-medium text-gov-900 mb-3">My recent reports</p>
            {recent.length === 0
              ? <p className="text-xs text-gray-400">No reports yet</p>
              : recent.map(r => (
                <div key={r.id} className="bg-[#FAFAF8] rounded-lg p-2.5 mb-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[11px] font-medium text-gray-800 truncate">{r.category} — {r.address}</span>
                    <span className={badgeClass(r.status)}>{r.status}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{r.tracking_id}</p>
                </div>
              ))
            }
          </div>

          <div className="bg-gov-50 rounded-xl p-4">
            <p className="text-xs font-medium text-gov-600 mb-2">How it works</p>
            <ol className="text-[11px] text-gov-500 space-y-1.5">
              {["Submit with photo", "Officer reviews", "Appears on live map", "You're notified on resolution"]
                .map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-gov-200 text-gov-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))
              }
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
