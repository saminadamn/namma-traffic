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
    const encoded = encodeURIComponent(query.trim())
    router.push(`/citizen/heatmap?q=${encoded}`)
  }

  const selectSuggestion = (item: NominatimResult) => {
    const name  = item.display_name.split(", ").slice(0, 2).join(", ")
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

      {/* Hero */}
      <section className="bg-gradient-to-br from-gov-50 to-white">
        <div className="max-w-6xl mx-auto px-5 py-14 grid grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-5xl font-bold text-gov-900 leading-tight">
              {t("hero_title_1")}<br /><span className="text-gov-500">{t("hero_title_2")}</span>
            </h1>
            <p className="mt-4 text-gray-600 text-lg leading-relaxed">{t("hero_desc")}</p>

            {/* Search bar with live suggestions */}
            <div className="mt-6 relative max-w-md">
              <div className="flex bg-white border border-gray-300 rounded-xl p-1.5 items-center shadow-sm focus-within:border-gov-400 transition-colors">
                <span className="px-3 text-gray-400">
                  {searching
                    ? <span className="inline-block w-4 h-4 border-2 border-gov-400 border-t-transparent rounded-full animate-spin" />
                    : "🔍"
                  }
                </span>
                <input
                  className="flex-1 text-sm outline-none bg-transparent"
                  placeholder={t("hero_search_placeholder")}
                  value={query}
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => { if (suggestions.length) setDropOpen(true) }}
                  onBlur={() => setTimeout(() => setDropOpen(false), 180)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <button className="gov-btn !py-2 !px-4" onClick={handleSearch}>
                  {t("hero_search_btn")}
                </button>
              </div>

              {/* Suggestions dropdown */}
              {dropOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  {suggestions.map((s, i) => {
                    const parts = s.display_name.split(", ")
                    return (
                      <button key={i} onMouseDown={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-3 hover:bg-gov-50 border-b border-gray-50 last:border-0 flex items-start gap-3 transition-colors">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{parts[0]}</p>
                          <p className="text-xs text-gray-400 truncate">{parts.slice(1, 3).join(", ")}</p>
                        </div>
                        <span className="text-xs text-gov-500 flex-shrink-0 mt-0.5">Safe route →</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <p className="mt-3 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{t("hero_quick_links")}</span>{" "}
              <Link href="/citizen/report" className="text-gov-500 hover:underline">{t("hero_link_report")}</Link>&nbsp;|&nbsp;
              <Link href="/citizen/heatmap" className="text-gov-500 hover:underline">{t("hero_link_heatmap")}</Link>&nbsp;|&nbsp;
              <Link href="/citizen/track" className="text-gov-500 hover:underline">{t("hero_link_track")}</Link>
            </p>
          </div>
          <div className="flex justify-center">
            <img src="/assets/hero.png" alt="Namma AI traffic intelligence" className="w-full h-auto rounded-2xl object-contain" />
          </div>
        </div>
      </section>

      {/* Service cards */}
      <section className="max-w-6xl mx-auto px-5 -mt-6">
        <div className="grid grid-cols-4 gap-4">
          {SERVICES.map(s => (
            <Link key={s.href} href={s.href} className="gov-card p-5 hover:border-gov-500 transition-colors">
              <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center text-gov-500 text-xl mb-3">{s.icon}</div>
              <p className="text-sm font-medium text-gov-900">{t(s.titleKey)}</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">{t(s.descKey)}</p>
              <p className="text-xs text-gov-500 font-medium">{t(s.ctaKey)} →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Role selection */}
      <section className="max-w-6xl mx-auto px-5 py-12">
        <h2 className="text-lg font-medium text-gov-900 mb-4">{t("role_choose")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <Link href="/citizen/report" className="gov-card p-5 flex items-center gap-4 hover:border-gov-500 transition-colors">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-700 text-2xl">👤</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gov-900">{t("role_citizen")}</p>
              <p className="text-xs text-gray-500">{t("role_citizen_desc")}</p>
            </div>
            <span className="gov-btn !py-2 !px-4">{t("role_enter")}</span>
          </Link>
          <Link href="/authority/login" className="gov-card p-5 flex items-center gap-4 hover:border-gov-500 transition-colors">
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
