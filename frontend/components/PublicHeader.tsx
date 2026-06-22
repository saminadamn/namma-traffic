"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { useLanguage } from "@/contexts/LanguageContext"

export default function PublicHeader() {
  const path   = usePathname()
  const { t }  = useLanguage()
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [isPersonnel, setIsPersonnel] = useState(false)
  const [isCitizen,   setIsCitizen]   = useState(false)

  useEffect(() => {
    const role = localStorage.getItem("namma_role")
    setIsPersonnel(role === "traffic_personnel")
    setIsCitizen(role === "citizen")
  }, [])

  const logoutPersonnel = () => {
    localStorage.removeItem("namma_token")
    localStorage.removeItem("namma_refresh")
    localStorage.removeItem("namma_role")
    setIsPersonnel(false)
    router.push("/")
  }

  const logoutCitizen = () => {
    localStorage.removeItem("namma_role")
    setIsCitizen(false)
    router.push("/")
  }

  // "File a report" only shown when user has entered as citizen or personnel
  const showReport = isPersonnel || isCitizen

  const desktopLinks = [
    { href: "/",               label: t("nav_home")    },
    { href: "/citizen/heatmap",label: t("nav_heatmap") },
    ...(showReport ? [{ href: "/citizen/report", label: t("nav_report") }] : []),
    { href: "/citizen/route",  label: t("nav_route")   },
  ]

  const mobileLinks = [
    {
      href: "/", label: t("nav_home"),
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
    },
    {
      href: "/citizen/heatmap", label: t("nav_heatmap"),
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>,
    },
    ...(showReport ? [{
      href: "/citizen/report", label: t("nav_report"),
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
    }] : []),
    {
      href: "/citizen/route", label: t("nav_route"),
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
    },
  ]

  const signOutIcon = (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0" onClick={() => setOpen(false)}>
          <img src="/assets/logo.png" alt="Namma AI" className="h-14 sm:h-12 w-auto object-contain" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          {desktopLinks.map(l => (
            <Link key={l.href} href={l.href}
              className={path === l.href ? "nav-link-active" : "nav-link"}>
              {l.label}
            </Link>
          ))}

          {/* Personnel badge */}
          {isPersonnel && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-gov-50 border border-gov-100 text-gov-500 text-xs font-medium px-3 py-1.5 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                {t("traffic_personnel")}
              </span>
              <button onClick={logoutPersonnel}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
                {signOutIcon}
                {t("nav_signout")}
              </button>
            </div>
          )}

          {/* Citizen badge */}
          {isCitizen && !isPersonnel && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-gov-50 border border-gov-100 text-gov-500 text-xs font-medium px-3 py-1.5 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                {t("lbl_citizen")}
              </span>
              <button onClick={logoutCitizen}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
                {signOutIcon}
                {t("nav_signout")}
              </button>
            </div>
          )}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            onClick={() => setOpen(o => !o)} aria-label="Menu">
            {open
              ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            }
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-3 space-y-0.5">
            {mobileLinks.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  path === l.href ? "bg-gov-50 text-gov-600" : "text-gray-600 hover:bg-gray-50"
                }`}>
                <span className={path === l.href ? "text-gov-500" : "text-gray-400"}>{l.icon}</span>
                <span className="flex-1">{l.label}</span>
                {path === l.href && <span className="w-1.5 h-1.5 bg-gov-500 rounded-full" />}
              </Link>
            ))}
          </div>

          {/* Mobile personnel section */}
          {isPersonnel && (
            <div className="px-4 pt-2 pb-4 border-t border-gray-50 space-y-1">
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gov-50 rounded-lg border border-gov-100">
                <svg className="w-4 h-4 text-gov-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="text-sm font-medium text-gov-700 flex-1">{t("traffic_personnel")}</span>
                <span className="text-xs text-gov-500 bg-gov-100 px-2 py-0.5 rounded-full font-medium">{t("lbl_verified")}</span>
              </div>
              <button onClick={() => { setOpen(false); logoutPersonnel() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                {t("nav_signout")}
              </button>
            </div>
          )}

          {/* Mobile citizen section */}
          {isCitizen && !isPersonnel && (
            <div className="px-4 pt-2 pb-4 border-t border-gray-50 space-y-1">
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gov-50 rounded-lg border border-gov-100">
                <svg className="w-4 h-4 text-gov-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span className="text-sm font-medium text-gov-700 flex-1">{t("lbl_citizen")}</span>
              </div>
              <button onClick={() => { setOpen(false); logoutCitizen() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                {t("nav_signout")}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
