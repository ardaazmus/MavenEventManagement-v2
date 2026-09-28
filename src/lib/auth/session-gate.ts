// ─── P06.4b: Oturum canlılık kapısı (saf karar fonksiyonu) ─────────────────────
// requestActor her yönetim isteğinde bu kapıyı çalıştırır: kullanıcı satırı
// silinmiş/devre dışıysa, çerez sürümü güncel değilse ya da kiracı bağı
// bozulmuşsa oturum ölüdür (401). P06.4-öncesi çerezlerde sv yoktur ve yalnız
// sessionVersion 0 ile eşleşir (geriye uyumlu, fail-closed).
export interface SessionGateUser {
  status: string;
  sessionVersion: number;
  tenantId: string;
}

export interface SessionGateInput {
  sessionSv: number | undefined;
  user: SessionGateUser | null;
  headerTenantId: string;
}

export function isSessionLive(input: SessionGateInput): boolean {
  const { user } = input;
  if (!user) return false;
  if (user.status !== "ACTIVE") return false;
  if (user.tenantId !== input.headerTenantId) return false;
  const sv = input.sessionSv;
  if (typeof sv !== "number" || Number.isNaN(sv)) {
    // Legacy çerez (sv yok): yalnız hiç bump yememiş hesapla yaşar.
    if (sv !== undefined) return false;
    return user.sessionVersion === 0;
  }
  return sv === user.sessionVersion;
}
