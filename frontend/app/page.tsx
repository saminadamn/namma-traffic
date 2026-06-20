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
    { titleKey: "svc_predict_title",   descKey: "svc_predict_desc",   ctaKey: "svc_predict_cta",   href: "/authority/predict" },
    { titleKey: "svc_heatmap_title",   descKey: "svc_heatmap_desc",   ctaKey: "svc_heatmap_cta",   href: "/citizen/heatmap" },
    { titleKey: "svc_resources_title", descKey: "svc_resources_desc", ctaKey: "svc_resources_cta", href: "/authority/resources" },
    { titleKey: "svc_report_title",    descKey: "svc_report_desc",    ctaKey: "svc_report_cta",    href: "/citizen/report" },
  ] as const

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

            {/* Search */}
            <div className="mt-6 relative max-w-lg">
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

            <p className="mt-3 text-xs text-gray-400">
              <Link href="/citizen/report" className="hover:text-gov-500 transition-colors">{t("hero_link_report")}</Link>
              <span className="mx-2 text-gray-200">|</span>
              <Link href="/citizen/heatmap" className="hover:text-gov-500 transition-colors">{t("hero_link_heatmap")}</Link>
              <span className="mx-2 text-gray-200">|</span>
              <Link href="/citizen/track" className="hover:text-gov-500 transition-colors">{t("hero_link_track")}</Link>
            </p>
          </div>

          {/* RIGHT — clean image, no floating cards */}
          <div className="flex justify-center md:justify-end">
            <img
              src="/assets/car.jpg"
              alt="Bengaluru traffic management"
              className="w-full max-w-sm md:max-w-full h-auto rounded-2xl object-contain"
            />
          </div>
        </div>

        {/* Stats strip */}
        <div className="max-w-6xl mx-auto px-4 pb-8 flex flex-wrap gap-4 sm:gap-8">
          {[
            { val: "2.4M+", label: "Daily commuters served" },
            { val: "18",    label: "Traffic corridors monitored" },
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

      {/* ── SERVICE CARDS ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Services</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {SERVICES.map(s => (
            <Link key={s.href} href={s.href}
              className="gov-card p-4 hover:border-gov-300 hover:shadow-sm transition-all group">
              <p className="text-sm font-medium text-gov-900 mb-1">{t(s.titleKey)}</p>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">{t(s.descKey)}</p>
              <p className="text-xs text-gov-500 font-medium group-hover:underline">{t(s.ctaKey)} →</p>
            </Link>
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
              <p className="text-sm font-medium text-gov-900">Traffic Personnel</p>
              <p className="text-xs text-gray-400">Government-verified field reporter — reports auto-authenticated</p>
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

      <footer className="border-t border-gray-100 py-5 text-center text-xs text-gray-400">
        {t("footer")}
      </footer>
    </div>
  )
}
