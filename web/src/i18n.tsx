import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'de' | 'en'
export type Dict = Record<string, { de: string; en: string }>

type Settings = {
  lang: Lang
  setLang: (l: Lang) => void
  tech: boolean // global "show technical details" switch, off by default
  setTech: (t: boolean) => void
}

const Ctx = createContext<Settings>({ lang: 'de', setLang: () => {}, tech: false, setTech: () => {} })

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(stored('lang', 'de') === 'en' ? 'en' : 'de')
  const [tech, setTech] = useState(stored('tech', '0') === '1')
  useEffect(() => {
    try {
      localStorage.setItem('lang', lang)
      localStorage.setItem('tech', tech ? '1' : '0')
    } catch {
      /* private mode etc. */
    }
    document.documentElement.lang = lang
  }, [lang, tech])
  return <Ctx.Provider value={{ lang, setLang, tech, setTech }}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)

/** `const t = useT(DICT)` → `t('key', { n: 3 })`; `{n}` placeholders are interpolated. */
export function useT<D extends Dict>(dict: D) {
  const { lang } = useSettings()
  return (key: keyof D, vars?: Record<string, string | number>): string => {
    let s = dict[key]?.[lang] ?? String(key)
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{${k}}`, String(v))
    return s
  }
}

/** Translate a backend enum value (clause type, verdict, …) through a lookup; falls back to the raw value. */
export function useLabel(map: Record<string, { de: string; en: string }>) {
  const { lang } = useSettings()
  return (value: string): string => map[value]?.[lang] ?? value.replace(/_/g, ' ')
}
