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

async function fetchTranslations(langCode: string): Promise<Translations> {
  const keys = Object.keys(STRINGS) as TranslationKey[]
  const texts = keys.map((k) => STRINGS[k])
  const res = await fetch(`${BASE}/api/translate-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, target: langCode }),
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
    const validCodes = Object.keys(LANG_META) as Language[]
    if (saved && validCodes.includes(saved)) setLangState(saved)
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
        const result = await fetchTranslations(LANG_META[next].code)
        // Only update cache when we got actual translations (not English originals
        // returned by the backend when no API keys are configured).
        const keys = Object.keys(STRINGS) as TranslationKey[]
        const isTranslated = keys.some(k => result[k] !== STRINGS[k])
        if (isTranslated) {
          setCache((p) => ({ ...p, [next]: result }))
        }
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
