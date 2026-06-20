"use client"
import React, { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { submitReport, getReports, type Report } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Accident: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  ),
  Waterlogging: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.25-7 8.5-7 11a7 7 0 0014 0c0-2.5-2.03-5.75-7-11z" />
    </svg>
  ),
  "Tree fall": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L7 9h3.5l-4 6H11v5h2v-5h4.5l-4-6H17L12 2z" />
    </svg>
  ),
  Breakdown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
    </svg>
  ),
  "Signal failure": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  Obstruction: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
}

const CATEGORIES = [
  { label: "Accident" },
  { label: "Waterlogging" },
  { label: "Tree fall" },
  { label: "Breakdown" },
  { label: "Signal failure" },
  { label: "Obstruction" },
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
        <div className="gov-card p-8 text-center border-emerald-200 bg-emerald-50">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
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
                  className={`py-2.5 px-2 rounded-lg border text-center transition-colors ${
                    category === c.label
                      ? "border-gov-500 bg-gov-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}>
                  <div className={`flex justify-center mb-1 ${category === c.label ? "text-gov-500" : "text-gray-400"}`}>
                    {CATEGORY_ICONS[c.label]}
                  </div>
                  <p className={`text-[11px] leading-tight ${category === c.label ? "text-gov-600 font-medium" : "text-gray-500"}`}>
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
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:bg-gray-50 hover:border-gov-300 transition-colors"
              >
                <div className="flex justify-center mb-2 text-gray-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Add a photo</p>
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
