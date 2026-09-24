// API istemci yardımcıları — tüm istekler göreli yol
import { useApp } from "@/lib/store";

// TASK-A F1: init desteği — portal uçları x-portal-token başlığıyla çağrılır
// (belirteç URL'e yazılmaz: proxy/log sızıntısı önlenir)
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `İstek başarısız (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `İşlem başarısız (${res.status})`);
  }
  return data as T;
}

// basit listelenmiş varlık yardımcıları
// Faz A: tenant-kapsamlı listeler için tenantId otomatik eklenir (store'daki aktif kiracı);
// edition-kapsamlı varlıklar tenantId parametresini yok sayar (sunucu guard'ı filtreler).
export const listEntity = <T,>(entity: string, params?: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams();
  const autoTenant = typeof window !== "undefined" ? useApp.getState().tenant?.id : undefined;
  const tenantId = params?.tenantId ?? autoTenant;
  if (tenantId) sp.set("tenantId", String(tenantId));
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  return apiGet<{ items: T[] }>(`/api/${entity}${qs ? `?${qs}` : ""}`).then((r) => r.items);
};

// TASK-A F6: imleçli sayfalı liste — { items, nextCursor } ham döner (useApi append modu);
// cursor boş/undefined → ilk sayfa. Sunucu tarafı q araması ve kesintisiz yükleme için.
export const listEntityPaged = <T,>(
  entity: string,
  params?: Record<string, string | number | undefined>,
  cursor?: string,
): Promise<{ items: T[]; nextCursor?: string | null }> => {
  const sp = new URLSearchParams();
  const autoTenant = typeof window !== "undefined" ? useApp.getState().tenant?.id : undefined;
  const tenantId = params?.tenantId ?? autoTenant;
  if (tenantId) sp.set("tenantId", String(tenantId));
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  if (cursor) sp.set("cursor", cursor);
  const qs = sp.toString();
  return apiGet<{ items: T[]; nextCursor?: string | null }>(`/api/${entity}${qs ? `?${qs}` : ""}`);
};
