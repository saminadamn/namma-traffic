"use client"
import { useState, useRef, useEffect } from "react"
import { useLanguage } from "@/contexts/LanguageContext"
import { LANG_META, type Language } from "@/lib/translations"

const LANGS: Language[] = ["en", "hi", "kn"]

export default function LanguageSwitcher() {
  const { lang, setLang, translating } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const current = LANG_META[lang]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={translating}
        title="Change language"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{current.short}</span>
        {translating && <span className="text-[10px] text-gray-400 animate-pulse">…</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {LANGS.map(code => {
            const meta = LANG_META[code]
            return (
              <button key={code} onClick={() => { setLang(code); setOpen(false) }}
                disabled={translating}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] transition-colors disabled:opacity-40 ${
                  lang === code ? "text-gov-500 font-semibold bg-gov-50" : "text-gray-700 hover:bg-gray-50"
                }`}>
                <span className="font-mono text-[10px] text-gray-400 w-6 shrink-0">{meta.short}</span>
                <span>{meta.label}</span>
                {lang === code && (
                  <svg className="w-3 h-3 text-gov-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" clipRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
