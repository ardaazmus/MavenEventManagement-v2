# Feature Specification: Finans Güvenlik Semantiği ve Bakiye Doğruluğu (F-01 & F-02)

**Feature Branch**: `001-finance-security-and-scale`  
**Created**: 2026-10-09  
**Status**: Draft  
**Input**: Yol haritası öncelikli işi: F-01 (Büyük manuel tahsilatta ikinci onay semantiği) ve F-02 (Finans tablosu ve toplamlar için sunucu agregasyonu)

## Problem ve Gerekçe

1. **F-01 (P1 Güvenlik / Bütünlük):** `src/components/maven/views/finance.tsx` arayüzü 50.000 TL üzeri tahsilatlarda "ikinci onay istenir" mesajı vermesine ve "Manuel Teyit Bekleyen" KPI'sı `Payment.status === "PENDING"` saymasına rağmen, `src/app/api/flows/route.ts` içindeki `finance.manualPayment` akışı 50.000 TL üstünü de doğrudan `status: "SUCCEEDED"` ve sahte sabit `approvedBy: "Tenant Sahibi"` ile kaydetmektedir. İkinci bir yetkilinin onaylayabileceği bir akış veya uç nokta bulunmamaktadır.
2. **F-02 (P2 Veri Doğruluğu):** Finans ekranı siparişleri `limit: 200` ile çekip tüm KPI toplamlarını (sipariş edilen, tahsil edilen, açık alacak, bekleyen manuel vb.) bu 200 siparişlik istemci dizisinden hesaplamaktadır. 200'den fazla siparişi olan etkinliklerde finansal mutabakat ve göstergeler eksik ve hatalı çıkmaktadır.

---

## User Scenarios & Testing

### User Story 1 — Eşiği Aşan Manuel Tahsilatta İkinci Onay Ayrımı (Priority: P1)

Finans sorumlusu veya yetkili personel, 50.000 TL (5.000.000 kuruş) üzerindeki bir manuel harici tahsilatı girdiğinde sistem ödemeyi doğrudan başarılı saymaz; `PENDING` statüsünde bekletir ve sipariş bakiyesini onaylanana kadar tahsil edilmiş saymaz.

**Why this priority**: Finansal suiistimali ve sahte onay kayıtlarını önler; gerçek tahsilat kanıtı olmadan siparişin "ödendi" olarak kapanmasını engeller.

**Independent Test**:
- 60.000 TL'lik bir manuel ödeme oluşturulur.
- Dönen yanıtın `status: "PENDING"`, `approvedBy: null`, `paidAt: null` olduğu ve siparişin `OPEN` kaldığı doğrulanır.
- 10.000 TL'lik bir manuel ödemede ise doğrudan `SUCCEEDED` ve `paidAt !== null` olduğu doğrulanır (geriye uyum).

**Acceptance Scenarios**:
1. **Given** ₺100.000 tutarında bir açık sipariş, **When** kullanıcı ₺60.000 manuel tahsilat girdiğinde, **Then** Payment kaydı `status: "PENDING"` ve `approvedBy: null` olarak oluşur; siparişin `paidSum` değeri artmaz ve sipariş durumu `OPEN` kalır.
2. **Given** ₺100.000 tutarında bir açık sipariş, **When** kullanıcı ₺30.000 manuel tahsilat girdiğinde, **Then** Payment kaydı `status: "SUCCEEDED"` olarak oluşur; sipariş durumu `PARTIALLY_PAID` olur.

---

### User Story 2 — İkinci Yetkili Tarafından Manuel Tahsilat Onayı / Reddi (Priority: P1)

Bekleyen manuel ödeme, kaydı giren kullanıcıdan FARKLI ve yetkili (ör. `FINANCE_MANAGER`, `EVENT_MANAGER`, `ORG_ADMIN`, `ORG_OWNER`) ikinci bir personel tarafından incelenip onaylanır (`finance.approvePayment`) veya reddedilir.

**Why this priority**: Görevler ayrılığı (Segregation of Duties - SoD) ilkesini sağlar; personelin kendi açtığı yüksek tutarlı işlemi kendisinin onaylamasını engeller.

**Independent Test**:
- Personel A tarafından oluşturulmuş ₺60.000'lik PENDING ödeme, Personel B tarafından onaylandığında `status: "SUCCEEDED"`, `approvedBy: Personel B`, `paidAt: Date` olur ve sipariş bakiyesi güncellenir.
- Personel A aynı ödemeyi onaylamaya kalktığında `403 / 400 Self-approval blocked` hatası alır (auth-on ortamında).

