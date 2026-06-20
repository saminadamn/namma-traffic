"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { useLanguage } from "@/contexts/LanguageContext"

export default function PublicHeader() {
  const path    = usePathname()
  const { t }   = useLanguage()
  const router  = useRouter()
  const [open, setOpen] = useState(false)
  const [isPersonnel, setIsPersonnel] = useState(false)

  useEffect(() => {
    setIsPersonnel(localStorage.getItem("namma_role") === "traffic_personnel")
  }, [])

  const logout = () => {
    localStorage.removeItem("namma_token")
    localStorage.removeItem("namma_refresh")
    localStorage.removeItem("namma_role")
    setIsPersonnel(false)
    router.push("/traffic/login")
  }

  const links = [
    { href: "/",               label: t("nav_home")   },
    { href: "/citizen/heatmap",label: t("nav_heatmap")},
    { href: "/citizen/report", label: t("nav_report") },
    { href: "/citizen/track",  label: t("nav_track")  },
    { href: "/citizen/route",  label: t("nav_route")  },
  ]

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0" onClick={() => setOpen(false)}>
          <img src="/assets/logo.png" alt="Namma AI" className="h-9 w-auto object-contain" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          {links.map(l => (
            <Link key={l.href} href={l.href}
              className={path === l.href ? "nav-link-active" : "nav-link"}>
              {l.label}
            </Link>
          ))}
          {isPersonnel ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-gov-50 border border-gov-100 text-gov-500 text-xs font-medium px-3 py-1.5 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                Traffic Personnel
              </span>
              <button onClick={logout}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Logout
              </button>
            </div>
          ) : (
            <Link href="/authority/dashboard" className="gov-btn !py-1.5 !px-3.5 !text-xs">
              {t("nav_authority_signin")}
            </Link>
          )}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {/* Mobile hamburger */}
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
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                path === l.href
                  ? "bg-gov-50 text-gov-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}>
              {l.label}
            </Link>
          ))}
          {isPersonnel ? (
            <button onClick={() => { setOpen(false); logout() }}
              className="w-full mt-2 flex items-center justify-center gap-1.5 text-sm text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-2.5 rounded-lg font-medium transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Logout
            </button>
          ) : (
            <Link href="/authority/dashboard" onClick={() => setOpen(false)}
              className="block gov-btn text-center mt-2 !text-sm">
              {t("nav_authority_signin")}
            </Link>
          )}
        </div>
      )}
    </header>
  )
}
