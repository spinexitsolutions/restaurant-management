import { en, type MessageKey } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";

export type { MessageKey };

/** Staff app languages. Add one by copying en.ts; the compiler lists any missing key. */
export const LANGUAGES = { en: "English", hi: "हिन्दी", mr: "मराठी" } as const;
export type Lang = keyof typeof LANGUAGES;

export const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { en, hi, mr };

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && v in LANGUAGES;
}

export type Vars = Record<string, string | number>;

export function translate(lang: string | null | undefined, key: MessageKey, vars?: Vars): string {
  const dict = isLang(lang) ? DICTIONARIES[lang] : en;
  const text = dict[key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Bound translator for one language. */
export function translator(lang: string | null | undefined) {
  return (key: MessageKey, vars?: Vars) => translate(lang, key, vars);
}
export type T = ReturnType<typeof translator>;
