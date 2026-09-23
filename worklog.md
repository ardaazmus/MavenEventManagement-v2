# Maven Event Management — Worklog

---
Task ID: 1
Agent: Z.ai Code (ana ajan)
Task: Zip içindeki mimari dokümana (Maven_Event_Management_Ortak_Organizasyonel_Mimari.md + 11 Ar-Ge dosyası) birebir uyan Event Management App'in eksiksiz geliştirilmesi.

Work Log:
- Upload kanalı sandbox'a dosya ulaştıramadı (3 deneme). Arka plan zip-watcher kuruldu (PID 1640, /home/z/my-project/upload/).
- Kullanıcının paylaştığı Google Docs linki `export?format=txt` ile indirildi (108 KB, 5220 satır) → `docs/maven-arge/Maven_UX_ArGe_Tum_Dokumantasyon.txt`. İçinde: 00 indeks + 01-11 Ar-Ge dosyaları + 63 başlıklı kaynak "Ortak Organizasyonel Mimari" MD'nin TAMAMI.
- Gerçek mimari özlendi: Person ≠ Participation ≠ Registration ≠ Role ≠ Payment; Tenant→Series→Edition; Entitlement Engine; çok eksenli durum modeli (§10); capability tabanlı modül sistemi (§6); Floor Studio ayrı uygulama, ortak kimlikler (§20, §60).
- Prisma şeması Master Domain Graph (§58) ile birebir yeniden yazıldı: **61 model**. `bunx prisma db push` ✓
- `src/lib/constants.ts`: tüm durum eksenleri (REGISTRATION_STATUS, PAYMENT_STATUS, ATTENDANCE_STATUS, BADGE, CERTIFICATE, ACCOMMODATION, SUBMISSION, SESSION, INVITATION, DELIVERABLE, CLAIM, ORDER) + TR etiketler + STATUS_TONE renkleri + CAPABILITIES (§6) + TEMPLATES + ORG_EVENT_ROLES (§4) + EVENT_ROLES (§11) + REG_SOURCES/FUNDING_SOURCES (§12) + EDITION_STATUS (§7) + MODULES (§53 menü).
- API katmanı: `src/lib/api/registry.ts` (61 entity için generic CRUD sözleşmesi: include/search/filter/orderBy/audit) + `src/app/api/[entity]/route.ts` + `[id]/route.ts` (Next 16: await params) + özel rotalar:
  - `/api/bootstrap` — SPA ilk yükleme (tenant, edisyonlar, sayaçlar, aktivite)
  - `/api/dashboard` — 08 dosyasındaki KPI sözleşmeleri: portföy + edisyon görünümü, 35 KPI, hazırlık denetimi (engelleyici/uyarı, 8/8), kayıt eğrisi, kaynak dağılımı
  - `/api/scan` — onsite tarama motoru: ilk geçerli giriş → CHECKED_IN; tekrar tarama → RESCAN_WARNING (sarı); engelli → DENIED; manuel istisna forceReason ile; oturum girişi ayrı liste
  - `/api/flows` — domain aksiyonları: registration.decide/cancel (claim CONSUMED/RELEASED + badge READY/VOID), sponsor.guest (Person→Participation→Registration→Claim RESERVED zinciri), finance.manualPayment (§38: reason zorunlu, 50k+ ikinci onay), finance.refund, booth.allocate, reservation.confirm (her gece stok kontrolü — bir gece eksikse engel), certificate.generate (uygunluk kuralı), edition.publish (denetim engelleyicileri), person.merge (önerili+onaylı), invitation.respond, capability.toggle
  - `/api/seed` — 61 modeli dolduran zengin demo: canlı edisyon No-Dig Turkey 2026 (ONSITE), TechDays 2027 (PLANNING), 24 kişi, 8 kurum, 25 kayıt (tüm durum eksenleri), Gold Sponsor 20/14/2/4 hak dökümü (09-C senaryosu), 14 bildiri + hakem/karar, 7 oturum, otel + gecelik stok + 5 rezervasyon + oda arkadaşı, 6 sipariş/ödeme/iade, 12 LCV, rozet/credential/30 tarama, sertifika kuralları, 4 kampanya, 10 görev.
