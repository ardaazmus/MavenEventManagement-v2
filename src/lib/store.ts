"use client";
// Uygulama durumu: tenant, edisyon seçimi, aktif modül
import { create } from "zustand";

export interface EditionLite {
  id: string;
  name: string;
  slug: string;
  editionLabel?: string | null;
  status: string;
  isPublished: boolean;
  startDate?: string | null;
  endDate?: string | null;
  venueName?: string | null;
  city?: string | null;
  coverColor?: string | null;
  template?: string | null;
  seriesId?: string | null;
  series?: { id: string; name: string } | null;
  capabilities?: { id: string; key: string; enabled: boolean; setupNote?: string | null }[];
  _count?: { participations?: number; registrations?: number; sponsorAgreements?: number; sessions?: number; tasks?: number };
}

export interface TenantLite {
  id: string;
  name: string;
  slug: string;
  plan: string;
  country?: string | null;
  timezone: string;
}

interface AppState {
  tenant: TenantLite | null;
  editions: EditionLite[];
  currentEditionId: string | null;
  module: string;
  refreshKey: number;
  loading: boolean;
  error: string | null;
  setModule: (m: string) => void;
  setCurrentEdition: (id: string) => void;
  bump: () => void;
  bootstrap: () => Promise<void>;
  seed: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  tenant: null,
  editions: [],
  currentEditionId: null,
  module: "dashboard",
  refreshKey: 0,
  loading: true,
  error: null,
  setModule: (m) => {
    set({ module: m });
    try { window.localStorage.setItem("maven.module", m); } catch { /* yoksay */ }
  },
  setCurrentEdition: (id) => set({ currentEditionId: id }),
  bump: () => set({ refreshKey: get().refreshKey + 1 }),

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = await res.json();
      if (!data.tenant) {
        set({ tenant: null, editions: [], loading: false });
        return;
      }
      const editions: EditionLite[] = data.editions ?? [];
      const persisted = typeof window !== "undefined" ? window.localStorage.getItem("maven.edition") : null;
      const current = editions.find((e) => e.id === persisted)?.id ?? editions[0]?.id ?? null;
      const persistedModule = typeof window !== "undefined" ? window.localStorage.getItem("maven.module") : null;
      set({ tenant: data.tenant, editions, currentEditionId: current, module: persistedModule ?? "dashboard", loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Bağlantı hatası", loading: false });
    }
  },

  seed: async () => {
    set({ loading: true });
    try {
      await fetch("/api/seed", { method: "POST" });
      await get().bootstrap();
      set({ loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Seed hatası", loading: false });
    }
  },
}));

export function currentEdition(): EditionLite | undefined {
  const { editions, currentEditionId } = useApp.getState();
  return editions.find((e) => e.id === currentEditionId);
}

export function hasCapability(ed: EditionLite | undefined, key: string): boolean {
  return Boolean(ed?.capabilities?.some((c) => c.key === key && c.enabled));
}

// modül seçimini kalıcı yap (reload sonrası aynı modülde devam)
export function persistModule(m: string) {
  try { window.localStorage.setItem("maven.module", m); } catch { /* yoksay */ }
}
export function restoreModule(): string | null {
  try { return window.localStorage.getItem("maven.module"); } catch { return null; }
}
