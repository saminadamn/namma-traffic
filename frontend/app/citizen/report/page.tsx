"use client"
import React, { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { submitReport, getReports, type Report } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"

const LocationPicker = dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false })

// ── Category → ML event_cause mapping ────────────────────────────────────────
// Values must match catboost_service CAUSES exactly so the ML worker scores correctly
const CATEGORIES: { label: string; cause: string; icon: React.ReactNode }[] = [
  {
    label: "Accident", cause: "accident",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>,
  },
  {
    label: "Vehicle breakdown", cause: "vehicle_breakdown",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>,
  },
  {
    label: "Pothole", cause: "pot_holes",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>,
  },
  {
    label: "Waterlogging", cause: "water_logging",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-4.97 5.25-7 8.5-7 11a7 7 0 0014 0c0-2.5-2.03-5.75-7-11z" /></svg>,
  },
  {
    label: "Tree fall", cause: "tree_fall",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2L7 9h3.5l-4 6H11v5h2v-5h4.5l-4-6H17L12 2z" /></svg>,
  },
  {
    label: "Obstruction", cause: "debris",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
  },
  {
    label: "Construction", cause: "construction",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63" /></svg>,
  },
  {
    label: "Congestion", cause: "congestion",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>,
  },
  {
    label: "Public event", cause: "public_event",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
  },
  {
    label: "Signal failure", cause: "signal_failure",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12z" /></svg>,
  },
  {
    label: "Others", cause: "others",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
]

const VEH_TYPES = [
  { label: "N/A",       value: "" },
  { label: "Car",       value: "private_car" },
  { label: "Auto",      value: "auto" },
  { label: "Taxi",      value: "taxi" },
  { label: "Truck",     value: "truck" },
  { label: "Heavy",     value: "heavy_vehicle" },
  { label: "BMTC",      value: "bmtc_bus" },
  { label: "KSRTC",     value: "ksrtc_bus" },
  { label: "Pvt bus",   value: "private_bus" },
]

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 py-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
)

