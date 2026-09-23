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
