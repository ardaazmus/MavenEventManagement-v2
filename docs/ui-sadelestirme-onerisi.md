# Maven V2 — Dashboard Sadeleştirme ve Menü Mimarisi Önerisi

> Tarih: 2026-10-09 · Kapsam: `src/components/maven/shell.tsx`, `src/components/maven/navigation/dual-sidebar.tsx`, `src/lib/constants.ts`, `src/lib/product-taxonomy.ts`, `tailwind.config.ts`, `src/app/globals.css`
> Etkileşimli örnek: `docs/ui-sadelestirme-onerisi/menu-prototipi.html` (tarayıcıda açın)

---

## 1. Mevcut Yapının Envanteri (ne var?)

### 1.1 Modüller
- `src/lib/constants.ts` içinde **27 modül** (`MODULES`) ve **7 yaşam-döngüsü grubu** (`MODULE_GROUPS`).
- `src/lib/module-components.tsx` modül → React bileşeni haritası (tek kaynak, iyi).
- Rol (`roles`) + yetenek (`capability`) kapıları burada tanımlı — bu kısım sağlıklı.

### 1.2 Navigasyon tanımları (aynı anda 4 ayrı sözlük!)
| Sözlük | Dosya | İçerik | Kim kullanıyor? |
|---|---|---|---|
| `MODULE_GROUPS` + `MODULES` | `constants.ts` | 7 grup / 27 modül | **Ölü** `SidebarNav` (shell.tsx:79, hiç render edilmiyor) + ⌘K paleti + testler |
| `GLOBAL_NAV_AREAS` | `product-taxonomy.ts` | 5 alan / 36 alt madde | DualSidebar (Firma paneli) |
| `WORK_NAV_GROUPS` | `product-taxonomy.ts` | 9 grup / 36 madde | DualSidebar "tüm ağaç" modu + arama |
| `WORK_OPERATIONAL_HUBS` + `WORK_UTILITY_HUBS` | `product-taxonomy.ts` | 6+2 hub | DualSidebar "hub" modu |

Aynı ekrana (örn. Katılımcılar) **dört farklı menü tanımı ve üç farklı yol** ile gidilebiliyor.
Spagettinin kökü budur: tanım tek yerde olmadığı için her sadeleştirme denemesi yeni bir katman eklemiş.

### 1.3 Davranış (işleyiş) sorunları
1. **El yazımı eşleme zincirleri:** `dual-sidebar.tsx` (1046 satır) içinde `computedAreaFromModule`, `activeHubId`, `isWorkItemActive`, `handleWorkItemClick`, `getItemDisplayTitle`, `isGlobalSubItemActive` — modül id'lerini menü maddelerine çeviren yüzlerce satırlık `if/else`. Yeni modül = bu zincirlere elle ekleme = kaçınılmaz kopma.
2. **Çift durum (state) kaynağı:** `localArea` + `activeGlobalArea` prop'u, `localContextTab` + türetilmiş `isWorkContextActive`, `expandedHubs` + `expandedGlobalAreas`, `viewMode`, `searchQuery`… Aynı bilgi hem store'da (`module`, `moduleSubView`) hem lokal state'te tutuluyor; ikisi senkronize kalamıyor → "tıklıyorum, seçim başka yerde yanıyor" hissi.
3. **Aynı işlev için 5 yüzey:** sol ikon şeridi + ikinci panel akordeonları + "İş Modülleri / Firma Globali" sekmeleri + içerik üstü `ModuleContextBridge` bandı + üst bardaki edisyon `Select`. Kullanıcı "menü hangisi?" sorusunu haklı olarak soruyor.
4. **Ölü kod:** `shell.tsx` içindeki `SidebarNav` hiç çağrılmıyor ama 7-grup düzenini ve renk dilini orada yaşatıyor; kopyala-yapıştır tasarımların kaynağı.

