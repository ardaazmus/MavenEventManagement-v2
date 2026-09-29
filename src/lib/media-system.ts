// ============================================================================
// MAVEN — Merkezi Medya Klasörü Altyapısı
// Kullanıcı kuralı: Yaka Kartı, sertifika, kişi fotoğrafı, kurum logosu, otel
// görseli, materyal, portal görseli — hepsi Medya klasöründe KENDİ klasöründe
// toplanır. Yüklenen her dosya benzersiz adla kaydedilir.
// ============================================================================
import { db, type DbTx } from "@/lib/db";

export interface SystemFolderSpec {
  key: string;
  name: string;
  color: string;
  description: string;
}

// Kök klasör + kategori alt klasörleri (sabit systemKey ile tekilleştirilir)
export const MEDIA_ROOT_KEY = "ROOT";

export const SYSTEM_MEDIA_FOLDERS: SystemFolderSpec[] = [
  { key: "YAKA_KARTI", name: "Yaka Kartı Tasarımları", color: "#0d9488", description: "Yaka kartı tasarımları, arka planlar, baskı çıktıları" },
  { key: "SERTIFIKA", name: "Sertifikalar", color: "#7c3aed", description: "Sertifika tasarımları, arka planlar, üretilen belgeler" },
  { key: "KISI_FOTOGRAF", name: "Kişi Fotoğrafları", color: "#059669", description: "Katılımcı/konuşmacı portreleri — kişi kaydıyla benzersiz adla gelir" },
  { key: "KURUM_LOGO", name: "Kurum/Kuruluş Logoları", color: "#b45309", description: "Kurum ve kuruluş logoları" },
  { key: "OTEL", name: "Otel Görselleri", color: "#0891b2", description: "Otel logoları, kapak ve oda görselleri" },
  { key: "MATERYAL", name: "Materyaller", color: "#c2410c", description: "Oturum sunumları, bildiri dosyaları, videolar" },
  { key: "PORTAL", name: "Portal Görselleri", color: "#4f46e5", description: "Dış portal header/arka plan görselleri" },
  { key: "FLOOR_STUDIO", name: "Floor Studio", color: "#334155", description: "Mekânsal plan kaynak dosyaları (ayrı uygulama)" },
  { key: "DIGER", name: "Diğer", color: "#64748b", description: "Kategoriye girmeyen varlıklar" },
];

/** Bir edisyon için sistem klasörlerini garanti eder (idempotent), map döner. */
export async function ensureSystemFolders(editionId: string, client?: DbTx): Promise<{
  root: { id: string; name: string };
  folders: Record<string, { id: string; name: string }>;
}> {
  // ONBOARD-2: seed atomikliği — tx verilirse ona katılır, yoksa varsayılan davranış
  const c: DbTx = client ?? (db as unknown as DbTx);
  // 1) Kök klasör
  let root = await c.mediaFolder.findFirst({
    where: { editionId, systemKey: MEDIA_ROOT_KEY },
  });
  if (!root) {
    root = await c.mediaFolder.create({
      data: { editionId, name: "Medya", systemKey: MEDIA_ROOT_KEY, color: "#0f766e", description: "Maven merkezi medya arşivi kökü" },
    });
  }

  // 2) Kategori alt klasörleri
  const existing = await c.mediaFolder.findMany({
    where: { editionId, parentId: root.id, systemKey: { not: null } },
  });
  const folders: Record<string, { id: string; name: string }> = { [MEDIA_ROOT_KEY]: { id: root.id, name: root.name } };
  for (const spec of SYSTEM_MEDIA_FOLDERS) {
    const found = existing.find((f) => f.systemKey === spec.key);
    if (found) {
      folders[spec.key] = { id: found.id, name: found.name };
    } else {
      const created = await c.mediaFolder.create({
        data: {
          editionId,
          parentId: root.id,
          name: spec.name,
          systemKey: spec.key,
          color: spec.color,
          description: spec.description,
        },
      });
      folders[spec.key] = { id: created.id, name: created.name };
    }
  }
  return { root: { id: root.id, name: root.name }, folders };
}

/** Sistem klasörünü çözer — bilinmeyen anahtar DIGER'e düşer. */
export function resolveSystemFolderKey(key?: string | null): string {
  if (key && SYSTEM_MEDIA_FOLDERS.some((s) => s.key === key)) return key;
  return "DIGER";
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };

/** Dosya adını slug'a çevirir (Türkçe karakter dostu). */
export function slugifyName(name: string): string {
  return name
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, "") // uzantıyı at — ayrı verilir
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "dosya";
}

/**
 * Benzersiz varlık adı üretir: `kisi-fotografi-ayse-yilmaz-l2x9k4.png`
 * Kural (kullanıcı): kişi kaydı yapılırken resim BENZERSİZ adla medya klasörüne eklenir.
 */
export function uniqueAssetName(baseName: string, ext?: string | null): string {
  const slug = slugifyName(baseName);
  const uniq = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
  const extClean = (ext ?? "").replace(/^\./, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${slug}-${uniq}${extClean ? `.${extClean}` : ""}`;
}

/** dataUrl'den mime + uzantı + boyut çıkarır. */
export function parseDataUrl(dataUrl: string): { mimeType: string; ext: string; sizeKb: number } | null {
  const m = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  const sizeKb = Math.round((m[2].length * 3) / 4 / 1024);
  const extMap: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
    "application/pdf": "pdf", "video/mp4": "mp4", "audio/mpeg": "mp3",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/zip": "zip", "text/plain": "txt",
  };
  return { mimeType, ext: extMap[mimeType] ?? (mimeType.split("/")[1] ?? "bin").replace(/[^a-z0-9]/g, ""), sizeKb };
}
