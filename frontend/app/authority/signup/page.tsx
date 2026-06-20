"use client"
import { useState } from "react"
import Link from "next/link"
import { authRegister } from "@/lib/api"

export default function AuthoritySignupPage() {
  const [form, setForm] = useState({ phone: "", password: "", full_name: "", email: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await authRegister({
        phone_number: form.phone,
        password: form.password,
        full_name: form.full_name || undefined,
        email: form.email || undefined,
      })
      setSuccess(true)
    } catch (err: any) {
      setError(
        err.message?.includes("409") ? "Phone number already registered" : "Registration failed — try again"
      )
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="gov-card p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gov-900">Account created</h2>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          Your account is registered with the <strong>citizen</strong> role.
          Contact your admin to upgrade to <em>field_officer</em> or <em>control_room_operator</em>
          before you can access authority features.
        </p>
        <Link href="/authority/login" className="gov-btn inline-block mt-6">Sign in</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gov-50 border border-gov-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gov-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gov-900">Request authority access</h1>
          <p className="text-sm text-gray-500 mt-1">Register your account · Role assigned by admin</p>
        </div>
        <form onSubmit={submit} className="gov-card p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="gov-label">Full name</label>
            <input className="gov-input" value={form.full_name} onChange={set("full_name")}
              placeholder="Officer / staff name" />
          </div>
          <div>
            <label className="gov-label">Phone number <span className="text-red-500">*</span></label>
            <input className="gov-input" type="tel" value={form.phone} onChange={set("phone")}
              placeholder="10-digit mobile number" required pattern="[6-9]\d{9}" />
          </div>
          <div>
            <label className="gov-label">Official email (optional)</label>
            <input className="gov-input" type="email" value={form.email} onChange={set("email")}
              placeholder="officer@btp.gov.in" />
          </div>
          <div>
            <label className="gov-label">Password <span className="text-red-500">*</span></label>
            <input className="gov-input" type="password" value={form.password} onChange={set("password")}
              placeholder="Min 8 characters" required minLength={8} />
          </div>
          <button type="submit" disabled={loading || !form.phone || !form.password} className="gov-btn w-full disabled:opacity-50">
            {loading ? "Registering…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-xs text-gray-500 mt-4">
          Already have an account?{" "}
          <Link href="/authority/login" className="text-gov-500 hover:underline">Sign in</Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          <Link href="/" className="hover:text-gov-500">← Back to public site</Link>
        </p>
      </div>
    </div>
  )
}