export default function ReportPage() {
  const { t } = useLanguage()
  const [category,     setCategory]     = useState(CATEGORIES[0].cause)
  const [incidentType, setIncidentType] = useState<"unplanned" | "planned">("unplanned")
  const [vehType,      setVehType]      = useState("")
  const [description,  setDesc]         = useState("")
  const [address,      setAddress]      = useState("")
  const [lat,          setLat]          = useState("12.9716")
  const [lon,          setLon]          = useState("77.5946")
  const [loading,      setLoading]      = useState(false)
  const [trackingId,   setTracking]     = useState<string | null>(null)
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [recent,       setRecent]       = useState<Report[]>([])
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isPersonnel,  setIsPersonnel]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsPersonnel(localStorage.getItem("namma_role") === "traffic_personnel")
    getReports().then(r => setRecent(r.slice(0, 3))).catch(() => {})
  }, [trackingId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoPreview(URL.createObjectURL(file))
  }

  const removePhoto = () => {
    setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const submit = async () => {
    if (!description || !address) return
    setLoading(true); setSubmitError(null)
    try {
      const fd = new FormData()
      fd.append("category", category)
      fd.append("incident_type", incidentType)
      fd.append("veh_type", vehType)
      fd.append("description", description)
      fd.append("address", address)
      fd.append("latitude", lat)
      fd.append("longitude", lon)
      if (fileRef.current?.files?.[0]) fd.append("photo", fileRef.current.files[0])
      const res = await submitReport(fd)
      if (!res.tracking_id) throw new Error("No tracking ID")
      setTracking(res.tracking_id)
      setPhotoPreview(null)
    } catch (err: any) {
      setSubmitError(err?.message || "Submission failed — check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const statusLabel = (s: string) =>
    s === "pending"  ? "Awaiting verification" :
    s === "approved" ? "Verified" : s

  const statusClass = (s: string) =>
    s === "pending"  ? "bg-amber-50 text-amber-700 border border-amber-200" :
    s === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                       "bg-gray-100 text-gray-500"

  if (trackingId) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="gov-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">{t("rpt_success_title")}</p>
          <p className="text-2xl font-bold text-gov-600 mt-2 tracking-widest">{trackingId}</p>
          <p className="text-xs text-gray-500 mt-1">{t("rpt_tracking_label")}</p>

          {isPersonnel ? (
            <div className="mt-4 bg-gov-50 border border-gov-100 rounded-xl px-4 py-3 text-left">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3.5 h-3.5 text-gov-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <p className="text-xs font-semibold text-gov-900">Report auto-verified · Active incident created</p>
              </div>
              <p className="text-[11px] text-gov-500 leading-relaxed">
                As a verified traffic personnel, your report was automatically authenticated and is now live on the map. No officer review required.
              </p>
            </div>
          ) : (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left">
              <p className="text-xs font-medium text-amber-800 mb-1">Status: Awaiting verification</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                A traffic officer will review your report. Once verified, it becomes a live incident on the map and affects route recommendations for all users.
              </p>
            </div>
          )}

          <button
            onClick={() => { setTracking(null); setDesc(""); setAddress(""); setSubmitError(null) }}
            className="gov-btn-outline mt-5"
          >
            {t("rpt_submit")}
          </button>
        </div>
      </div>
    )
  }

  const selectedCat = CATEGORIES.find(c => c.cause === category) || CATEGORIES[0]

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-semibold text-gov-900">{t("rpt_title")}</h1>
          {isPersonnel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gov-50 border border-gov-100 text-gov-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Traffic Personnel · Auto-verified
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {isPersonnel
            ? "Your reports are automatically verified — no officer review needed"
            : t("rpt_desc")}
        </p>
      </div>

      <div className="gov-card p-4 sm:p-5 space-y-4">

          {/* Incident type toggle */}
          <div className="space-y-3">
            <Divider label="Incident type" />
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["unplanned", "planned"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIncidentType(t)}
                  className={`flex-1 text-sm py-2.5 transition-colors font-medium ${
                    incidentType === t ? "bg-gov-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Category grid */}
          <div className="space-y-3">
            <Divider label="Incident category" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.cause}
                  type="button"
                  onClick={() => setCategory(c.cause)}
                  className={`py-2.5 px-2 rounded-lg border text-center transition-colors ${
                    category === c.cause
                      ? "border-gov-500 bg-gov-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className={`flex justify-center mb-1 ${category === c.cause ? "text-gov-500" : "text-gray-400"}`}>
                    {c.icon}
                  </div>
                  <p className={`text-[10px] leading-tight ${category === c.cause ? "text-gov-600 font-medium" : "text-gray-500"}`}>
                    {c.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-3">
            <Divider label="Location" />
            <LocationPicker
              lat={lat}
              lon={lon}
              onPick={(la, lo, addr) => {
                setLat(la); setLon(lo)
                if (addr) setAddress(addr)
              }}
            />
            <div>
              <label className="gov-label">{t("rpt_address")}</label>
              <input
                className="gov-input"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Junction name or landmark…"
              />
              <p className="text-[10px] text-gray-400 mt-1">Coords: {lat}, {lon}</p>
            </div>
          </div>

          {/* Vehicle type */}
          <div className="space-y-3">
            <Divider label="Vehicle involved (optional)" />
            <div className="flex flex-wrap gap-1.5">
              {VEH_TYPES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVehType(value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    vehType === value
                      ? "bg-gov-500 border-gov-500 text-white font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gov-400 hover:text-gov-500 bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="gov-label">{t("rpt_description")}</label>
            <textarea
              className="gov-input h-20 resize-none"
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder={t("rpt_desc_placeholder")}
            />
          </div>

          {/* Photo */}
          <div>
            <label className="gov-label">{t("rpt_photo")}</label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                <img src={photoPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                <button
                  onClick={removePhoto}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
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
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG — optional but helps verification</p>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          </div>

          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
              {submitError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || !description || !address}
            className="gov-btn w-full py-3 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t("rpt_submitting")}</>
              : t("rpt_submit")
            }
          </button>
      </div>
    </div>
  )
}
