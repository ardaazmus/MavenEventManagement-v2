# Maven Event Management — Ortak Organizasyonel Mimari

> **Sürüm:** 1.0 · **Durum:** Tek doğruluk kaynağı (Single Source of Truth)
> Bu doküman, organizasyon yapısı ile veritabanı şemasının **birebir** uyduğu ortak mimarinin tanımıdır.
> `prisma/schema.prisma` bu dokümandaki model tanımlarıyla 1:1 eşleşir. API katmanı ve UI modülleri bu modele göre türetilir.

---

## 1. Mimari Katmanlar

```
┌─────────────────────────────────────────────────────────┐
│  UI KATMANI (SPA /)                                     │
│  Dashboard · Etkinlikler · Organizasyon · Üyeler        │
│  Görevler · Finans · Sponsorlar · Ajanda · Katılımcılar │
│  Duyurular · Raporlar                                   │
├─────────────────────────────────────────────────────────┤
│  API KATMANI (App Router Route Handlers)                │
│  /api/{entity} + /api/{entity}/[id] REST sözleşmesi     │
│  /api/dashboard (agregasyon)  /api/seed (demo veri)     │
├─────────────────────────────────────────────────────────┤
│  VERİ KATMANI (Prisma ORM + SQLite)                     │
│  20 model — aşağıdaki §3 ile birebir aynı               │
└─────────────────────────────────────────────────────────┘
```

## 2. Organizasyon Yapısı (Hiyerarşi)

```
Organization (Kök Varlık)
│
├── Department (Birim — kendine referanslı ağaç)
│     ├── Yönetim Kurulu
│     ├── Etkinlik Birimi
│     ├── Finans Birimi
│     ├── PR & Pazarlama
│     ├── Teknoloji Birimi
│     └── İnsan Kaynakları
│
├── Role (Rol — yetki seviyeli: 1=Yönetici … 5=Gönüllü)
│
├── Member (Üye — Birim + Rol bağlantılı)
│     └── Member ←→ Team (TeamMember: LIDER/KOORDINATOR/UYE)
│
└── Team (Ekip — daimi veya etkinliğe özel)
      └── leaderId: Member
```

## 3. Domain Modeli (20 Model — DB ile birebir)

| # | Model | Amaç | Önemli Alanlar / İlişkiler |
|---|-------|------|-----------------------------|
| 1 | `Organization` | Kök kiralayıcı (tenant) | name, slug, mission, foundedYear |
| 2 | `Department` | Hiyerarşik birim ağacı | parentId→Department (self), managerId→Member |
| 3 | `Role` | Yetki seviyeli roller | code, level (1-5), color |
| 4 | `Member` | Üyeler | departmentId, roleId, status: ACTIVE/PASSIVE/ALUMNI |
| 5 | `Team` | Ekipler | eventId?, leaderId?, type: STANDING/EVENT |
| 6 | `TeamMember` | Ekip-üye köprüsü | roleInTeam: LEADER/COORDINATOR/MEMBER |
| 7 | `Event` | Ana varlık | venueId?, coordinatorId?, status, type |
| 8 | `Venue` | Mekanlar | city, district, capacity, contact |
| 9 | `Task` | Görevler (kanban) | eventId, teamId?, assigneeId?, status, priority, position |
| 10 | `TaskChecklistItem` | Görev alt maddeleri | taskId, isDone, position |
| 11 | `BudgetItem` | Bütçe kalemleri | eventId, category, plannedAmount, actualAmount |
| 12 | `Expense` | Gider kayıtları | budgetItemId, status: PENDING/APPROVED/REJECTED/PAID |
| 13 | `Sponsor` | Sponsorlar & ortaklar | eventId, tier, status, sponsorshipAmount |
| 14 | `Speaker` | Konuşmacılar | company, bio, social linkler |
| 15 | `Session` | Program oturumları | eventId, speakerId?, type, startTime/endTime, room |
| 16 | `TicketType` | Bilet tipleri | eventId, price, quantity |
| 17 | `Attendee` | Katılımcı kayıtları | eventId, ticketTypeId?, status, qrCode |
| 18 | `Announcement` | Duyurular | eventId? (null=genel), priority, authorId? |
| 19 | `ActivityLog` | Denetim/aktivite akışı | type, entityType, entityId, actorName |
| 20 | `Feedback` | Etkinlik geri bildirimi | eventId, rating (1-5), category |

