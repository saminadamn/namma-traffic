"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authLogin } from "@/lib/api"
import { useLanguage } from "@/contexts/LanguageContext"
import LanguageSwitcher from "@/components/LanguageSwitcher"

export default function AuthorityLoginPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await authLogin(identifier, password)
      localStorage.setItem("namma_token", res.access_token)
      localStorage.setItem("namma_refresh", res.refresh_token)
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
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">🛡️</div>
          <h1 className="text-xl font-semibold text-gov-900">{t("login_title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("login_subtitle")}</p>
        </div>
        <form onSubmit={submit} className="gov-card p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="gov-label">{t("login_identifier")}</label>
            <input className="gov-input" type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
              placeholder={t("login_identifier_placeholder")} required autoFocus />
          </div>
          <div>
            <label className="gov-label">{t("login_password")}</label>
            <input className="gov-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t("login_password_placeholder")} required />
          </div>
          <button type="submit" disabled={loading || !identifier || !password} className="gov-btn w-full disabled:opacity-50">
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
