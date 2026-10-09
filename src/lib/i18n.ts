"use client";
// ─── Tek-dosyalı dil çözümü (Faz E) ─────────────────────────────────────────────
// next-intl KULLANILMAZ. Tek kaynak: src/i18n/tr.json (+ en.json).
// t(key): nokta-yollu anahtar arar; eksik anahtar TR'ye düşer + konsol uyarısı
// (uyarı anahtar başına bir kez — spam yok). useLang(): dil değişiminde re-render.
// localStorage anahtarı: "maven.lang" ("tr" | "en"), varsayılan tr.
import { useSyncExternalStore } from "react";
import trDict from "@/i18n/tr.json";
import enDict from "@/i18n/en.json";

// TASK-A F8: parça sözlükler (src/i18n/_new/<view>.{tr,en}.json) — geliştirme sırasında
// çeviriler parça dosyalarda yaşar (F9'da tr.json/en.json'a "pişirilir"). Burada derin
// birleşim yüklenir: TABAN KAZANIR (tr.json/en.json etiketleri donuk — parça yalnız
// boşluk doldurur). Böylece F8 sonrası TR arayüz bozulmadan çalışmaya devam eder.
import peopleTr from "@/i18n/_new/people.tr.json";
import peopleEn from "@/i18n/_new/people.en.json";
import onsiteTr from "@/i18n/_new/onsite.tr.json";
import onsiteEn from "@/i18n/_new/onsite.en.json";
import scientificTr from "@/i18n/_new/scientific.tr.json";
import scientificEn from "@/i18n/_new/scientific.en.json";
import formsTr from "@/i18n/_new/forms.tr.json";
import formsEn from "@/i18n/_new/forms.en.json";
import archiveTr from "@/i18n/_new/archive.tr.json";
import archiveEn from "@/i18n/_new/archive.en.json";
import b2bTr from "@/i18n/_new/b2b.tr.json";
import b2bEn from "@/i18n/_new/b2b.en.json";
import socialTr from "@/i18n/_new/social.tr.json";
import socialEn from "@/i18n/_new/social.en.json";
import floorsTr from "@/i18n/_new/floors.tr.json";
import floorsEn from "@/i18n/_new/floors.en.json";
import integrationsTr from "@/i18n/_new/integrations.tr.json";
import integrationsEn from "@/i18n/_new/integrations.en.json";
import complianceTr from "@/i18n/_new/compliance.tr.json";
import complianceEn from "@/i18n/_new/compliance.en.json";
import portalTr from "@/i18n/_new/portal.tr.json";
import portalEn from "@/i18n/_new/portal.en.json";
import accommodationPlusTr from "@/i18n/_new/accommodation-plus.tr.json";
import accommodationPlusEn from "@/i18n/_new/accommodation-plus.en.json";
import financeTr from "@/i18n/_new/finance.tr.json";
import financeEn from "@/i18n/_new/finance.en.json";
import sponsorshipTr from "@/i18n/_new/sponsorship.tr.json";
import sponsorshipEn from "@/i18n/_new/sponsorship.en.json";
import badgeQueueTr from "@/i18n/_new/badge-queue.tr.json";
import badgeQueueEn from "@/i18n/_new/badge-queue.en.json";
import accountingPlusTr from "@/i18n/_new/accounting-plus.tr.json";
import accountingPlusEn from "@/i18n/_new/accounting-plus.en.json";
import cmeReportTr from "@/i18n/_new/cme-report.tr.json";
import cmeReportEn from "@/i18n/_new/cme-report.en.json";
import mediaTr from "@/i18n/_new/media.tr.json";
import mediaEn from "@/i18n/_new/media.en.json";
import dashboardTr from "@/i18n/_new/dashboard.tr.json";
import dashboardEn from "@/i18n/_new/dashboard.en.json";
import editionsTr from "@/i18n/_new/editions.tr.json";
import editionsEn from "@/i18n/_new/editions.en.json";
import portfolioTr from "@/i18n/_new/portfolio.tr.json";
import portfolioEn from "@/i18n/_new/portfolio.en.json";
import registrationsTr from "@/i18n/_new/registrations.tr.json";
import registrationsEn from "@/i18n/_new/registrations.en.json";
import communicationTr from "@/i18n/_new/communication.tr.json";
import communicationEn from "@/i18n/_new/communication.en.json";
import reportsTr from "@/i18n/_new/reports.tr.json";
import reportsEn from "@/i18n/_new/reports.en.json";
import unifiedNavTr from "@/i18n/_new/unified-nav.tr.json";
import unifiedNavEn from "@/i18n/_new/unified-nav.en.json";