**Acceptance Scenarios**:
1. **Given** `PENDING` durumunda bir Payment, **When** yetkili ikinci bir kullanıcı `action: "finance.approvePayment", paymentId, approved: true` gönderdiğinde, **Then** payment `status: "SUCCEEDED"`, `approvedBy: <onaylayan>` olur ve sipariş `PAID` / `PARTIALLY_PAID` durumuna geçer.
2. **Given** `PENDING` durumunda bir Payment, **When** yetkili ikinci bir kullanıcı `action: "finance.approvePayment", paymentId, approved: false, reason: "Dekont okunamadı"` gönderdiğinde, **Then** payment `status: "FAILED"` olur ve sipariş açık kalmaya devam eder.
3. **Given** Personel X tarafından girilmiş `PENDING` bir Payment, **When** Personel X kendisi onaylamaya çalıştığında, **Then** sistem `400 / 403` ile işlemi reddeder (SoD koruması).

---

### User Story 3 — Finans Arayüzünde Bekleyen Onay Kuyruğu ve Onay Butonları (Priority: P2)

Finans ekranında "Manuel Teyit Bekleyen" KPI kartına tıklandığında veya sipariş detayında PENDING durumundaki ödemeler belirgin olarak listelenir; yetkili personel tek tıkla onaylama/reddetme diyalogunu açabilir.

**Why this priority**: Finans yöneticisinin sisteme takılan yüksek tutarlı tahsilatları aramadan hızlıca görüp onaylamasını sağlar.

**Independent Test**:
- Finans ekranında PENDING ödemesi olan bir sipariş açıldığında "Onayla" ve "Reddet" butonları görünür. Tıklandığında flow API'si çağrılır ve başarı bildirimi gösterilir.

---

### User Story 4 — Tüm Edisyon Çapında Sunucu Tabanlı Finansal KPI Agregasyonu (Priority: P2)

Finans ekranındaki KPI kartları (`Sipariş Edilen`, `Tahsil Edilen`, `Açık Alacak`, `Manuel Bekleyen`), yalnızca ilk 200 siparişin toplamından değil, sunucuda tüm siparişleri ve ödemeleri kapsayan bir özet API'sinden (`/api/accounting` veya `/api/orders/summary`) alınır.

**Why this priority**: Yüksek hacimli (500+ sipariş) etkinliklerde kullanıcıya yanlış finansal rapor verilmesini önler (F-02).

**Independent Test**:
- 250 siparişlik test verisinde istemci tablosu 200 sipariş gösterse bile KPI kartları 250 siparişin tamamının kuruş bazlı toplamını gösterir.

---

## Edge Cases

- **Aşım Ödeme (Overpayment):** Bekleyen ödeme onaylandığı anda, aradan geçen sürede başka bir ödeme tamamlanmışsa ve sipariş tutarını aşıyorsa onay transaction'ı `409 Conflict` ile aşım ödemeyi engeller.
- **Yarış Durumu (Race Condition):** İki farklı yöneticinin aynı anda aynı ödemeyi onaylamaya çalışması durumunda `withLock("order:" + orderId)` ile çift yazma engellenir.
- **Çift Para Birimi:** Sipariş para birimi ile onaylanan ödeme para birimi eşleşmelidir.
- **Demo / Auth-Off Kipi:** Auth kapalı demo kipinde veya tek kullanıcılı testlerde SoD kısıtı demo bypass ile engelleme yapmaz, onaylayıcı olarak aktör adı veya varsayılan kimlik atanır.

---

## Functional Requirements

- **FR-001**: `finance.manualPayment` akışında `amountMinor > 5_000_000` (₺50.000) ise ödeme `status: "PENDING"`, `approvedBy: null`, `paidAt: null` olarak oluşturulmalıdır.
- **FR-002**: `finance.manualPayment` akışında `amountMinor <= 5_000_000` ise ödeme mevcut haliyle `status: "SUCCEEDED"`, `paidAt: new Date()` olarak oluşturulmalıdır.
- **FR-003**: Yeni bir flow aksiyonu `finance.approvePayment` tanımlanmalı; `paymentId`, `approved: boolean`, `reason?: string` parametrelerini almalıdır.
- **FR-004**: `finance.approvePayment` eylemi `FLOW_ACTION_POLICY` içinde `payments` entity'si ve `APPROVE` aksiyonuna bağlanmalıdır.
- **FR-005**: `resolveFlowEdition` fonksiyonu `finance.approvePayment` için `paymentId` üzerinden edisyon kapsamını çözmelidir.
- **FR-006**: `finance.approvePayment` işlemi sırasında sipariş transaction kilidi (`withLock`) içinde bakiye, aşım ödeme ve durum makinesi doğrulanmalıdır.
- **FR-007**: Auth açıkken, işlemi giren personel (`enteredBy`) ile onaylayan personel (`actorName`) aynı olamaz (SoD kuralı).
- **FR-008**: Finans UI'ında (`finance.tsx`) PENDING ödemeler için Onayla/Reddet aksiyonları eklenmeli ve KPI toplamları sunucu verisiyle uyumlu olmalıdır.
- **FR-009**: Mevcut test sözleşmeleri (`phase2-money.spec.ts`) yeni semantiğe (₺60.000 -> PENDING, ardından onay -> SUCCEEDED) güncellenmeli ve geriye uyum testleri eklenmelidir.
