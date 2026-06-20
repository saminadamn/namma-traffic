"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authLogin } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"
import LanguageSwitcher from "@/components/LanguageSwitcher"

const DEMO = { phone: "9000000000", password: "Admin@1234" }

export default function AuthorityLoginPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [identifier, setIdentifier] = useState("")
  const [password,   setPassword]   = useState("")
  const [error,      setError]      = useState("")
  const [loading,    setLoading]    = useState(false)

  const fillDemo = () => {
    setIdentifier(DEMO.phone)
    setPassword(DEMO.password)
    setError("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await authLogin(identifier, password)
      localStorage.setItem("namma_token", res.access_token)
      localStorage.setItem("namma_refresh", res.refresh_token)
      localStorage.setItem("namma_role", "authority")
      router.push("/authority/dashboard")
    } catch {
      setError(t("login_error"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gov-50 border border-gov-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gov-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gov-900">{t("login_title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("login_subtitle")}</p>
        </div>

        {/* Demo credentials banner */}
        <button
          type="button"
          onClick={fillDemo}
          className="w-full mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left hover:bg-amber-100 transition-colors group"
        >
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            Demo credentials
            <span className="ml-auto text-amber-600 text-[10px] group-hover:underline">Click to fill →</span>
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Phone: <span className="font-mono font-bold">{DEMO.phone}</span>
            &nbsp;&nbsp;Password: <span className="font-mono font-bold">{DEMO.password}</span>
          </p>
        </button>

        <form onSubmit={submit} className="gov-card p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="gov-label">{t("login_identifier")}</label>
            <input className="gov-input" type="text" value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder={t("login_identifier_placeholder")} required autoFocus />
          </div>
          <div>
            <label className="gov-label">{t("login_password")}</label>
            <input className="gov-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t("login_password_placeholder")} required />
          </div>
          <button type="submit" disabled={loading || !identifier || !password}
            className="gov-btn w-full disabled:opacity-50">
            {loading ? t("login_signing") : t("login_btn")}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-4">
          {t("login_new_user")}{" "}
          <Link href="/authority/signup" className="text-gov-500 hover:underline">{t("login_request")}</Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link href="/" className="hover:text-gov-500">{t("login_back")}</Link>
        </p>
      </div>
    </div>
  )
}
