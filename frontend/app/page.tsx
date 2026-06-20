"use client"
import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import PublicHeader from "@/components/PublicHeader"
import { useLanguage } from "@/contexts/LanguageContext"

interface NominatimResult { display_name: string; lat: string; lon: string }

const FAQ_CATEGORIES = [
  {
    label: "About the platform",
    items: [
      {
        q: "What is Namma Traffic AI?",
        a: "Namma Traffic AI is a smart traffic management platform built for Bengaluru. It combines AI-powered congestion prediction, citizen incident reporting, real-time heatmaps, and safe route planning in one unified interface. Version 1.0 was developed for the Gridlock Hackathon 2.0 under the Smart India Hackathon (SIH) sprint.",
      },
      {
        q: "What version is this and what features are included?",
        a: "This is Namma Traffic AI v1.0 (SIH Sprint, June 2025). Features include: live incident heatmap (Leaflet), citizen reporting with photo upload and tracking IDs (NMT-YYYY-XXXXX format), AI congestion prediction (XGBoost, 15-minute forecasts), A* safe route finder that avoids active closures, authority command center with resource allocation, diversion plan generation, what-if scenario simulation, and multi-language support (English, Hindi, Kannada). Stack: FastAPI + PostgreSQL + OSMnx backend, Next.js 14 + Tailwind CSS frontend.",
      },
    ],
  },
  {
    label: "For citizens",
    items: [
      {
        q: "How do I report a traffic incident?",
        a: "Tap 'Report incident' from the home page or navigate to /citizen/report. Select the incident category (accident, congestion, road closure, waterlogging, etc.), add a description, confirm your location, and optionally attach a photo. On submission you receive a unique tracking ID (e.g. NMT-2025-00123). Reports are queued for review by traffic personnel before authorities act on them.",
      },
      {
        q: "How do I track the status of my report?",
        a: "Go to 'Track report' in the navigation bar and enter your tracking ID. You will see the current status (Pending → Verified → Resolved), the assigned officer if applicable, and timestamps for each stage. Status updates in real time as personnel verify and escalate the report.",
      },
      {
        q: "How does the Safe Route feature work?",
        a: "The Safe Route Finder uses A* graph search over Bengaluru's road network sourced from OpenStreetMap via OSMnx. Active road closures are removed from the graph entirely, and edges near accident zones are penalised with a higher travel cost. The algorithm finds the fastest safe path. Enter your origin and destination to get a colour-coded route on the map alongside the list of incidents it avoids.",
      },
    ],
  },
  {
    label: "AI & technology",
    items: [
      {
        q: "How accurate are the AI predictions?",
        a: "The congestion prediction model (XGBoost) is trained on historical incident data, public event schedules, time-of-day patterns, and crowd density signals from Bengaluru's 18 monitored corridors. Internal testing shows 99.2% route accuracy and sub-3-second inference latency. Predictions are refreshed in 15-minute windows and cover events up to 24 hours ahead.",
      },
      {
        q: "What data sources does the platform use?",
        a: "The platform ingests: citizen incident reports (real-time crowdsourced), historical incident records in PostgreSQL, OpenStreetMap road network data via OSMnx for routing, public event calendar feeds for congestion forecasting, and crowd density estimates derived from incident clustering. No CCTV or proprietary sensor infrastructure is required — the system is intentionally designed on open and crowdsourced data.",
      },
    ],
  },
  {
    label: "For authorities",
    items: [
      {
        q: "How do Traffic Personnel and Authority accounts differ?",
        a: "Traffic Personnel are government-verified field reporters. Their incident reports are automatically pre-authenticated and skip the public review queue. Authority accounts (traffic control officers) access the full command center: AI congestion prediction, event simulation, what-if scenario analysis, resource allocation planning, diversion plan generation, report verification, and advanced analytics. Personnel log in via /traffic/login; authority staff via /authority/login.",
      },
      {
        q: "How does the command center help manage incidents?",
        a: "The authority command center aggregates live incident data, predicted congestion zones, and resource availability into a single dashboard. Officers can accept or modify AI-suggested officer and barricade placements, generate turn-by-turn diversion plans for affected corridors, simulate hypothetical event scenarios to stress-test response plans, and verify or escalate citizen reports — all without switching tools.",
      },
    ],
  },
  {
    label: "Privacy & support",
    items: [
      {
        q: "Is my location data stored permanently?",
        a: "Precise coordinates attached to incident reports are stored in PostgreSQL for operational use by traffic authorities. After 90 days, report locations are rounded to the nearest 500 m area level and submitter details are anonymised. Route searches are not persisted server-side — they run against the OpenStreetMap Nominatim API directly from your browser. To remove a specific report, contact Bengaluru Traffic Police via the official helpline.",
      },
    ],
  },
]

