# 🗺️ Maven Event Management V2 — Menü Mimarisi ve Bağlantı Şeması

> **Obsidian Görsel Rehberi:** Bu dosya hem Obsidian Graph View hem de canlı Canvas/Mermaid render motoru ile tam uyumlu olarak tasarlanmıştır.

#maven-v2 #mimari #menu-hiyerarsisi #firma-globali #is-modulleri #baglam-koprusu

---

## 🧭 1. Genel Mimari ve Çift Sol Menü (Dual Sidebar) Şeması

```mermaid
flowchart TD
    classDef rail fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef switcher fill:#1e293b,stroke:#818cf8,stroke-width:2px,color:#f8fafc;
    classDef globalHub fill:#134e4a,stroke:#2dd4bf,stroke-width:2px,color:#f0fdfa;
    classDef workHub fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#faf5ff;
    classDef screen fill:#09090b,stroke:#71717a,stroke-width:1px,color:#fafafa;
    classDef bridge fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;

    subgraph RAIL["56px Sol Global İkon Şeridi"]
        R_LOGO["🏢 Logo & Kiracı"]:::rail
        R_JOBS["💼 İşler"]:::rail
        R_PORT["👥 Portföy"]:::rail
        R_COMMS["📢 İletişim"]:::rail
        R_REPS["📊 Raporlar"]:::rail
        R_SETS["⚙️ Ayarlar"]:::rail
    end

    subgraph CONTEXT_TOGGLE["Bağlam Seçici (Dual Sidebar Header)"]
        TOGGLE{"[İş Modülleri] 🔀 [Firma Globali]"}:::switcher
        BACK_TO_WORK["← [İş Adı] İşine Dön"]:::switcher
    end

    subgraph GLOBAL_PANEL["FİRMA GLOBALI (5 Açılır Akordeon)"]
        G_JOBS["💼 1. İşler & Etkinlikler (7 Madde)"]:::globalHub
        G_PORT["👥 2. Firma Portföyü (6 Madde)"]:::globalHub
        G_COMMS["📢 3. Genel İletişim (7 Madde)"]:::globalHub
        G_REPS["📊 4. Firma Raporları (6 Madde)"]:::globalHub
        G_SETS["⚙️ 5. Firma Ayarları (9 Madde)"]:::globalHub
    end

    subgraph WORK_PANEL["İŞ MODÜLLERİ (6 Operasyonel + 2 Yardımcı Hub)"]
        W_COCKPIT["🎯 Kokpit ve Yönetim (6 Madde)"]:::workHub
        W_REG["📝 Katılım ve Kayıt (6 Madde)"]:::workHub
        W_PROG["📅 Program ve İçerik (3 Madde)"]:::workHub
        W_SPONSOR["💎 Sponsor ve Sergi (5 Madde)"]:::workHub
        W_LOGISTICS["🚚 Saha ve Lojistik (7 Madde)"]:::workHub
        W_COMMS["📡 İletişim ve Deneyim (3 Madde)"]:::workHub
        W_REPS["📈 Raporlar & Defter (3 Madde)"]:::workHub
        W_SETS["🛠️ İş Parametreleri (3 Madde)"]:::workHub
    end

    subgraph BRIDGES["Çapraz Modül Köprüleri (Work Context Bridges)"]
        B_SUMMARY["⚡ İş Özeti Cockpit"]:::bridge
        B_SETUP["📋 Kurulum Kontrol Listesi"]:::bridge
        B_COMMS["📨 İletişim Senkronizasyonu"]:::bridge
        B_PORTALS["🌐 Dış Deneyimler & PWA"]:::bridge
        B_REPORTS["💰 Defter & Muhasebe"]:::bridge
    end

    %% İlişkiler
    R_JOBS --> G_JOBS
    R_PORT --> G_PORT
    R_COMMS --> G_COMMS
    R_REPS --> G_REPS
    R_SETS --> G_SETS

    TOGGLE -->|Firma Globali Seçilirse| GLOBAL_PANEL
    TOGGLE -->|İş Modülleri Seçilirse| WORK_PANEL
    BACK_TO_WORK --> WORK_PANEL

    WORK_PANEL -.-> BRIDGES
    BRIDGES -.-> GLOBAL_PANEL
```

