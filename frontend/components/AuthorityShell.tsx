"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { authMe, type UserOut } from "@/lib/api"
import LanguageSwitcher from "@/components/LanguageSwitcher"
import { useLanguage } from "@/contexts/LanguageContext"

export default function AuthorityShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  const [user, setUser] = useState<UserOut | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const NAV = [
    { href: "/authority/dashboard",  label: t("nav_dashboard"),        icon: "▦" },
    { href: "/authority/verify",     label: t("nav_verify"),           icon: "◫" },
    { href: "/authority/resources",  label: t("nav_resources"),        icon: "◐" },
    { href: "/authority/diversion",  label: t("nav_diversion"),        icon: "↔" },
    { href: "/authority/predict",    label: t("nav_predict_demo"),     icon: "◈" },
    { href: "/authority/heatmap",    label: t("nav_heatmap_auth"),     icon: "◉" },
    { href: "/authority/analytics",  label: t("nav_analytics_month"),  icon: "▤" },
  ]

  useEffect(() => {
    const token = localStorage.getItem("namma_token")
    if (!token) {
      router.replace("/authority/login")
      return
    }
    authMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("namma_token")
        localStorage.removeItem("namma_refresh")
        router.replace("/authority/login")
      })
      .finally(() => setAuthChecked(true))
  }, [])

  const logout = () => {
    localStorage.removeItem("namma_token")
    localStorage.removeItem("namma_refresh")
    localStorage.removeItem("namma_role")
    router.push("/")
  }

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAFAF8]">
        <p className="text-sm text-gray-400">{t("nav_verifying")}</p>
      </div>
    )
  }

  const initials = user?.full_name
    ? user.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : (user?.phone_number?.slice(-2) ?? "AU")

  const Sidebar = () => (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="h-20 flex items-center gap-2.5 px-4 border-b border-gray-200">
        <img src="/assets/logo.png" alt="Namma AI" className="h-16 w-auto object-contain" />
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon }) => (
          <Link key={href} href={href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              (href === "/authority/predict"
                ? (path === "/authority/predict" || path === "/authority/simulate" || path === "/authority/what-if")
                : path === href)
                ? "bg-gov-50 text-gov-500 font-medium" : "text-gray-600 hover:bg-gray-50"
            }`}>
            <span className="w-4 text-center">{icon}</span>{label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-200 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gov-50 text-gov-500 text-[11px] font-medium flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-gray-700 truncate">
              {user?.full_name || user?.phone_number || "Authority"}
            </p>
            <p className="text-[10px] text-gray-400 truncate">{user?.roles[0]?.replace(/_/g, " ") || "officer"}</p>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <button onClick={logout} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
            {t("nav_signout")}
          </button>
        </div>
        <div className="pt-1">
          <LanguageSwitcher />
        </div>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFAF8]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 flex-shrink-0">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-14 px-4 bg-white border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/assets/logo.png" alt="Namma AI" className="h-10 w-auto object-contain" />
          <div className="flex-1" />
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
          >
            Sign out
          </button>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