type Dict = Record<string, unknown>;

// derin birleşim: taban (ana sözlük) kazanır, parça yalnız eksik yaprakları doldurur
function deepMerge(base: Dict, frag: Dict): Dict {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(frag)) {
    const bv = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && bv && typeof bv === "object" && !Array.isArray(bv)) {
      out[k] = deepMerge(bv as Dict, v as Dict);
    } else if (out[k] === undefined) {
      out[k] = v;
    }
  }
  return out;
}

const FRAGMENTS: { tr: Dict; en: Dict }[] = [
  { tr: peopleTr as Dict, en: peopleEn as Dict },
  { tr: onsiteTr as Dict, en: onsiteEn as Dict },
  { tr: scientificTr as Dict, en: scientificEn as Dict },
  { tr: formsTr as Dict, en: formsEn as Dict },
  { tr: archiveTr as Dict, en: archiveEn as Dict },
  { tr: b2bTr as Dict, en: b2bEn as Dict },
  { tr: socialTr as Dict, en: socialEn as Dict },
  { tr: floorsTr as Dict, en: floorsEn as Dict },
  { tr: integrationsTr as Dict, en: integrationsEn as Dict },
  { tr: portalTr as Dict, en: portalEn as Dict },
  { tr: financeTr as Dict, en: financeEn as Dict },
  { tr: sponsorshipTr as Dict, en: sponsorshipEn as Dict },
  { tr: badgeQueueTr as Dict, en: badgeQueueEn as Dict },
  { tr: accountingPlusTr as Dict, en: accountingPlusEn as Dict },
  { tr: cmeReportTr as Dict, en: cmeReportEn as Dict },
  { tr: accommodationPlusTr as Dict, en: accommodationPlusEn as Dict },
  { tr: registrationsTr as Dict, en: registrationsEn as Dict },
  { tr: complianceTr as Dict, en: complianceEn as Dict },
  { tr: mediaTr as Dict, en: mediaEn as Dict },
  { tr: dashboardTr as Dict, en: dashboardEn as Dict },
  { tr: editionsTr as Dict, en: editionsEn as Dict },
  { tr: portfolioTr as Dict, en: portfolioEn as Dict },
  { tr: communicationTr as Dict, en: communicationEn as Dict },
  { tr: reportsTr as Dict, en: reportsEn as Dict },
  { tr: unifiedNavTr as Dict, en: unifiedNavEn as Dict },
];

function withFragments(base: Dict): Dict {
  let acc = base;
  for (const f of FRAGMENTS) acc = deepMerge(acc, f.tr);
  return acc;
}
function withFragmentsEn(base: Dict): Dict {
  let acc = base;
  for (const f of FRAGMENTS) acc = deepMerge(acc, f.en);
  return acc;
}

const BASE_TR = trDict as Dict;
const BASE_EN = enDict as Dict;
const DICTS: Record<Lang, Dict> = {
  tr: withFragments(BASE_TR),
  en: withFragmentsEn(BASE_EN),
};

export type Lang = "tr" | "en";

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
    syncHtmlLang(current); // WCAG 3.1.1 — ilk client render'ında aktif dile hizala
  }
  return current;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// WCAG 3.1.1 Language of Page — <html lang> her zaman aktif arayüz dilini izler
// (ekran okuyucular TR içerikle EN telaffuz karışımını böyle engellenir)
function syncHtmlLang(lang: Lang): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

export function setLang(lang: Lang): void {
  current = lang;
  hydrated = true;
  syncHtmlLang(lang);
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

// uyarısız sessiz arama (enum yardımcıları için — constants.label köprüsü)
export function tQuiet(key: string): string | undefined {
  const lang = getLang();
  return lookup(override[lang] ?? DICTS[lang], key) ?? lookup(DICTS.tr, key);
}

// TASK-A F8/F9: durum-etiket köprüsü — TR modunda DONUK map etiketi (birebir eski davranış),
// EN modunda status.<key> sözlüğü (yoksa map etiketine düşer). Böylece aynı enum anahtarı
// farklı eksenlerde farklı TR etiket taşıyabileceği için TR asla sözlüğe bakmaz.
export function tStatus(mapLabel: string | undefined, key: string): string {
  const lang = getLang();
  if (lang === "en") {
    return lookup(override.en ?? DICTS.en, `status.${key}`) ?? lookup(DICTS.tr, `status.${key}`) ?? mapLabel ?? key;
  }
  return mapLabel ?? key;
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