---

## 🏢 2. [[Firma Globali]] Detaylı Menü Ağacı ve Ekran Bağlantıları

> [!info] **Firma Globali Kapsamı**
> Kiracı organizasyonun (Firma B) tüm etkinliklerden bağımsız olan kalıcı varlıklarını, genel iletişimini ve konsolide raporlarını içerir. 5 ana akordeon ve 36 alt maddeden oluşur.

```mermaid
flowchart LR
    classDef area fill:#115e59,stroke:#5eead4,stroke-width:2px,color:#ffffff;
    classDef sub fill:#0f172a,stroke:#38bdf8,stroke-width:1px,color:#e2e8f0;
    classDef view fill:#18181b,stroke:#a1a1aa,stroke-width:1px,color:#ffffff;

    subgraph JOBS_AREA["💼 İşler ve Organizasyonlar"]
        J1["Tümü (editions/all)"]:::sub --> V_JOBS["Görünüm: JobsView (İş Kartları & Filtreler)"]:::view
        J2["İşlerim (editions/my-jobs)"]:::sub --> V_JOBS
        J3["Aktif (editions/active)"]:::sub --> V_JOBS
        J4["Planlanan (editions/planning)"]:::sub --> V_JOBS
        J5["Dikkat Gereken (editions/attention)"]:::sub --> V_JOBS
        J6["Tamamlanan (editions/completed)"]:::sub --> V_JOBS
        J7["Arşiv (editions/archive)"]:::sub --> V_JOBS
    end

    subgraph PORTFOLIO_AREA["👥 Firma Portföyü"]
        P1["Kişiler"]:::sub --> V_PORT["Görünüm: PortfolioView (Ana Kişi & Kurum Veritabanı)"]:::view
        P2["Kurumlar"]:::sub --> V_PORT
        P3["Müşteriler"]:::sub --> V_PORT
        P4["İlişkiler"]:::sub --> V_PORT
        P5["Segmentler"]:::sub --> V_PORT
        P6["Portföy Formları"]:::sub --> V_PORT
    end

    subgraph COMMS_AREA["📢 Genel İletişim"]
        C1["Genel Bakış"]:::sub --> V_COMMS["Görünüm: CompanyCommunicationsView"]:::view
        C2["Kitleler"]:::sub --> V_COMMS
        C3["Segmentler"]:::sub --> V_COMMS
        C4["Kampanyalar"]:::sub --> V_COMMS
        C5["Şablonlar"]:::sub --> V_COMMS
        C6["Onaylar"]:::sub --> V_COMMS
        C7["Gönderim Geçmişi"]:::sub --> V_COMMS
    end

    subgraph REPORTS_AREA["📊 Firma Raporları"]
        R1["Portföy Analizi"]:::sub --> V_REPS["Görünüm: CompanyReportsView (Finansal & Operasyonel Konsolidasyon)"]:::view
        R2["İş Portföyü"]:::sub --> V_REPS
        R3["Operasyon Metrikleri"]:::sub --> V_REPS
        R4["Finans & Bütçe"]:::sub --> V_REPS
        R5["İletişim Başarısı"]:::sub --> V_REPS
        R6["Dışa Aktarımlar"]:::sub --> V_REPS
    end

    subgraph SETTINGS_AREA["⚙️ Firma Ayarları"]
        S1["Firma Profili"]:::sub --> V_SETS["Görünüm: CompanySettingsView"]:::view
        S2["Çalışanlar & Ekipler"]:::sub --> V_SETS
        S3["Departmanlar"]:::sub --> V_SETS
        S4["Roller & Erişim"]:::sub --> V_SETS
        S5["Modül Hakları"]:::sub --> V_SETS
        S6["Genel Şablonlar"]:::sub --> V_SETS
        S7["İletişim & İzinler (İYS)"]:::sub --> V_SETS
        S8["Entegrasyonlar"]:::sub --> V_INT["Görünüm: IntegrationsView"]:::view
        S9["Uyumluluk & Vault"]:::sub --> V_COMP["Görünüm: ComplianceView"]:::view
    end
```