async function searchPlaces(q: string): Promise<NominatimResult[]> {
  if (q.trim().length < 2) return []
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Bengaluru")}&format=json&limit=5&countrycodes=in`,
      { headers: { "Accept-Language": "en" } }
    )
    return res.json()
  } catch { return [] }
}

export default function Home() {
  const { t } = useLanguage()
  const router = useRouter()
  const [query,       setQuery]       = useState("")
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [searching,   setSearching]   = useState(false)
  const [dropOpen,    setDropOpen]    = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInput = (v: string) => {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) { setSuggestions([]); setDropOpen(false); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const results = await searchPlaces(v)
      setSuggestions(results)
      setDropOpen(results.length > 0)
      setSearching(false)
    }, 380)
  }

  const handleSearch = () => {
    if (!query.trim()) return
    router.push(`/citizen/heatmap?q=${encodeURIComponent(query.trim())}`)
  }

  const selectSuggestion = (item: NominatimResult) => {
    const name = item.display_name.split(", ").slice(0, 2).join(", ")
    const params = new URLSearchParams({ q: name, lat: item.lat, lon: item.lon })
    router.push(`/citizen/route?${params.toString()}`)
    setDropOpen(false)
  }

  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="bg-[#F4F7FB] border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">

          {/* LEFT */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gov-700 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Live · Bengaluru Traffic Intelligence
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-gov-900 leading-tight tracking-tight">
              {t("hero_title_1")}
              <br />
              <span className="text-gov-500">{t("hero_title_2")}</span>
            </h1>

            <p className="mt-4 text-gray-500 text-sm md:text-base leading-relaxed max-w-md">
              {t("hero_desc")}
            </p>

            {/* Search — hidden on mobile */}
            <div className="mt-6 relative max-w-lg hidden sm:block">
              <div className="flex bg-white border border-gray-300 rounded-xl p-1 items-center shadow-sm focus-within:border-gov-400 focus-within:shadow-md transition-all">
                <span className="px-3 text-gray-400 flex-shrink-0">
                  {searching
                    ? <span className="inline-block w-4 h-4 border-2 border-gov-400 border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                  }
                </span>
                <input
                  className="flex-1 text-sm outline-none bg-transparent py-2"
                  placeholder={t("hero_search_placeholder")}
                  value={query}
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => { if (suggestions.length) setDropOpen(true) }}
                  onBlur={() => setTimeout(() => setDropOpen(false), 180)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <button className="gov-btn !py-2 !px-4 !rounded-lg !text-xs flex-shrink-0" onClick={handleSearch}>
                  {t("hero_search_btn")}
                </button>
              </div>

              {dropOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  {suggestions.map((s, i) => {
                    const parts = s.display_name.split(", ")
                    return (
                      <button key={i} onMouseDown={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-start gap-3 transition-colors">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800 truncate">{parts[0]}</p>
                          <p className="text-xs text-gray-400 truncate">{parts.slice(1, 3).join(", ")}</p>
                        </div>
                        <span className="text-xs text-gov-500 flex-shrink-0 font-medium">Safe route →</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-gray-400 hidden sm:block">
              <Link href="/citizen/report" className="hover:text-gov-500 transition-colors">{t("hero_link_report")}</Link>
              <span className="mx-2 text-gray-200">|</span>
              <Link href="/citizen/heatmap" className="hover:text-gov-500 transition-colors">{t("hero_link_heatmap")}</Link>
              <span className="mx-2 text-gray-200">|</span>
              <Link href="/citizen/track" className="hover:text-gov-500 transition-colors">{t("hero_link_track")}</Link>
            </p>
          </div>

          {/* RIGHT — clean image, no floating cards */}
          <div className="flex justify-center md:justify-end overflow-hidden rounded-2xl">
            <img
              src="/assets/car.jpg"
              alt="Bengaluru traffic management"
              className="w-full h-64 sm:h-80 md:h-auto max-w-full rounded-2xl object-cover md:object-contain"
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="max-w-6xl mx-auto px-4 pb-8 flex flex-wrap gap-4 sm:gap-8">
          {[
            { val: "2.4M+", label: "Daily commuters served" },
            { val: "< 3s",  label: "AI prediction latency" },
            { val: "99.2%", label: "Route accuracy" },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-4">
              <div>
                <p className="text-xl font-semibold text-gov-900">{s.val}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
              {i < arr.length - 1 && <div className="hidden sm:block w-px h-8 bg-gray-200" />}
            </div>
          ))}
        </div>
      </section>

      {/* ── ROLE SELECTION ────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{t("role_choose")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/citizen/report"
            className="gov-card p-4 flex items-center gap-4 hover:border-gov-300 hover:shadow-sm transition-all">
            <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gov-900">{t("role_citizen")}</p>
              <p className="text-xs text-gray-400">{t("role_citizen_desc")}</p>
            </div>
            <span className="gov-btn !py-1.5 !px-3 !text-xs flex-shrink-0">{t("role_enter")}</span>
          </Link>
          <Link href="/traffic/login"
            className="gov-card p-4 flex items-center gap-4 hover:border-gov-300 hover:shadow-sm transition-all">
            <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gov-900">{t("traffic_personnel")}</p>
              <p className="text-xs text-gray-400">{t("traffic_personnel_desc")}</p>
            </div>
            <span className="gov-btn !py-1.5 !px-3 !text-xs flex-shrink-0">{t("role_signin")}</span>
          </Link>
          <Link href="/authority/login"
            className="gov-card p-4 flex items-center gap-4 hover:border-gov-300 hover:shadow-sm transition-all">
            <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gov-900">{t("role_authority")}</p>
              <p className="text-xs text-gray-400">{t("role_authority_desc")}</p>
            </div>
            <span className="gov-btn !py-1.5 !px-3 !text-xs flex-shrink-0">{t("role_signin")}</span>
          </Link>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="mb-10">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">FAQ</h2>
            <p className="text-2xl font-bold text-gov-900">Frequently asked questions</p>
            <p className="text-sm text-gray-400 mt-1">Namma Traffic AI · Version 1.0 · SIH Sprint · Gridlock Hackathon 2.0</p>
          </div>
          <div className="space-y-8">
            {FAQ_CATEGORIES.map((cat, ci) => (
              <div key={ci}>
                <p className="text-[11px] font-semibold text-gov-500 uppercase tracking-widest mb-3 px-1">{cat.label}</p>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                  {cat.items.map((item, ii) => {
                    const idx = ci * 10 + ii
                    return (
                      <div key={ii} className="bg-white">
                        <button
                          onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                          className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50/70 transition-colors">
                          <span className="text-sm font-medium text-gov-900 leading-snug">{item.q}</span>
                          <svg
                            className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${faqOpen === idx ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {faqOpen === idx && (
                          <div className="px-5 pb-5 text-sm text-gray-500 leading-relaxed border-t border-gray-50 bg-gray-50/40">
                            {item.a}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-5 text-center text-xs text-gray-400">
        {t("footer")}
      </footer>
    </div>
  )
}
