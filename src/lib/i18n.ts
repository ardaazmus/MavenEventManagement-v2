// ─── Tek-dosyalı dil çözümü (Faz E) ─────────────────────────────────────────────
// next-intl KULLANILMAZ. Tek kaynak: src/i18n/tr.json (+ en.json).
// t(key): nokta-yollu anahtar arar; eksik anahtar TR'ye düşer + konsol uyarısı
// (uyarı anahtar başına bir kez — spam yok). useLang(): dil değişiminde re-render.
// localStorage anahtarı: "maven.lang" ("tr" | "en"), varsayılan tr.
import { useSyncExternalStore } from "react";
import trDict from "@/i18n/tr.json";
import enDict from "@/i18n/en.json";

export type Lang = "tr" | "en";

type Dict = Record<string, unknown>;

const DICTS: Record<Lang, Dict> = { tr: trDict as Dict, en: enDict as Dict };

// JSON içe aktarma ile geçici sözlükoverride (Ayarlar → Dil bölümü)
let override: Partial<Record<Lang, Dict>> = {};

const warned = new Set<string>();

let current: Lang = "tr";
let hydrated = false;
const listeners = new Set<() => void>();

function readLocal(): Lang {
  try {
    return window.localStorage.getItem("maven.lang") === "en" ? "en" : "tr";
  } catch {
    return "tr";
  }
}

function getLang(): Lang {
  if (!hydrated && typeof window !== "undefined") {
    current = readLocal();
    hydrated = true;
  }
  return current;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLang(lang: Lang): void {
  current = lang;
  hydrated = true;
  try {
    window.localStorage.setItem("maven.lang", lang);
  } catch {
    /* yoksay */
  }
  for (const fn of listeners) fn();
}

function lookup(dict: Dict | undefined, key: string): string | undefined {
  if (!dict) return undefined;
  let acc: unknown = dict;
  for (const part of key.split(".")) {
    if (acc && typeof acc === "object" && part in (acc as Dict)) {
      acc = (acc as Dict)[part];
    } else {
      return undefined;
    }
  }
  return typeof acc === "string" ? acc : undefined;
}

// {var} interpolasyonu — t("accounting.kpiCollectedSub", { online: 3, manual: 1 })
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = getLang();
  let val = lookup(override[lang] ?? DICTS[lang], key);
  if (val === undefined) {
    val = lookup(DICTS.tr, key);
    if (val !== undefined && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] anahtar "${key}" "${lang}" sözlüğünde yok — TR'ye düşüldü`);
    }
  }
  if (val === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] eksik anahtar: ${key}`);
    }
    return key;
  }
  if (vars) {
    return val.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }
  return val;
}

// uyarısız sessiz arama (enum yardımcıları için)
function tQuiet(key: string): string | undefined {
  const lang = getLang();
  return lookup(override[lang] ?? DICTS[lang], key) ?? lookup(DICTS.tr, key);
}

// sabit map + status sözlüğü köprüsü: önce t("status.<key>"), yoksa mevcut TR etiket
export function tLabel(map: Record<string, string>, key?: string | null): string {
  if (!key) return "—";
  return tQuiet(`status.${key}`) ?? map[key] ?? key;
}

// dil değişiminde re-render eden hook
export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string } {
  const lang = useSyncExternalStore(subscribe, getLang, () => "tr" as Lang);
  return { lang, setLang, t };
}

// ─── JSON dışa/içe aktarma (şema kontrollü, tek tuş) ────────────────────────────
const SCHEMA_ID = "maven-i18n";
const SCHEMA_VERSION = 1;

interface I18nBundle {
  maven: string;
  version: number;
  exportedAt: string;
  strings: { tr: Dict; en: Dict };
}

export function exportI18nJson(): string {
  const bundle: I18nBundle = {
    maven: SCHEMA_ID,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    strings: { tr: DICTS.tr, en: { ...(DICTS.en), ...(override.en ?? {}) } },
  };
  return JSON.stringify(bundle, null, 2);
}

// dönen değer: hata mesajı | null (başarı)
export function importI18nJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Geçerli JSON değil";
  }
  const b = parsed as Partial<I18nBundle>;
  if (!b || b.maven !== SCHEMA_ID || typeof b.version !== "number" || !b.strings || typeof b.strings !== "object") {
    return "Şema uyuşmuyor — beklenen: { maven: 'maven-i18n', version, strings: { tr, en } }";
  }
  if (b.strings.tr && typeof b.strings.tr === "object") override.tr = b.strings.tr as Dict;
  if (b.strings.en && typeof b.strings.en === "object") override.en = b.strings.en as Dict;
  for (const fn of listeners) fn();
  return null;
}