---

## 🎯 3. [[İş Modülleri]] Sektörel Hub'ları ve Ekran Bağlantıları

> [!info] **İş Modülleri Kapsamı (Work Workspace)**
> Yalnızca seçili işe (Kongre, Fuar, Kurumsal Etkinlik) ait operasyonel süreçleri içerir. 6 Sektörel Operasyonel Hub ve 2 Yardımcı Hub'da toplam 33 alt madde yer alır.

```mermaid
flowchart LR
    classDef hub fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#ffffff;
    classDef item fill:#1e1b4b,stroke:#c084fc,stroke-width:1px,color:#f5f3ff;
    classDef mod fill:#0f172a,stroke:#38bdf8,stroke-width:1px,color:#f8fafc;

    subgraph HUB_1["🎯 1. Kokpit ve Yönetim"]
        H1_1["İş Özeti"]:::item --> M_DASH["Modül: Dashboard / Kokpit"]:::mod
        H1_2["Kurulum Kontrol Listesi"]:::item --> M_SETUP["Modül: SetupChecklistCard"]:::mod
        H1_3["Görevler ve Onaylar"]:::item --> M_OPS["Modül: Operations & Tasks"]:::mod
        H1_4["Müşteri ve Düzenleyen"]:::item --> M_ORGS["Modül: Organizations"]:::mod
        H1_5["Ekip ve Yetkiler"]:::item --> M_SETS["Modül: Work Settings"]:::mod
        H1_6["İş Bilgileri"]:::item --> M_ED["Modül: Editions Editörü"]:::mod
    end

    subgraph HUB_2["📝 2. Katılım ve Kayıt"]
        H2_1["Katılımcılar"]:::item --> M_REG["Modül: Registrations (Liste & Detay)"]:::mod
        H2_2["Kategoriler ve Haklar"]:::item --> M_REG_CAT["Modül: Registrations (Kategoriler)"]:::mod
        H2_3["Onay Merkezi"]:::item --> M_REG_APP["Modül: Registrations (Onay Kuyruğu)"]:::mod
        H2_4["Formlar"]:::item --> M_FORMS["Modül: FormCenter"]:::mod
        H2_5["İçe / Dışa Aktarım"]:::item --> M_REG_IMP["Modül: Registrations (Aktarım)"]:::mod
        H2_6["Kişiler ve Kurumlar"]:::item --> M_PEOPLE["Modül: People (İşe Bağlılar)"]:::mod
    end

    subgraph HUB_3["📅 3. Program ve İçerik"]
        H3_1["Program (Oturumlar)"]:::item --> M_PROG["Modül: Scientific (Program Izgarası)"]:::mod
        H3_2["Bilimsel (Bildiriler)"]:::item --> M_SCI["Modül: Scientific (Bildiri & Hakem)"]:::mod
        H3_3["Sosyal ve Tur Planı"]:::item --> M_SOC["Modül: Social (Gala, Turlar)"]:::mod
    end

    subgraph HUB_4["💎 4. Sponsor ve Sergi"]
        H4_1["Sponsorlar"]:::item --> M_SPON["Modül: Sponsorship (Kanban & Paket)"]:::mod
        H4_2["Paketler ve Anlaşmalar"]:::item --> M_SPON
        H4_3["Haklar ve Teslimatlar"]:::item --> M_SPON
        H4_4["Stantlar / Floor Studio"]:::item --> M_FLOOR["Modül: Floors (SVG Yerleşim)"]:::mod
        H4_5["B2B İkili Görüşmeler"]:::item --> M_B2B["Modül: B2B Eşleşme Masası"]:::mod
    end

    subgraph HUB_5["🚚 5. Saha ve Lojistik"]
        H5_1["Saha Operasyonu"]:::item --> M_ONSITE["Modül: Onsite (Canlı Check-in & Kiosk)"]:::mod
        H5_2["Yaka Kartları ve Baskı"]:::item --> M_BADGE["Modül: BadgeQueue (Termal ZPL Baskı)"]:::mod
        H5_3["Belgeler ve Sertifikalar"]:::item --> M_CERT["Modül: Certificates"]:::mod
        H5_4["Konaklama"]:::item --> M_ACC["Modül: Accommodation (Otel Blokları)"]:::mod
        H5_5["Seyahat ve Transfer"]:::item --> M_ACC_TR["Modül: Accommodation (Uçuş & Araç)"]:::mod
        H5_6["Mekânlar ve Alanlar"]:::item --> M_FLOOR
        H5_7["Ek Hizmetler"]:::item --> M_FIN["Modül: Finance (Ek Hizmet Kalemleri)"]:::mod
    end

    subgraph HUB_6["📡 6. İletişim ve Deneyim"]
        H6_1["İş İletişimi"]:::item --> M_COMMS["Modül: Communications (İş Kitleleri)"]:::mod
        H6_2["Dış Deneyimler (Portallar)"]:::item --> M_PORTAL["Modül: Portals (PWA & Web Vitrini)"]:::mod
        H6_3["Medya Arşivi"]:::item --> M_MEDIA["Modül: Media"]:::mod
    end

    subgraph HUB_7["📈 7. İş Raporları (Yardımcı)"]
        H7_1["Finans & Defter"]:::item --> M_ACC_LEDGER["Modül: Accounting (Gelir/Gider Defteri)"]:::mod
        H7_2["Kayıt İstatistikleri"]:::item --> M_REG
        H7_3["Sponsor ROI Raporu"]:::item --> M_SPON
    end

    subgraph HUB_8["🛠️ 8. İş Ayarları (Yardımcı)"]
        H8_1["İş Parametreleri"]:::item --> M_SETS
        H8_2["Etkin Modüller"]:::item --> M_SETS
        H8_3["Yayın & Dış Görünüm"]:::item --> M_PORTAL
    end
```