- UI (SPA `/`): koyu teal sidebar + bağlam şeridi (Tenant > Seri > Edisyon, tarih/yer/saat dilimi) + sabit footer (mt-auto). 15 modül:
  - Dashboard (portföy + edisyon: 8 KPI + hazırlık 8/8 + finans/sponsor/bilimsel/program kartları + eğri + donut)
  - Etkinlikler (3 adımlı kurulum sihirbazı + şablon yetenek önerisi)
  - Kişiler + **Person 360** çekmecesi (§54: kimlik, edisyona göre kayıt/ödeme/rol/rozet/tarama/sertifika, bilimsel)
  - Kurumlar + **Kurum 360** (§55: roller, hak dökümü, stand, finans, teslimler)
  - Kayıt & Katılımcılar (kategori doluluk kartları, durum filtresi, onay/ret/iptal + etki önizlemesi, LCV sekmesi)
  - Bilimsel (bildiri detay: yazarlar, hakem atamaları, sürümlü kararlar; komite karar dialogu)
  - Program (gün filtresi, salon çakışma tespiti, yayın engeli, görevliler)
  - Sponsor & Fuar (Entitlement havuzları 4'lü döküm + claim listesi + misafir ekleme + teslim takvimi + ticari stand planı, Floor Studio ayrımı notu)
  - Konaklama (gecelik stok ızgarası renk kodlu, release uyarısı, teyit akışı)
  - Ödeme & Ek Hizmet (6 finans KPI, sipariş detay: kalemler→katılımcı, ödeme zaman çizelgesi, açık bakiye, manuel tahsilat dialogu)
  - İletişim, Sahada (kapı seçimi + tarama masası + sonuç kartı yeşil/sarı/kırmızı + canlı akış + manuel istisna), Belgeler (4'lü sayaç + üretim), Operasyon (6 kolon kanban + hızlı durum), Ayarlar (capability switch'leri + kurum atamaları)
- Doğrulama (agent-browser, uçtan uca): dashboard render ✓, edisyon değişimi ✓, sponsor misafir ekleme (ayrılmış 2→3, kalan 4→3) ✓, QR tarama yeşil ✓, tekrar tarama sarı ✓ (location MAIN_DOOR düzeltmesi), kayıt onaylama (claim CONSUMED + rozet READY) ✓, rezervasyon teyidi (2 oda-gece tüketildi) ✓, Person 360 ✓ (apiGet import + response wrap düzeltmeleri), yetenek kilidi ekranı ✓, Operasyon kanban ✓, Konaklama stok ızgarası ✓, campaigns orderBy düzeltmesi (createdAt yok → name) ✓.
- ESLint: 0 error (useApi async IIFE düzenlemesi, eksik importlar: label/apiGet/useState/Select).

Stage Summary:
- **61 modellik Prisma şeması kaynak mimarinin Master Domain Graph'ı ile birebir uyumlu**; organizasyon yapısı (Tenant→Series→Edition→Participation) ve iş kayıtları (Registration/Order/Payment/Entitlement/Submission/…) dokümanla 1:1.
- 15 modüllü SPA + generic REST API + 6 özel iş rotası + gerçekçi demo verisi.
- Anti-patternlere uyuldu (§57): tek status yok (çok eksenli), sponsor tier hard-code değil, complimentary ≠ PAID, bilimsel karar ≠ program slotu, stant ticari tahsis ≠ geometri.
- Bilinen ufak esneklikler: registration confirmationNo akışta cuid (okunaklı format sadece seed'de); Floor Studio geometri yalnız FloorPlanObject ile temsili.
- Zip hala upload edilmedi; zip gelirse `upload/maven_docs` watcher çıkaracak — mimari farkları hizalanmalı.

Unresolved / sonraki adımlar:
- Katılımcı/sponsor/davetli PORTALLARI (dış kullanıcı akışları) ayrı faz.
- Form tasarımcısı (sürükle-bırak soru editörü) ve koşullu soru istatistikleri.
- Floor Studio bağlantı sözleşmesi (shared ID sync endpoint'leri).
- Person merge UI'ı (API hazır).

---
Task ID: F-prep (F1-F5)
Agent: Z.ai Code (ana ajan)
Task: Kullanıcının yeni isteği — Geniş kapsamlı Form Yönetimi & Tasarım Merkezi (kayıt formu, katılımcı formu, anketler, mobil interaktif QA öğeleri, spam koruması, kayıt muhasebesi, online ödeme, saha giderleri entegrasyonu)

Work Log:
- Prisma şeması genişletildi: `FormSubmission` (spam puanı/gerekçeleri, honeypot, elapsed, IP, kaynak), `Expense` (kategori/saha harcaması, fiş, onay, ödeme yöntemi) modelleri; `FormDefinition`'a type (REGISTRATION|SURVEY|FEEDBACK|QA_MOBILE|CUSTOM), isPublic, spam ayarları (honeypotEnabled, minSubmitSeconds, maxPerEmailPerDay, blockedDomains, autoApprove), enableOnlinePayment, defaultCategoryId, successMessage; `FormField`'a placeholder + mobileInteractive. `bunx prisma db push --force-reset` ✓ (seed yeniden doldurulacak)
- `src/lib/spam-guard.ts`: 7 katmanlı spam motoru (honeypot +100, engelli domain +100, zaman tuzağı +60, geçersiz e-posta +50, IP hız limiti +40, e-posta günlük limit +80, mükerrer onaylı +30; eşik 50 → SPAM). Bellek içi günlük sayaçlar.
- `src/lib/api/registration-chain.ts`: FormSubmission → Person → Participation → Registration → Order/Line/Payment zinciri (idempotent; §2 prensibi: her adım bağımsız kayıt). cancelRegistrationOfSubmission ile spam/ret durumunda bağlı kayıt iptali.
- API rotaları:
  - `POST /api/public-register` — spam korumalı herkese açık kayıt: {formId, respondentName, respondentEmail, phone, organization, answers{fieldId:değer}, honeypotValue, elapsedSeconds, paymentMethod} → SPAM ise bile submission kaydedilir (gerekçeleriyle), temizse kayıt zinciri + PENDING ödeme oluşur. Yanıt: {submissionId, status, spamScore, spamReasons, registration, order, payment}
  - `GET/PATCH/DELETE /api/form-submissions/[id]` — PATCH action: approve (kayıt zinciri kurar/iptal edileni geri açar) | reject | spam | pending
  - `GET /api/form-stats?formId=` — gönderi özeti + alan bazlı dağılım (SINGLE/MULTI/CHECKBOX/QA_QUIZ), NUMBER/RATING ort-min-max, NPS skoru (promoter-passive-detractor), son 14 gün günlük akış, spam oranı
  - `GET /api/accounting?editionId=` — entegre defter: gelir (SUCCEEDED payments), bekleyen tahsilat, gider (APPROVED/PAID/REIMBURSED) + planlanan, net/marj, açık alacak (order bakiyesi), kaynak/kategori kırılımı, 30 günlük seri, son 60 birleşik hareket
  - `POST /api/payments/[id]/process` — sanal POS simülasyonu: kart doğrulama, **0000 ile biten kart → FAILED; aksi SUCCEEDED + order bakiyesi yeniden hesap (OPEN/PARTIALLY_PAID/PAID)
- Registry: `form-submissions` ve `expenses` varlıkları eklendi (generic CRUD + audit); `forms` entry'sine _count.submissions + orderBy + audit eklendi
- constants.ts: FORM_TYPES, FORM_TYPE_HINTS, FORM_FIELD_TYPES (15 tür; RATING/NPS/QA_QUIZ mobil interaktif), CHOICE_FIELD_TYPES, FORM_SUBMISSION_STATUS, SUBMISSION_SOURCES, EXPENSE_STATUS/CATEGORY/PAYMENT_METHOD, PAYMENT_METHODS; MODULES'a `forms` (Form Merkezi, capability=null) ve `accounting` (Muhasebe, capability=REGISTRATION) eklendi; STATUS_TONE'a SPAM/PLANNED/PENDING_RECEIPT/REIMBURSED/CLOSED
- Seed: Online Kayıt Formu (REGISTRATION, spam ayarlı, engelli domainler: spam.xyz/tempmail.xyz/guvensizmail.com, ödeme yöntemi alanı), Kongre Memnuniyet Anketi (8 yanıt, NPS/RATING/Quiz mobil interaktif), kapalı geri bildirim + taslak özel form; gönderiler: 3 SPAM (honeypot/engelli domain/zaman tuzağı gerekçeli), 2 PENDING, 1 APPROVED + kayıt zinciri + tahsil edilmiş ödeme, 1 ADMIN kayıtlı; 8 gider (saha harcamaları dahil, 4 farklı durum)
- page.tsx: `forms` ve `accounting` modülleri render'a bağlandı; stub view'lar yazıldı

Stage Summary:
- Form Merkezi backend'i TAM: form CRUD (registry), spam korumalı public kayıt, gönderi inceleme, istatistik, sanal POS, entegre muhasebe
- Sıradaki: F-a (form-center.tsx UI) + F-b (accounting.tsx UI) paralel agent görevleri, sonra E2E doğrulama

---
## UI AGENT SÖZLEŞMESİ (F-a / F-b ajanları için ortak kurallar)

Konvansiyonlar (mevcut view'lardan birebir):
- Dosya başı: `"use client";` + kısa TR yorum
- `import { listEntity, apiSend } from "@/lib/client";` — TÜM istekler göreli yol (ZORUNLU)
- `import { useApp } from "@/lib/store";` — `const { currentEditionId, bump, refreshKey } = useApp();`
- `import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";`
- Sabitler: `@/lib/constants` (label, fmtMoney, fmtDate, fmtDateTime, STATUS_TONE, FORM_TYPES, FORM_FIELD_TYPES, FORM_SUBMISSION_STATUS, SUBMISSION_SOURCES, EXPENSE_STATUS, EXPENSE_CATEGORY, EXPENSE_PAYMENT_METHOD, PAYMENT_METHODS, ORDER_STATUS, PAYMENT_STATUS)
- shadcn: Button, Input, Label, Textarea, Select, Dialog*, Tabs, Badge, Switch, Checkbox, Separator, Card (src/components/ui/*)
- Toast: `import { useToast } from "@/hooks/use-toast";`
- İkonlar: `import * as Icons from "lucide-react";`
- Named export: `export function FormCenterView()` / `export function AccountingView()`
- useApi deseni: `const { data, error, reload, loading } = useApi<T>(() => listEntity<T>("entity", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);`
- Toast sonrası `reload(); bump();`
- Kart dolgusu p-4/p-6, listelerde max-h-96 overflow-y-auto + `maven-scroll` sınıfı, mobil uyumlu (grid sm:/md:/lg:)
- Türkçe etiketler, emoji yok, küçük/orta boyutlu tipografi

API SÖZLEŞMESİ (değiştirme — ana ajan yazdı, çalışıyor):
- Form listesi: `listEntity("forms", { editionId })` → FormDefinition[] (fields + _count.submissions dahil)
- Form kaydet: `apiSend("/api/forms", "POST", {...})` / `apiSend("/api/forms/<id>", "PUT", {...})` / DELETE
- Alan CRUD: `/api/form-fields` (POST {formId, label, type, ...}) / `/api/form-fields/<id>` PUT-DELETE
- PUBLIC kayıt: `apiSend("/api/public-register", "POST", { formId, respondentName, respondentEmail, phone, organization, answers: {fieldId: value}, honeypotValue, elapsedSeconds, paymentMethod, source: "WEB_PUBLIC" })` → { submissionId, status: "APPROVED"|"PENDING"|"SPAM", spamScore, spamReasons[], registration, order, payment }
- Gönderi listesi: `listEntity("form-submissions", { formId | editionId | status | source })` → form{id,name,type} + registration{category} dahil
- Gönderi aksiyon: `apiSend("/api/form-submissions/<id>", "PATCH", { action: "approve"|"reject"|"spam"|"pending", notes? })`
- Gönderi detay: `apiGet("/api/form-submissions/<id>")` → form.fields + answers + registration
- İstatistik: `apiGet("/api/form-stats?formId=<id>")` → { form, totals{submissions,valid,spam,spamRate,approved,pending,rejected,avgElapsedSeconds}, daily[{date,count}], fields[{fieldId,label,type,mobileInteractive,responseCount,responseRate,distribution[{value,count}],numeric,nps,samples}] }
- Muhasebe: `apiGet("/api/accounting?editionId=<id>")` → { summary{incomeTotal,pendingIncome,pendingCount,expenseTotal,plannedExpense,net,margin,paymentCount,expenseCount}, receivable{amount,openOrders}, incomeBySource[], expenseByCategory[], expenseByStatus[], daily[{date,income,expense}], ledger[{id,kind:"INCOME"|"EXPENSE"|"RECEIVABLE",date,description,ref,method,status,amount,currency}] }
- Gider CRUD: `listEntity("expenses", { editionId, status?, category? })`, POST/PUT `/api/expenses[...]` (code UI'da üretilir: `GSN-YYYY-XXX`)
- Ödeme simülasyonu: `apiSend("/api/payments/<id>/process", "POST", { cardHolder, cardNumber, expiry: "AA/YY", cvc })` → { outcome: "SUCCEEDED"|"FAILED", message, payment, order }. KART TESTLERİ: başarılı için "4242 4242 4242 4242", reddi için sonu "0000" (örn. "5555 5555 5555 0000")
- Bekleyen ödeme bulma: `listEntity("payments", { status: "PENDING" })` → order dahil; order.editionId == currentEditionId filtresi UI'da

---
Task ID: F-b
Agent: full-stack-developer
Task: Muhasebe view (accounting.tsx)

Work Log:
- Stub `/home/z/my-project/src/components/maven/views/accounting.tsx` üzerine yazıldı (681 satır, named export `AccountingView`); yalnızca bu dosya değiştirildi — page.tsx / constants.ts / registry.ts / API route'lara dokunulmadı, test kodu yazılmadı.
- Sözleşmeye birebir uydı: "use client" + TR yorum, `listEntity/apiSend/apiGet` (göreli yol), `useApp` (currentEditionId/bump/refreshKey), `../bits` bileşenleri, constants importları (EXPENSE_STATUS, EXPENSE_CATEGORY, EXPENSE_PAYMENT_METHOD, PAYMENT_METHODS, STATUS_TONE, label, fmtDate, fmtDateTime, fmtMoney), shadcn (Button/Input/Label/Textarea/Select/Dialog/Tabs/Badge/Separator), useToast, `import * as Icons`, useApi deseni `apiGet("/api/accounting?editionId=")` + `listEntity("expenses", { editionId })`.
- PageHeader: "Muhasebe" + §36 açıklaması; children: "Hızlı Saha Harcaması" (amber outline varyant) + "Yeni Gider".
- 6 KPI (grid sm:2 / md:3 / xl:6): Tahsil Edilen (paymentCount tahsilat), Bekleyen Tahsilat (pendingCount ödeme + openOrders açık sipariş, Hourglass/amber), Gerçekleşen Gider (expenseCount kalem, ReceiptText), Planlanan Gider (onay/fiş bekleyen), Net Bakiye (net≥0 yeşil / <0 kırmızı, TrendingUp/Down, "%47 marj" alt notu — margin null ise "gelir − gerçekleşen gider"), Açık Alacak (openOrders sipariş bakiyesi).
- TAB defter: kind Select filtresi (Tümü/INCOME/EXPENSE/RECEIVABLE, istemci tarafı), sticky başlıklı tablo (max-h-96 maven-scroll): fmtDateTime tarih, mono referans, yöntem (INCOME/RECEIVABLE → PAYMENT_METHODS, EXPENSE → EXPENSE_PAYMENT_METHOD), StatusBadge (ödemeler için SUCCEEDED/PENDING/FAILED + EXPENSE_STATUS birleşik harita; ton STATUS_TONE'dan), tutar renk kodlu (+yeşil / −kırmızımsı / "(bekliyor)" amber, satır para birimiyle); altında görünür filtrede gelir/gider alt toplam satırı; boşsa EmptyState.
- TAB expenses: durum + kategori Select ve başlık/vendor/kod arama (üçü de istemci tarafı — kod üretimi tam listeden yapılır); gider kartları: mono kod, StatusBadge, kategori Chip (FIELD_EXPENSE amber, TECH teal — Chip'te sky tonu yok, CATERING violet, diğer neutral), tutar bold sağda, fmtDate tarih, "Sahada: {spentBy}", ödeme yöntemi, fiş no mono Badge; aksiyonlar: PLANNED/PENDING_RECEIPT → Onayla (PUT APPROVED + approvedBy:"Muhasebe") + Ödendi İşaretle (PUT PAID), APPROVED → Ödendi, PAID + PERSONAL_REIMBURSE → Personeline Ödendi (PUT REIMBURSED); REJECTED'a buton yok; satır bazlı busyId + disabled.
- "Yeni Gider" dialogu: 12 alanlı tam form (başlık*, kategori*, tutar*, para birimi TRY/USD/EUR default TRY, ödeme yöntemi, tedarikçi, harcayan, harcama tarihi default bugün — TZ güvenli todayStr, durum default PENDING_RECEIPT, açıklama, fiş no, not); POST /api/expenses; code `GSN-YYYY-XXX` sayaç+1, Set ile çakışma denetimi (+1 döngü).
- "Hızlı Saha Harcaması" dialogu: başlık/tutar/harcayan/ödeme yöntemi (CASH/COMPANY_CARD/PERSONAL_REIMBURSE); sabit category FIELD_EXPENSE, status APPROVED, approvedBy "Saha Onayı", açıklama "Sahada anlık harcama — fiş sonradan eklenebilir."; toast "Saha harcaması kaydedildi — deftere işlendi".
- TAB breakdown: lg:2 sütun — Sol: Gelir Kaynakları barları (teal, PAYMENT_METHODS etiketi), Gider Kategorileri barları (FIELD_EXPENSE amber, diğer rose-400); Sağ: Gider Durumları Chip dizisi (ton STATUS_TONE'dan türetilen toneFromStatus ile), 30 Günlük Akış sütun grafiği (gün başına iki ince div: teal gelir / rose-500 gider, max'a normalize min 2px, zero barlar opak, hover title "GG.AA — gelir/gider", altta renkli kare legend + 30 gün toplamları); altta "Mutabakat Notu" SectionCard (net = gelir − gerçekleşen gider; planlanan gider onay/ödeme sonrası net'e etki eder; RECEIVABLE tahsil olunca INCOME'a döner) + Separator.
- Doğrulama (agent-browser, No-Dig Turkey 2026 edisyonu): KPI'lar gerçek veriyle (₺43.000 tahsil / ₺23.000 gider / ₺20.000 net / %47 marj / ₺20.000 alacak) ✓; defter tablosu +/− tutarlar, yöntem etiketleri, durum rozetleri ✓; Hızlı Saha Harcaması POST uçtan uca (GSN-2026-009, 450 TRY, CASH, APPROVED/Saha Onayı) ✓; Onayla PUT uçtan uca (GSN-2026-006 → APPROVED, approvedBy "Muhasebe") ✓; Yeni Gider dialogu tüm alanlar + defaultlar ✓; 3 sekme + kırılım barları/chip/grafik ✓; page errors: 0.
- `bun run lint`: 0 error 0 warning (temiz, exit 0).

Stage Summary:
- Muhasebe view TAM: entegre defter (gelir ≠ gider ≠ alacak), 6 KPI, gider CRUD akışı (tam form + hızlı saha harcaması + onay/ödeme/reimburse zinciri), kaynak/kategori/durum kırılımı ve 30 günlük akış grafiği — API sözleşmesi hiç değiştirilmeden UI katmanı tamamlandı.
- Kod üretimi tam gider listesinden yapıldığı için status/category filtreleri istemci tarafında (liste küçük, anlık filtre; listEntity'nin status/category parametreleri kullanılmadı — davranış farkı yok).
- Bilinen ufak esneklikler: TECH kategorisi Chip'te sky tonu olmadığından teal; "Ödendi İşaretle" basit PUT {status:"PAID"} (spec'e uygun — fiş no dialogu isteğe bağlı bırakıldı); RECEIVABLE defter satırları yalnız PENDING ödeme varken görünür (mevcut seed'de pendingIncome=0, kod hazır).
- Kalan: F-a (form-center.tsx) paralel ajanı + ana ajan E2E turu.

---
Task ID: F-a
Agent: full-stack-developer
Task: Form Merkezi view (form-center.tsx)

Work Log:
- Stub üzerine 1.872 satırlık tam FormCenterView yazıldı (sadece bu dosya değiştirildi; page.tsx/constants/registry/API rotalarına dokunulmadı). Konvansiyonlar UI AGENT SÖZLEŞMESİ'nden birebir: "use client" + TR yorum, listEntity/apiSend/apiGet göreli yol, useApp (currentEditionId/bump/refreshKey), ../bits parçaları, shadcn bileşenleri, useToast, Icons namespace, useApi deseni, toast sonrası reload()+bump().
- TAB 1 Formlar: kart grid (md:2/xl:3), tür rozeti (REGISTRATION=teal, SURVEY=violet, FEEDBACK=emerald, QA_MOBILE=amber, CUSTOM=neutral), StatusBadge (Taslak/Yayında/Kapalı), açıklama truncate, mini metrikler (_count.submissions, fields.length), spam koruması / online ödeme / herkese açık rozetleri. Aksiyonlar: Stüdyoda Düzenle (tab+seçim), Yayınla/Kapat (PUT status), Herkese Açık Switch (PUT isPublic). Yeni Form dialogu: ad/tür(+FORM_TYPE_HINTS)/açıklama + spam bölümü (honeypot default açık, zaman tuzağı 4sn, günlük limit 5, engelli domainler) + REGISTRATION ekstraları (enableOnlinePayment, defaultCategoryId "Kategori otomatik" sentinel=AUTO, autoApprove).
- TAB 2 Tasarım Stüdyosu: form seçici; lg:grid-cols-5 (sol 3 alan listesi, sağ 2 ayar panelleri). Alan satırları: sıra no, etiket, tür, Zorunlu(amber)/Koşullu(sky) rozetleri, Mobil Chip, gizlilik Chip, SECTION sol vurgulu farklı görünüm, ok butonlarıyla order swap (iki alanın çift PUT'u) ve sil (DELETE + toast). Alan Ekle dialogu: 15 tür, placeholder/helpText, options textarea (SINGLE/MULTI/QA_QUIZ/COUNTRY), required (OPTIONAL/ALWAYS/CONDITIONAL + koşul alan/değer girişleri), gizlilik 3 seçenek, mobileInteractive (RATING/NPS/QA_QUIZ'de otomatik açık), order=fields.length+1. Sağ panel: Form Ayarları + Spam Koruması (ShieldCheck) + Ödeme (CreditCard, yalnız REGISTRATION) — hepsi PUT /api/forms/<id>, boş string→null.
- TAB 3 Yanıtlar & İstatistik: form + durum + kaynak filtreleri; masaüstü tablo (sticky başlıklı, max-h-96 maven-scroll) + mobil kartlar; spam puanı pill (STATUS_TONE.SPAM doğrudan kullanım), süre "38 sn", kaynak/tarih; aksiyonlar Onayla/Ret/Spam, SPAM'da İncelemeye Al (apiPatch yardımcı — client.ts PATCH içermediği için dosya içinde fetch tabanlı PATCH eklendi, göreli yol). Detay dialogu apiGet: gönderen bilgileri + IP + spam gerekçeleri (kırmızı liste) + form.fields sırasıyla yanıtlar (CHECKBOX→Evet/Hayır, çoklu JSON→virgül) + bağlı kayıt (no, durum, kategori, kişi). İstatistik: 4 KpiCard (Toplam/Onaylı/Spam Oranı/Ort. Doldurma), 14 günlük mini sütun grafiği (normalize yükseklik), NPS büyük skor kartı (promoter yeşil/pasif amber/detractor kırmızı), alan kartları lg:grid-cols-3 (yanıt oranı, teal dağılım barları max'a normalize, Ort (min–max), son 5 örnek italik, Mobil Öge Badge).
- TAB 4 Canlı Kayıt Masası: yalnız PUBLISHED && isPublic formlar; max-w-2xl ziyaretçi görünümü; 15 alan türü render (yatak/textarea/select/checkbox listesi/tek checkbox/yıldız 1-5 fill/NPS 0-10 grid-cols-11 teal/quiz=select/dosya disabled/tarih/sayı); koşullu alanlar conditionField etiketi eşleşmesiyle gizle/göster (conditionValue "true" özel durumu); honeypot görünmez name="website" alan (-left-[9999px], aria-hidden, tabIndex -1); Date.now tabanlı elapsedSeconds; REGISTRATION'da 4 bilgi alanı + ödeme yöntemi Select (ONLINE_CARD/BANK_TRANSFER/PAYMENT_LINK); POST /api/public-register → sonuç kartı (SPAM kırmızı skor+gerekçe, PENDING amber + successMessage + kayıt no/durum, APPROVED yeşil); PENDING ödemede sanal POS kart formu → /api/payments/<id>/process (SUCCEEDED yeşil referans / FAILED kırmızı tekrar dene) + test ipucu Chip'leri (4242→Başarılı, **0000→Red); Yeni Gönderim sıfırlama; submit sonrası bump().
- Doğrulama: bun run lint 0 sorun; tsc --noEmit form-center.tsx temiz (listEntity generic tip düzeltmesi: T=eleman tipi). agent-browser E2E: 4 sekme render ✓, edisyon değişiminde eski form seçiminin otomatik temizlenmesi düzeltildi ✓, stüdyoda 7 alanlı kayıt formu + sıra değişimi (ileri/geri) ✓, Yanıtlar tablosu + spam pill + koşullu aksiyonlar + detay dialogu (bağlı kayıt NF-No + kategori) ✓, istatistik KPI + NPS + dağılım barları ✓, Canlı Masada UI üzerinden gerçek gönderim → PENDING + kayıt zinciri + sanal POS 4242 ile SUCCEEDED (TR referansı) + Yeni Gönderim sıfırlaması ✓, Yeni Form dialogu ✓. Test sırasında oluşan gönderiler (Canlı Test Kullanıcı, Bot Botson) demo verisi olarak bırakıldı.

Stage Summary:
- Form Merkezi UI tamamlandı: 4 sekme (liste/tasarım stüdyosu/yanıt incelemesi+istatistik/canlı kayıt masası) backend sözleşmesiyle birebir entegre; spam koruması, koşullu alanlar, mobil interaktif öğeler ve online ödeme akışı uçtan uca çalışıyor.
- ESLint 0 hata, TypeScript strict temiz; tek dosya değişikliği (form-center.tsx, 1.872 satır).
- Bilinen esneklikler: file alanı önizlemede kapalı (spec gereği), koşullu gösterim conditionField'i etiket eşleşmesiyle bulur (aynı etiketten iki soru varsa ilki), İncelemeye Al/PATCH için client.ts'e dokunulmadan dosya içi apiPatch kullanıldı, submission detayında notes alanı henüz UI'da düzenlenmiyor.

---
Task ID: F8
Agent: Z.ai Code (ana ajan)
Task: Final doğrulama — lint, temiz seed, agent-browser uçtan uca E2E testleri

Work Log:
- `bun run lint` → 0 hata / 0 uyarı (tüm proje)
- Seed yeniden çalıştırıldı (agent E2E test artıklarını temizler): 4 form, 15 gönderi, 8 gider, 26 kayıt
- agent-browser E2E (tümü GEÇTİ):
  1. Menüde "Form Merkezi" ve "Muhasebe" modülleri görünüyor ✓
  2. Canlı Kayıt Masası → ziyaretçi görünümü: 15 alan türü render, honeypot gizli alan, zaman tuzağı sayacı ✓
  3. SPAM TESTİ: engelli domain e-posta (bot@tempmail.xyz) → gönderildi ama "Spam şüphesi — incelemeye alındı", Skor 100, gerekçe: "E-posta alan adı engelli listede: tempmail.xyz" ✓ (kayıt zinciri KURULMADI)
  4. TEMİZ KAYIT: Ayla Deneme → "Başvurunuz alındı — incelemede" + Kayıt No NF-MUECUBH7406 + ₺5.000 sipariş + PENDING ödeme ✓
  5. SANAL POS: 4242 4242 4242 4242 kart → "Ödeme başarılı — Referans TR-MUECUTD0, 5000 TRY tahsil edildi" ✓ (önceki curl testinde **0000 kartı → FAILED doğrulanmıştı)
  6. Yanıtlar sekmesi: Ayla (İnceleniyor) + Bot Deneme (Spam, Skor 100) tabloda; "Onayla" aksiyonu → "Onaylandı" ✓
  7. Form istatistikleri: yanıt oranları, dağılım barları ✓
  8. Muhasebe: Tahsil ₺43.000 (7), Bekleyen ₺2.000, Gider ₺23.000, Net ₺20.000 (%47 marj), Açık Alacak ₺20.000; defterde Ayla +₺5.000 INCOME satırı ✓ (seed 38.000 + Ayla 5.000 = tutarlı)
  9. Mobil viewport (390×844) render + sticky footer (contentinfo) ✓, sayfa hataları 0 ✓
- dev.log temiz: 0 runtime error

Stage Summary:
- Kullanıcının yeni isteği TAMAMLANDI: geniş kapsamlı Form Yönetimi & Tasarım Merkezi (kayıt/katılımcı/anket/mobil QA/özel formlar), 7 katmanlı spam koruması, form özelliklerine göre kayıt girişi, kayıt muhasebesi (kişi bazlı ödeme durumu), online ödeme seçenekleri + sanal POS API'si, ek/saha harcamalarının muhasebeye entegrasyonu
- API yolları: /api/public-register, /api/form-submissions/[id], /api/form-stats, /api/accounting, /api/payments/[id]/process, /api/forms, /api/form-fields, /api/form-submissions, /api/expenses (generic CRUD)
- Proje durumu: 61+2 model, 17 modüllü SPA, lint temiz, E2E doğrulanmış

Unresolved / sonraki adımlar:
- Hız limitleri bellek içi (tek instance) — yatay ölçek için Redis'e taşınmalı
- Mobil uygulamaya gerçek QA/quiz motoru bağlanacaksa QA_QUIZ için doğru cevap işaretleme (scoring) modeli eklenebilir
- FILE alan türü UI'da bilinçli kapalı (gerçek dosya yükleme servisi gerekir)
- Sponsor/katılımcı dış portalları ayrı faz

---
Task ID: R-prep
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R — QA değerlendirmesi + yeni özellik API'leri (mutabakat + rozet baskı)

Work Log:
- QA değerlendirmesi (agent-browser): 0 page error, 0 console error; Dashboard/Form Merkezi/Muhasebe/Kayıt/Ödeme/Sahada sweep temiz; tüm API'ler 200 (/api/accounting 400 = editionId param beklentisi, normal). Proje STABİL → hata düzeltme yerine yeni özellik turu.
- Yeni API: `GET /api/reconciliation?editionId=` — mutabakat raporu: sipariş tutarlılığı (tutar≠kalem, PAID≠tahsilat, OPEN+tahsilat tespiti), doğrulanmamış tahsilatlar (referans/teyit eksik §38), gider denetimi (fiş bekleyen/7+ gün eski, onaylı-ödenmemiş, reimburse), açık alacak yaşlandırması (0-30/31-60/60+), son 6 ay dönem özeti, kapanış hazırlığı (blockers/warnings). Test: 8 sipariş, 0 tutarsızlık, 2 doğrulanmamış tahsilat, hazırlık=False ✓
- Yeni API: `GET/POST /api/badges/print-queue` — baskı kuyruğu (READY/PRINTED/ISSUED... + profil + kişi + kategori + roller), POST {ids, action: PRINT|ISSUE|REPRINT} durum makinesi kontrollü (READY→PRINTED, PRINTED→ISSUED, basılı→REPRINTED) + aktivite günlüğü. Test: PRINT 1 rozet READY 3→2 ✓, seed sıfırlandı

Stage Summary:
- İki API test edildi ve çalışıyor; sıradaki: R-a (accounting.tsx Mutabakat sekmesi) + R-b (badge-queue.tsx Rozet Baskı modülü) paralel, sonra stil cilası (bits.tsx) ve final doğrulama

---
## UI AGENT SÖZLEŞMESİ R (R-a / R-b)

Ortak kurallar: önceki "UI AGENT SÖZLEŞMESİ" bölümündeki TÜM konvansiyonlar geçerli (use client, göreli yol, ../bits, useToast, reload()+bump(), Türkçe, emoji yok, max-h-96 maven-scroll, responsive, strict TS).

R-a ek sözleşme — Mutabakat API:
- `apiGet("/api/reconciliation?editionId=" + currentEditionId)` → {
    generatedAt,
    orders: { total, paid, open, partiallyPaid, cancelled, mismatches: [{ orderNo, payer, issue, expected, actual, delta }] },
    unverifiedPayments: [{ id, orderNo, payer, amount, currency, source, paidAt, reason }],
    expenseAudit: { awaitingReceipt: {count,amount}, awaitingOld: {count,amount}, approvedUnpaid: {count,amount}, reimbursable: {count,amount} },
    aging: { buckets: [{label,count,amount}], totalReceivable, openOrders },
    period: [{ month: "YYYY-MM", income, expense, net }],
    readiness: { ok, blockers: string[], warnings: string[] }
  }

R-b ek sözleşme — Baskı Kuyruğu API:
- `apiGet("/api/badges/print-queue?editionId=" + currentEditionId)` → {
    queue: [{ id, badgeNo, status, issuedAt, printedAt, profile: {name,color,accessAreas}|null, person: {fullName, company, title}, category, roles: string[], registrationStatus }],
    stats: { ready, printed, issued, reprinted, notEligible, void, total },
    byProfile: [{ name, count }]
  }
- Aksiyon: `apiSend("/api/badges/print-queue", "POST", { ids: string[], action: "PRINT"|"ISSUE"|"REPRINT" })` → { ok, succeeded, failed, results: [{id, ok, message?}] }
- BADGE_STATUS + STATUS_TONE (constants.ts) rozet durumları için; modül id "badges" (constants MODULES'ta ben ekledim), capability "BADGING" → Sahada ile aynı yetenek

---
Task ID: R-b
Agent: full-stack-developer
Task: Rozet Baskı Merkezi view (badge-queue.tsx)

Work Log:
- YENİ dosya `/home/z/my-project/src/components/maven/views/badge-queue.tsx` oluşturuldu (377 satır, named export `BadgeQueueView`); SADECE bu dosya yazıldı — page.tsx / constants.ts / bits.tsx / API route'larına dokunulmadı, test kodu yok, modül kaydı ana ajana bırakıldı.
- UI AGENT SÖZLEŞMESİ R'ye birebir: "use client" + TR yorum, apiGet/apiSend göreli yol, useApp (currentEditionId/bump/refreshKey), ../bits parçaları (PageHeader/KpiCard/Chip/SectionCard/StatusBadge/EmptyState/ErrorState/Loading/useApi), constants (BADGE_STATUS, EVENT_ROLES, label, fmtDate), shadcn (Button/Input/Checkbox/Select/Dialog), useToast, `import * as Icons`, strict TS (any yok).
- useApi deseni sözleşmedeki gibi: `if (!currentEditionId) return Promise.resolve(null); return apiGet<BadgeQueueData>("/api/badges/print-queue?editionId=" + currentEditionId)` deps [currentEditionId, refreshKey].
- PageHeader: "Rozet Baskı" + §40 desc; children Chip teal "N seçili" (satır tıklamasıyla canlı güncellenir).
- KPI sırası grid sm:2 xl:5: Baskıya Hazır (teal/Printer), Basıldı (emerald/Stamp), Verildi (emerald/CheckCircle2), Yeniden Basılan (amber/RefreshCcw), Uygun Değil (neutral/Ban); altında "Toplam N rozet kuyrukta" not satırı.
- Profil kırılımı barı: byProfile → Chip dizisi "Delegate × 13" biçiminde; her chip'e kuyruktan eşlenen profil rengiyle inline-style renk noktası (renk adı→hex objesi: teal/amber/violet/rose/sky/neutral, fallback #a3a3a3 — dinamik Tailwind sınıfı derlenmediği için inline style, talimattaki gibi).
- Seçim + toplu aksiyon çubuğu (sticky değil): "Tümünü Seç (kuyruk)" (yalnız filtrelenmiş görünür satırlara union uygular, title ile belirtildi) / "Seçimi Temizle" / "{görünen}/{toplam} rozet görünüyor" sayacı; üç toplu buton Baskıya Gönder (PRINT, primary), Teslim Et (ISSUE, emerald outline), Yeniden Bas (REPRINT, amber outline) — durum kapısı YOK (sunucu kontrol ediyor); seçim boşsa istek atmak yerine "Rozet seçilmedi" toast'ı.
- runAction(action, ids) tek/çoklu ortak: bulkBusy (PRINT|ISSUE|REPRINT) + rowBusyId ayrı busy state'leri, tüm butonlar çakışmayı önlemek için anyBusy'de disabled, aktifte Loader2 spin; sonuç toast'ı: başlık "{succeeded} rozet basıldı/teslim edildi/yeniden basıldı", başarısız varsa description "{failed} atlandı (durumu uygun değil / basılı durumda değil / basılı rozet değil)", succeeded=0 ise destructive; sonra setSelected(empty) + reload() + bump().
- Kuyruk tablosu (SectionCard, max-h-96 overflow-y-auto maven-scroll, sticky thead): Checkbox (hücre stopPropagation), Rozet No (mono, son 6 karakter # ile; tıklanınca önizleme), Kişi (fullName bold + company·title muted truncate), Profil (renk noktası inline style + Chip), Kategori (lg'de), Roller (EVENT_ROLES label Chip, max 2 + "+N", md'de), Durum (StatusBadge BADGE_STATUS + STATUS_TONE), Baskı/Veriş (Basım/Veriş iki satır fmtDate, sm'de), İşlem (göz ikonu önizleme + READY→"Baskıya Al", PRINTED/REPRINTED→"Teslim Et", aksi "—"); satır tıklaması seçimi toggle eder, seçili satır bg-teal-50/60.
- Filtreler istemci tarafı: durum Select (Tümü + BADGE_STATUS'ın 6 durumu), arama Input (fullName + badgeNo + profil adı, toLocaleLowerCase("tr-TR") contains); "Tümünü Seç" yalnız görünene uygulanır; boş görünüm için iki farklı EmptyState (kuyruk boş / filtre boş).
- Baskı Önizleme dialogu: rozet no'ya veya satır sonu göz ikonuna tıklayınca; 320px kart mock — üstte profil rengi şerit (inline style), ortada fullName büyük + company·title, altta #badgeNo mono + profil adı + "Erişim alanları: ..." muted; not "Bu kart baskı şablonunu temsil eder — gerçek kesiim BadgeProfile ayarlarından gelir"; Kapat butonu; DialogDescription a11y için mevcut.
- Edisyon değişiminde seçim + önizleme useEffect ile sıfırlanır (stale id ile başka edisyonun rozetine aksiyon gitmesin); seçim aksiyon anında kuyrukla kesişimle doğrulanır (selectedInQueue).
- Doğrulama: `bun run lint` → 0 error 0 warning (exit 0); `bunx tsc --noEmit` → badge-queue.tsx'te 0 hata (proje genelindeki önceden varolan hatalar başka dosyalarda: examples/, skills/, api/seed, onsite.tsx, scientific.tsx — bu ajanın kapsamı dışı). View page.tsx'e bağlı olmadığından agent-browser E2E yapılamadı (görevde belirtildiği gibi dosya derlemesi doğrulandı).

Stage Summary:
- Rozet Baskı Merkezi UI TAM: baskı kuyruğu tablosu (seçimli), toplu PRINT/ISSUE/REPRINT akışı (sunucu durum makinesine güvenen her-zaman-aktif butonlar + succeeded/failed toast raporu), profil kırılımı, durum/arama filtreleri ve BadgeProfile tabanlı baskı önizleme mock'u — API sözleşmesi (/api/badges/print-queue GET/POST) hiç değiştirilmeden tamamlandı.
- Bilinen sınırlar: modül henüz page.tsx'te render edilmiyor (ana ajan bağlayacak); preview kartındaki accessAreas Prisma'da String? olduğundan düz metin olarak gösterilir (dizi gelirse join ile güvenli); "Uygun Değil/Geçersiz/Verildi" rozetlerine tabloda satır aksiyonu yok (durum makinesi gereği "—").
- Kalan: ana ajan module kaydı ("badges" id) + render + E2E turu.

---
Task ID: R-a
Agent: full-stack-developer
Task: Muhasebe'ye Mutabakat sekmesi

Work Log:
- Sadece `src/components/maven/views/accounting.tsx` değiştirildi (682 → 938 satır, +258 satır; named export `AccountingView` korundu). page.tsx / constants.ts / bits.tsx / API route'lara dokunulmadı, test kodu yazılmadı.
- `ReconciliationData` interface'i eklendi (R-a sözleşmesiyle birebir: orders+mismatches, unverifiedPayments, expenseAudit, aging, period, readiness); ayrı `useApi` çağrısı `apiGet("/api/reconciliation?editionId=" + currentEditionId)` — mevcut accounting çağrısıyla AYNI deps `[currentEditionId, refreshKey]`, aynı null-guard deseni; mevcut accounting veri çağrısı hiç değiştirilmedi.
- TAB 4 "Mutabakat" (Icons.FileCheck): Kapanış Hazırlığı kartı — ok=true → yeşil border/bg + CheckCircle2 + "Mutabakata hazır — engelleyici bulunamadı"; ok=false → kırmızı + AlertTriangle + "Kapanış engellendi…"; blockers kırmızı maddeler (OctagonAlert, "ENGELLEYICI (n)" başlığı) + warnings amber maddeler (TriangleAlert, "UYARI (n)" başlığı) ayrımı; header action'da "Oluşturuldu: fmtDateTime(generatedAt)" muted metni + Yenile butonu (loadingRecon'da disabled + ikon spin).
- Sipariş Özeti satırı: 5 mini Chip (Toplam/Ödendi/Açık/Kısmi/İptal — nötr/emerald/amber/amber/rose tonları), ShoppingCart ikonlu etiketle tek kart satırı.
- lg:grid-cols-2 grid: Sol "Sipariş Tutarsızlıkları" — boşsa yeşil ReconCleanState ("Tutarsızlık yok — tüm siparişler tutarlı", dosya içi yeşil EmptyState bileşeni: emerald dashed border + CheckCircle2); varsa satır: orderNo mono bold + payer + issue + "Beklenen ≠ Gerçekleşen" fmtMoney + kırmızı işaretli "Fark:" delta Badge. Sağ "Doğrulanmamış Tahsilatlar (§38)" — boşsa yeşil "Tümü doğrulanmış"; varsa satır: orderNo + payer + tutar (kendi para birimi) + kaynak (PAYMENT_METHODS label) + fmtDateTime(paidAt) + amber reason pill.
- "Gider Denetimi": 4 KpiCard (Fiş Bekleyen amber / 7+ Gün Bekleyen Fiş — 0 üstünde amber değilse nötr / Onaylı — Ödenmemiş violet / Personeline Ödenecek teal), alt notlarda tutar fmtMoney.
- "Açık Alacak Yaşlandırması": 3 sütun yaş kovası kartı (label + count sipariş + fmtMoney amount); 60+ gün tutarı > 0 → rose vurgu + uyarı ikonu; Separator altında bold "Toplam açık alacak" satırı.
- "Son 6 Ay Dönem Özeti": kompakt tablo (sticky başlıklı, max-h-96 maven-scroll) — Ay "2026-09" → monthLabel("Eyl 2026", tr-TR), Gelir yeşil / Gider kırmızı / Net işaretli + pozitif yeşil negatif kırmızı + normalize mini bar; tfoot'ta Toplam satırı (Gelir/Gider/Net toplamları, period türevleri render'da hesaplanır).
- Mobil: 4. sekmeyle TabsList 390px'i aşınca form-center'daki mevcut konvansiyon uygulandı (`TabsList className="h-auto flex-wrap"` — tek satırlık stil eklemesi, sekme yapısı/konvansiyonları korundu); 390px'te yatay taşma 0.
- `bun run lint`: 0 hata / 0 uyarı (exit 0). `tsc --noEmit` accounting.tsx'te 0 hata (proje genelindeki diğer dosyalardaki mevcut TS hataları bu görevle ilgisiz).
- Doğrulama (agent-browser, No-Dig Turkey 2026 edisyonu): 4 sekme render ✓; Mutabakat sekmesi gerçek veriyle: readiness=False → kırmızı kart "Kapanış engellendi…" + ENGELLEYICI(1) "2 tahsilat referans/teyit bilgisi eksik (§38)" + UYARI(1) "3 onaylı gider henüz ödenmedi" ✓; Sipariş Özeti 7/3/1/3/0 ✓; Tutarsızlık yok yeşil blok ✓; 2 doğrulanmamış tahsilat (ORD-2026-0005 Onur Erdem ₺6.000 Sahada POS 21 Eyl, ORD-2026-0006 Gizem Bulut ₺2.000 Ödeme Linki 22 Eyl, "Referans numarası eksik" pill) ✓; Gider Denetimi 2/₺9.900, 0/₺0, 3/₺19.400, 1/₺1.250 ✓; Yaşlandırma 0-30: ₺20.000/4 sipariş, toplam ₺20.000 ✓; Dönem Özeti Nis–Eyl 2026 + Eyl satırı ₺38.000/₺23.000/+₺15.000, tfoot Toplam ₺38.000/₺23.000/₺15.000 ✓; Yenile butonu çalışıyor ✓; diğer 3 sekme (defter/gider/kırılım) bozulmadı ✓; mobil 390×844 yatay taşma yok ✓; page errors 0, console temiz ✓; VLM görsel denetim: renk hiyerarşisi/hizalama/padding temiz ✓.
- Not: Geliştirme sırasında sunucu bellek baskısıyla (4GB sandbox, tsc + chrome aynı anda) iki kez OOM ile düştü; ayrıntılı tsc turu sonrası dev sunucu yeniden başlatıldı ve doğrulama tamamlandı. Tablo/kart stilleri mevcut SectionCard/KpiCard/Chip/Badge/StatusBadge konvansiyonlarıyla birebir yazıldı.

Stage Summary:
- Muhasebe view 4. sekme MUTABAKAT tamamlandı: kapanış hazırlığı (engelleyici/uyarı ayrımı), sipariş özeti çipleri, sipariş tutarsızlıkları, doğrulanmamış tahsilatlar (§38), gider denetimi (4 KPI), açık alacak yaşlandırması ve son 6 ay dönem özeti — /api/reconciliation sözleşmesiyle birebir, tek dosya değişikliği (+258 satır), lint temiz, gerçek veriyle E2E doğrulandı (readiness=False senaryosu dahil).
- Sıradaki: R-b (badge-queue.tsx Rozet Baskı modülü) paralel ajanı + ana ajan stil cilası ve final doğrulama.

---
Task ID: R-final
Agent: Z.ai Code (ana ajan)
Task: R turu finali — modül bağlama, stil cilası, uçtan uca doğrulama

Work Log:
- Rozet Baskı modülü bağlandı: MODULES'a `{ id: "badges", label: "Rozet Baskı", icon: "Printer", capability: "BADGING", group: "edition" }` (Sahada'dan sonra) + page.tsx'e BadgeQueueView mount
- bits.tsx stil cilası (18 modülü birden etkiler):
  - KpiCard: tıklanabilir kartlarda hover'da yukarı kalkma (translate-y), üst kenarda primary vurgu çizgisi (scale-x animasyonu), ikon hover büyütme, focus-visible ring (erişilebilirlik), active state
  - SectionCard: overflow-hidden (köşe taşması yok), başlık şeridi bg-muted/30, hover shadow
  - StatusBadge: iç parlaklık (inset highlight) ile daha oturmuş rozet görünümü
  - EmptyState: ikon artık yuvarlak muted kapsayıcıda, bg-muted/20 zemin
  - PageHeader: başlık yanında teal gradyan vurgu çubuğu (marka tutarlılığı)
  - Tailwind uyumluluk düzeltmeleri: hover:shadow-sm/60 → hover:shadow, ring-current/15 kaldırıldı
- agent-browser E2E (tümü GEÇTİ):
  1. Menüde "Rozet Baskı" görünüyor; KPI'lar No-Dig 2026'da 3 READY/18 PRINTED/24 toplam ✓ (edisyon localStorage'ı seed sonrası eski id — TechDays'e düştü, edisyon seçiciyle No-Dig'e geçildi; bootstrap fallback davranışı not edildi)
  2. Durum filtresi (Hazır) ✓, arama alanı ✓
  3. Baskı Önizleme dialogu: Ahmet Yılmaz — ABC Pharma · Ar-Ge Müdürü — Speaker — erişim alanları ✓ (Escape ile kapanıyor)
  4. Tümünü Seç + toplu PRINT → POST 200, READY 3→0 ✓
  5. Muhasebe → Mutabakat sekmesi: Kapanış Hazırlığı kırmızı kart (engelleyici: 2 tahsilat referans eksik §38; UYARI 1), "Tutarsızlık yok", yaşlandırma 0-30 gün, Son 6 Ay Dönem Özeti ✓
  6. Mobil 390×844 render ✓, page errors 0 ✓
- `bun run lint`: 0 hata / 0 uyarı (bits.tsx cilası dahil tüm proje)

Stage Summary:
- Bu tur eklendi: Mutabakat raporu (API + Muhasebe 4. sekme: tutarsızlık/§38/gider denetimi/yaşlandırma/6 ay/kapanış hazırlığı) + Rozet Baskı Merkezi (API + yeni modül: kuyruk, toplu PRINT/ISSUE/REPRINT durum makinesi, önizleme, filtre/arama) + global stil cilası
- Proje: 63 model, 18 modüllü SPA, 2 yeni API (reconciliation, badges/print-queue), lint temiz

Unresolved / sonraki adımlar:
- Edisyon localStorage'ı: seed sonrası eski id geçersiz olunca editions[0]'a düşüyor (TechDays) — bootstrap'ta "kayıtlı id yoksa en güncel PUBLISHED edisyonu seç" iyileştirmesi yapılabilir
- Kalan adaylar: kişi birleştirme UI'ı (API hazır), Floor Studio sync endpoint'leri, bekleme listesi otomatik teklif, CME kredi defteri, sponsor/katılımcı portalları
- Bellek notu: 4GB sandbox'ta tsc + chrome + next dev aynı anda OOM verebiliyor — agent'lar tsc'yi dosya bazlı filtreyle kullanmalı

---
## UI AGENT SÖZLEŞMESİ R2 (R2-a / R2-b)

Ortak kurallar: önceki "UI AGENT SÖZLEŞMESİ" bölümlerindeki TÜM konvansiyonlar geçerli ("use client", göreli yol, ../bits parçaları, useToast, Türkçe, emoji yok, max-h-96 maven-scroll, responsive, strict TS, any yok). EK KURAL: **tsc --noEmit ÇALIŞTIRMA** (4GB sandbox OOM riski) — yalnız `bun run lint` ile doğrula. Dev sunucusuna DOKUNMA, seed ÇALIŞTIRMA.

R2-a ek sözleşme — CME Kredi API (HAZIR, değiştirme):
- `apiGet("/api/cme?editionId=" + currentEditionId)` → {
    editionId,
    sessions: [{ id, title, type, startTime, cmeCredits: number|null, status, attendanceCount }],
    ledger: [{ participationId, person: { fullName, company, title }, roles: string[], registrationStatus, attendedCount, eligibleCount, credits, maxPossible, percent, lastActivity }],
    summary: { sessionsTotal, sessionsWithCredits, creditsPotential, attendees, creditsIssued, avgCredits, maxEarned, coveragePercent },
    byType: [{ type, sessions, withCredits, creditsSum, attendance }]
  }
- POST `apiSend("/api/cme", "POST", { action: "set-credits", sessionId, credits: number })` → ProgramSession | { error } (0–99 arası; hata 400)
- POST `apiSend("/api/cme", "POST", { action: "bulk-apply", editionId, defaults: Record<string, number> })` → { ok, updated, applied: string[] } — yalnız cmeCredits null olanlara uygular

R2-b ek sözleşme — Mükerrer Kişi API (HAZIR, değiştirme):
- `apiGet("/api/people/duplicates")` → {
    totalPersons,
    suggestions: [{ key, reason: "EMAIL"|"NAME_PHONE"|"NAME_ORG", persons: [{ id, fullName, email, phone, title, company, city, status, createdAt }], olderId, note }],
    reasonLabels: { EMAIL, NAME_PHONE, NAME_ORG }
  }
- Birleştirme: `apiSend("/api/flows", "POST", { action: "person.merge", sourceId, targetId })` → { ok: true } — kaynak MERGED olur, geçmiş (katılım/bildiri/yazarlık/hakemlik/tarama) hedefe taşınır. Kaynak ≠ hedef kontrolü sunucuda.

Entegrasyon notları:
- R2-a: scientific.tsx içindeki ProgramView'a Tabs eklenecek (mevcut oturum listesi "Oturumlar" sekmesine taşınır; yeni sekme "CME Kredi" — yalnız hasCapability(edition, "CME_CREDITS") true ise görünür; edition = editions.find(e => e.id === currentEditionId))
- R2-b: people.tsx içindeki PeopleView'a "Olası Mükerrerler" bölümü eklenecek (Kişiler listesinin üstünde/altında SectionCard)

---
Task ID: R2-a
Agent: Z.ai Code
Task: Program modülüne CME Kredi Defteri sekmesi (scientific.tsx — yalnız ProgramView)

Work Log:
- Yalnız `/home/z/my-project/src/components/maven/views/scientific.tsx` değiştirildi (289 → 539 satır, +250 satır); ScientificView'a hiç dokunulmadı, yeni dosya açılmadı, test kodu yazılmadı. page.tsx / constants.ts / bits.tsx / API rotaları değişmedi, seed çalıştırılmadı, dev sunucusuna dokunulmadı.
- ProgramView içeriği Tabs'e taşındı: "Oturumlar" sekmesi (gün filtresi Select + çakışma uyarısı + oturum kartları + yayınla dialogu birebir korundu), yeni "CME Kredi" sekmesi (GraduationCap ikonu). Sekme yalnız `hasCapability(editions.find(e => e.id === currentEditionId), "CME_CREDITS")` true ise render edilir (store'dan editions + hasCapability import edildi).
- CME verisi ayrı useApi ile: `apiGet("/api/cme?editionId=" + currentEditionId)`, deps `[currentEditionId, refreshKey]`, null-guard `if (!currentEditionId || !cmeEnabled) return Promise.resolve(null)`. Sekme içi yükleme Loading(rows=5), hata ErrorState(onRetry: reloadCme).
- KPI satırı (grid gap-3 sm:grid-cols-2 xl:grid-cols-4): Kredili Oturum (sessionsWithCredits, sub "N oturum", GraduationCap), Kredi Potansiyeli (creditsPotential, Sigma, violet), Kredi Kazanan (attendees, sub "katılımcı", UserCheck, emerald), Dağıtılan Kredi (creditsIssued, sub "ort. X kredi/kişi", Award, amber).
- Kapsam satırı: h-1.5 rounded bg-muted içinde teal div (width %) + "Kapsam" etiketi + "Oturumların %X'i kredili" muted metni.
- SectionCard "Oturum Kredileri": kredi editörü tablosu (maven-scroll max-h-96 overflow-auto, min-w-[560px], sticky thead bg-card) — sütunlar Oturum (title bold + tür Chip, KEYNOTE=violet/BREAK=neutral/diğer=teal), Saat (tr-TR saat:dk), Katılım ("N kişi"), Kredi (Input type=number w-20 h-8, value=cmeCredits ?? "", placeholder "—", min 0 max 99 step 0.5) + Kaydet butonu (Loader2 spin, savingId'de disabled, boş girişte disabled). Kaydet: apiSend("/api/cme","POST",{action:"set-credits", sessionId, credits:Number(input)}) → toast "X kredi atandı: {title}" → reloadCme() + bump(); hata toast destructive; 0–99 aralık dışı istemci tarafı engel + uyarı.
- Input senkronizasyonu: satır bazlı `Record<string,string>` state + useEffect([cme]) ile dış veri reload'unda sunucu değerine senkronize (cmeCredits null → "").
- SectionCard "Tür Bazlı Toplu Ata": CME_SESSION_TYPES sabiti (constants.ts'te SESSION_TYPES yoktu → yerel sabit dizi KEYNOTE/TALK/PANEL/WORKSHOP/POSTER_SESSION) için 5 küçük number input (placeholder "0") + sağda "Boş Kredilere Uygula" butonu (tüm inputlar boş veya bulkBusy iken disabled) + muted ipucu "Yalnız kredisiz oturumlara uygulanır". Gönderilen defaults yalnız dolu inputlar; yanıt updated>0 → toast "{updated} oturuma kredi atandı", updated=0 → bilgi toast "Atanacak kredisiz oturum yok".
- SectionCard "Kredi Defteri": kişi bazlı tablo (maven-scroll max-h-96, min-w-[640px], sticky thead) — Kişi (fullName bold + company·title muted truncate), Roller (EVENT_ROLES label Chip teal, max 2 + "+N" neutral, boşsa "—"), Katılım ("attendedCount/eligibleCount oturum" tabular-nums), Kredi (bold tabular-nums), İlerleme (w-16 h-1.5 teal bar + %X muted), Son Etkinlik (fmtDateTime, yoksa "—"). API sırası korundu (krediye göre sıralı), attendedCount=0 satırlar opacity-60. Boşsa EmptyState "Defter boş — oturum taraması ve kredi bekleniyor".
- PageHeader Yenile butonu artık her iki veriyi yeniler (reload + reloadCme); `label` ve `fmtDateTime` constants'tan eklendi, dosya başı yorumuna CME notu eklendi. Renk ailesi teal/emerald/amber/rose/violet/neutral, emoji yok, tüm metinler Türkçe.
- Doğrulama: `bun run lint` → 0 hata / 0 uyarı (tsc çalıştırılmadı — R2 sözleşmesi). agent-browser E2E (No-Dig Turkey 2026): Program → 2 sekme render ✓; CME Kredi sekmesi görünür (yetenek açık) ✓; KPI gerçek veriyle 3/7 oturum, potansiyel 6.5, 5 kazanan, 7.5 dağıtılan (ort. 1.5) ✓; Kapsam %43 ✓; editör tablosunda 7 oturum, mevcut krediler inputlara yüklü, boş girişlerde Kaydet disabled ✓; PANEL oturumuna 1 kredi girip Kaydet → toast "1 kredi atandı: Büyük Projelerde Paydaş Paneli" + Kredili 4, Potansiyel 7.5, Kapsam %57, defter "1/4 oturum" ✓; Tür Bazlı Ata POSTER_SESSION=2 → "Boş Kredilere Uygula" aktifleşti, POST 200, Kredili 5 / Kapsam %71 / Poster input 2 ✓; aynı şablon tekrar uygulandığında updated=0 → bilgi toast "Atanacak kredisiz oturum yok" (DOM eval ile doğrulandı) ✓; Kredi Defteri 25 satır (5 aktif + 20 soluk opacity-60), roller Chip, ilerleme barları ✓; Oturumlar sekmesi değişmedi ✓; mobil 390×844 yatay taşma 0 ✓; `agent-browser errors` → 0 page error ✓.

Stage Summary:
- Program modülü 2 sekmeli oldu: mevcut oturum yönetimi korunarak CME Kredi Defteri (§08) tam UI kazandı — kredi atama editörü, tür bazlı toplu şablon, kişi bazlı birikim defteri; /api/cme GET/POST sözleşmesi hiç değiştirilmeden tüketildi (tek dosya +250 satır).
- Test sırasında atanan gerçek krediler (PANEL=1, POSTER_SESSION=2) demo verisi olarak bırakıldı (seed çalıştırma yasağı gereği geri alınıp bozulmadı; akreditasyon senaryosuna uygun).
- Bilinen sınırlar: oturum kredisini sıfırlama/silme yok (API credits=null kabul etmiyor, 400); BREAK türü şablonda yok (toplu atama yalnız 5 sabit tür) ama editörde listelenir; "+N" rol chip'i için demo veride 3+ rollü kişi yok (kod yolu hazır); SESSION_TYPES sabiti constants.ts'e eklenmedi (dokunma yasağı) — yerel sabit kullanıldı.
- R2-b (people.tsx Mükerrer Kişi) paralel ajanın görevi; bu ajan yalnız scientific.tsx'e dokundu.

---
Task ID: R2
Agent: Z.ai Code (ana ajan) + full-stack-developer ×2 (R2-a ✓, R2-b △ tamamlandı ve ana ajan tarafından doğrulandı)
Task: Cron inceleme turu R2 — QA değerlendirmesi, edisyon fallback hatası düzeltmesi, CME Kredi Defteri + Kişi Birleştirme özellikleri, stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog + dev.log inceledi; agent-browser ile 18 modülün tamamı tarandı → 0 page error, 0 console error, tüm API'ler 200. Proje STABİL → hata düzeltme + yeni özellik turu kararına varıldı.
- HATA DÜZELTMESİ (worklog'da bilinen sorun): store.ts bootstrap — persisted edition id geçersizse (seed sonrası) editions[0]'a (boş TechDays taslağı) düşüyordu. Yeni mantık: persisted geçersiz → isPublished/REGISTRATION/ONSITE edisyonları startDate'e göre sırala, en güncel aktif edisyonu seç. E2E doğrulandı: reseed + stale localStorage → No-Dig Turkey 2026 açılıyor ✓
- ŞEMA: ProgramSession.cmeCredits Float? eklendi (CME_CREDITS yeteneği için), db push ✓ — model sayısı 63 (footer metni de 63'e güncellendi).
- YENİ API `/api/cme` (GET+POST): oturum kredi editörü verisi, SESSION_ENTRY/RESCAN+ALLOWED/RESCAN_WARNING taramalarından kişi×oturum tekil katılım, kişi bazlı defter (kredi, yüzde bar, son etkinlik), özet (sessionsWithCredits/creditsPotential/attendees/creditsIssued/avg/coveragePercent), tür kırılımı. POST: set-credits (0–99 doğrulamalı) + bulk-apply (tür bazlı, yalnız kredisiz oturumlara). Düzeltmeler: ScanEvent'te editionId yok → session relasyon filtresi; katılım haritası personId anahtarlı (participationId değil). Seed'e KEYNOTE=2/TALK=1.5/WORKSHOP=3 kredileri eklendi.
- YENİ API `/api/people/duplicates`: EMAIL / NAME_PHONE / NAME_ORG kurallarıyla mükerrer önerisi (tr-TR normalize, MERGED hariç, olderId hedef önerisi). Test: iki kural da gerçek veriyle doğrulandı.
- registry.ts: EntityConfig.defaultWhere desteği + people'a { status ≠ MERGED, mergedIntoId: null } — birleştirilen kişiler artık tüm listelerde gizlenir (sözleşme gereği).
- R2-a (subagent, scientific.tsx +250 satır): ProgramView Tabs'a taşındı; "CME Kredi" sekmesi (yalnız CME_CREDITS yeteneği açıkken): 4 KPI + kapsam barı + oturum kredi editörü (inline input+kaydet) + tür bazlı toplu atama + kredi defteri (kişi, rol chip'leri, ilerleme barı, soluk satırlar). Subagent E2E: kredi atama 1.5→toast, toplu atama, updated=0 bilgi toast'ı, mobil 390px ✓
- R2-b (subagent, people.tsx +148 satır): "Olası Mükerrerler" bölümü (öneri 0 ise gizli, "Mükerrer yok" chip'i), kişi kartları + sebep chip'i (EMAIL emerald/NAME_PHONE amber/NAME_ORG violet), birleştirme diyaloğu (A/B radio kartlar, olderId varsayılan, geri alınamaz uyarısı). Subagent deadline aşımı → ana ajan dosyayı devraldı: tek bozukluk 3 useState bildirimiydi ([m karakterleri eksik — dosya zaten ajanın son yazımında düzgün geldi), lint 0 hata ile doğrulandı. Ana ajan E2E: test Ahmet Yılmaz çifti UI'dan birleştirildi → toast + bölüm kapandı + MERGED listeden düştü ✓
- STİL CILASI (shell.tsx, 18 modülü etkiler): sidebar aktif öğesinde sol teal vurgu çubuğu (scale animasyonlu), hover'da ikon büyüme + pl geçişi, focus-visible ring; ONSITE edisyon için "Canlı" rozetinde ve edisyon seçicide ping animasyonlu nokta; Yenile butonu loading'de spin + disabled; modül geçişlerinde fade/slide animasyonu (key={module}); sidebar alt kartına gradyan + Shapes ikonu; footer "61 model" → "63 model" düzeltmesi.

Stage Summary:
- Bu tur eklendi: CME Kredi Defteri (§08 — şema+API+UI, akreditasyon iş akışı: kredi ata → tarama işler → kişi bazlı defter) + Mükerrer Kişi Tespiti & Onaylı Birleştirme (Kimlik kuralı 1 UI'ı) + edisyon fallback düzeltmesi + MERGED gizleme + kapsamlı stil cilası
- Proje: 63 model, 18 modüllü SPA, 2 yeni API (cme, people/duplicates), lint 0 hata, reseed sonrası tam E2E sweep temiz
- Doğrulanmış akışlar: bootstrap fallback, CME kredi atama (tek+toplu), mükerrer tespit (2 kural), onaylı birleştirme (UI+API), MERGED gizlenme, mobil render

Unresolved / sonraki adımlar:
- CME: kredi sıfırlama (credits:null) API'de kapalı — akreditasyonda gerekirse açılabilir; BREAK/NETWORKING türlerine şablon atanmıyor (bilinçli)
- person.merge activity log'u id son 6 haneyle yazıyor — insan okunur isim için flows'ta include ile zenginleştirilebilir
- Kalan adaylar (öncelik sırasıyla): bekleme listesi otomatik teklif (registration.cancel → WAITLIST'e teklif), Floor Studio sync endpoint'leri, sponsor/katılımcı dış portalları, kişi birleştirmede çakışma çözümü (aynı edisyonda iki katılım)
- Bellek: dev sunucusu tur içinde 2 kez OOM düştü (subagent chrome+tsc paralelliği) — tur sonunda setsid ile yeniden başlatıldı, temiz. Subagent'lara tsc yasağı işe yarıyor; chrome işlemleri bitince kapatılmalı (agent-browser close)

---
Task ID: R3
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R3 — QA değerlendirmesi (agent-browser), Bekleme Listesi & Otomatik Teklif motoru (§12), stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog + dev.log incelendi; agent-browser ile modül sweep (Dashboard, Kayıt, Form Merkezi, Muhasebe, Ödeme, Sahada, Rozet, Bilimsel + mobil 390×844) → 0 page error, 0 console error, lint 0 hata. Proje STABİL → yeni özellik turu kararı: worklog'daki 1 numaralı aday "bekleme listesi otomatik teklif" uygulandı.
- ŞEMA: WaitlistEntry modeli (64. model) — editionId, categoryId?, personId, participationId?, priority (küçük önce), status (WAITING|OFFERED|CONVERTED|DECLINED|EXPIRED|CANCELLED), offeredAt/offerExpiresAt (48s), respondedAt, convertedRegistrationId (Registration'a "WaitlistConversion"关系), notes. EventEdition/Person/EventParticipation/RegistrationCategory'a waitlistEntries ters relasyonu; Registration'a waitlistConversions. İki kez db push (ilk push'ta convertedRegistration include'u eksikti → PrismaClientValidationError; relasyon eklenip düzeltildi). Footer "63 model" → "64 model".
- SABİTLER: WAITLIST_STATUS (TR etiketler), WAITLIST_OFFER_HOURS=48, REG_SOURCES'a WAITLIST_PROMOTION ("Bekleme Listesi"), STATUS_TONE'a WAITING/OFFERED/CONVERTED/DECLINED.
- MOTOR `src/lib/api/waitlist-engine.ts` (paylaşımlı): SEAT_HOLDING_STATUSES (SUBMITTED/PENDING_APPROVAL/CONFIRMED koltuk tutar), expireStaleOffers (süresi geçen OFFERED→EXPIRED + aktivite), seatStatsForCategory (capacity/taken/seatsLeft), autoOfferForCategory (boş koltuk başına TEK teklif kuralı: seatsLeft − açık teklif sayısı ≤ 0 → dur; öncelik+createdAt sırası; 48 saatlik offerExpiresAt; aktivite günlüğü), convertOfferToRegistration (son kapasite kontrolü + participation upsert + okunaklı REG-YYYY-#### teyit no üretimi (çakışma döngüsüyle) + CONFIRMED kayıt + rozet NOT_ELIGIBLE→READY + CONVERTED).
- YENİ API `/api/waitlist` (GET+POST): GET → summary (waiting/offered/converted/declinedExpired/fullCategories/categoriesWithQueue) + kategori doluluk anlık görüntüsü (taken/seatsLeft/waitingCount/offeredCount/fillPercent) + girişler (person/category/convertedRegistration dahil); GET her çağrıda önce expireStaleOffers. POST aksiyonları: add (kişi+kategori+öncelik; aktif kayıt/mükerrer bekleme engelli; öncelik boşsa sıra sonu), offer (manuel tek teklif — koltuk başına tek teklif kuralı 409), auto-offer (kategori veya tüm kontenjanlı kategoriler), respond (ACCEPT→CONVERTED+zincir yok çünkü koltuk doldu; DECLINE→sıradakine zincirleme auto-offer), cancel (WAITING/OFFERED→CANCELLED; OFFERED ise koltuk serbest→zincir).
- flows ENTEGRASYONU: registration.cancel sonrası kategori bazlı autoOfferForCategory çağrılır; yanıt body'sine waitlistOffered eklenir ve iptal toast'ı "Koltuk boşaldı — bekleme listesinden teklif gönderildi: {isimler}" gösterir. Kayıt iptal dialogu etki önizlemesine bekleme maddesi eklendi.
- SEED: catVip'e capacity:1 (dolu VIP senaryosu — Seda VIP CONFIRMED); 5 bekleme girişi: VIP Hande#10 (notlu)/Murat#20/Barış#30, REG Ünsal#40/Can#50; wipe sırasına waitlistEntry eklendi.
- UI (registrations.tsx, 250 → ~680 satır): 3. sekme "Bekleme" (Kayıtlar | Bekleme | LCV) → WaitlistTab: 5 KPI (Bekleyen/Teklif Aşamasında/Kayda Dönüşen/Ret-Süre Aşımı/Tam Dolu Kategori), "Kategori Doluluğu & Otomatik Teklif" kartı (kategoribazı doluluk barı — dolu kırmızı/%80+ amber/normal teal, bekleyen/teklifte/Dolu Chip'leri, kategoribazı + global "Tümünü Tara" Otomatik Teklif butonu), Bekleme Sırası tablosu (kategori içi pozisyon rozeti, kişi+kurum, öncelik mono #N, StatusBadge, teklif hücresinde geri sayım "47 sa 59 dk kaldı"/"Süresi doldu", eylemler), kapasite duyarlı butonlar: dolu kategoride WAITING → kilitli "Koltuk Bekleniyor" (tooltip), boşta → "Teklif Gönder"; OFFERED → Kabul (emerald)/Ret (rose); geçmiş bölümü (CONVERTED kayıt no, DECLINED/EXPIRED/CANCELLED + yanıt tarihi); "Listeye Ekle" dialogu (kişi select 300 kişi, kategori+Genel, öncelik otomatik sıra sonu, not). Kategori filtresi (Tümü/Genel/kategoriler). HMR ile canlı kural güncellemesi doğrulandı.
- BULUNAN VE DÜZELTİLEN 2 TASARIM HATASI (E2E sırasında): (1) autoOfferForCategory tek boş koltuk için 3 teklif gönderiyordu (OFFERED koltuk tutmuyordu) → açık teklif sayısı koltuktan düşüldü, artık boş koltuk başına tek teklif; (2) manuel "Teklif Gönder" dolu kategoride 409 veriyordu ama buton açıktı → sunucu kuralı seatsLeft−openOffers'a genişletildi + UI kilitli buton durumuna geçti (HMR ile canlı doğrulandı).
- E2E (agent-browser, tam zincir): Kayıtlar sekmesinden REG kaydı iptal → toast "teklif gönderildi: Ünsal Kağan, Can Arslan" (787 boş koltuk → sıradaki 2'sine teklif, doğru) ✓; Seda VIP iptal → "teklif gönderildi: Hande Soyer" (tek koltuk → tek teklif) ✓; Bekleme sekmesinde Hande OFFERED + geri sayım ✓; Kabul → "Teklif kabul edildi — kayıt açıldı" + Hande geçmişte CONVERTED + VIP 1/1 yeniden dolu ✓; Ret → "Teklif reddedildi: Ünsal" + geçmişte DECLINED ✓; Listeye Ekle → Serpil genel sıraya #100 WAITING ✓; manuel teklif → OFFERED + geri sayım ✓; Listeden çıkar → CANCELLED + geçmiş ✓; Okunaklı teyit no düzeltmesi sonrası lint 0 ✓; mobil 390px'te kategori kartları ve KPI'lar düzgün, "Listeye Ekle" satır taşması flex-wrap ile giderildi ✓; page errors 0 ✓; reseed ile temiz demo durumu (5 WAITING, VIP dolu) bırakıldı; browser kapatıldı.
- OPERASYON NOTU: Tur başında Prisma client yenilenince dev sunucusu eski client'la seed'de patladı (deleteMany undefined) — sunucu yeniden başlatıldı; ayrıca 4GB sandbox'ta chrome+dev aynı anda OOM (dmesg: next-server killed) → agent-browser close ile bellek serbest bırakıldı, seed sonrası sunucu stabilize.

Stage Summary:
- Bekleme Listesi & Otomatik Teklif motoru TAM: kategori kontenjanı dolan kişiler sıraya alınır; koltuk her boşaldığında (iptal/reddet/çıkarma/süre aşımı) en yüksek öncelikli bekleyene 48 saatlik teklif otomatik gider; kabul → WAITLIST_PROMOTION kaynaklı onaylı kayıt + rozet READY; ret/süre aşımı → zincirleme sıradaki teklife geçiş; "boş koltuk başına tek teklif" kuralı sunucu + UI'da tutarlı zorlanıyor.
- Proje: 64 model, 18 modüllü SPA, yeni API /api/waitlist + flows registration.cancel zinciri, lint 0 hata, reseed sonrası temiz demo verisi, E2E uçtan uca doğrulanmış.
- Yapılan düzeltmeler: teklif/koltuk tutarlılığı (2 hata), okunaklı teyit numarası (REG-YYYY-####), mobil satır taşması, 64 model footer.

Unresolved / sonraki adımlar:
- Teklif e-postası/bildirimi gerçek gönderim yok (simülasyon; portallar fazında entegre edilir)
- Kategorisiz (Genel) bekleyenler otomatik dağıtıma girmez — bilinçli: hangi kategoriye yerleşeceği belirsiz; manuel teklif gerekir
- expireStaleOffers yalnız GET/akış çağrılarında çalışır — cron/scheduled job yok (tek instance bellek içi yeterli)
- Kalan adaylar (öncelik sırasıyla): Floor Studio sync endpoint'leri, sponsor/katılımcı dış portalları, kişi birleştirmede çakışma çözümü (aynı edisyonda iki katılım), QA_QUIZ doğru cevap scoring modeli
- Bellek: chrome + dev aynı anda çalışınca 4GB sınırı daralıyor — agent turu sonunda agent-browser close alışkanlığı sürdürülmeli

---
Task ID: R4
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R4 — QA değerlendirmesi, Bildirim Merkezi (zil) + QA_QUIZ puanlama motoru (mobil QA tamamı), stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog + dev.log + lint inceledi (0 hata); agent-browser sweep (Dashboard/Kayıt/Form/Muhasebe/Program/Ödeme + mobil) → 0 page error. Proje STABİL → özellik turu: kalan adaylardan "QA_QUIZ doğru cevap scoring modeli" + yeni Bildirim Merkezi uygulandı (R3'te açılan bekleme teklifi bildirimi simülasyonuydu; zil ile gerçek zamanlı olay akışı kazanıldı).
- ŞEMA: FormField.correctAnswer String? (QA_QUIZ doğru cevabı) + FormSubmission.quizScore Float? / quizCorrect Int? / quizTotal Int? → db push ✓ (model sayısı 64; yeni model yok, alan genişletmesi).
- YENİ API `/api/notifications` (GET): ActivityLog → bildirim eşlemesi; önem seviyesi tip bazlı (rose: iptal/tarama reddi/iade, emerald: onay/tahsilat/yayın/giriş, amber: claim/ödeme kaydı/yetenek, teal: varsayılan); hedef modül eşlemesi İKİ KATMANLI: entityType → modül + entityType boş olan seed/akış kayıtları için ActivityType → modül yedek haritası (moduleFor) — 0 "modülsüz" kayıt doğrulandı. limit parametresi (1-100, default 25).
- Shell: NotificationBell bileşeni (notification-bell.tsx, Yenile ile avatar arasına); Popover panel — başlık + "{n} yeni" rozeti + "Tümünü gör" + max-h-96 liste; madde: önem ikonu (ShieldAlert/CircleAlert/CheckCircle2/Activity), mesaj, göreli zaman ("şimdi/3 dk önce/2 sa önce/dün"), aktör, "modüle git" ipucu; okunmamış takibi localStorage "maven.notif.seen" zaman damgası; rozet 9+ sınırı + ping animasyonu + zil sallanma animasyonu (swing keyframe); 60 sn hafif yoklama + edisyon değişiminde yenileme + açılışta tazeleme; maddeye tıklayınca setModule ile ilgili ekrana navigasyon + görüldü işaretleme; mobilde edisyon seçici w-[150px] sm:w-[220px] küçültülerek zile yer açıldı.
- QUIZ MOTORU: public-register — QA_QUIZ + correctAnswer'lı alanlar otomatik puanlanır (String eşleşme, trim'li; quizScore=round(correct/total*100)) ve yanıt gövdesine quizScore/quizCorrect/quizTotal eklendi; SPAM gönderiler de puanlanır (inceleme değer kaybı yok). form-stats — quiz bölümü: questionCount, scoredCount, avgScore, passRate(50+), 4 kova dağılım (0-24/25-49/50-74/75-100), soru bazlı correctCount/wrongCount/correctRate.
- FORM MERKEZİ UI (form-center.tsx): (1) Stüdyo — QA_QUIZ alan satırında satır içi "Doğru cevap:" Select (KeyRound ikonu, seçeneklerden, PUT /api/form-fields/<id>, toast + reload; boş seçim puanlamayı kapatır); Alan Ekle dialogunda QA_QUIZ için "Doğru Cevap (QA motoru puanlaması)" seçenek kartı (emerald). (2) Yanıtlar — tabloya "Quiz" sütunu + mobil kartlara quiz pill: "Quiz %100 · 1/1" bant renkli (≥75 emerald/≥50 amber/<50 rose, Sigma ikonu). (3) Detay dialogu — quiz skoru bandı + QA_QUIZ yanıt satırları ✓/✗ renkli ("yanlış — doğrusu: X" gösterimi). (4) İstatistik — "QA Quiz Sonuçları" kartı (lg:col-span-3): Ortalama Skor (renk eşikli), Geçme Oranı, Skor Dağılımı mini barları, soru bazlı doğru/yanlış split bar + "6✓ 3✗" sayacı. (5) Canlı masa — gönderim sonucu kartına anında "Quiz sonucu: %100 — 1/1 doğru" bandı.
- SEED: Anket quiz alanına correctAnswer "Kazısız altyapı" + 8 anket gönderisine quizScore (6 doğru %100 / 2 yanlış %0) — istatistik kartı gerçek dağılım gösterir.
- E2E (agent-browser): zil "9+" rozetli ✓; popover 12 okunmamış madde ✓; "Tarama reddedildi" maddesine tıkla → Sahada modülüne navigasyon + rozet sıfır ✓; Yanıtlar tablosunda quiz pill'ler (Quiz %0 · 0/1 kırmızı, Quiz %100 · 1/1 yeşil) ✓; QA Quiz Sonuçları kartı gerçek veriyle %66.7 ort / %67 geçme / 3-0-0-6 kova / 6✓ 3✗ split bar ✓; Stüdyoda doğru cevap değiştirme (Kazısız→Ziraat→geri) PUT + toast + reload ✓; Canlı masada doğru cevapla gönderim → "Kaydınız onaylandı" + "Quiz sonucu: %100 — 1/1 doğru" ✓; yanlış e-postayla gönderim spam skor 50 + quizScore 100 (bağımsız puanlama) ✓; Detay dialogunda quiz bandı + "doğru" satır işareti ✓; mobil 390px zil + küçük edisyon seçici düzenli, sekme sarmalama doğru ✓; page errors 0 ✓.
- Test sırasında oluşan gönderiler reseed ile temizlendi; temiz demo durumu bırakıldı; browser kapatıldı; lint 0 hata; dev.log 5xx yok.

Stage Summary:
- Bu tur eklendi: Bildirim Merkezi (zil — aktivite akışından türetilen önem seviyeli bildirimler, modüle giden tıklanabilir maddeler, okunmamış takibi, 60 sn yoklama) + QA_QUIZ puanlama motoru (doğru cevap işaretleme → otomatik quiz skoru → yanıt pill'leri → detay ✓/✗ → istatistik kartı → canlı masa anında sonuç) — kullanıcının "mobil uygulamaya anket QA soruları gibi interaktif öğeler tasarlanabilmeli" isteğinin puanlama ayağı tamamlandı.
- Proje: 64 model (alan genişletmesi), 18 modüllü SPA + bildirim zili, 1 yeni API (notifications), lint 0 hata, E2E doğrulanmış, reseed ile temiz demo.
- Yapılan düzeltmeler: notifications modül eşlemesinde entityType NULL fallback (tip bazlı harita), mobil edisyon seçici genişliği.

Unresolved / sonraki adımlar:
- Quiz doğru cevabı değişince ESKİ gönderilerin skorları yeniden hesaplanmaz (gönderi anındaki cevapla puanlanır — tasarım kararı; gerekirse backfill endpoint'i eklenebilir)
- Bildirim yoklaması 60 sn setInterval — WebSocket taşıma olası (mini-service fazında)
- Quiz: birden fazla soruda ağırlık/kısmi puan yok (her soru 1 puan); QA_QUIZ çoklu doğru cevap desteklenmez
- Kalan adaylar (öncelik sırasıyla): Floor Studio sync endpoint'leri, sponsor/katılımcı dış portalları (teklif e-postası burada gerçek gönderime döner), kişi birleştirmede çakışma çözümü
- Bellek alışkanlığı: agent turu sonunda agent-browser close sürdürülmeli (4GB sandbox)

---
Task ID: R5
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R5 — QA taraması, Floor Studio modülü (plan + senkron uçları), stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog + dev.log (0×5xx) + lint (0 hata) inceledi; agent-browser sweep — 16 modül tek tek gezildi, 0 page error; mobil 390px yatay taşma 0. Proje STABİL → özellik turu: worklog'daki birinci öncelik adayı "Floor Studio sync endpoint'leri" uygulandı.
- YENİ MODÜL Floor Studio (18. modül + zil = 19 nav girişi; MODULES'e "floors" eklendi, capability FLOOR_PLAN, grup edition, icon Map):
  - API `/api/floor-studio/plan` (GET): edisyon plan anlık görünümü — booth'lar (allocation→organization, floorObject), Floor Studio sahipli dekor objeleri (boothUnitId null), summary (toplam/yerleşik/byStatus/m²/contracted+potential gelir). Ortak fonksiyon `src/lib/api/floor.ts` buildPlanSnapshot.
  - API `/api/floor-studio/sync`: GET = Floor Studio uygulamasının PULL ucu (aynı snapshot + direction), POST = PUSH ucu — changes[] (geometri upsert, boothUnitId unique) + statusChanges[] (BoothUnit.status, allowlist'li); ORTAK KİMLİK bütünlüğü: yabancı boothUnitId → 409; BOOTHS_SAVED ActivityLog (entityType FloorPlanObject) → zile düşer, modül eşlemesi "floors".
  - View `views/floors.tsx` (~430 satır): 5 KPI (Toplam/Planda Yerleşik/Müsait/Sözleşmeli Gelir/Potansiyel Gelir); milimetrik kağıt zeminli Salon Planı (46×26 m sahne, .maven-plan-grid CSS, kademeli giriş animasyonu .maven-plan-block, prefers-reduced-motion duyarlı); stant blokları durum renkli (BOOTH_PLAN_TONE — teal CONTRACTED, amber OPTION/HELD, gri BLOCKED/RELEASED, emerald AVAILABLE), köşe ölçek ibresi; dekor objeleri kesikli (Floor Studio sahipli — Maven yalnız görüntüler); durum filtre çipleri (sayaçlı) + arama (eşleşmeyenler %25 opasite); yerleşim bekleyen şeridi (kesikli amber kart, chip listesi); Stant Detayı paneli (kuruluş, tip, fiyat, opsiyon bitişi, StatusBadge, durum hız eylemleri Müsait/Hold/Bloke/Serbest — PUT /api/booth-units/[id], konum editörü X/Y/En/Boy sayısal + 0.5 m ok takımı + Konumu Kaydet (tek parça push) + Geometriyi Kaldır); Senkron kartı (yerleşim ilerlemesi %, son gönderim/çekme localStorage, uç dokümantasyonu, tüm planı senkronize et); Otomatik Yerleşim (yerleşmemişleri mevcut planın altına satır satır dizip toplu push).
  - SEED: salon düzeni 7 → 18 stant (A21-A28 4×3, B01-B05 6×4, C01-C05 4×3, koordinatlı geometri hepsinde), 3 dekor objesi (ANA GİRİŞ, KAYIT MASASI, KAFE), durum çeşitliliği (A25 HELD, B03 BLOCKED, C02 RELEASED), B02 → Beta Sound CONTRACTED; caps1'e FLOOR_PLAN eklendi (No-Dig ana demo edisyonunda modül artık görünür, setupNote'lu).
- STİL CILASI (zorunlu): globals.css — ::selection teal, .maven-plan-grid milimetrik kağıt (iki katmanlı grid), .maven-plan-block kademeli fade+scale giriş animasyonu (reduced-motion ile kapatılır); plan içi hover/scale/ring geçişleri, etiket truncation, mobil 390px'te KPI 2 kolon + buton sarmalama doğrulandı.
- DÜZELTİLEN HATALAR: (1) buildPlanSnapshot `venue` diye yanlış alan → schema `venueName` (500 → 200); (2) apiSend GET desteklemediği için plan/pull apiGet'e taşındı; (3) yerleşmemiş stantların planda üst üste binmesi → plandan çıkarılıp "yerleşim bekleyen" şeridine alındı; (4) constants CAPABILITY_MODULE'de EXHIBITION çift anahtarı (sponsorship + floors) → sponsorship tarafı kaldırıldı; (5) kullanılmayan eslint-disable direktifi.
- E2E (agent-browser): Floor Studio nav girişi göründü ✓; 18 blok + 3 dekor + 5 KPI doğru ✓; A24 detayı (ABC Pharma, ₺60.000, Sözleşmeli) ✓; C05 durum değişimi AVAILABLE→HELD (toast + amber ton) ✓; nudge ↑↑ + Konumu Kaydet (y 17→16) ✓; Plana Gönder "18 geometri" push ✓; Floor Studio'dan Çek ✓; arama "ABC" → 17 blok soluk, yalnız A24 net ✓; Geometri Kaldır → şeritte C05 + "Otomatik Yerleşim (1)" → yerleşim geri, 18 blok ✓; yabancı boothUnitId push → 409 ortak kimlik ihlali ✓; zil akışında "Floor Studio senkronizasyonu" kayıtları severity teal + module floors ✓; mobil 390px düzenli, yatay taşma 0 ✓; page errors 0 ✓.
- TEST SONRASI: reseed ile temiz demo (18 stant hepsi yerleşik, C05 müsait) bırakıldı; browser kapatıldı; lint 0 hata; dev.log'ta yeni 5xx yok (test sırasındaki 1×500 düzeltildi).

Stage Summary:
- Bu tur eklendi: Floor Studio modülü — mimarinin "ayrı uygulama, ortak kimlik" ilkesine (§20, §60) birebir: Maven ticari tahsisi + kontratı tutar, geometri PULL/PUSH uçlarıyla paylaşılır, dekor Floor Studio sahipli. Salon planı görselleştirme, otomatik yerleşim, konum/durum düzenleme ve senkron durumu tek ekranda.
- Proje: 64 model, 19 nav girişli SPA (18 modül + zil), 2 yeni API dosyası (plan/sync) + paylaşımlı floor.ts, lint 0 hata, E2E doğrulandı, reseed ile temiz demo.
- Yapılan düzeltmeler: venueName alan adı, apiGet/apiSend ayrımı, yerleşmemiş stant render kuralı, CAPABILITY_MODULE çift anahtar, dekor etiket eşiği.

Unresolved / sonraki adımlar:
- Plan editörü fare sürükleme desteklemez (bilinçli: seç + ok/ sayısal adım; sürükleme istenirse pointer event + çakışma denetimi eklenebilir)
- Otomatik yerleşim mevcut bloklarla çakışma denetimi yapmaz (yalnızca alt boşluğa dizer — çakışma görsel olarak fark edilir, senkron engellemez)
- Floor Studio "gerçek dış uygulamadan" push senaryosu yalnız curl/browser ile simüle edildi; gerçek Floor Studio istemcisi ayrı proje
- Kalan adaylar (öncelik sırasıyla): sponsor/katılımcı dış portalları (teklif e-postası gerçek gönderim), kişi birleştirmede çakışma çözümü, bildirim WebSocket taşıma (mini-service)
- Bellek alışkanlığı: agent turu sonunda agent-browser close sürdürülmeli (4GB sandbox)

---
Task ID: R6
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R6 — QA taraması, Dış Portal modülü (sponsor/katılımcı self-servis önizlemesi + portal aksiyonları), stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog + dev.log (yalnız R5'in düzeltilmiş 4×500 geçmişi; yeni 5xx yok) + lint (0 hata) incelendi; agent-browser sweep — 16 modül tek tek gezildi, 0 page error, 0 console error. Proje STABİL → özellik turu: worklog'daki birinci öncelik adayı "sponsor/katılımcı dış portalları" uygulandı.
- BULUNAN VE GİDERİLEN OPERASYONEL RİSK: tur içinde `bunx tsc --noEmit` tam tarama sırasında dev sunucusu OOM ile düştü (4GB sandbox; worklog'da bilinen risk) → setsid ile yeniden başlatıldı. Ek Not: repoda tsc'nin ZATEN kırmızı olan eski dosyaları var (seed `never` tipleri, flows, registration-chain, form-submissions, registrations/scientific/onsite eski tip notları) — lint gate'i temiz, tsc katı tarama yeni kod için de temiz; bu eski notlar ayrı borç olarak kayıtlı.
- YENİ MODÜL Dış Portal (19. modül; MODULES'e "portals" eklendi, capability yok → workspace grubunda her zaman görünür, icon Globe):
  - API `/api/portal/participant` (GET): kişinin kendi dünyası — person(+company), participation (roller, rozetler, sertifikalar, snapshot, rezervasyonlar+otel, program atamaları+salon+CME, hak claim'leri), kayıtlar+kategori, siparişler (satır+ödeme+iade, paid/remaining hesaplı), bekleme girişleri; GET her çağrıda expireStaleOffers → portal görünümü hep güncel.
  - API `/api/portal/sponsor` (GET): kurumun sözleşmeleri (tier/paket/rightsSpec, teslimler, stant tahsisleri), hak havuzları (granted/consumed/reserved+claim dökümü), siparişler, "ekibiniz" (person.company eşleşmesiyle kurum personeli + kayıt/rozet durumu).
  - API `/api/portal/action` (POST): (1) deliverable-submit — NOT_STARTED/WAITING_SPONSOR/REJECTED → SUBMITTED, DELIVERABLE_SAVED aktivitesi "Portal: teslim gönderildi…"; (2) payment-link — açık bakiyeye PAYMENT_LINK/PENDING ödeme + PAYLINK-XXXX referansı, aktivite "Portal: ödeme bağlantısı üretildi…". Her ikisi de zile düşer (entityType Deliverable/Order mevcut modül eşlemesiyle).
  - Bekleme teklif yanıtı portal UI'dan doğrudan /api/waitlist respond'u çağırır (aktör: "Katılımcı Portalı — <ad>") — R3 motorundaki zincirleme teklif + kapasite kuralları aynen geçerli.
- UI `views/portals.tsx` (~700 satır): Kimlik rayı (katılımcı araması isim/kurum, onaylı rozet işareti; sponsor tarafında sözleşmeli kurumlar) + **tarayıcı mock'u çerçevesi** (.maven-portal-frame: mac dot'ları, kilitli URL pill'i `portal.maven.events/katilimci|sponsor/<slug>`, amber "ÖNİZLEME" damgası) + **portal hero** (.maven-portal-hero: katmanlı teal degrade + nokta dokusu, etkinlik kimliği, ziyaretçi kartı, kaynak/geliş chip'leri).
  - Katılımcı görünümü: 5 adımlı durum zaman çizelgesi (Katılım→Kayıt→Onay→Rozet→Giriş; done/current(pulsing)/error/pending — .maven-step-pulse), **canlı bekleme teklifi kartı** (geri sayım 30 sn tick, Kabul/Red gerçek aksiyon), kayıt kartı (teyit no, kategori, fon, iptal gerekçesi), ödemeler (sipariş satırları, ödeme chip'leri kaynak ikonlu, kalan bakiye, "Ödeme bağlantısı" üretimi + panoya kopya), Programınız (saat/salon/CME/rol chip), Konaklama + Rozet & Belgeler + Haklarınız.
  - Sponsor görünümü: sözleşme kartı (tutar, imza, rightsSpec, stant chip'leri), Haklar & Kullanım (segmentli progress bar: teal kullanılan / amber ayrılmış / boş + claim dökümü), Teslim Edilecekler (tip ikonlu satırlar, termin, durum; gönderilebilirlerde "Teslim et"), Siparişler (katılımcıyla ortak OrderBlock), Ekibiniz listesi.
- DEEP-LINK ENTEGRASYONU: Kayıt & Katılımcılar → Bekleme sekmesi her satırına "portalda gör" butonu (ExternalLink) — sessionStorage "maven.portal.person" yazıp Dış Portal modülüne geçer; ParticipantPortal açılışta bu kişiyi önceden seçer. Yönetici ile portal görünümü arasında tek tık köprü.
- SEED: Ünsal (REG #40) canlı teklifli — status OFFERED, offerExpiresAt +46 sa → portalda sürekli demo edilebilir kabul/ret akışı; diğer 4 bekleme girişi WAITING.
- STİL CILASI (zorunlu): globals.css — .maven-portal-hero (3 katmanlı degrade+nokta dokusu), .maven-portal-enter kademeli giriş animasyonu, .maven-step-pulse adım nabzı; hepsi prefers-reduced-motion duyarlı; portal kartlarında staggered animationDelay (0/40/80/120/160/200ms), hover geçişleri, tabular-nums para hizaları.
- DÜZELTİLEN HATALAR (geliştirme sırasında yakalanan): (1) Person modelinde `organization` ilişkisi yok → `company` alanı kullanıldı (route + UI); (2) RoomType ilişkisi `property` değil `hotel`; (3) BadgeInstance'ta `badgeName` yok → `badgeNo`; CertificateIssue'da serialNo/issuedAt yok → status/eligibilityNote/generatedAt/deliveredAt + doğru durum etiket haritaları (ELIGIBLE/GENERATED/DELIVERED, REPRINTED/VOID); (4) sponsor "ekibiniz" filtresi person.organizationId (yok) → person.company eşleşmesi.
- E2E (agent-browser, tam zincir): Dış Portal nav ✓; Katılımcı: Ünsal seç → teklif kartı + "45/46 sa kaldı" geri sayım ✓; Kabul et → REG-2026-0027 CONFIRMED (WAITLIST_PROMOTION) + rozet NOT_ELIGIBLE→READY + zaman çizelgesi Onay adımı dolu ✓ (sunucu tarafı waitlist summary converted:1 ile teyit). Sponsor: tab geçişi Radix pointer sekansı gerektirdi (mousedown+mouseup+click; eval click yetersiz — test notu) → TeknoBasın (Aday ₺0 boş görünüm) ✓ → ABC Pharma: Gold/₺500.000/A24/4 hak barı/ekip ✓; "Teslim et" (Banner WAITING_SPONSOR→SUBMITTED, buton kayboldu) ✓; "Ödeme bağlantısı" → PAYMENT_LINK PENDING 4000 sunucuda teyit ✓; zil akışında "Portal: teslim gönderildi" + "Portal: ödeme bağlantısı üretildi" kayıtları ✓. Deep-link: Bekleme sekmesi Hande Soyer satırı → Dış Portal'da hande-soyer önceden seçili ✓. Mobil 390px: yatay taşma 0, çerçeve 358px'e sığar, URL pill gizli, adımlar dikey ✓. page errors 0 ✓.
- TEST SONRASI: reseed ile temiz demo bırakıldı (4 WAITING + Ünsal OFFERED canlı teklif; Banner tekrar WAITING_SPONSOR); browser kapatıldı (bellek 1.9GB available); lint 0 hata; dev.log yeni 5xx yok.

Stage Summary:
- Bu tur eklendi: Dış Portal modülü — mimarinin "dış portallar ayrı uygulama, ortak kimlik" (§12 kaynakları, §20/§60) ilkesinin Maven'daki önizleme ve aksiyon yüzeyi: katılımcı kendi kayıt/ödeme/program/konaklama/teklif akışını, sponsor sözleşme/hak kullanımı/stant/teslim/siparişlerini gerçek veriyle görür; teklif yanıtı, teslim gönderimi ve ödeme bağlantısı üretimi gerçek iş kurallarıyla çalışır ve organizasyon ekibine bildirim düşer.
- Proje: 64 model (yeni model yok), 19 modüllü SPA (Dış Portal dahil), 3 yeni API dosyası (portal/participant, portal/sponsor, portal/action), lint 0 hata, E2E doğrulandı, reseed ile temiz demo.
- Yapılan düzeltmeler: Person.company/RoomType.hotel/BadgeInstance.badgeNo/CertificateIssue alan eşlemeleri (4 hata), Radix tab pointer sekansı test notu, dev sunucusu OOM restart.

Unresolved / sonraki adımlar:
- Portal gerçek kimlik doğrulaması içermez (OTP/ bağlantı e-postası yok) — dış portal ayrı uygulama olduğundan Maven tarafı yalnız önizleme + aksiyon simülasyonu; teklif/ödeme e-postaları hâlâ simülasyon (PAYLINK referansı üretilir, gerçek gönderim yok)
- Portal aksiyonlarında hız sınırlaması/spam guard yok (iç önizleme yüzeyi; public-register'daki spam-guard portallara uygulanmadı)
- Sponsor portalında teslim dosya yükleme yok (yalnız durum geçişi); dosya yükleme ayrı depolama konusu
- Katılımcı seçici 500 katılımla sınırlı (limit parametresi) — daha büyük edisyonlarda sunucu tarafı arama gerekir
- Eski tsc notları (seed `never`, flows/registration-chain/form-submissions/3 view) borç olarak duruyor — lint gate temiz
- Kalan adaylar (öncelik sırasıyla): kişi birleştirmede çakışma çözümü (aynı edisyonda iki katılım), bildirim WebSocket taşıma (mini-service), CME kredi defteri rapor görünümü, portal için OTP'li gerçek dış bağlantı tasarımı
- Bellek alışkanlığı: agent turu sonunda agent-browser close sürdürülmeli (4GB sandbox)

---
Task ID: R7
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R7 — QA taraması, Kişi Birleştirme Çakışma Çözümü (aynı edisyonda iki katılım), stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog + dev.log (0 yeni 5xx) + lint (0 hata) incelendi. Proje STABİL → özellik turu: R6 devir listesinin 1 numaralı adayı "kişi birleştirmede çakışma çözümü" uygulandı.
- BULUNAN TASARIM HATASI (mevcut person.merge akışında): `eventParticipation.updateMany` aynı edisyonda iki kişinin de katılımı varsa @@unique([editionId, personId]) ihlaliyle PATLIYORDU — 500 hatası + transaction yokluğu yüzünden yarım birleştirme (katılımlar taşınmış, kişi MERGED işaretlenmemiş) riski. Ayrıca CertificateIssue (@@unique definition+participation), DelegationMember (@@unique delegation+participation) ve aynı bildiride çift yazarlık çakışmaları hiç yönetilmiyordu.
- YENİ API `/api/people/merge-preview` (GET): birleştirme öncesi çakışma analizi — çakışan edisyonlar (iki tarafın kayıt no/durumu/kategorisi/rozet sayısı + defaultWinner: onaylı kayıt tarafı), taşınacak katılım sayısı, kişi-düzeyi taşınma sayaçları (bildiri/yazarlık/hakemlik/tarama/görev/iletişim/delegasyon/bekleme), profil alan farkları (fill: hedef boş→doldurulur | conflict: çakışıyor→hedef korunur), loserBadges uyarısı.
- flows `person.merge` SIFIRDAN YAZILDI: `db.$transaction` ile tek işlem; resolutions[editionId]="target"|"source" ile edisyon kazananı seçilir — kaybeden katılımın TÜM geçmişi (kayıtlar, snapshot'lar, rozetler, credential'lar, taramalar, hak claim'leri, program atamaları, rezervasyonlar, occupancy, refakatçiler, sipariş satırları, form yanıtları, bekleme girişleri, oda arkadaşı istekleri) kazanan katılıma taşınır; benzersiz kısıtlı çocuklarda (sertifika/delegasyon üyeliği) hedefte varsa kopya silinir yoksa taşınır; rollerde aynı rol hedefte varsa kopya oluşmaz; sonra boşalan katılım silinir (geçmiş silinmez, sahibi değişir — Kimlik kuralı 3). Kişi-düzeyi: participations/submissions/reviewAssignments/scanEvents/tasks/contacts/delegasyon liderlikleri/waitlist/program personId taşımaları; yazarlıklarda aynı bildiride çift satır engeli (dup → isimli harici yazar kalır); fillProfile: boş hedef profil alanları kaynaktan doldurulur; kaynak kişi MERGED+mergedIntoId; aktivite günlüğü "…N kayıt taşındı · M edisyonda çakışma çözüldü".
- UI (people.tsx): Birleştirme diyaloğu iki katmanlı oldu — (1) hedef seçimi radio'ları (mevcut), (2) hedef seçilince otomatik yüklenen çakışma önizlemesi: profil alan farkları (teal "doldurulur" / amber "hedef korunur" chip'leri), çakışan edisyon başına KAZANAN SEÇİMİ iki kutulu radio (kayıt no mono, durum, kategori, rozet sayısı; kazanan kutu .maven-winner-glow hale + ring, kaybeden kesikli soluk; altında "…taşınır, boşalan silinir" açıklaması dinamik), taşınma özeti chip'leri (N bildiri, N tarama…), loserBadges amber chip; onay butonu analiz bitene dek kilitli; toast taşınan kayıt+çözülen edisyon sayısını gösterir. Diyalog max-h-[85vh] kaydırmalı.
- SEED: Defne Kaya mükerrer senaryosu — eski kayıt (Delta Üniversitesi, CONFIRMED REG + PRINTED rozet + credential + kapı taraması), yeni kayıt (Yol Yapım A.Ş., aynı e-posta, phone dolu/title/company farklı; SUBMITTED Öğrenci kaydı + NOT_ELIGIBLE rozet) → aynı edisyonda iki katılım; mükerrer tarayıcı EMAIL eşleşmesiyle önerir.
- STİL CILASI (zorunlu): globals.css .maven-winner-glow (2.2s teal hale, reduced-motion duyarlı); kazanan/kaybeden kutu kontrastı (ring+dashed), diff chip renk dili, kaydırılabilir diyalog, mobil 390px'te kutular dikey sarar.
- DÜZELTİLEN HATALAR: (1) yukarıdaki P2002/yarım-merge hatası (transaction + çözüm); (2) eski akışta authorship/updateMany çakışmalarının sessiz veri kaybı riski (dedupe kuralları); (3) merge aktivitesi edisyon-scope'suz olduğundan zilde görünmüyordu — /api/activity sorgusuyla doğrulanıyor (tasarım kararı: birleştirme tenant-düzeyi olay).
- E2E (agent-browser + curl, iki yön de): curl target-kazanır → merge ok (1 kayıt, 1 edisyon) + tek katılım + 2 kayıt + 2 rozet aynı katılımda + telefon doldurulmuş + kaynak MERGED gizli (26 görünür) ✓; UI: Kişiler → Olası Mükerrerler → Birleştir → önizleme (Telefon fill, Unvan/Kurum conflict, çakışma bandı, REG'li kutular) → kazanan radio kaynakta (false/true→true/false) → Birleştir → suggestions listesi boşaldı + PERSON_MERGED günlüğü "1 kayıt taşındı · 1 edisyonda çakışma çözüldü" ✓ (source-kazanır yolu UI'dan); mobil 390px: diyalog sığar, iç kaydırma var, sayfa taşması 0, 4 radio görünür ✓; page errors 0 ✓.
- TEST SONRASI: reseed ile temiz demo bırakıldı (Defne çifti tekrar birleşmemiş — 1 mükerrer öneri; Ünsal canlı teklif OFFERED); browser kapatıldı; lint 0 hata; dev.log 5xx yok.

Stage Summary:
- Bu tur eklendi: Kişi Birleştirme Çakışma Çözümü — aynı edisyonda iki katılımın olduğu mükerrer kişiler artık güvenle birleşiyor: önizlemede çakışma görünür, kullanıcı edisyon bazında kazanan katılımı seçer, sunucu tek transaction'da kaybedenin tüm geçmişini kazanan tarafına taşıyıp boşalanı siler; benzersiz kısıtlı tablolarda dedupe, profil boşluk doldurma ve tam aktivite izi ile. R6'daki "yarım merge/P2002" riski kapandı.
- Proje: 64 model (değişiklik yok), 19 modüllü SPA, 1 yeni API (merge-preview) + yeniden yazılan person.merge akışı, lint 0 hata, E2E iki yönüyle doğrulandı, reseed ile temiz demo.
- Yapılan düzeltmeler: person.merge P2002 + yarım birleştirme hatası (transaction), sertifika/delegasyon/yazarlık çakışma dedupe'leri, hedef-buton analiz kiliti.

Unresolved / sonraki adımlar:
- Birleştirme geri alma (un-merge) yok — mimari gereği geçmiş korunuyor; mergedIntoId ile iz sürülebilir, ayrı geri alma akışı istenirse ayrı faz
- Preview'da yalnız sayısal özet var; edisyon çatışmasında ikinci kaydın ödeme/hak durumu ayrıca listelenmiyor (kayıt no + durum yeterli görüldü)
- Merge ekranı yalnız mükerrer öneri kartından açılıyor; kişi 360 çekmecesi içinden "başka kayıtla birleştir" girişi eklenmeye aday
- Kalan adaylar (öncelik sırasıyla): bildirim WebSocket taşıma (mini-service), CME kredi defteri rapor görünümü, portal için OTP'li gerçek dış bağlantı, Floor Studio otomatik yerleşiminde çakışma denetimi
- Bellek alışkanlığı: agent turu sonunda agent-browser close sürdürülmeli (4GB sandbox)

---
Task ID: R8
Agent: Z.ai Code (ana ajan)
Task: Cron inceleme turu R8 — QA taraması, Canlı Bildirim Veri Yolu (WebSocket mini-servis), CME Resmî Akreditasyon Raporu (basılabilir belge + CSV), stil cilası

Work Log:
- QA DEĞERLENDİRMESİ: worklog (R7 sonrası devir listesi) + dev.log (0 yeni 5xx) + lint (0 hata) incelendi; upload/maven_docs HÂLÂ boş (zip-watcher ürünü yok → şema/UI mutabakatı gerekmedi). agent-browser ile app açıldı, sayfa hataları 0 → proje STABİL → özellik turu: devir listesinin 1 numaralı adayı "bildirim WebSocket taşıma" + 2 numaralı aday "CME rapor görünümü" bu turda birlikte uygulandı.
- YENİ MİNİ-SERVİS mini-services/live-bus/ (bağımsız bun projesi, kendi package.json'ı, socket.io ^4.8.3):
  - socket.io :3003 path "/" (Caddy XTransformPort kuralı aynen) — tarayıcı aboneliği: subscribe { editionId } → "global" + "edition:<id>" odaları
  - HTTP yayın ucu :3004 (POST /publish { room, payload }, GET /health) — KRİTİK BULGU: socket.io path "/" ile AYNI portta HTTP uç çalışmıyor (engine.io tüm yolları yutuyor, "Transport unknown") → yayın ucu ayrı iç porta alındı; tarayıcı :3004'e asla dokunmaz
  - Hazırlık takibi: socket başına edisyon, bağlantı/kopma olaylarında "presence" yayını (izleyici sayısı); durum yok — kalıcılık ActivityLog'ta, bus yalnız aktarım
  - E2E doğrulandı (socket.io-client test istemcisi): subscribe → presence → publish → room'a doğru teslim (receivers:1)
- TEK KANCA — Prisma $extends (src/lib/db.ts): 33+ çağrı noktasına dokunmadan TÜM activityLog.create/createMany işlemlerini yakalayıp canlıya düşer. İLK DENEMEDE DÜŞTÜĞÜ HATA: Prisma 6.11'de db.$use YOK ("db.$use is not a function" → tüm API'ler 500) → $extends query bileşeniyle yeniden yazıldı; globalThis önbelleği eski düz istemciyi tuttuğu için dev sunucusu bir kez yeniden başlatıldı (setsid). Fire-and-forget: 900 ms timeout, bus kapalıysa sessiz yutulur, iş akışı asla bloklanmaz.
  - Paylaşılan meta çıkarıldı: src/lib/api/notification-meta.ts (SEVERITY_MAP + MODULE_MAP + TYPE_MODULE_MAP + severityFor/moduleFor) — /api/notifications ile canlı yayın aynı dili konuşur, mükerrer harita kalktı
- BİLDİRİM ZİLİ CANLI OLDU (notification-bell.tsx): io("/?XTransformPort=3003") bağlantısı (websocket+polling, 12 deneme reconnect), connect'te subscribe; canlı olay listede BAŞA kayar (25 ile sınırlı, id dedupe), .maven-notif-in girişli; rose (kritik) olaylar ayrıca toast düşer; alt bantta bağlantı durumu: "Canlı akış" (yeşil nabızlı nokta + N izleyici) / "Yoklama modu" (amber); zil butonunda canlılık noktası; yoklama yedeği: canlıyken 3 dk, değilken 45 sn
  - YAKALANAN HATA (bayat closure): connect handler'ı ilk render'ın currentEditionId'sini (null — bootstrap bitmeden) yakalayıp yalnız global odaya abone oluyordu → edisyon olayları hiç düşmüyordu. Çözüm: editionRef + güncelleyen effect; connect'te ref'ten okuma. Testte yakalandı (curl tetiklemesi popover'a düşmedi), düzeltme sonrası canlı teslim doğrulandı
- YENİ API /api/cme/report (GET ?editionId=&format=json|csv): resmî rapor sözleşmesi — antet verisi (tenant + edisyon adı/label/tarih/mekân/şehir), özet (7 metrik), oturum dökümü (tarih, katılım, kredi), kişi defteri (YALNIZ kredi > 0; teyit no, roller, katılınan oturum, yüzde), generatedAt. CSV: BOM'lu UTF-8, ; ayraçlı (Excel TR), Content-Disposition attachment (cme-rapor-<slug>-<tarih>.csv), TOPLAM satırı
- RAPOR BELGESİ UI (src/components/maven/cme-report.tsx + Program → CME Kredi sekmesi): "Resmî Rapor" (overlay) + "CSV" butonları Kapsam satırına eklendi. Belge: .maven-report-doc serif kimlik + kağıt gölgesi, .maven-report-letterhead antet bandı (tenant uppercase tracking + edisyon + mekân/tarih), "Sürekli Tıbbi Eğitim — Kredi Raporu" rozeti, 4'lü özet şeridi, oturum dökümü + kişi defteri (.maven-report-table resmî çizgi dili), imza blokları (Akreditasyon Sorumlusu / Organizasyon Sekreteri) + .maven-report-seal çift halkalı mühür, elektronik üretim künyesi footer'ı
  - YAZDIRMA: "Yazdır" body.maven-printing ekler; @media print kuralları body * visibility:hidden + .maven-report-print absolute görünür → yalnız belge basılır (sandbox'ta window.open engellenebileceğinden new-window yerine yerinde yazdırma seçildi); aksiyon çubuğu .maven-no-print ile basılmaz
- STİL CILASI (zorunlu): globals.css — maven-live-pulse (canlı nokta nabzı), maven-notif-in (canlı bildirim girişi), .maven-report-doc/letterhead/seal/table resmî belge dili, @media print kuralları; hepsi prefers-reduced-motion duyarlı
- E2E (agent-browser, gateway :81 üzerinden): zil "Canlı akış · 5 izleyici" ✓; curl ile CME kredi ataması → AÇIK popover'a anında düştü (yoklamasız) ✓; kritik-seviye toast mekanizması rose eşlemesiyle bağlı ✓; Resmî Rapor: antet "Maven Etkinlik Çözümleri / No-Dig Turkey 2026 — 2026 / İKM, İstanbul" + 3/7, 6.5, 5, 7.5 özet + 2 tablo + mühür + imzalar görsel teyitli ✓; CSV ucu curl ile teyitli ✓; mobil 390px: rapor 358px sığar, ÖNCE BULUNAN TAŞMA (486 vs 390 — benim eklediğim Kapsam butonları flex-wrapsız) flex-wrap + min-w-24 ile GİDERİLDİ (390 vs 390) ✓; page errors 0, console hata 0 ✓
- TEST SONRASI: reseed ile temiz demo bırakıldı (5 kredi kazanan, 7.5 dağıtılan — tohum değeriyle aynı); browser kapatıldı (1.8GB available); lint 0 hata; test penceresinde 5xx yok

Stage Summary:
- Bu tur eklendi: (1) Canlı Bildirim Veri Yolu — mimarideki "domain event → UI" akışı artık gerçek zamanlı: Prisma katmanına tek $extends kancası (33+ nokta), bağımsız live-bus mini servisi (socket.io :3003 / yayın :3004), zil anında güncelleniyor, izleyici sayısı + bağlantı durumu görünür, REST yoklaması yalnız yedek; (2) CME Resmî Akreditasyon Raporu — antetli, mühürlü, imzalı basılabilir belge + Excel uyumlu CSV indirme; R7 devir listesinin ilk iki adayı kapandı.
- Proje: 64 model (değişiklik yok), 19 modüllü SPA, 1 yeni mini-servis (live-bus), 2 yeni API (cme/report + meta çıkarımı), 1 yeni UI bileşeni (cme-report.tsx), lint 0 hata, E2E doğrulandı, reseed ile temiz demo.
- Yapılan düzeltmeler: socket.io path "/" HTTP çakışması (ayrı yayın portu), Prisma $use yokluğu ($extends ile), globalThis bayat istemci (dev restart), zilde bayat-closure abonelik hatası (ref), mobil Kapsam satırı taşması (flex-wrap).

Unresolved / sonraki adımlar:
- live-bus bellek alışkanlığı: servis `cd mini-services/live-bus && (setsid bun run dev > live-bus.log 2>&1 &)` ile ayağa kalkar; sandbox yeniden başlatılırsa yeniden çalıştırılmalı (health: curl 127.0.0.1:3004/health)
- Canlı yayın sunucu-içi localhost:3004'e gider — çoklu实例 (PM2/cluster) senaryosunda yayın hedefi ortam değişkenine alınmalı (tek dev örneğinde sorun yok)
- Kritik (rose) olay toast'ı zil açıkken de düşer (çift bildirim algısı) — istenirse popover açıkken toast bastırılabilir
- Yazdırma çıktısı yalnız kural setiyle doğrulandı (headless'ta gerçek print önizlemesi test edilemez); kenar boşlukları kullanıcı tarafında kontrol edilmeli
- Kalan adaylar (öncelik sırasıyla): portal için OTP'li gerçek dış bağlantı, Floor Studio otomatik yerleşiminde çakışma denetimi, deliverable dosya yükleme (depolama), bildirim tercih/abonelik ayarları (zil hangi olay tiplerini alsın)
- Bellek alışkanlığı: agent turu sonunda agent-browser close sürdürülmeli (4GB sandbox)

---
Task ID: R9-temel
Agent: Z.ai Code (ana ajan)
Task: Kullanıcının 9 başlıklı "düşünce bulutu" modül talebinin mevcut 64 modelli şemaya derinlemesine uyum analizi (feature check — geliştirme hafızası) + şema evrimi + temel API katmanı.

Work Log:
- Kullanıcı talebi: 9 modüllük düşünce bulutu (kişi/rol, program import, medya arşivi, API geçidi, kurumsal profil, 360 branding, sponsorluk, konaklama, yaka kartı + sertifika). Talimat: "yapılmışsa özellik kontrolü + geliştirme hafızası; şema bozulmasın, tekrar önlensin". upload/maven_docs boş geldi (zip yok).
- FEATURE CHECK — ZATEN VAR (geliştirme hafızası; tekrar yapılmadı):
  - Rol ayrımları: EventRoleAssignment (§11: ATTENDEE|AUTHOR|REVIEWER|SPEAKER|MODERATOR|SESSION_CHAIR|PANELIST|COMMITTEE_MEMBER|VIP|PRESS|STAFF|EXHIBITOR_STAFF) + ReviewAssignment (hakem) + ProgramAssignment (konuşmacı/oturum görevi) — kişi bazlı hiyerarşik eşleme mevcut
  - Oturum/program: ProgramRoom/ProgramSession/ProgramAssignment + Submission.fileUrl (bildiri dosyası) + Track
  - Sponsorluk: SponsorTierDefinition/Package/Agreement + Deliverable (§51 teslim akışı) + Entitlement (type=CUSTOM + label serbest = paket dışı custom hak; granted/consumed/reserved + EntitlementClaim = kullanım takibi)
  - Konaklama: HotelProperty/RoomType (fiyat/night)/RoomBlock/InventoryNight/Reservation (payerType, §10 durum makinesi)/OccupancySlot/RoommateRequest/Companion (ADULT|CHILD|INFANT) — Single/Double/aile kapasitesi mevcut
  - Form→konaklama veri toplama: FormDefinition.audience=ACCOMMODATION mevcut
- GAP ANALİZ SONUCU — EKSİKLER (bu turda tamamlanıyor):
  1. Custom Rol Motoru (CustomRole modeli: key/name/color/hierarchyLevel/permissions JSON) + EventRoleAssignment.customRoleId; CV alt modülü (CvEntry: EDUCATION|EXPERIENCE|AWARD|LANGUAGE|PUBLICATION|CERTIFICATION, kişi bazlı, edisyon izolasyonlu); QR VCard (/api/people/[id]/vcard — vCard 3.0 + QR SVG, qrcode paketi; .vcf indirme); rol giriş ekranı mock önizlemesi (UI)
  2. Program/katılımcı içe aktarım (/api/program/import — CSV/TSV parse, tr/en başlık eşlemesi, e-posta→ad-soyad eşleştirme, matchDetails raporu, dryRun); SessionMaterial modeli (ABSTRACT|FULL_PAPER|SLIDES|VIDEO|SPEAKER_TEXT|LINK, sessionId+personId bağlantılı)
  3. Medya Arşivi: MediaFolder (self-ref parentId, systemKey) + MediaAsset (kind/mimeType/dataUrl ≤400KB/externalUrl/linkedType) — editionId ZORUNLU (etkinlik izolasyonu)
  4. API Geçidi: ApiIntegration (direction OUTBOUND|INBOUND, kind REST|WEBHOOK|PAYMENT|MAIL|SMS|CRM|TICKETING, authConfig maskeli, inboundToken @unique) + IntegrationLog + /api/integrations/run (gerçek fetch 8sn timeout) + /api/integrations/hook/[token] (type=PARTICIPANT ile kişi+katılım upsert) — ödeme sağlayıcıları (Iyzico/PayTR) PAYMENT kind ile
  5. Kurum: +generalEmail/address/description/locationNote (Salon/Fuar/Otel QR notu) + /api/organizations/[id]/vcard (format=location → konum QR) + OrganizationContact.role (PRIMARY|AUTHORIZED|PAYMENT|TECHNICAL|PRESS|CUSTOM) — PCO tipi Organization.type'a additive değer
  6. 360 Branding: Campaign.phase (PRE|DURING|POST_EVENT) + audienceMode + customRecipients + templateId/providerId/formId bağlantıları; EmailTemplate (HTML gövde, kategori, faz, usageCount); MailProviderConfig (SMTP|MAILJET|SENDGRID|RESEND, isDefault, dailyLimit) + /api/mail/test (kontrol listesi + IntegrationLog)
  7. Entitlement.approvalStatus (PROPOSED|APPROVED|REJECTED — default APPROVED, mevcut veriler güvenli)
  8. Reservation.noShow/noShowFee/ratePerNight/nights/occupancyType (SINGLE|DOUBLE|FAMILY_SHARED); Person.parentPersonId SELF-REFERENCING (Parent_ID kuralı birebir) + relationType (SPOUSE|CHILD|GUEST|ASSISTANT)
  8-bis. BadgeDesign modeli (widthMm/heightMm/bleedMm/cornerMm, sideCount 1|2, fontKey serbest, front/backBackgroundDataUrl arka layer, front/backElements JSON mm koordinatlı, qrSource CREDENTIAL|VCARD, sponsorHierarchyKey, showProgramOnBack, backContactInfo) + BadgeProfile.designId + /api/badges/print-sheet (@page mm, QR server-side üretim, alan bağlama BADGE_FIELD_KEYS: snapshot badgeName/title/company + rol/profil/teyit no)
  9. CertificateDefinition tasarım kolonları (widthMm/heightMm/bleedMm/orientation/backgroundDataUrl/fontKey/textColor/bodyTemplate {{fullName}}... yer tutuculu/tierNote) + /api/certificates/print-sheet
- ŞEMA EVRİMİ: yalnızca EKLEME — 64→74 model, mevcut tablo/kolon SİLİNMEDİ (kullanıcının Schema Evolution kuralı birebir). db push ✓ + Prisma client regen + dev restart
- API DÜZELTMELERİ (geliştirme sırasında yakalanan): SQLite mode:"insensitive" desteği yok (3 rota düzeltildi); EventParticipation ilişkileri snapshots[] (çoğul) + profile yok → badgeInstances[0].profile (print-sheet rotası 2 kez düzeltildi)
- E2E SMOKE (curl): seed ✓ (yeni dalga verisi: 3 custom rol, 6 CV, 6 materyal, 5 klasör+5 varlık, 4 entegrasyon+3 log, 4 şablon, 2 sağlayıcı, kurum kimlik kartı+2 kontak, PROPOSED hak, DOUBLE rezervasyon+no-show ücretli örnek, SPOUSE refakatçi Person.self-ref, 2 taraflı badge tasarımı + profil bağları, sertifika şablonu) · vcard 200 · badge print-sheet 200 (16KB HTML) · cert print-sheet 200 · webhook hook 202 → "yeni kişi + katılım" upsert ✓ · program import dry-run ✓
- page.tsx: media + integrations modül case'leri bağlandı (stub view'lar geçici); constants.ts: MODULES'e Medya Arşivi + API Geçidi eklendi + 12 yeni etiket seti (CAMPAIGN_PHASE, APPROVAL_STATUS, EMAIL_TEMPLATE_CATEGORY, MAIL_PROVIDER_KIND, MEDIA_KIND, MATERIAL_TYPE, INTEGRATION_*, CONTACT_ROLE, RELATION_TYPE, CV_KIND, OCCUPANCY_TYPE, BADGE_FIELD_KEYS, BADGE_FONTS)

Stage Summary:
- Feature check tamamlandı ve geliştirme hafızası olarak worklog'a işlendi: 9 başlığın ~%55'i zaten mevcut mimarideydi (rol makinesi, entitlement engine, konaklama stoku, teslim akışı); eksikler 10 yeni model + 6 modelde additive kolonlarla tamamlandı. Şema evrimi kuralı (migration, normalization 3NF, Parent_ID self-ref, Event_ID izolasyonu) birebir uygulandı.
- Proje: 74 model, 22 modüllü SPA, 8 yeni API dosyası (people/organizations vcard, program/import, integrations run+hook, mail/test, badges+certificates print-sheet), registry'de 10 yeni entity, seed genişletildi.
- Sonraki adım: 3 paralel UI subagent'ı (B: yaka kartı tasarımcısı + sertifika + iletişim 360; C: kişiler roller/CV/VCard + kurum kartı + program import/materyaller; D: medya arşivi + API geçidi + konaklama no-show + sponsorluk onay) → agent-browser QA → worklog final.
---
Task ID: R9-b
Agent: UI subagent B (badge/certificates/communications)
Task: Yaka Kartı Tasarımcısı (Rozet Baskı → "Tasarımcı" sekmesi), Sertifikalar tasarım paneli + belge listesi (baskı + e-posta teslimi), İletişim 360 Branding (aşama filtresi, kampanya/şablon/sağlayıcı kartları + dialoglar + test gönderimi).

Work Log:
- badge-designer.tsx (YENİ, tek yeni dosya): 3 panelli tasarımcı — sol rayda tasarım listesi (badge-designs, edisyon bazlı) + "Baskı Kuyruğu" seçim kartı; ortada mm hassasiyetli kanvas (3.2 px/mm ölçek, üst/sol mm cetvelleri, 5mm ince + 10mm belirgin CSS repeating-linear-gradient ızgara, baskı payı kesikli çerçeve, font = BADGE_FONTS[fontKey].css); sağda tasarım + eleman özellik paneli.
- Tasarım CRUD: ad, widthMm/heightMm/bleedMm/cornerMm (mm number input, tabular-nums), Tek/Çift taraflı Switch (sideCount 1|2), fontKey (BADGE_FONTS), qrSource (CREDENTIAL|VCARD), sponsorHierarchyKey (hint "Gold Sponsor"), showProgramOnBack, backContactInfo; arka plan yükleme (FileReader → dataURL, ≤600KB aksi toast uyarı, front/backBackgroundDataUrl, hint "Tasarımcıdan gelen görsel en arka layer'a eklenir"); kaydet POST/PUT /api/badge-designs (+bump).
- Eleman editörü: 7 ekleme düğmesi (Metin/Alan/QR/Logo/Sponsor Logo/Program/İletişim), pointer-event sürükleme (px→mm dönüşümü, setPointerCapture, kanvas sınırına clamp), seçili eleman ring-2 ring-teal-500, eleman listesi; özellik paneli: x/y/w/h mm (0.1 adım), fontSize (mm), weight 400-800, color (color input + hex), align; FIELD için BADGE_FIELD_KEYS seçici, TEXT için metin alanı; eleman silme.
- Gerçek veriyle önizleme: listEntity("participations", {editionId, limit:30}) (person+registrations.category+badgeInstances.profile+roleAssignments dahil — curl ile şekil teyitli), kişi seçici, FIELD değerleri print-sheet ile aynı eşlemede doldurulur, QR placeholder kutu; Ön/Arka pill switcher sideCount=2'de görünür.
- Baskı: katılımcı çoklu seçim (en fazla 20, checkbox), kopya 1-4, "Baskı sayfası aç" → raw fetch POST /api/badges/print-sheet → text/html → Blob URL → window.open, popup engellenirse gizli iframe fallback; tasarım kayıtsızsa yönlendirici toast.
- badge-queue.tsx: mevcut kuyruk görünümü DOKUNULMADI, üstte "Baskı Kuyruğu | Tasarımcı" sekme şeridi eklendi; Tasarımcı sekmesi BadgeDesigner'ı barındırır.
- onsite.tsx CertificatesView (OnsiteView/OperationsView/SettingsView dokunulmadı): tanım kartları seçilebilir (ring-teal) oldu; seçili tanım için "Sertifika Tasarımcısı" paneli — widthMm/heightMm/bleedMm/orientation (Yatay|Dikey)/fontKey/textColor (color input)/tierNote + arka plan yükleme (≤600KB → backgroundDataUrl) + bodyTemplate textarea ve {{fullName}}/{{title}}/{{company}}/{{edition}}/{{tier}}/{{date}}/{{serial}} yer tutucu çipleri (tıkla-ekle); PUT /api/certificate-definitions/[id] (textColor #-siz saklanır). Canlı önizleme: aspect-ratio mini kanvas (seri adı, def adı, seri no, örnek veriyle doldurulmuş gövde, imzacı + çift halkalı mühür).
- Belge listesi: listEntity("certificate-issues", {definitionId}) (registry include: participation.person); satır seçimi + "Toplu Yazdır" → POST /api/certificates/print-sheet (blob/iframe), sunucu ELIGIBLE→GENERATED otomatik geçişi sonrası liste reload; satır bazlı "Sertifikayı aç" (tekil baskı); GENERATED/DELIVERED için "E-posta ile gönder" → PUT /api/certificate-issues/[id] {status:"DELIVERED", deliveredAt} + toast "Sertifika e-postayla gönderildi (simülasyon) — Şablon: Teşekkür + Sertifika Teslimi". Mevcut "Üret" (flows certificate.generate) ve sayaçlar korundu.
- onsite.tsx CommunicationsView → 360 Branding: aşama filtre şeridi (Tümü + Organizasyon Öncesi/Zamanı/Sonrası, CAMPAIGN_PHASE); kampanya satırında aşama/audienceMode çipleri + şablon/sağlayıcı adları (id→ad eşleme) + "Gönder (sim.)" (PUT campaigns status=SENT+metrik, bağlı şablon usageCount PUT ile +1); kampanya dialogu: phase, audienceMode (SEGMENT|CUSTOM|BOTH), customRecipients textarea (CUSTOM/BOTH'ta görünür, alıcı sayacı), şablon/sağlayıcı/quiz-formu (forms) seçicileri, konu, sabit segment.
- Şablonlar kartı: liste (ad, kategori, aşama, usageCount, konu) + önizleme dialogu (mock e-posta çerçevesi: "Kimden: fromEmail" başlık bandı, konu, htmlBody korumalı dangerouslySetInnerHTML) + oluştur/düzenle dialogu (ad, konu, kategori, aşama, HTML gövde) + "Kampanyada kullan" kısayolu (şablon ön seçili kampanya dialogu).
- Mail Sağlayıcıları kartı: liste (MAIL_PROVIDER_KIND etiketi, from, günlük limit, isDefault yıldızı, status, son test çipi) + oluştur/düzenle dialogu (kind, host, port, username, password type=password + "UI'da maskelenir — boş bırakılırsa mevcut şifre korunur", fromEmail/fromName/replyTo/dailyLimit/isDefault) + "Test gönderimi" → POST /api/mail/test → toast kontrol listesi özeti (✓/✗ label: note, N/M kontrol) + reload (lastTest çipi güncellenir). Mevcut metrik ızgarası ve TESTED açıklaması korundu.
- STİL (zorunlu): p-4/p-6 + gap-4/6 tutarlılığı, tabular-nums mm sayıları, hover geçişleri, maven-scroll max-h-96 listeler, mm ızgara kanvas, pill switcher'lar, ring-2 ring-teal-500 seçim, animate-in fade-in slide-in kademeli giriş + motion-reduce:animate-none, lg altı dikey istifleme + kanvas overflow-x-auto; palet teal/amber (indigo/mavi yok).
- E2E (agent-browser, gateway :81): Rozet Baskı sekmesi → Tasarımcı: 7 sürüklenebilir eleman + mm ızgara + Ön/Arka pill + "Çift taraflı" + Gold Sponsor + iletişim metni ✓; Gerçek Veriyle Önizle → "Ahmet Yılmaz" ✓; baskı kuyruğu checkbox (29 satır) → "Baskı sayfası aç" → POST /api/badges/print-sheet 200 + blob sekmesi açıldı (toolbar "🖨️ Yazdır / PDF kaydet" gözlendi) ✓; Belgeler → Tasarımcı: tasarım paneli + yer tutucu çipleri + Canlı Önizleme (MAVEN mührü, Katılımcı düzeyi) + Belge Listesi + Toplu Yazdır + Sertifikayı aç ✓; İletişim: aşama pill'leri, Şablonlar (önizleme mock çerçeve "Kimden:" ✓), Sağlayıcılar → Test gönderimi → POST /api/mail/test 200 + "kontrol geçti" toast'ı ✓; page error 0.
- curl doğrulama: badges/print-sheet 200 text/html 31KB (2 katılımcı×2 kopya) · certificates/print-sheet 200 · people/[id]/vcard?format=qr data:image/png ✓ · PUT campaigns (phase/audienceMode/customRecipients/templateId/providerId) 200 ✓ · PUT certificate-definitions tasarım alanları 200 ✓ · PUT certificate-issues deliveredAt 200 ✓ · mail/test {ok, checks[]} ✓ · email-templates + badge-designs POST/PUT/DELETE turu 200 (test kayıtları silindi, tohum verisi geri kondu).
- OPERASYON NOTU: doğrulama sırasında Next dev sunucusu düştü; `setsid bun run dev` ile aynı port/komut yeniden ayağa kaldırıldı (dev.log tekrar yazılıyor, tüm sayfalar 200).

---
Task ID: R9-c
Agent: UI subagent C (people/program)
Task: R9-temel temellerinin UI katmanı — Kişiler'e "Roller & Yetkiler" sekmesi (özel rol motoru + hiyerarşi rayı + rol atama köprüsü + rol giriş ekranı mock'u), kişi 360'a CV zaman çizelgesi + QR VCard + aile/refakatçi bağları, Kurumlar'a kurumsal kimlik kartı + kontak yönetimi + çift QR paneli, Program'a İçe Aktar (dry-run + rapor) ve oturum materyalleri.

Work Log:
- Önce /api/program/import, /api/people/[id]/vcard, /api/organizations/[id]/vcard, registry ve generic CRUD rotaları curl ile tersine mühendislik edildi. BULGU: görev bağlamında geçen "event-role-assignments" ve "organization-contacts" entity adları registry'de YOKTU — "role-assignments" kullanılabilir, contacts için registry.ts'e "organization-contacts" entity'si EKLENDİ (yalnız ekleme, mevcut model dokunulmadı; auditType ORG_SAVED).
- PEOPLEVIEW "Roller & Yetkiler" sekmesi: mevcut Kişiler içeriği (mükerrer öneriler + birleştirme + 360) birebir korunup Tabs altına alındı. Yeni sekme: (1) Özel Rol kartları — renk noktası, Sv. rozeti, mono key, JSON yetki çipleri (CAPABILITIES etiketli), isSystem/pasif çipleri, düzenle/pasifleştir-güç/sil (sistem rolu silinemez); (2) oluşturma/düzenleme diyaloğu — ad→key TR-slugify otomatik öneri + benzersizlik çakışma uyarısı, Slider+Input hibrit hiyerarşi 1-99, sabit 6 renk paleti radio grubu, CAPABILITIES toggle-çipleri, açıklama; (3) Hiyerarşi Rayı — seviyeye göre boyutlanan daireler (Sv.1-20 en büyük) bağlantı çizgili yatay kaydırılabilir zincir, kademeli giriş; (4) Rol Ataması köprüsü — katılım seçimi (listEntity participations, kişi+kurum etiketli) + standart/özel rol ayrılmış Select (özel: `cus:<id>` → POST /api/role-assignments {participationId, role:key, customRoleId}) + toast + bump; (5) Rol Giriş Ekranı mock'u — PortalFrame desenli tarayıcı çerçevesi, rol renkli vurgu bandı, kapalı e-posta/şifre girişleri, devre dışı Giriş butonu, çapraz çizgili zemin + döndürülmüş "Önizleme" su damgası, alt nota "gerçek kimlik doğrulama içermez".
- KİŞİ 360: (1) "Aile & Refakatçiler" kartı — Bağlı olduğu kişi satırı (parentPersonId → tek apiGet ile isim; aynı-soyad araması find ile hızlı yol) + bağlantı türü çipi + Refakatçiler listesi (listEntity people q=<soyad> → parentPersonId === kişi filtresi, RELATION_TYPE etiketli çipler); (2) "CV & Deneyimler" kartı — cv-entries CV_KIND sırasına göre gruplu sol-hat zaman çizelgesi (nokta düğümler, kurum·şehir, tabular tarih aralığı, "Devam ediyor" çipi bitişi gizler), ekle/düzenle diyaloğu (tür, başlık, kurum, şehir, tarih çifti, isCurrent checkbox, açıklama, sıra) + sil; editionId ZORUNLU olduğundan edisyon seçilmeden ekleme kilitli + açıklama; (3) "QR VCard" kartı — köşe vurgulu .maven-qrvcard çerçeveli 120px QR, rol çipleri, "vCard indir" (?format=vcf download anchor), "QR'ı kopyala" (clipboard + toast), e-posta VE telefon yoksa EmptyState ("Kartvizit için iletişim bilgisi yok").
- Kişi oluşturma diyaloğu create/edit'e dönüştü: "Bağlı olduğu ana kişi" (liste verisinden, exclude-self) + "Bağlantı türü" (SELF hariç RELATION_TYPE; ana kişi seçilmemişse disabled) alanları; 360 Kimlik kartına "Düzenle" butonu eklendi — PUT /api/people/{id} parentPersonId/relationType dahil; kaydetme sonrası açık 360 çekmecesi tazelenir. Kişi listesi satırında "refakatçi" çipi.
- ORGANIZATIONSVIEW: (1) kurum diyaloğu generalEmail/address/description/locationNote alanlarıyla genişletildi, tür seçimine PCO eklendi (yerel ORG_TYPES haritası — constants'a dokunulmadı, label fallback ile bilinmeyen türler ham basılır), düzenleme modu (360'tan "Düzenle", PUT); (2) "Kurumsal Kimlik Kartı" bölümü 360'ın tepesinde (genel e-posta, adres, web, konum notu QR ipucuyla, açıklama); (3) OrgContactsPanel — CONTACT_ROLE rol çipleri + departman çipi + yıldızla birincil toggle (yeni birincil seçilince eskisi otomatik düşürülür, iki PUT) + ekle/düzenle/sil diyaloğu (isPrimary checkbox "kartvizitte görünür" notu); (4) OrgQrPanel — Kurum QR + Konum QR yan yana (locationPayload altyazısı), "vCard indir" + "Konum QR'ı kopyala"; kurum listesi kartlarında genel e-posta/konum notu satırı.
- PROGRAMVIEW: (1) "İçe Aktar" diyaloğu — Oturum Programı/Katılımcı Listesi radio kartları, mono textarea (placeholders: "Oturum Adı;Başlangıç;Bitiş;Salon;Konuşmacı;E-posta;Rol" / "Ad Soyad;E-posta;Kurum;Unvan" — parser | desteklemediği için ; ayracı), createMissingPersons + createMissingRooms(oturum türünde) + "Önce sına — kaydetmez" checkbox'ları; gönderince rapor kartı: metrik çipleri (X oturum oluşturuldu, Y güncellendi, Z salon, W kişi eşleşti, yeni kişi, V eşleşmeyen + "deneme — kaydedilmedi" çipi), hata satırları (rose), matchDetails tablosu (sm+ tablo / mobilde kart, sonuç tonları: "eşleşti"→teal, "Yeni kişi"→emerald, "oluşturulacak"→amber, "Eşleşmedi"→rose), dryRun temizse "Şimdi kaydet" (dryRun:false yeniden gönderim) → bump + oturum/materyal reload; (2) Materyaller — session-materials edisyon geneli tek istekle çekilip oturuma göre gruplanır; oturum kartında "Materyaller (N)" alt listesi: tür çipi (MATERIAL_TYPE), başlık, VIDEO dk (tabular), sahip (personId→participations eşlemesi), durum rozeti (PENDING/READY/MISSING), dış bağlantı ikonu, satır içi düzenle/sil; "Materyal Ekle" + diyaloğu (tür, durum, başlık, URL, kişi seçimi, VIDEO'da süre, notlar).
- STİL CILASI: globals.css'e .maven-qrvcard (köşe vurgulu ince çift çerçeve), .maven-stagger-item + maven-fade-up (animationDelay ile kademeli giriş), .maven-mock-watermark (çapraz çizgili zemin), .maven-rail-line (hiyerarşi bağlantı çizgisi) — tamamı prefers-reduced-motion duyarlı; p-4/p-6 + gap-3/4 tutarlılığı, tabular-nums, hover geçişleri, maven-scroll max-h-96 kaydırmalı listeler.
- E2E (agent-browser ayrı oturum + curl): Roller sekmesi 3 tohum rolü kartları/rayı/mock'u ile ✓; mock'ta rol seçimi → portal URL + kapalı Giriş butonu ✓; Rol Ataması UI'dan cme_auditor atandı → GET role-assignments customRoleId dolu ✓ (test kaydı temizlendi); Kerem 360: Eğitim grubu (İşletme Yüksek Lisansı), QR görseli, düzenle diyaloğu (ana kişi/bağlantı türü) ✓; Mustafa Koç'ta refakatçi çipi "Elif Koç · Eş" ✓; ABC Pharma 360: kimlik kartı + konum notu, iki QR görseli + locationPayload altyazısı, Deniz Yalçın birincil yıldızı ✓; Program içe aktarım UI dry-run (2 satır, 1 eşleşme/1 eşleşmeyen, 1 salon) → "Şimdi kaydet" → oturumlar + Yeni Salon Test gerçekten oluştu, konuşmacı ataması SPEAKER=Kerem ✓ (test oturumları/salon silindi, tohum demo temiz); mobil 390px scrollWidth=390 taşma yok; page errors 0; lint 0 hata.
- KESİNTİ: UI testi sırasında dev sunucusu çöktü (port 3000 dinlemiyordu) — setsid ile yeniden ayağa kaldırıldı, health 200; sandbox bellek alışkanlığı notu geçerli.

Stage Summary:
- R9-temel'in UI karşılığı üç dosyada tamamlandı: people.tsx (Roller & Yetkiler sekmesi + kişi 360 CV/VCard/aile + kurumsal kimlik/kontak/QR), scientific.tsx (Program İçe Aktar + materyaller), registry.ts (+1 entity organization-contacts), globals.css (+4 stil bloğu). Şema değişikliği yok (74 model sabit).
- Kritik uyum bulguları: import parser | ayracı desteklemiyor (; / tab / , destekli) — UI placeholder'ları buna göre; matchDetails oturum türünde yalnız eşleşenleri içerir; CvEntry.editionId zorunlu; contacts birincil toggle çift PUT ile tekil korunur.
- lint 0 hata, dev.log 5xx yok (yalnız başka ajanın email-templates test hatası), demo verisi tohum durumuna iade edildi.

Unresolved:
- Rol giriş mock'u tamamen sunucusuzdur — dış portalın gerçek rol bazlı yönlendirmesi ayrı uygulama kapsamında
- Kişi edit diyaloğunda ana kişi seçenekleri mevcut liste (max 300) ile sınırlı; büyük veri setinde aramalı seçici gerekebilir
- Hiyerarşi rayında çok sayıda rolde yatay kaydırma var; miniharita/ölçek gösterimi eklenmeye aday
- Dev sunucusu bu turda bir kez kendiliğinden düştü (yeniden başlatıldı) — sandbox bellek baskısı izlenmeli

---
Task ID: R9-d (kayıp tur kaydı — subagent bağlam limiti nedeniyle worklog yazamadan sonlandı; ana ajan devraldı ve doğruladı)
Agent: UI subagent D (media/integrations/accommodation/sponsorship) + ana ajan doğrulama
Task: Medya Arşivi + API Geçidi modülleri, konaklama no-show/occupancy, sponsorluk onay akışı UI'ları.

Work Log (dosya içerik analizinden doğrulanmış):
- media.tsx (749 satır): klasör ağacı (self-ref tree, daralt/aç, alt klasör ekle, yeniden adlandır, sil), varlık ızgarası (kind ikonlu kartlar, arama, etiket chip'leri), yükleme diyaloğu (≤400KB dataURL / bağlantı modu), detay diyaloğu, KPI şeridi (toplam varlık/görsel/video/klasör) + "etkinlik izolasyonu" rozeti
- integrations.tsx (694 satır): entegrasyon kartları (yön/tür/sağlayıcı/durum/kimlik chip'leri, başarı-fail mini bar), dry-run anahtarı, Çalıştır/Duraklat/Düzenle, INBOUND kartlarda webhook URL pill'i + kopyala + "Test webhook gönder", hızlı şablonlu yeni entegrasyon diyaloğu, log akışı (30 kayıt, 20 sn otomatik tazeleme, entegrasyon filtresi), ödeme sağlayıcı notu kartı
- accommodation.tsx (556 satır): occupancyType (SINGLE/DOUBLE/FAMILY_SHARED), ratePerNight/nights + geceleri hesapla, toplam ₺ hesaplı, no-show işaretle + noShowFee + rose NO-SHOW chip'i + toplam no-show ücreti KPI
- sponsorship.tsx (452 satır): approvalStatus chip'leri (teal Onaylı / amber Onay Bekliyor / rose Reddedildi), PROPOSED satırlarda Onayla/Reddet (approvedBy "Komite" + approvedAt), öneri olarak ekleme, "Onay bekleyen haklar" filtresi
- Ana ajan doğrulaması (agent-browser): Medya Arşivi ağaç render ✓ (Logolar → 2026 Basın Kiti iç içe), API Geçidi 4 entegrasyon + dry-run koşusu ✓, UI'dan webhook test → 202 "yeni kişi + katılım" log akışına düştü ✓, Konaklama no-show ₺1.500 toplam + ₺4.200×3 gece ₺12.600 ✓, Sponsorluk PROPOSED→APPROVED ✓ (aktivite "Komite imzasıyla kaydedildi"), Kurumlar konum notu "Fuar Alanı · Stand A24" ✓

Stage Summary:
- D'nin 4 view'ı tam ve çalışır; worklog kaydı ana ajanca tamamlandı. Tüm modüller mobil 390px'te 0 taşma, page error 0, lint 0 hata.

---
Task ID: R9-final
Agent: Z.ai Code (ana ajan)
Task: R9 turu kapanışı — entegrasyon QA'sı, mobil taşma düzeltmesi, temiz demo, üç bölümlü devir.

Work Log:
- PARALEL UI TURLARI BİRLEŞTİRİLDİ: B (yaka kartı tasarımcısı + sertifika tasarımcısı + iletişim 360), C (roller/CV/VCard + kurum kimlik kartı + program içe aktarım/materyaller), D (medya arşivi + API geçidi + konaklama + sponsorluk onay) — dosya sahiplikleri ayrık tutuldu, çakışma olmadı. C'nin katkısı: registry'e organization-contacts entity'si eklendi, gerçek entity adı role-assignments olarak tespit edildi.
- QA (agent-browser E2E, gateway :3000): Ana menüde 22 modül ✓ → Medya Arşivi (klasör ağacı + izolasyon rozeti + KPI) ✓ → API Geçidi (dry-run koşusu, webhook URL pill, UI'dan test webhook → 202 + log akışına "yeni kişi + katılım") ✓ → Kişiler/Roller & Yetkiler (3 custom rol + hiyerarşi + rol giriş ekranı mock) ✓ → Rozet Baskı/Tasarımcı (seed tasarımı 105×148mm 2 yüz 7 eleman, kanvas + özellikler + elemanlar paneli) ✓ → Program/İçe Aktar (dry-run raporu: 1 oturum, eşleşme dökümü → "Şimdi kaydet" → DB'de oturum+salon+atama teyitli) ✓ → Konaklama (no-show ₺1.500, Double ₺4.200×3=₺12.600) ✓ → Sponsor & Fuar (PROPOSED→APPROVED onay eylemi) ✓ → Kurumlar (çift QR paneli: Kurum QR + Konum QR, vCard indir, rol bazlı kontaklar) ✓
- BULUNAN+DÜZELTİLEN HATA: Kurumlar görünümü mobil 390px'te taşma (scrollWidth 542) — grid çocuklarına min-w-0 + kartta truncate zinciri + Konum QR alt metnine break-words; düzeltme sonrası 6 modülde sweep: hepsi 390/390, overflow 0
- Sertifika tasarımcısı (B): boyut/baskı payı/arka plan layer/bodyTemplate yer tutucu chip'leri + toplu yazdırma + e-posta simülasyonu — curl 200 + UI render teyitli
- TEST SONRASI: reseed ile temiz demo (UI import oturumu + webhook test kişisi temizlendi, PROPOSED hak geri geldi, canlı teklif OFFERED durumu korundu); browser kapatıldı (bellek alışkanlığı); lint 0 hata; dev.log'ta bu turun 5xx'i 0
- Düzeltilen rota hataları (R9-temel'den devir): SQLite mode:insensitive (3 rota), snapshot→snapshots + profile→badgeInstances[0].profile ilişki adları

Stage Summary (üç bölümlü devir — 1/3):
① DURUM: Proje STABİL ve kullanıcının 9 başlıklı düşünce bulutu %100 kapsandı: feature-check zaten-var listesi worklog R9-temel'de geliştirme hafızası olarak kayıtlı; eksikler 74 modele (64+10 yeni: CustomRole, CvEntry, SessionMaterial, MediaFolder, MediaAsset, ApiIntegration, IntegrationLog, EmailTemplate, MailProviderConfig, BadgeDesign) ve 6 modelde additive kolonlarla tamamlandı (Person.parentPersonId self-ref, Entitlement.approvalStatus, Reservation.noShow*, Campaign.phase*, CertificateDefinition tasarım kolonları, Organization kimlik kartı, OrganizationContact.role, BadgeProfile.designId, EventRoleAssignment.customRoleId, FormDefinition.campaignQuizzes). Şema evrimi kuralı: sıfır silme, sıfır veri kaybı. 22 modüllü SPA + 10 yeni generic entity + 8 özel API.
② TAMAMLANAN: yaka kartı tasarımcısı (mm hassasiyetli kanvas, sürükle-bırak, alan bağlama, QR seçimli, serbest font, baskı payı, tek/çift yüz, arka plan layer, sponsor hiyerarşisi, program+iletişim arka yüz, tekil/toplu baskı sayfası @page mm) · sertifika tasarımcısı (özel boyut/baskı payı/arka plan/düzey notu/{{}} şablon/önizleme/toplu PDF/e-posta simülasyonu) · QR VCard (kişi+kurum+konum QR, .vcf) · CV alt modülü · custom rol motoru + hiyerarşi rayı + rol giriş ekranı mock · program/katılımcı içe aktarım (eşleştirme raporlu, dry-run→kaydet) · oturum materyalleri · medya arşivi (klasör ağacı, izolasyon) · API geçidi (çift yönlü, gerçek fetch, webhook upsert, ödeme sağlayıcı, log akışı) · 360 branding (fazlar, HTML şablon kütüphanesi, SMTP/Mailjet sağlayıcılar + test) · konaklama (no-show/ücret, occupancy, misafir profil self-ref) · sponsorluk onay akışı. Mobil 390px temiz, page error 0, lint 0.
③ RİSK/SONRAKİ: (1) baskı sayfaları tarayıcı yazdırma motoruna bağlı — gerçek yazıcı çıktısında kenar payı kalibrasyonu kullanıcı tarafında yapılmalı; (2) yaka kartı arka planları dataURL olarak SQLite'ta (≤600KB) — büyük tasarımlar için dosya depolama/migration gerekir; (3) program import'ta "|" ayracı desteklenmiyor (TSV/CSV/;); (4) portal/rol giriş ekranları hâlâ tasarım önizlemesi (gerçek auth yok); (5) dosya yüklemelerde virus/mime doğrulama yok (iç yüzey); (6) mail gönderimleri simülasyon — Mailjet/SMTP gerçek API anahtarı bağlanınca /api/mail/test ve kampanya gönderimi gerçek sağlayıcıya taşınmalı; (7) öneri: badge tasarım sürümlendirme + şablon klonlama (seri geçişi), medya arşivinde etiket bazlı filtre sayfası, CME defterine kredi dikeyinde rapor.

---
Task ID: R10-main
Agent: Z.ai Code (ana ajan)
Task: Kullanıcının yeni 13 başlıklı isteği — çift tık düzenleme, kişi fotoğrafı/kurum logosu, Yaka Kartı terminolojisi, sertifika kanvası, portal header tasarımcısı, medya klasör mimarisi + ZIP, otel detaylı giriş, program manuel giriş, bildiri detaylı giriş, demo veri tam girişli hale getirme.

Work Log:
- Şema evrimi (additive-only, 74→75 alan): HotelProperty +logoUrl/imageUrl/email/website/starRating/checkInNote; EventEdition +portalHeaderTitle/Subtitle/ImageUrl/Accent; CertificateDefinition +designJson. db push ✓
- Medya altyapısı: src/lib/media-system.ts (ensureSystemFolders/slugify/uniqueAssetName/parseDataUrl) + 3 API: POST /api/media/upload-linked (sistem klasörü + BENZERSİZ ad + linkedType/Id, ≤600KB), GET /api/media/system-folders (idempotent garanti), GET /api/media/export (JSZip: klasör yapısı + dataUrl binary + dış bağlantı best-effort + manifest.json). jszip eklendi.
- Terminoloji: "Rozet"→"Yaka Kartı" 16 dosyada (constants MODULES/CAPABILITIES/BADGE_FIELD_KEYS, shell menü, 5 API route, 8 view) — "Rozet Baskı"→"Yaka Kartı Baskı", "Kurumlar"→"Kurum/Kuruluşlar". Çoğul ek hatası ("yaka kartıler") düzeltildi. Footer 64→74 model.
- Seed tam girişli: 25 kişiye telefon+şehir+bio; 8 kuruma tam kimlik kartı (genel mail, adres, açıklama, konum notu); 14 bildiriye birebir özet+anahtar kelime+dosya/poster no; 7 oturuma açıklama; 2 otel (Maslak Grand 4★, yeni Boğaz Suit 5★) tam detaylı; rezervasyon "Deneme" adları gerçekçi hale getirildi; 51 medya varlığı sistem klasörlerine benzersiz adla (25 kişi avatarı→photoUrl, 8 kurum logosu→logoUrl, 2×2 otel görseli, portal arka plan→portalHeader*, sertifika arka plan+designJson kanvas yerleşimi, yaka kartı arka planı, 6 materyal kopyası→notes "Medya: ..."); editon1'e portal header tasarımı; katılımcı sertifikasına 9 elemanlı kanvas designJson.
- R10-a/b/c paralel UI turları (ayrı dosya sahipliği) tamamlandı — aşağıda. Ana ajan E2E QA: agent-browser ile çift tık diyaloğu (ad+kategori değiştir→kaydet→satır güncel ✓), kişi fotoğrafı yükleme (PNG→benzersiz ad "defne-kaya-fotografi-*.png" → Medya/Kişi Fotoğrafları + person.photoUrl ✓), Kurum/Kuruluşlar logoları+kimlik ✓, Bildiri Ekle UI→DB ✓, Oturum Ekle UI→DB (tüm alanlar+atamalar) ✓, sertifika kanvas (mm cetvel, gerçek veriyle önizleme "Mehmet Demir" dolu, Prestij şablonu→altın çerçeve, Kaydet) ✓, otel kartları (kapak/logo/★/iletşim chip) + düzenle diyaloğu tüm alanlar ✓, portal header tasarımcısı (canlı önizleme + katılımcı portalı mock'u tasarımı kullanıyor) ✓, Medya ZIP butonu→65 girdili zip (klasör yapısı+manifest, 41 gömülü+11 dış .url) ✓, Yaka Kartı Baskı terminolojisi ✓.
- QA BULUNAN+DÜZELTEN: (1) /api/organizations _count yoktu → "0 etkinlik rolü" hatası — registry include eklendi; (2) UI'dan oluşturulan bildiriye cuid kod — SUB-XXXXX üretimi eklendi; (3) GLOBAL mobil taşma: tüm modüller 406/390 — grid item'larının min-content'i track'i zorluyordu; tüm "lg:col-span-*" öğelerine min-w-0 (18 dosya) → 12 modül sweep 390/390 ✓; (4) kişi düzenleme kaydının 405 döndüğü ÖNCEKİ turdan kalma hata R10-a'da tespit edildi → /api/people/[id] PUT handler eklendi; (5) tsc src hataları 0'a indirildi (registration-chain let-null, flows roleAssignments include, form-submissions ChainResult, integrations method, program/import person=null, badges/print-sheet series include, media/export JSZip tip, constants duplicate key, seed never[]).
- RISK NOTU: dev sunucusu bu turda 2 kez kendiliğinden düştü (bellek baskısı) — setsid ile yeniden ayağa kaldırıldı; son seed sonrası sağlıklı (home 200, assetCount 51).

Stage Summary (üç bölümlü devir — R10):
① DURUM: 13/13 istem canlı. 75 modele evrimleşen şema (silme yok), medya altyapısı 3 API ile merkezileşti, tüm demo veriler tam girişli (eksik verili kayıt kalmadı; refakatçi e-postasızlık bilinçli self-ref demosu). lint 0, tsc src 0, mobil 390 temiz, dev.log 5xx 0.
② TAMAMLANAN: çift tık tam durum düzenleme (kayıt satırları + kişi satırları + oturum/bildiri/otel kartları); kişi fotoğrafı + kurum logosu yükleme (medya benzersiz ad akışı); Yaka Kartı terminolojisi her yerde; sertifika kanvas tasarımcısı (4 yerleşim şablonu, mm sürükle/boyutlandır, {{}} yer tutucu, arka plan SERTIFIKA klasörü, designJson baskı sayfasına işlendi); dış portal header tasarımcısı (arka plan PORTAL klasörü, canlı önizleme + portal mock entegrasyonu); medya sistem klasörleri (9 kategori) + ZIP export; otel detaylı giriş (logo/kapak/yıldız/mail/web/adres/giriş notu); program manuel oturum girişi (atama yönetimi dahil); bildiri detaylı giriş/düzenleme; materyal→medya kopya.
③ RİSK/SONRAKİ: (1) sunucu bellek baskısı izlenmeli (2 çökme bu turda); (2) sertifika kanvas öğeleri kaydetmeden gezinirsen kaybolur — otomatik taslak (localStorage) eklenebilir; (3) ZIP'te dış bağlantılar best-effort (.url fallback) — büyük dosyalarda sunucu tarafı dosya deposu hâlâ gündemde; (4) kişi/kurum görsel silme = alanı null yapar, arşivdeki varlık durur (temizlik işi medya arşivinden ayrı); (5) rol giriş mock'ları hâlâ tasarım önizlemesi; (6) öneri: çift tık davranışının kalan modüllere (finans, sponsorluk satırları) yayılması, badge tasarım klonlama, medya arşivi etiket filtresi sayfası.
---
Task ID: R10-a
Agent: UI subagent A (people/registrations)
Task: Kayıt & Katılımcılar çift tık tam durum düzenleme diyaloğu; Kişiler'de çift tık düzenleme; kişi fotoğrafı + kurum logosu (upload-linked, benzersiz adla medya klasörüne); "Kurumlar"→"Kurum/Kuruluşlar"; Rozet→Yaka Kartı terminolojisi.

Work Log:
- worklog.md (son 8KB) + registry.ts + constants.ts + prisma şeması (salt okunur) + bits.tsx/store.ts incelendi; mevcut desenler (useApi, listEntity, apiSend, useToast, SectionCard/Chip, maven-scroll, min-w-0/truncate) birebir korundu.
- registrations.tsx: satırlara onDoubleClick + cursor-pointer + title="Çift tıkla: tüm durumları gör/düzenle"; Eylem kolonuna kalem (Pencil) düğmesi (aria-label'lı); araç çubuğuna "Çift tıklama ile de açılır" Chip'i. Yeni TAM DURUM DİYALOĞU (3 bölüm: "Kişi Bilgileri" 8 skaler alan, "Katılım" attendance Select (ATTENDANCE_STATUS), "Kayıt" kategori Select (registration-categories, "— Kategori yok —" sentinel'li) + durum Select (REGISTRATION_STATUS) + fon kaynağı Select (FUNDING_SOURCES) + notlar). Kaydet sırayla 3 PUT atar (aşağıda payload'lar) → reload+bump+toast "Değişiklikler kaydedildi".
- people.tsx: kişi satır kartlarına onDoubleClick→openEdit (mevcut "Kişiyi Düzenle" diyaloğu genişletildi; paralel diyalog YOK) + title; mevcut diyaloga Telefon, Şehir, Ülke, LinkedIn, Durum (ACTIVE|PASSIVE Select), Bio alanları eklendi, max-h-[85vh] maven-scroll verildi; savePerson payload'ı tüm skaler Person alanlarına genişletildi (yalnız skaler, "" → null).
- R10-a LinkedPhotoUploader bileşeni (people.tsx içinde paylaşımlı): accept="image/*", file.size ≤ 600KB guard, image/* tip guard, FileReader→dataURL, POST /api/media/upload-linked → PUT ile kayda yazma, önizleme + "Medya Arşivi → … klasörüne benzersiz adla kaydedilir" açıklaması. Kişi fotoğrafı: düzenleme diyaloğunda (yeni kişide bilgilendirme notu) + Kişi 360 Kimlik kartında; fotoğraf kişi listesi satırlarında (yuvarlak img, yoksa baş harfler) ve 360 SheetTitle'ında. Kurum logosu: Kurum düzenleme diyaloğunda (yeni kayıtta not) + Kurum 360 Kimlik kartında (fit=contain); logo kurum kartlarında (size-12, rounded border, object-contain) ve 360'ta.
- PageHeader "Kurumlar" → "Kurum/Kuruluşlar" (people.tsx'teki tek kullanıcı görünür geçiş; başlık yorumu da eşgüncellendi).
- Terminoloji: her iki dosyada 13 "Rozet/rozet" geçişi "Yaka Kartı/yaka kartı" oldu (rg ile 0 kaldığı doğrulandı; badgeInstance vb. kod tanımlayıcılarına dokunulmadı).
- BULUNAN+DÜZELTİLEN HATA: PUT /api/people/{id} 405 dönüyordu — dedicated /api/people/[id]/route.ts (360 GET) generic /api/[entity]/[id] PUT yolunu gölgeliyordu ve PUT exportu yoktu; mevcut "Kişiyi Düzenle" kaydı da fiilen çalışmıyordu. Route'a registry sanitize ile birebir aynı sözleşmeli PUT eklendi (audit log'lu). Bu dosya sahiplik listem dışında — özellik bu düzeltme olmadan imkânsızdı (bkz. Deviations).
- Smoke test (curl): PUT /api/people/{id} city "İstanbul-QA" → 200 + geri alma (null) → 200; PUT /api/participations/{id} → 200; PUT /api/registrations/{id} notes → 200 + revert; GET /api/registration-categories?editionId=… → 7 kategori; POST /api/media/upload-linked (1px PNG, KISI_FOTOGRAF, linkedType PERSON, linkedId "qa-r10a") → 201, ad "qa-r10a-fotografi-27phtxoh.png" (benzersiz), klasör "Kişi Fotoğrafları" → DELETE /api/media-assets/{id} 200 + sonrası 404. dev.log'ta bu turun 5xx'i yok. Test verileri tohum durumuna iade edildi.
- DİKKAT: dev sunucusu bu tur başında kendiliğinden düşmüştü (port 3000 boş) — `bun run dev` arka planda yeniden başlatıldı, bootstrap 200 döndü (önceki R8 turundaki aynı durumun tekrarı).

Stage Summary:
- API sözleşmeleri (hepsi curl ile doğrulandı):
  • PUT /api/people/{personId} — skaler: { firstName, lastName, email, phone, title, company, city, country } ("" → null; asla iç içe nesne yok) · foto/logo için ayrı: { photoUrl } / { logoUrl }
  • PUT /api/participations/{participationId} — { attendance: "NOT_ARRIVED|CHECKED_IN|CHECKED_OUT|NO_SHOW" }
  • PUT /api/registrations/{id} — { categoryId: string|null, status: DRAFT|SUBMITTED|PENDING_APPROVAL|CONFIRMED|REJECTED|CANCELLED, fundingSource: FUNDING_SOURCES key, notes: string|null }
  • POST /api/media/upload-linked — { editionId, systemFolder: "KISI_FOTOGRAF"|"KURUM_LOGO", name, dataUrl, linkedType: "PERSON"|"ORGANIZATION", linkedId } → 201 { asset: { id, name( benzersiz), dataUrl }, folder: { id, name, systemKey } }
- Tasarım kararları: tek paylaşımlı LinkedPhotoUploader (dosya guard'ları tek yerde); foto/logo düzenleme diyaloğunda ANINDA kaydedilir (kullanıcı kuralı: "resim kişi kaydı yapılırken medya klasörüne eklenir") — ana "Kaydet"ten bağımsız; edisyon seçili değilse yükleme düğmesi disabled + açıklama; RegRow.person tipine şemanın döndürdüğü phone/title/city/country alanları eklendi; tsc'te önceden var olan OrgRow.address/description ve WaitlistEntryRow.categoryId tip eksikleri (salt tip bildirimi) tamamlandı.
- lint 0 hata; tsc'te bu dosyalarda 0 hata; GET / 200; mobil 390 için grid çocuklarında min-w-0/truncate korundu, diyaloğlarda max-h + maven-scroll.

Unresolved:
- Registration şemasında `fee` alanı YOK, EventParticipation'da `role` skaleri YOK (roller EventRoleAssignment'ta) — task'te "if present" olduğundan bu ikisi diyaloğa alınmadı; rol düzenleme ayrı rol-atama akışı gerektirir.
- src/app/api/people/[id]/route.ts sahiplik dışı dosyaya PUT eklendi (bkz. Work Log) — ana ajanın birleştirmede bilmesi için işaretlendi.
- Dev sunucusu dışarıdan `bun run dev` ile yeniden başlatıldı; sistem denetçisi bir sonraki turda kendi sürecini kaldırsa çakışma olmaması için süreç kontrol edilmeli (şu an tek instance, port 3000).
- Kişi fotoğrafı/logo dataUrl SQLite'a gömülüyor (≤600KB tavan) — büyük arşiv için dosya depolama hâlâ açık konu (R9 devriyle aynı).

---
Task ID: R10-b
Agent: UI subagent B (scientific/onsite/certificates)
Task: Program penceresinden manuel oturum girişi, bildiri ayrıntılı giriş/düzenleme, materyal dosya modu → Medya Arşivi, sertifika KANVAS tasarımcısı (designJson + yerleşim şablonları + print-sheet upgrade), Rozet→Yaka Kartı terminolojisi.

Work Log:
- Terminoloji: badge-queue.tsx'de 17, onsite.tsx'de 3, badge-designer.tsx'de 1 "rozet" geçişi "yaka kartı" ailesine çevrildi (son ek formları ayrı ele alındı: rozetini→yaka kartını, rozetler→yaka kartları, Rozet No→Yaka Kartı No); `rg "Rozet|rozet"` 3 dosyada 0 sonuç; tanımlayıcılar (badgeInstance, BadgeProfile, BadgeDesigner) korundu.
- scientific.tsx — Program: PageHeader'a "Oturum Ekle"; tüm ProgramSession alanlı tam diyalo (title*, description, type/salon/iz/kaynak-bildiri Select'leri, startTime*/endTime* datetime-local→ISO dönüşümü, capacity, accessRule, status, isVisible Switch, cmeCredits). Kayıtlı oturumda diyalo içinde "Oturum Görevlileri" bloğu: mevcut atamalar chip + X ile sil (DELETE /api/program-assignments/{id}), kişi Select (people, tenantId, limit 500) + rol Select (SPEAKER|MODERATOR|SESSION_CHAIR|PANELIST — program/import route.ts ile aynı küme) + POST /api/program-assignments. Kartta çift tık + "Düzenle" düğmesi aynı diyaloğu öndoldurarak açar; endTime > startTime inline hatası (rose satır) + kaydet disable. Görev listesi reload sonrası taze kalsın diye sesDraft liste üzerinden türetilir.
- scientific.tsx — Bildiri: PageHeader'a "Bildiri Ekle"; tüm Submission alanlı diyalo (abstract rows=5, keywords, presentingAuthorName, tür, durum, trackId, fileUrl, posterNo, fileStatus, submittedAt opsiyonel datetime-local). Kart özetinde çift tık + geniş alanda "Bildiriyi Düzenle" → PUT /api/submissions/{id}. Geniş alan genişletildi: sunan yazar/anahtar kelime/poster no/gönderim/dosya bağlantısı satırı. "Durumu hızlı değiştir" chip satırı (SUBMISSION_STATUS sabitinden, salt status PUT).
- scientific.tsx — Materyaller: diyaloğa "Dosya (≤ 600 KB)" bloğu (file input → dataURL; caption "Dosya Medya Arşivi → Materyaller klasörüne benzersiz adla kopyalanır"). saveMat: materyal kaydı sonrası POST /api/media/upload-linked { systemFolder:"MATERYAL", linkedType:"SESSION", linkedId, name: başlık, dataUrl | externalUrl } → not satırı `Medya: <asset.name> (Materyaller klasörü)` PUT /api/session-materials/{id} ile notes'a eklenir; arşiv yazımı başarısızsa materyal kaydı engellenmez (toast'ta bilgi). Materyal satırında notes "Medya:" içeriyorsa FolderOpen "Medya" chip'i.
- onsite.tsx — Sertifika KANVAS tasarımcısı (badge-designer mimarisi aynalandı): CertElement modeli designJson'da { id, type: text|image|line|qr, x,y,w,h (mm), text, placeholderBinding, fontSize, fontWeight, color, align, imageDataUrl, radius }. PX_PER_MM=2.2, mm cetveller, 5/10mm ızgara (arka plan yokken), baskı payı kesikli çerçevesi, overflow-x-auto kabı (390px). Pointer-drag taşıma + sağ-alt resize tutamacı + ok tuşları 1mm (Shift 5mm) + Delete eleman siler; "Eleman Ekle" (Metin/Çizgi/Görsel/QR); eleman listesi + özellik paneli (x/y/w/h, metin + yer tutucu chip'leri {{fullName}}…{{signer}}, font boyu/kalınlığı, renk color+hex, hizalama, öne/arkaya katman, görsel yükleme ≤600KB, radius). 4 YERLEŞİM ŞABLONU: Yatay Klasik / Dikey Modern (PORTRAIT'e geçer, W↔H takas) / Minimal (yalnız başlık+gövde) / Prestij (altın çerçeve 4 çizgi + altın başlık + çift imza) — her biri element[] üretir, arka planı korur, toast "Yerleşim uygulandı — Kaydet'i unutmayın". Gerçek Veriyle Önizle modu: seçili issue'nun katılımcı adıyla {{}} doldurma (fillFor). saveDesign artık designJson'ı da PUT eder. Arka plan yükleme POST /api/media/upload-linked { systemFolder:"SERTIFIKA", linkedType:"CERTIFICATE", name:"<def>-arkaplan" } → asset.dataUrl backgroundDataUrl; caption "Medya Arşivi → Sertifikalar klasörüne benzersiz adla kaydedilir". Üretim/toplu yazdırma/e-posta simülasyonu akışları aynen korundu; eski "Canlı Önizleme" kartı kanvasla değiştirildi (Tasarım Özellikleri formu col-5'e taşındı, kanvas col-7).
- print-sheet/route.ts: designJson parse edilip elemanlar `.el { position:absolute }` + `left/top/width/height: Nmm` (CSS mm doğrudan) olarak basılır; text fill() ile kişi-özel (snapshot'a düşer), line düz renk bloğu, image imageDataUrl'li img, qr gerçek QRCode.toDataURL("MAVEN|<edition>|<serial>|<ad>") (badge print-sheet'teki qrcode deseni alındı — bu dosyada QR yoktu); verisiz görsel alanı baskıda sessizce atlanır. designJson yoksa eski brand/title/body/sign-row fallback aynen. Bonus: sayfa dizimi `${pages}` (virgüllü string birleşimi) → `pages.join("\n")` ile düzeltildi. ELIGIBLE→GENERATED geçişi korundu.
- Çözülen tsc hataları (dosyamda önceden var olanlar): onsite ScanRow.participation.id, scientific SessionRow.room.id eklemeleri; ProgramView'a eksik tracks hook'u eklendi.

Stage Summary:
- 5 dosya (3 view + badge-designer terminoloji + certificates/print-sheet) lint 0 hata, tsc filtresinde kendi dosyalarımda 0 hata.
- smoke: POST/PUT/DELETE /api/sessions 201/200/200 · POST/PUT/DELETE /api/submissions 201/200/200 · PUT certificate-definitions designJson 200 + null'a dönüş 200 · POST print-sheet (designJson'lu) 200 ve çıktıda ">QA<" + "kanvas yerleşimi (1 eleman)" + mm konumlu .el div'i · designJson'suz fallback 200 (cert-title/cert-body). dev.log'ta bu turun 5xx'i yok.
- designJson şeması: [{ id, type: "text"|"image"|"line"|"qr", x, y, w, h (mm), text?, placeholderBinding?, fontSize?, fontWeight?, color? (hex'siz), align?, imageDataUrl?, radius? }] — registry sanitize scalar-safe (JSON string tek kolon).
- Unresolved: src/app/api/badges/print-sheet/route.ts(102) 'series' tsc hatası dosyam dışında (başka sahibi düzeltmeli); sertifika önizlemede snapshot yok — gerçek kişi adı participation.person'dan (baskıda snapshot.title/company kullanılır); kanvas qr önizlemede yer tutucu (gerçek QR yalnız baskıda); Rozet→Yaka Kartı değişimi yalnız sahipliğimdeki 3 dosyada — menü/sayfa etiketleri (shell.tsx vb.) başka ajanlarda olabilir.

---
Task ID: R10-c
Agent: UI subagent C (accommodation/portals/media)
Task: Otel detaylı giriş diyaloğu (logo/kapak bağlantılı yükleme), Dış Portal header tasarımcısı (arka plan görselli canlı önizleme), Medya Arşivi sistem klasörleri + ZIP export, Rozet→Yaka Kartı terminolojisi.

Work Log:
- accommodation.tsx (556 → 875 satır): HotelRow arayüzüne 8 yeni skaler alan eklendi (address, email, website, starRating, checkInNote, notes, logoUrl, imageUrl). "Oteller" SectionCard'ı + başlık satırında "Otel Ekle" butonu kuruldu; otel kartları zenginleştirildi: 16:9 kapak şeridi (aspect-video object-cover min-h-0), logo (rounded border object-contain), ★ yıldız satırı (amber + boş yıldız soluk), adres truncate+title, kişi/telefon/giriş-notu chip'leri, e-posta mailto bağlantısı, web sitesi external-link ikonu; kartta onDoubleClick → düzenle diyaloğu (her öğe çift tık kuralı) + erişilebilirlik için ayrı kalem ikon butonu (aria-label). Mevcut oda bloğu/gecelik stok çizelgesi, rezervasyon düzenleme, no-show ve konuk hiyerarşisi akışları aynen korundu.
- Otel Ekle/Düzenle diyaloğu: tüm alanlar (ad*, şehir, semt, adres Textarea, yıldız Select 1-5 ★ görünümlü, giriş/çıkış notu placeholder "Giriş 14:00 / Çıkış 12:00", ilgili kişi, telefon, e-posta, web sitesi, notlar) + diyaloğa gömülü logo/kapak seçici (renderHotelMediaPicker). Yükleme zinciri: dosya ≤600KB → dataURL → POST /api/media/upload-linked { editionId, systemFolder:"OTEL", linkedType:"HOTEL", linkedId, name: "<otel>-logosu|kapak" } → PUT /api/hotels/{id} { logoUrl|imageUrl }. Yeni otelde: önce POST (id döner) → bekleyen görsel yüklemeleri → PUT (hotelPending state). Düzenlemede seçim anında yüklenir; "Kaldır" form alanını boşaltır, Kaydet'te "" → null ile sunucudan silinir. Açıklama satırı: "Medya Arşivi → Otel Görselleri klasörüne benzersiz adla kaydedilir (≤600KB)".
- portals.tsx (856 → 1054 satır): PortalHeaderDraft/EditionRow tipleri; PortalsView'a listEntity("editions") ile taslak hidrasyonu (async callback içinde setState — lint set-state-in-effect kuralına takılmayan desen); PortalHeaderDesigner SectionCard'ı portal mock'unun ÜSTÜNE eklendi: başlık/alt başlık Input'ları, accent için input[type=color] + hex metin (geçersiz hex → #0d9488 fallback), arka plan görseli yükleme (≤600KB → upload-linked { systemFolder:"PORTAL", linkedType:"PORTAL", name:"portal-header-arkaplan" } → asset.dataUrl taslağa), Kaldır, "Kaydet" → PUT /api/editions/{id} { portalHeaderTitle, portalHeaderSubtitle, portalHeaderImageUrl, portalHeaderAccent } (yalnız skaler, boşlar null). Canlı önizleme bandı (min-h-44): görsel varsa absolute object-cover + from-black/60 degrade, yoksa maven-portal-hero; başlık text-2xl bold, alt başlık, accent altı çizgi (h-1 w-16) + accent zeminli CTA chip'i — yazarken anında güncellenir.
- PortalHero güncellendi: isteğe bağlı `design` prop'u — imageUrl varsa arka plan + degrade katmanı, title.trim() || etkinlik adı, alt başlık satırı, accent renkli altı çizgi; alanlar null/boşsa mevcut görünüm aynen korunur. design prop'u PortalsView taslak state'inden her iki portala (Katılımcı/Sponsor) geçilir → tasarımcı değişikliği mock'larda canlı yansır (/api/portal/participant ve /api/portal/sponsor'a dokunulmadı).
- media.tsx (750 → 829 satır): mount'ta GET /api/media/system-folders?editionId (ensure semantics, deps [currentEditionId]); dönen folders map'i id bazında mevcut media-folders listesiyle birleştirilir (mergedFolders memo — listede henüz yoksa spec rengi/açıklamasıyla sentetik satır eklenir; ROOT parentId null). Ağaç, KPI "Klasör" sayısı, seçili klasör araması ve boş durum mesajı mergedFolders üzerinden çalışır; sistem klasörleri ağaçta Pin ikonu + amber yıldız + spec rengiyle nokta (hex → inline style) + TooltipLite ile spec.description tooltip'i + seçiliyken hex renkli kenarlık/zemin alır.
- Yükleme diyaloğu: "Sistem klasörü — hızlı seç" chip satırı (9 spec: Yaka Kartı Tasarımları, Sertifikalar, Kişi Fotoğrafları, Kurum/Kuruluş Logoları, Otel Görselleri, Materyaller, Portal Görselleri, Floor Studio, Diğer) — tıklayınca uploadForm.folderId ilgili sistem klasörüne set edilir, seçili chip spec rengiyle dolar, title=description; ayrıca "Bağlı varlık tipi" Select (PERSON…BADGE_DESIGN + Bağlantısız) eklendi ve POST /api/media-assets gövdesine linkedType eklendi. Mevcut ağaç/varlık özellikleri (yeniden adlandır, sil, alt klasör, detay, etiket) korunmuştur.
- PageHeader'a "ZIP olarak indir" butonu: fetch(/api/media/export?editionId) → !ok ise json hata toast'u → blob → URL.createObjectURL → <a download="medya-arsivi-<slug>.zip"> tık → revoke; chip şeridine "Sistem klasörleri: 9" chip'i + "ZIP çıktısı: klasör yapısı + manifest.json dahil" bilgi satırı.
- Terminoloji: portals.tsx'te 5 Rozet/rozet geçişi Yaka Kartı/yaka kartı yapıldı (buildSteps adım başlıkları ×2, "Yaka Kartı & Belgeler" başlığı, 2 yorum satırı) — değişken adlarına (badge/badges) dokunulmadı.

Stage Summary:
- Üç view tamamlandı; tüm kalıcı veri yalnızca mevcut API'lerle (generic entity + upload-linked + system-folders + export) yazıldı, prisma/schema/constants/registry/seed'e dokunulmadı. Medya zinciri: otel logo/kapak → OTEL klasörü (linkedType HOTEL), portal arka planı → PORTAL klasörü (linkedType PORTAL); benzersiz ad sunucuda üretilir.
- Doğrulama: eslint üç dosyada 0 hata/0 uyarı; tsc --noEmit filtresinde kendi dosyalarımda 0 hata (kalan hatalar parallel ajanlara ait: scientific.tsx, registration-chain.ts, constants.ts). Curl smoke: POST /api/hotels 201 → PUT {notes} 200 → DELETE 200; PUT /api/editions/{id} {portalHeaderTitle:"QA Başlık"} 200 → orijinale (null) geri alındı 200; GET /api/media/export 200 application/zip (Medya/ 9 sistem alt klasörü + manifest.json). dev.log'ta bu turun tüm istekleri 2xx, 5xx yok. Ana sayfa 200 + derleme temiz.
- Mobil 390px disiplini korundu: grid çocuklarında min-w-0, truncate zincirleri, flex-wrap chip satırları, p-4/p-6 + gap-3/4, tabular-nums sayılar, ikon-only butonlarda aria-label.

Unresolved:
- Otel düzenleme modunda görsel seçimi anında sunucuya yazılır (Kaydet beklemeden); kullanıcı Vazgeç'e basarsa görsel kayıtta kalır — geri alma butonu eklenmedi (Kaldır + Kaydet ile silinebilir).
- PortalsView taslak hidrasyonu her edisyon değişiminde /api/editions listesini yeniden çeker (limit 100); çok büyük kurulumda editions endpoint'ine id-bazlı GET geçişi düşünülebilir.
- ZIP çıktısındaki dosya adı slug'ı istemci tarafında basit regex'le üretilir (Türkçe karakterler korunur); sunucu tarafı slug ile birebir aynı olması garanti değil — yalnızca indirme dosya adını etkiler, içerik etkilenmez.
