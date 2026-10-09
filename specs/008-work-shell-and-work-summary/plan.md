# Uygulama Planı: 008 — İş Shell'i ve İş Özeti (Cockpit)

## 1. Mimari Tasarım

İş Özeti (`WorkSummaryView` / `DashboardView`), tek bir işin operasyonel sağlık merkezidir.

### Bileşen Hiyerarşisi:
```text
Shell
├── DualSidebar (56px global rail + 224px 9-group work menu)
└── WorkSummaryView (İş Özeti Cockpit)
    ├── WorkHeaderBlock (Kimlik, Tür, Profil, Yaşam Döngüsü, Müşteri, Tarih/Mekân)
    ├── SetupAndReadinessCard (Kurulum Yüzdesi, Blokajlar, Hızlı Kurulum Butonu)
    ├── PendingDecisionsCard (Onay Bekleyen Başvurular, Ödemeler, Sözleşmeler)
    ├── ActiveModulesGrid (Sadece etkin modüller: Kayıt, Program, Sponsor, Saha, Otel, Portal)
    ├── UpcomingTasksCard (Sorumlu, Tarih, Öncelik ile yaklaşan işler)
    ├── ExternalExperienceCard (Katılımcı PWA / Web Vitrini link ve QR)
    └── ArchivedSummaryBanner (Arşivlenmiş/Tamamlanmış işler için özel kapanış paneli)
```

## 2. API ve Veri Akışı
- `/api/dashboard?editionId=<id>`: Mevcut endpoint, edisyon bazlı `checks`, `kpi`, `recentActivity`, `upcomingTasks` verilerini döner.
- Bu veriler İş Özeti'ndeki karar panellerine, modül durumlarına ve görev listesine beslenir.
- Bir karara veya göreve tıklandığında `setModule("<moduleId>")` tetiklenerek doğrudan ilgili iş modülüne geçiş sağlanır.

## 3. Güvenlik ve İzolasyon
- Tüm modül linkleri ve aksiyonlar yalnızca seçili `currentEditionId` bağlamında çalışır.
- Rol tabanlı yetki kontrolü (`roleCanSee`) her modül linkinde korunur.
- Arşivlenmiş işlerde eylem butonları devre dışı bırakılır veya salt okunur moda alınır.
