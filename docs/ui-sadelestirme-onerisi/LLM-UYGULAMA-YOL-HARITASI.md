# LLM UYGULAMA YOL HARİTASI — Maven V2 Dashboard / Menü Sadeleştirme

> Bu belge, bir LLM'e (veya geliştiriciye) **Maven Event Management V2** admin panelinin
> navigasyonunu sadeleştirme işini uçtan uca yaptırmak için yazılmıştır.
> Paket içeriği: `menu-prototipi.html` (çalışır interaktif REFERANS — hedef görsel dil bu dosyada
> birebir uygulanmıştır; tarayıcıda aç) ve `ui-sadelestirme-onerisi.md` (gerekçe + envanter).
> Not: kullanıcının orijinal referans görseli repo'da saklanmıyor; prototip o görsele bağlı kalınarak üretildi.
> **Önce bu iki dosyayı incele, sonra Faz 1'den başla. Her fazın sonunda doğrulama komutlarını çalıştır.**

---

## 0. Bağlam (değiştirme, sadece oku)

- Next.js 16 (App Router, Turbopack), React 19, Tailwind **v4** (`@tailwindcss/postcss`), TypeScript, Prisma, shadcn/Radix, lucide-react, zustand-benzeri `useApp` store (`src/lib/store.ts`).
- Uygulama SPA: `src/app/page.tsx` → `Shell` (`src/components/maven/shell.tsx`) → `MODULE_COMPONENTS[module]` (`src/lib/module-components.tsx`). Modül geçişi `setModule(moduleId, subView?)` ile; **URL路由 yok**, state tabanlı.
- 27 modül, rol (`roles`) + yetenek (`capability`) kapılı. Bu kapılar **korunacak**; sadece menü sunumu değişir.

