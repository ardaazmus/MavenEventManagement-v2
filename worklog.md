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
