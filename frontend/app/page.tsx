"use client"
import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import PublicHeader from "@/components/PublicHeader"
import { useLanguage } from "@/contexts/LanguageContext"

interface NominatimResult { display_name: string; lat: string; lon: string }

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

  const SERVICES = [
    { icon: "◈", titleKey: "svc_predict_title",   descKey: "svc_predict_desc",   ctaKey: "svc_predict_cta",   href: "/authority/predict" },
    { icon: "◉", titleKey: "svc_heatmap_title",   descKey: "svc_heatmap_desc",   ctaKey: "svc_heatmap_cta",   href: "/citizen/heatmap" },
    { icon: "◐", titleKey: "svc_resources_title", descKey: "svc_resources_desc", ctaKey: "svc_resources_cta", href: "/authority/resources" },
    { icon: "✎", titleKey: "svc_report_title",    descKey: "svc_report_desc",    ctaKey: "svc_report_cta",    href: "/citizen/report" },
  ] as const

  return (
    <div className="min-h-screen">
      <PublicHeader />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#E8F1FF] via-[#EFF6FF] to-white">
        {/* decorative blobs */}
        <div className="absolute -top-24 -right-24 w-[420px] h-[420px] bg-gov-200 rounded-full opacity-25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-16 w-72 h-72 bg-blue-100 rounded-full opacity-20 blur-2xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gov-50 rounded-full opacity-30 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-5 py-16 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">

          {/* LEFT — headline + search */}
          <div>
            {/* live pill */}
            <span className="inline-flex items-center gap-2 bg-white border border-gov-200 text-gov-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm mb-6">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              AI-powered · Live Bengaluru traffic
            </span>

            <h1 className="text-5xl md:text-6xl xl:text-7xl font-extrabold text-gov-900 leading-[1.05] tracking-tight">
              {t("hero_title_1")}
              <br />
              <span className="text-gov-500">{t("hero_title_2")}</span>
            </h1>

            <p className="mt-5 text-gray-600 text-base md:text-lg leading-relaxed max-w-lg">
              {t("hero_desc")}
            </p>

            {/* Search bar */}
            <div className="mt-7 relative max-w-lg">
              <div className="flex bg-white border-2 border-gray-200 rounded-2xl p-1.5 items-center shadow-md focus-within:border-gov-400 transition-colors">
                <span className="px-3 text-gray-400 flex-shrink-0">
                  {searching
                    ? <span className="inline-block w-4 h-4 border-2 border-gov-400 border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                  }
                </span>
                <input
                  className="flex-1 text-sm outline-none bg-transparent py-1"
                  placeholder={t("hero_search_placeholder")}
                  value={query}
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => { if (suggestions.length) setDropOpen(true) }}
                  onBlur={() => setTimeout(() => setDropOpen(false), 180)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <button className="gov-btn !py-2.5 !px-5 !rounded-xl" onClick={handleSearch}>
                  {t("hero_search_btn")}
                </button>
              </div>

              {/* Suggestions */}
              {dropOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  {suggestions.map((s, i) => {
                    const parts = s.display_name.split(", ")
                    return (
                      <button key={i} onMouseDown={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-3.5 hover:bg-gov-50 border-b border-gray-50 last:border-0 flex items-start gap-3 transition-colors">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{parts[0]}</p>
                          <p className="text-xs text-gray-400 truncate">{parts.slice(1, 3).join(", ")}</p>
                        </div>
                        <span className="text-xs text-gov-500 flex-shrink-0 mt-0.5 font-medium">Safe route →</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick links */}
            <p className="mt-4 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{t("hero_quick_links")}</span>{" "}
              <Link href="/citizen/report" className="text-gov-500 hover:underline">{t("hero_link_report")}</Link>
              &nbsp;<span className="text-gray-300">|</span>&nbsp;
              <Link href="/citizen/heatmap" className="text-gov-500 hover:underline">{t("hero_link_heatmap")}</Link>
              &nbsp;<span className="text-gray-300">|</span>&nbsp;
              <Link href="/citizen/track" className="text-gov-500 hover:underline">{t("hero_link_track")}</Link>
            </p>

            {/* Live stats strip */}
            <div className="mt-8 flex gap-5 flex-wrap">
              {[
                { val: "2.4M+", label: "Daily commuters" },
                { val: "18",    label: "Active corridors" },
                { val: "< 3s",  label: "Prediction latency" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-xl font-bold text-gov-900">{s.val}</p>
                  <p className="text-[11px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — hero image with floating badges */}
          <div className="relative flex justify-center md:justify-end">
            {/* glow ring behind image */}
            <div className="absolute inset-4 bg-gov-300 rounded-3xl opacity-10 blur-xl" />

            <div className="relative w-full max-w-md">
              <img
                src="/assets/hero.png"
                alt="Namma AI traffic intelligence"
                className="w-full h-auto rounded-3xl shadow-2xl object-cover"
              />

              {/* floating badge — top-left */}
              <div className="absolute -top-4 -left-4 bg-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-2.5 border border-gray-100">
                <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center text-lg">🚨</div>
                <div>
                  <p className="text-[10px] text-gray-500">Live incidents</p>
                  <p className="text-sm font-bold text-red-600">Active alerts</p>
                </div>
              </div>

              {/* floating badge — bottom-right */}
              <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-2.5 border border-gray-100">
                <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-lg">🛡️</div>
                <div>
                  <p className="text-[10px] text-gray-500">Safe routes</p>
                  <p className="text-sm font-bold text-emerald-600">AI-optimised</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICE CARDS ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 -mt-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {SERVICES.map(s => (
            <Link key={s.href} href={s.href} className="gov-card p-5 hover:border-gov-500 hover:shadow-md transition-all">
              <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center text-gov-500 text-xl mb-3">{s.icon}</div>
              <p className="text-sm font-medium text-gov-900">{t(s.titleKey)}</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">{t(s.descKey)}</p>
              <p className="text-xs text-gov-500 font-medium">{t(s.ctaKey)} →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── ROLE SELECTION ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 py-12">
        <h2 className="text-lg font-medium text-gov-900 mb-4">{t("role_choose")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/citizen/report" className="gov-card p-5 flex items-center gap-4 hover:border-gov-500 hover:shadow-md transition-all">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-700 text-2xl">👤</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gov-900">{t("role_citizen")}</p>
              <p className="text-xs text-gray-500">{t("role_citizen_desc")}</p>
            </div>
            <span className="gov-btn !py-2 !px-4">{t("role_enter")}</span>
          </Link>
          <Link href="/authority/login" className="gov-card p-5 flex items-center gap-4 hover:border-gov-500 hover:shadow-md transition-all">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-700 text-2xl">🛡️</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gov-900">{t("role_authority")}</p>
              <p className="text-xs text-gray-500">{t("role_authority_desc")}</p>
            </div>
            <span className="gov-btn !py-2 !px-4">{t("role_signin")}</span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        {t("footer")}
      </footer>
    </div>
  )
}