### 1.4 Renk neden "hiç tutmadı"? (somut bulgular)
1. **`tailwind.config.ts` ölü konfig:** Tailwind **v4** (`@tailwindcss/postcss`) kullanımda; v4 JS konfigürasyonunu otomatik yüklemez ve `globals.css` içinde `@config` yok. Ayrıca konfigin `content` glob'ları `./pages`, `./components`, `./app` — repoda bu klasörler yok (hepsi `src/` altında). Yani bu dosya hiçbir şeyi boyamıyor; ama `hsl(var(--…))` sözdizimiyle eski renk anlayışını canlı tutuyor.
2. **Karışık renk birimleri:** `globals.css` **oklch** değişkenleri tanımlarken `src/components/ui/sidebar.tsx:483` ve `portal-settings.tsx:1744` hâlâ **hsl(var(--…))** okuyor → o yüzeylerde renkler yanlış/şeffaf düşüyor.
3. **Tema başına farklı marka rengi:** açık temada `--sidebar-primary: oklch(0.72 0.12 182)` (**teal**) iken koyu temada `--sidebar-primary: oklch(0.488 0.243 264.376)` (**mor/mavi**). Tema değiştirince markanın rengi değişiyor — "renk tutmuyor" şikâyetinin birebir karşılığı.
4. **Yüzey üstüne yüzey:** `bg-sidebar/50`, `bg-background/20`, `bg-sidebar-accent/30` gibi yarı saydam katmanlar koyu panel üstünde üst üste binince her bölge başka tonda görünüyor; görsel hiyerarsi kayboluyor.

---

## 2. Önerilen Model: "1 Ray + 1 Bağlamsal Panel"

İstediğiniz şema (en solda ana kontrol ikonları, hemen yanında modüller side-menüsü) doğru şemadır.
Sadeleştirmenin kuralı: **her karar tek yerde, her eylem tek yüzeyde.**

### 2.1 Sol ikon rayı (56–64px) — BAĞLAM değiştirici, menü değil
| İkon | İşlev |
|---|---|
| ⬤ Logo/Kiracı | ana marka |
| 📁 **Aktif İş** (yalnızca bir iş açıkken) | İş modülleri panelini açar |
| 💼 İşler | Firma → İşler listesi |
| 👥 Portföy | Firma → Portföy |
| 📢 İletişim | Firma → Genel İletişim |
| 📊 Raporlar | Firma → Firma Raporları |
| ⚙️ Ayarlar | Firma → Firma Ayarları |
| (alt) Yardım + Avatar | |

Ray **menü açmaz**, yalnızca ikinci panelin hangi bağlamı göstereceğini seçer. Aktif ikon = **siyah dolu daire** (referans görseldeki dil); pasif ikonlar açık gri daire üzerinde koyu gri.

### 2.2 İkinci panel (240px) — MODÜLLER side-menüsü
- **Firma bağlamında:** seçili alanın düz listesi (ekran görüntüsündeki gibi): başlık + en çok 6–9 madde, akordeonsuz.
- **İş bağlamında:** en çok **7 bölüm**, bölüm başına ≤5 madde, tek seviye (hub-içinde-hub yok):

```
İŞ: No-Dig Turkey 2026            [← İş listesine dön]
──────────────────────────────
YÖNETİM        İş Özeti · Kurulum Listesi · Görevler & Onaylar · İş Bilgileri
KATILIM        Katılımcılar · Kategoriler & Haklar · Onay Merkezi · Formlar · Aktarım
PROGRAM        Program · Bilimsel · Sosyal & Tur
SPONSOR        Sponsorlar · Paketler · Floor Studio · B2B
SAHA           Saha Operasyonu · Yaka Kartı · Belgeler · Konaklama
DENEYİM        İş İletişimi · Dış Deneyimler (PWA) · Medya
RAPOR & AYAR   Defter & Raporlar · İş Ayarları
```

