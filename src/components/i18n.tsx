"use client";

import { createContext, useContext, useMemo, useTransition } from "react";
import { Languages } from "lucide-react";
import { LANGUAGES, translator, type Lang, type T } from "@/lib/i18n";
import { setLanguage } from "@/app/dashboard/language-actions";

const I18nContext = createContext<{ lang: Lang; t: T }>({ lang: "en", t: translator("en") });

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: translator(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translator for the signed-in staff member's language (English outside the dashboard). */
export function useT() {
  return useContext(I18nContext).t;
}

export function LanguagePicker() {
  const { lang, t } = useContext(I18nContext);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-stone-600">
      <Languages size={16} aria-hidden />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={lang}
        disabled={pending}
        onChange={(e) => start(() => setLanguage(e.target.value))}
        className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
        aria-label={t("nav.language")}
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
