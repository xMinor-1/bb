import { useSyncExternalStore } from "react";

export type Lang = "en" | "ru";
export const LANGS: readonly Lang[] = ["en", "ru"];

const STORAGE_KEY = "xminor-plugins.lang";
const CHANGE_EVENT = "xminor-plugins:lang-change";

function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "en" || value === "ru" ? value : null;
  } catch {
    return null;
  }
}

export function browserLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const first = navigator.languages?.[0] ?? navigator.language ?? "";
  return first.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function getLang(): Lang {
  return storedLang() ?? browserLang();
}

export function setLang(lang: Lang | null): void {
  try {
    if (lang) localStorage.setItem(STORAGE_KEY, lang);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("languagechange", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("languagechange", onChange);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "en");
}

type Message = string | ((...args: never[]) => string);
type Translation<M> = {
  [K in keyof M]: M[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

export function defineMessages<M extends Record<string, Message>>(
  en: M,
  ru: Translation<M>,
): Record<Lang, M> {
  return { en, ru: ru as unknown as M };
}

export function useMessages<M>(messages: Record<Lang, M>): M {
  return messages[useLang()];
}

export function messagesNow<M>(messages: Record<Lang, M>): M {
  return messages[getLang()];
}

export function pluralRu(
  n: number,
  [one, few, many]: readonly [string, string, string],
): string {
  if (!Number.isInteger(n)) return few;
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function intlLocale(lang: Lang): string {
  return lang === "ru" ? "ru-RU" : "en-US";
}

export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang();
  return (
    <div
      role="group"
      aria-label={lang === "ru" ? "Язык интерфейса" : "Interface language"}
      className={`inline-flex shrink-0 rounded-md border border-border p-0.5 text-xs ${className ?? ""}`}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={`rounded px-2 py-0.5 ${lang === code ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
