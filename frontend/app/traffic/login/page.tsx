"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authLogin } from "@/lib/api"

const DEMO = { phone: "9333333333", password: "Traffic@1234" }

export default function TrafficLoginPage() {
  const router = useRouter()
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
      localStorage.setItem("namma_role", "traffic_personnel")
      router.push("/citizen/report")
    } catch {
      setError("Invalid credentials. Check your phone number and password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Traffic Personnel Login</h1>
          <p className="text-sm text-gray-500 mt-1">Government-verified field reporting</p>
        </div>

        <div className="w-full mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Your reports are auto-verified
          </p>
          <p className="text-xs text-blue-700 mt-1">Reports submitted here go directly to active incidents — no manual control-room verification required.</p>
        </div>

        <button
          type="button"
          onClick={fillDemo}
          className="w-full mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left hover:bg-amber-100 transition-colors group"
        >
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            Demo credentials
            <span className="ml-auto text-amber-600 text-[10px] group-hover:underline">Click to fill →</span>
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Phone: <span className="font-mono font-bold">{DEMO.phone}</span>
            &nbsp;&nbsp;Password: <span className="font-mono font-bold">{DEMO.password}</span>
          </p>
        </button>

        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone number</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="10-digit phone number"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !identifier || !password}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in as Traffic Personnel"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          <Link href="/" className="hover:text-blue-500">← Back to public site</Link>
          &nbsp;·&nbsp;
          <Link href="/authority/login" className="hover:text-blue-500">Authority login</Link>
        </p>
      </div>
    </div>
  )
}