### 0.1 Bugünün envanteri (somut, bu repoda doğrulanmış)
| Dosya | Durum |
|---|---|
| `src/components/maven/navigation/dual-sidebar.tsx` (1046 satır) | Canlı sidebar. İçinde elle yazılmış eşleme zincirleri: `computedAreaFromModule`, `activeHubId`, `isWorkItemActive`, `handleWorkItemClick`, `getItemDisplayTitle`, `isGlobalSubItemActive`. **Bunlar silinecek.** |
| `src/lib/product-taxonomy.ts` (990 satır) | 4 ayrı nav sözlüğü: `GLOBAL_NAV_AREAS` (5 alan/36 madde, satır ~144), `WORK_NAV_GROUPS` (9 grup, ~234), `WORK_OPERATIONAL_HUBS` (6, ~358) + `WORK_UTILITY_HUBS` (2, ~455). Ayrıca `PRODUCT_MODULE_CATALOG` (~498) ve `getProductContextScope`, `WORK_CONTEXT_BRIDGES` (~951). |
| `src/lib/constants.ts` | `MODULES` (27, ~satır 465+), `MODULE_GROUPS` (7, ~448), `roleCanSee`, `buildModuleCommands`. |
| `src/components/maven/shell.tsx` | `SidebarNav` (~satır 79) **ölü kod** (hiç render edilmiyor) → sil. `<DualSidebar/>` desktop aside + mobil Sheet'te canlı. |
| `src/components/maven/navigation/module-context-bridge.tsx` | İçerik üstü kısayol bandı → **kaldırılacak** (aynı kısayollar menüde var). |
| `tailwind.config.ts` | **Ölü**: Tailwind v4 JS konfig otomatik yüklemiyor, `globals.css`'te `@config` yok, `content` glob'ları (`./pages` vb.) repoda yok → **sil**. |
| `src/app/globals.css` | Token'lar oklch. Işıkta `--sidebar-primary` hue 182 (teal, satır ~73), koyuda hue 264 (mor, satır ~107) → **temaya göre hue değişimi kaldırılacak**. |
| `src/components/ui/sidebar.tsx:483`, `src/components/maven/views/portal-settings.tsx:1744` | `hsl(var(--…))` kalıntısı (v4 token'ları oklch) → düzelt. |

### 0.2 Bağlı testler (kayıpsızlık garantisi — kır, sonra yeniden bağla)
`tests-mini/module-coherence.test.mjs`, `product-taxonomy-and-module-ownership.test.mjs`,
`global-shell-and-jobs-view.test.mjs`, `work-shell-and-work-summary.test.mjs`,
`unified-product-language-and-navigation.test.mjs`, `command-palette.test.mjs`,
`tests/modules/24-ui-organization.spec.ts` (MODULES ≥27, MODULE_GROUPS ≥7, i18n `modules.*` tr/en, rol matrisi).

---

## 1. Hedef UX (referans: `menu-prototipi.html` — orijinal referans görselinin birebir uygulaması)

Görsel dil **soft-ui / açık tema**: dış zemin `#e7e8ea`, kabuk `#f6f6f7` (28px köşe), kartlar beyaz (20px köşe, `0 2px 10px rgba(0,0,0,.05)` gölge, border yok).
Renk disiplini: **siyah** `#101114` yalnızca (a) aktif ray dairesi, (b) aktif menü maddesi, (c) birincil eylem pili; **amber** `#f6c453` yalnızca vurgu/sayaç; **yeşil/kırmızı** yalnızca durum. Gri tonları: metin ikincil `#84858b`, ikon zemini `#e9e9ec`, hover `#f1f1f3`.

Yerleşim (3 bölge):
1. **Üst bar (tek satır):** logo · arama pili (⌘K paleti tek arama yüzeyi) · bildirim/yardım/avatar. Altında sayfa başlığı satırı: `H1 + alt açıklama` solda; sağda iş seçici pili + gri pill'ler + tek siyah birincil pill ("+ Yeni İş").
2. **İkon rayı (64px):** dairesel butonlar; **aktif = siyah dolu daire**. Ray menü açmaz — yalnızca panelin bağlamını seçer: `[Aktif İş]` (yalnızca iş açıkken, amber noktalı) + İşler · Portföy · İletişim · Raporlar · Ayarlar; altta çıkış.
3. **Modüller side-menüsü (252px, beyaz kart):** ray'ın hemen yanında.
   - **İş bağlamı:** başlıkta iş adı + "← İş listesine dön". Altında **açılır-kapanır gruplar** (kullanıcı gereksinimi): grup başlığı (ikon + ad + chevron) tıklanınca alt maddeler açılıp kapanır; açık grubun maddeleri soldan 2px kılavuz çizgisiyle girintili. Aktif grup başlığı `#e9e9ec` zemin; aktif madde **siyah hap** (beyaz metin). Sayaçlar amber rozet.
     Gruplar (7): Yönetim · Katılım · Program · Sponsor & Fuar · Saha & Konaklama · İletişim & Deneyim · Rapor & Ayar.
     Örnek: "Program" açılınca → Program, Bilimsel, Sosyal & Tur.
   - **Firma bağlamı:** seçili ray alanının düz listesi (başlık + maddeler), akordeon yok.
   - Sekme ("İş/Firma" toggle), panel içi arama, "hub/tüm ağaç" anahtarı, `ModuleContextBridge` bandı, edisyon meta şeridi: **hepsi kaldırılır**.

Etkileşim kuralları: aktif madde = `leaf.module === module && (leaf.subView ?? null) === moduleSubView` (tek karşılaştırma). Tıklama = `setModule(leaf.module, leaf.subView ?? null)`. Bir madde seçilince grubu otomatik açık kalır.

---

## 2. Hedef mimari — TEK nav kaynağı

### 2.1 Yeni dosya: `src/lib/nav-tree.ts`
`product-taxonomy.ts` içindeki 4 sözlük + `constants.ts MODULE_GROUPS` **bu tek ağaçta birleşir**.
```ts
export interface NavLeaf { id: string; labelKey?: string; label?: string; icon: string;
  module: string; subView?: string | null; count?: "approvals" | "editions" | null }
export interface NavGroup { id: string; label: string; icon: string; items: NavLeaf[] }
export const WORK_NAV: NavGroup[] = [ /* §1'deki 7 grup; her yaprak module+subView taşır */ ];
export const COMPANY_NAV: Record<"jobs"|"portfolio"|"comms"|"reports"|"settings", { title: string; items: NavLeaf[] }> = { … };
```
- Eski `WORK_NAV_GROUPS` madde adları/hedefleri **birebir** buraya taşınır (kayıpsızlık). `primaryModuleId`+`defaultSubView` → `module`+`subView`.
- Eski `dual-sidebar.tsx`'teki `handleWorkItemClick` if/else'lerindeki **tüm** özel subView'ler (`registrations:categories/approval/import/list`, `sponsorship:sponsors/packages/deliverables`, `accommodation:hotels/transfers`, `onsite:desk`, `badges:queue`, `accounting:defter`, `portals:pwa` vb.) yapraklara veri olarak yazılır — zincirler silinir.
- `PRODUCT_MODULE_CATALOG` ve `getProductContextScope`, `WORK_CONTEXT_BRIDGES` yerlerinde kalabilir (başka modüller kullanıyor); ancak sidebar bunlardan **türemeyecek**.

### 2.2 Yeni bileşen: `src/components/maven/navigation/app-sidebar.tsx` (~250-300 satır hedef)
- Props'suz; `useApp()`'ten `module, moduleSubView, setModule, editions, currentEditionId, me, tenant`.
- Ray + Panel + (mobilde Sheet içeriği aynı bileşen).
- Görünürlük: her yaprak için `roleCanSee(MODULES.find(m=>m.id===leaf.module), role)` ve `hasCapability(edition, mod.capability)` — kapalıysa madde **gizlenir** (mevcut davranış).
- Lokal state yalnızca: `openGroups: Record<string,boolean>` (+ mobil `open`). Bağlam ray'dan türetilir; ayrı "contextTab" state'i **yok**.
- ⌘K paleti (`buildModuleCommands`) ve mobil Sheet bu ağaçtan beslenecek şekilde bağlanır (Faz 3).

### 2.3 Silinecekler / değiştirilecekler
- `dual-sidebar.tsx` **sil** (yerine `app-sidebar.tsx`); `shell.tsx` import'unu güncelle; ölü `SidebarNav`'ı sil.
- `module-context-bridge.tsx` **sil** + `shell.tsx`'teki render'ını kaldır.
- `tailwind.config.ts` **sil**.
- `globals.css`: §3 token bloğunu uygula; hue-264 `.dark --sidebar-primary` satırını kaldır.
- `ui/sidebar.tsx:483` ve `portal-settings.tsx:1744` hsl→yeni token.

---

## 3. Design token'lar (globals.css)

`:root` içine ekle (mevcut oklch setinin YANINA; shadcn adlarını bozma):
```css
--surface-page:#e7e8ea; --surface-shell:#f6f6f7; --surface-card:#ffffff;
--ink:#101114; --ink-2:#84858b; --ink-3:#9a9aa1;
--chip:#e9e9ec; --chip-hover:#f1f1f3; --hairline:#ececef;
--accent-amber:#f6c453; --accent-amber-soft:#fdeec9; --accent-amber-ink:#7a5a12;
--ok:#34a368; --err:#e5484d;
--radius-shell:28px; --radius-card:20px; --shadow-card:0 2px 10px rgba(16,17,20,.05);
```
Kural: siyah/amber/yeşil/kırmızı kullanım noktaları §1'deki listeden taşamaz. Koyu tema gerekirse aynı hue'ların koyu karşılıkları; **vurgu hue'su temaya göre değişmez**.

---

## 4. Fazlar ve doğrulama kapıları

**FAZ 1 — Token & temizlik (davranış değişmez)**
1. `tailwind.config.ts` sil; `hsl(var(` 2 kalıntıyı düzelt; `.dark` mor `--sidebar-primary` kaldır; §3 token'larını ekle.
2. Doğrula: `npx tsc --noEmit` && `npm run lint` && görsel regresyon yok (sidebar hâlâ eski ama renkler tutarlı).

**FAZ 2 — Yeni sidebar (asıl iş)**
1. `nav-tree.ts` yaz (§2.1) — 27 modülün TAMAMının en az bir yaprakta göründüğünü kontrol et.
2. `app-sidebar.tsx` yaz (§1 etkileşim + §2.2). Açılır-kapanır gruplar dahil.
3. `shell.tsx`: `<DualSidebar/>` → `<AppSidebar/>`; `SidebarNav` ölüsünü ve `ModuleContextBridge` render'ını sil; edisyon meta şeridini kaldır (bilgi İş Özeti başlığına iner).
4. `dual-sidebar.tsx`, `module-context-bridge.tsx` sil.
5. Doğrula: `npx tsc --noEmit`; `npm run lint`; ardından **kayıpsızlık kontrolü**: `node -e` ile `nav-tree`'yi require edip 27 MODULES id'sinin kapsandığını assert et (veya Faz 3'te test dosyasını güncelle).

**FAZ 3 — Türetme & testler**
1. `buildModuleCommands` (⌘K) ve mobil Sheet'i `nav-tree`'den türet; `constants.ts`'ten `MODULE_GROUPS`'u sil ve buna bağlı testleri (`24-ui-organization.spec.ts` dahil) **aynı garantilerle** yeni kaynağa yeniden bağla: ≥27 modül kapsama, tr/en i18n `modules.*`, rol matrisi (`roleCanSee` davranışı değişmedi).
2. `product-taxonomy.ts`'te emekli olan sözlükleri (`GLOBAL_NAV_AREAS`, `WORK_NAV_GROUPS`, `WORK_OPERATIONAL_HUBS`, `WORK_UTILITY_HUBS`) kaldır; bunları assert eden `tests-mini/*` testlerini `nav-tree` assert'lerine çevir.
3. Doğrula: `npm run test:unit` (node --test listesi) YEŞİL; `npx playwright test tests/modules/24-ui-organization.spec.ts` (DB gerektiriyorsa `npm run test:unit` yeterli kabul edilip e2e not edilir).

---

## 5. YAPMA listesi
- Yeni bir nav sözlüğü/grubu EKLEME (çakışan 5. tanım olur); tek kaynak `nav-tree.ts`.
- Modül ekleme/çıkarma, `roles`/`capability` matrisi değişikliği, i18n key silme YOK.
- Koyu petrol/teal sidebar'a geri dönme; referans açık soft-ui'dir.
- `handleXClick` tarzı if/else eşleme fonksiyonu YAZMA — eşleme yalnızca veri (leaf.module/subView).
- Panel içine arama, sekme, ikinci akordeon seviyesi KOYMA (grup→madde tek seviye).

## 6. Bitiş tanımı (Definition of Done)
- [ ] Sidebar bileşeni ≤300 satır; navigasyon tanımı tek dosya (`nav-tree.ts`).
- [ ] Aktif madde tespiti tek satır; eşleme if/else'si 0.
- [ ] Referans görsel dili: açık zemin, siyah aktif, amber vurgu; temaya göre hue kayması yok.
- [ ] İş panelinde gruplar açılır-kapanır; seçili maddenin grubu otomatik açık.
- [ ] 27 modül kayıpsız; rol/yetenek kapıları çalışır; tr/en etiketler eksiksiz.
- [ ] `tsc --noEmit`, `lint`, `test:unit` yeşil; güncellenen testler yeni kaynağı doğruluyor.