### 3.1 Enum Karşılıkları (SQLite: string + sabitler)

- **EventStatus:** `DRAFT → PLANNING → PUBLISHED → ONGOING → COMPLETED` · yan kol: `CANCELLED`
- **EventType:** CONFERENCE, WORKSHOP, SEMINAR, MEETUP, HACKATHON, FESTIVAL, WEBINAR, SPORTS, SOCIAL, OTHER
- **TaskStatus:** BACKLOG, TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED
- **TaskPriority:** LOW, MEDIUM, HIGH, URGENT
- **MemberStatus:** ACTIVE, PASSIVE, ALUMNI
- **BudgetCategory:** VENUE, CATERING, MARKETING, EQUIPMENT, SPEAKERS, DECORATION, TRANSPORT, PRINTING, TECHNOLOGY, OTHER
- **ExpenseStatus:** PENDING, APPROVED, REJECTED, PAID
- **SponsorTier:** PLATINUM, GOLD, SILVER, BRONZE, MEDIA, PARTNER
- **SponsorStatus:** PROSPECT, CONTACTED, NEGOTIATION, CONFIRMED, DECLINED
- **SessionType:** KEYNOTE, TALK, PANEL, WORKSHOP, BREAK, NETWORKING
- **AttendeeStatus:** REGISTERED, CONFIRMED, CHECKED_IN, CANCELLED, NO_SHOW
- **AnnouncementPriority:** NORMAL, IMPORTANT, CRITICAL
- **TeamType:** STANDING, EVENT · **RoleInTeam:** LEADER, COORDINATOR, MEMBER

## 4. REST API Sözleşmesi

| Desen | Metotlar | Not |
|-------|----------|-----|
| `/api/{entity}` | GET (liste+filtre), POST (oluştur) | `entity` ∈ §3 modelleri (çoğul isimler) |
| `/api/{entity}/[id]` | GET, PUT, DELETE | Next 16: `params` Promise — `await params` |
| `/api/dashboard` | GET | Agregasyon: sayaçlar, dağılımlar, yaklaşan etkinlikler |
| `/api/seed` | POST | Demo veri yükler (idempotent: önce temizler) |

Hata sözleşmesi: `{ error: string }` + uygun HTTP kodu (400/404/409/500).

## 5. UI Modül Haritası (SPA `/`)

| Modül | İçerik |
|-------|--------|
| Dashboard | KPI kartları, durum dağılımı (donut), etkinlik tipi grafiği, bütçe plan/gerçek, yaklaşan etkinlikler, aktivite akışı |
| Etkinlikler | Filtre barı + kart ızgarası + CRUD dialogu; detay sekmeleri: Genel Bakış, Ekipler, Görevler, Bütçe, Sponsorlar, Ajanda, Katılımcılar |
| Organizasyon | Organizasyon profili, birim ağacı (açı/kapa), roller tablosu |
| Üyeler | Tablo + arama + birim/rol filtresi + CRUD |
| Ekipler | Ekip kartları, üye yönetimi |
| Görevler | Kanban (6 kolon), hızlı durum değişimi, checklist |
| Finans | Etkinlik bazlı bütçe kalemleri, giderler, plan/gerçek barları |
| Sponsorlar | Tier gruplu kartlar, durum pipeline'ı |
| Ajanda | Konuşmacı galerisi + oturum zaman çizelgesi |
| Katılımcılar | Tablo + check-in aksiyonu + bilet tipleri |
| Duyurular | Öncelik etiketli duyuru listesi |

## 6. Kurallar

1. **Organizasyon yapısı ⇄ DB yapısı birebir uyuşur** — hiçbir UI alanı modelsiz, hiçbir model uisiz kalmaz.
2. Prisma şeması bu dokümanla eşleşmek zorundadır; değişiklik önce buraya işlenir.
3. API istekleri istemciden **göreli yol** ile yapılır.
4. SQLite kısıtı: enum yerine string + `src/lib/constants.ts` sabitleri.
5. Tüm parasal değerler `Float` + `TRY` varsayılan para birimi ile tutulur.
