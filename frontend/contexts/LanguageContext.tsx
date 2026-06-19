"use client"
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import {
  STRINGS,
  LANG_META,
  STATIC_TRANSLATIONS,
  type Language,
  type Translations,
  type TranslationKey,
} from "@/lib/translations"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const PREF_KEY = "namma_lang"

interface LanguageCtx {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey) => string
  translating: boolean
}

const Ctx = createContext<LanguageCtx>({
  lang: "en",
  setLang: () => {},
  t: (k) => STRINGS[k],
  translating: false,
})

async function fetchTranslations(targetScript: string): Promise<Translations> {
  const keys = Object.keys(STRINGS) as TranslationKey[]
  const texts = keys.map((k) => STRINGS[k])
  const res = await fetch(`${BASE}/api/translate-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, target: targetScript }),
    cache: "no-store",
  })
  if (!res.ok) throw new Error("translate-batch failed")
  const { translations } = (await res.json()) as { translations: string[] }
  return Object.fromEntries(keys.map((k, i) => [k, translations[i] ?? STRINGS[k]])) as Translations
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en")
  const [cache, setCache] = useState<Partial<Record<Language, Translations>>>(
    // Seed the cache with static translations so switching is instant
    STATIC_TRANSLATIONS as Partial<Record<Language, Translations>>,
  )
  const [translating, setTranslating] = useState(false)

  // Restore saved language preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(PREF_KEY) as Language | null
    if (saved && ["en", "hi", "kn"].includes(saved)) setLangState(saved)
  }, [])

  const setLang = useCallback(
    async (next: Language) => {
      setLangState(next)
      localStorage.setItem(PREF_KEY, next)
      if (next === "en") return

      // Static translations are already in cache — nothing else needed for the demo.
      // Attempt a backend upgrade in the background (Sarvam/MyMemory) for better quality;
      // if it fails the static strings are already displayed.
      setTranslating(true)
      try {
        const result = await fetchTranslations(LANG_META[next].script)
        setCache((p) => ({ ...p, [next]: result }))
      } catch {
        // Static translations remain active — no visible fallback needed
      } finally {
        setTranslating(false)
      }
    },
    [],
  )

  const t = useCallback(
    (key: TranslationKey): string => {
      if (lang === "en") return STRINGS[key]
      return cache[lang]?.[key] ?? STRINGS[key]
    },
    [lang, cache],
  )

  return <Ctx.Provider value={{ lang, setLang, t, translating }}>{children}</Ctx.Provider>
}

export const useLanguage = () => useContext(Ctx)
