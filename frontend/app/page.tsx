"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import PublicHeader from "@/components/PublicHeader"
import { useLanguage } from "@/contexts/LanguageContext"

export default function Home() {
  const { t } = useLanguage()
  const [faqOpen,   setFaqOpen]   = useState<number | null>(null)
  const [userRole,  setUserRole]  = useState<string | null>(null)

  const faqItems = [
    { q: t("faq_q1"), a: t("faq_a1") },
    { q: t("faq_q2"), a: t("faq_a2") },
    { q: t("faq_q4"), a: t("faq_a4") },
    { q: t("faq_q5"), a: t("faq_a5") },
    { q: t("faq_q6"), a: t("faq_a6") },
  ]

  useEffect(() => {
    setUserRole(localStorage.getItem("namma_role"))
  }, [])

  const signOut = () => {
    localStorage.removeItem("namma_token")
    localStorage.removeItem("namma_refresh")
    localStorage.removeItem("namma_role")
    setUserRole(null)
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="bg-[#F4F7FB] border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6 md:py-14 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">

          {/* LEFT */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gov-700 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              {t("hero_live_badge")}
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-gov-900 leading-tight tracking-tight">
              {t("hero_title_1")}
              <br />
              <span className="text-gov-500">{t("hero_title_2")}</span>
            </h1>

            <p className="mt-4 text-gray-500 text-sm md:text-base leading-relaxed max-w-md">
              {t("hero_desc")}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/citizen/route" className="gov-btn">
                Safe Route Finder →
              </Link>
              <Link href="/citizen/heatmap" className="gov-btn-outline">
                Live Heatmap
              </Link>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex justify-center md:justify-end overflow-hidden rounded-2xl shadow-sm">
            <img
              src="/assets/car.jpg"
              alt="Bengaluru traffic management"
              className="w-full h-64 sm:h-80 md:h-auto max-w-full rounded-2xl object-cover md:object-contain"
            />
          </div>
        </div>

      </section>

      {/* ── ROLE SELECTION / QUICK ACCESS ──────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        {userRole === "traffic_personnel" ? (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{t("lbl_quick_access")}</h2>
            <div className="gov-card p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gov-900">{t("traffic_personnel")}</p>
                  <p className="text-xs text-gov-500">{t("personnel_active_desc")}</p>
                </div>
                <button onClick={signOut}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  {t("nav_signout")}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Link href="/citizen/report" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all group">
                  <p className="text-sm font-medium text-gov-900">{t("nav_report")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t("traffic_personnel_desc").split("—")[0].trim()} →</p>
                </Link>
                <Link href="/citizen/heatmap" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all group">
                  <p className="text-sm font-medium text-gov-900">{t("nav_heatmap")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Live incident map →</p>
                </Link>
                <Link href="/citizen/route" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all group">
                  <p className="text-sm font-medium text-gov-900">{t("nav_route")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Incident-aware routing →</p>
                </Link>
              </div>
            </div>
          </>
        ) : userRole === "citizen" ? (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{t("lbl_quick_access")}</h2>
            <div className="gov-card p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gov-900">{t("lbl_citizen")}</p>
                  <p className="text-xs text-gov-500">{t("role_citizen_desc")}</p>
                </div>
                <button onClick={signOut}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  {t("nav_signout")}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Link href="/citizen/report" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all">
                  <p className="text-sm font-medium text-gov-900">{t("nav_report")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t("role_citizen_desc").split(",")[0]} →</p>
                </Link>
                <Link href="/citizen/heatmap" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all">
                  <p className="text-sm font-medium text-gov-900">{t("nav_heatmap")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t("hmap_desc").split("—")[0].trim()} →</p>
                </Link>
                <Link href="/citizen/route" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all">
                  <p className="text-sm font-medium text-gov-900">{t("nav_route")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t("route_desc").split("—")[0].trim()} →</p>
                </Link>
              </div>
            </div>
          </>
        ) : userRole === "authority" ? (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{t("lbl_quick_access")}</h2>
            <div className="gov-card p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-10 h-10 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gov-900">{t("role_authority")}</p>
                  <p className="text-xs text-gov-500">{t("authority_active_desc")}</p>
                </div>
                <button onClick={signOut}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  {t("nav_signout")}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Link href="/authority/dashboard" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all">
                  <p className="text-sm font-medium text-gov-900">{t("btn_dashboard")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t("authority_active_desc")} →</p>
                </Link>
                <Link href="/citizen/heatmap" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all">
                  <p className="text-sm font-medium text-gov-900">{t("nav_heatmap")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Live incident map →</p>
                </Link>
                <Link href="/citizen/route" className="gov-card p-3 hover:border-gov-300 hover:shadow-sm transition-all">
                  <p className="text-sm font-medium text-gov-900">{t("nav_route")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Incident-aware routing →</p>
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{t("role_choose")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/citizen/heatmap"
                onClick={() => localStorage.setItem("namma_role", "citizen")}
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
          </>
        )}
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="bg-[#F4F7FB] border-t border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-12">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
            How it works
          </p>
          <h2 className="text-xl md:text-2xl font-bold text-gov-900 mb-8">
            From report to resolution in minutes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: "01",
                title: "Incident Reported",
                desc: "Citizens and officers report traffic incidents with location, category, and an optional photo — directly from their phone.",
                icon: (
                  <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3.75h3" />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Analyses & Prioritises",
                desc: "The system scores incident severity, detects emerging hotspots, and predicts which roads are at risk — before things get worse.",
                icon: (
                  <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Officers Deploy & Respond",
                desc: "Traffic authorities get live advisories, suggested resource deployments, and diversion routes pushed to their dashboard in real time.",
                icon: (
                  <svg className="w-5 h-5 text-gov-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.step} className="gov-card p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 bg-gov-500 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {item.step}
                  </div>
                  <div className="w-8 h-8 bg-gov-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                </div>
                <p className="text-sm font-semibold text-gov-900">{item.title}</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-xl font-bold text-gov-900 mb-6">{t("faq_title")}</p>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {faqItems.map((item, idx) => (
              <div key={idx} className="bg-white">
                <button
                  onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50/70 transition-colors">
                  <span className="text-sm font-medium text-gov-900 leading-snug">{item.q}</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform duration-300 ${faqOpen === idx ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${faqOpen === idx ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="px-5 pb-5 pt-3 text-sm text-gray-500 leading-relaxed border-t border-gray-50 bg-gray-50/40">
                    {item.a}
                  </div>
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