---

## 🔗 4. [[Bağlam Köprüsü]] (Module Context Bridge) Akışları

İş bağlamı açıkken üst barda yer alan 5 kritik geçiş köprüsü:

| Köprü Adı | Temsil Edilen Simge | Hedef Modül | Alt Görünüm | İşlev & Çapraz Bağlantı |
| :--- | :---: | :--- | :--- | :--- |
| **İş Özeti** | ⚡ | `dashboard` | `null` | Anlık iş sağlık puanı, blokajlar ve hızlı aksiyon kokpiti. |
| **Kurulum Listesi** | 📋 | `editions` | `setup-checklist` | Kademeli kurulum adımları ve yayın blokaj denetimi. |
| **İş İletişimi** | 📨 | `communications` | `overview` | Yalnızca bu işin delegelerine özel duyuru merkezi (Firma geneline köprü sağlar). |
| **Dış Deneyimler** | 🌐 | `portals` | `pwa` | Katılımcı PWA vitrini, konuşmacı portalı ve sponsor alanı. |
| **İş Raporları** | 💰 | `accounting` | `defter` | İşe ait tek düzen gelir-gider defteri ve kapanış mutabakatı. |

---

## 📑 5. Obsidian İç Bağlantı Dizini (Backlinks)

- [[Firma Globali]]
  - [[İşler ve Organizasyonlar]]
  - [[Firma Portföyü]]
  - [[Genel İletişim]]
  - [[Firma Raporları]]
  - [[Firma Ayarları]]
- [[İş Modülleri]]
  - [[Kokpit ve Yönetim]]
  - [[Katılım ve Kayıt]]
  - [[Program ve İçerik]]
  - [[Sponsor ve Sergi]]
  - [[Saha ve Lojistik]]
  - [[İletişim ve Deneyim]]
  - [[İş Raporları]]
  - [[İş Ayarları]]
- [[Bağlam Köprüsü]]
- [[Yeni İş Sihirbazı (New Work Wizard)]]
- [[Kurulum Kontrol Listesi]]