- Sekme yok ("İş Modülleri / Firma Globali" toggle'ı kaldırılır): bağlamı **ray** belirler.
- Panel içi arama ve "hub/tüm ağaç" görünüm anahtarı kaldırılır → arama yalnızca üst barda (⌘K paleti zaten var).
- `ModuleContextBridge` bandı kaldırılır: aynı 5 kısayol "YÖNETİM" bölümünde zaten mevcut.

### 2.3 Üst bar — tek satır
`Kiracı adı  ›  [İş Seçici ▾]  …  ⌘K  🔔  Tema  Avatar`
Edisyon meta şeridi (tarih/mekân satırı) kaldırılır; bu bilgi İş Özeti sayfasının başlığına iner.

### 2.4 Renk sistemi — referans görselin dili (soft-ui, açık tema)
| Token | Değer | Kural |
|---|---|---|
| sayfa zemini | `#e7e8ea` (dış) / `#f6f6f7` (kabuk) | Kabuk 28px, kartlar 20px köşe; border yerine 1px yumuşak gölge |
| kartlar | `#ffffff` | Düz, çerçevesiz; gölge `0 2px 10px rgba(0,0,0,.05)` |
| metin | `#101114` / ikincil `#84858b` | Güçlü tipografik hiyerarşi (27px başlık, 13px alt açıklama) |
| **siyah** | `#101114` | YALNIZCA: aktif ray dairesi, aktif menü maddesi (hap), birincil eylem pili ("+ Yeni İş") |
| **amber** | `#f6c453` (zemin `#fdeec9`) | YALNIZCA vurgu: sayaç rozetleri, grafik etiketi, tek ilerleme çubuğu |
| yeşil / kırmızı | `#34a368` / `#e5484d` | YALNIZCA durum noktaları (↗ %12,5, onay kuyruğu çizgileri) |

Kaldırılacaklar: koyu petrol sidebar, yarı saydam katman üstüne katman (`/20 /30 /50`), tema başına değişen marka hue'su (mevcut `.dark` `--sidebar-primary` moru), mikro gölgeler ve çok renkli rozetler. Koyu tema gerekirse aynı hue'ların koyu zemin karşılıklarıyla tanımlanır — vurgu rengi temaya göre ASLA hue değiştirmez.

---

## 3. Kod Mimarisi Önerisi (spagettiyi kökten kesen)

1. **Tek navigasyon kaynağı:** `product-taxonomy.ts` içinde TEK ağaç:
   ```ts
   type NavLeaf = { id: string; labelKey: string; icon?: string; module: ModuleId; subView?: string };
   type NavGroup = { id: string; titleKey: string; items: NavLeaf[] };
   const COMPANY_NAV: Record<GlobalAreaId, NavGroup[]>; 
   const WORK_NAV: NavGroup[];
   ```
   `WORK_NAV_GROUPS` + `WORK_*_HUBS` + `MODULE_GROUPS` bu tek ağaçta birleşir.
2. **Eşleme if/else'leri silinir:** aktif madde = `leaf.module === module && leaf.subView === moduleSubView` karşılaştırması; tıklama = `setModule(leaf.module, leaf.subView ?? null)`. `handleWorkItemClick` vb. 5 fonksiyon (~350 satır) yok olur.
3. **Lokal state asgari:** yalnızca `open` (mobil) ve ray seçimi; `module`/`moduleSubView` store'u tek doğruluk kaynağı kalır.
4. **Türetilen yüzeyler aynı ağaçtan:** ⌘K paleti, mobil Sheet, breadcrumb. (Şu an palet `MODULES`'ten, sidebar başka sözlükten geliyor.)
5. **Temizlik listesi:** `SidebarNav` (ölü) sil; `tailwind.config.ts` sil (v4'te etkisiz) ya da `@config` ile bağla — öneri: sil; `hsl(var(--…))` kalan 2 yeri yeni token setine çevir; temaya göre hue değiştiren `--sidebar-primary` kullanımını §2.4'teki tek soft-ui token setiyle değiştir.
6. **Testler:** `tests-mini/module-coherence`, `24-ui-organization.spec.ts` gibi kayıpsızlık testleri tek ağaca yeniden bağlanır (27 modülün tamamının ağaçta görünür olduğu aynı garantiyle test edilir — özellik kaybı yok).

---

## 4. Geçiş Planı (önerilen sıra)

1. **Faz 0 (bugün):** Bu belge + `menu-prototipi.html` üzerinde görsel onay.
2. **Faz 1:** Renk token düzeltmesi (3 dosya, düşük risk): `.dark` sidebar-primary, hsl kalıntıları, ölü konfig kaldırma.
3. **Faz 2:** Tek `NAV_TREE` + veri güdümlü yeni `app-sidebar.tsx` (~250 satır hedef); `dual-sidebar.tsx` emekliye ayrılır; köprü bandı + panel-arama + sekmeler kalkar.
4. **Faz 3:** Palet/mobil/breadcrumb aynı ağaçtan türetme; test güncelleme; `MODULE_GROUPS` emekliliği.

Hedef metrik: sidebar bileşeni ≤ 300 satır, navigasyon tanımı tek dosya, aktif-madde mantığı 1 satır.
