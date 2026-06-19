"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { useLanguage } from "@/contexts/LanguageContext"

export default function PublicHeader() {
  const path = usePathname()
  const { t } = useLanguage()

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={path === href ? "nav-link-active" : "nav-link"}
    >
      {label}
    </Link>
  )

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/assets/logo.png" alt="Namma AI" className="h-10 w-auto object-contain" />
        </Link>
        <nav className="flex items-center gap-5">
          {navLink("/", t("nav_home"))}
          {navLink("/citizen/heatmap", t("nav_heatmap"))}
          {navLink("/citizen/report", t("nav_report"))}
          {navLink("/citizen/track", t("nav_track"))}
          <Link href="/authority/dashboard" className="gov-btn !py-2 !px-4">
            {t("nav_authority_signin")}
          </Link>
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
