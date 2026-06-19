"use client"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { useLanguage } from "@/contexts/LanguageContext"

export default function PublicHeader() {
  const path    = usePathname()
  const { t }   = useLanguage()
  const [open, setOpen] = useState(false)

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
          <Link href="/authority/dashboard" className="gov-btn !py-1.5 !px-3.5 !text-xs">
            {t("nav_authority_signin")}
          </Link>
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
          <Link href="/authority/dashboard" onClick={() => setOpen(false)}
            className="block gov-btn text-center mt-2 !text-sm">
            {t("nav_authority_signin")}
          </Link>
        </div>
      )}
    </header>
  )
}
