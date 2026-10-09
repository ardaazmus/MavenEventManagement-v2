"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { PageHeader, SectionCard } from "../bits";
import { CustomerDataCard } from "./comms-crm";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyCommsViewProps {
  initialTab?: string;
}

export function CompanyCommsView({ initialTab = "overview" }: CompanyCommsViewProps) {
  const { t } = useLang();
  const { bump, setModule, moduleSubView, editions } = useApp();

  const validTabs = ["overview", "audiences", "segments", "campaigns", "templates", "approvals", "delivery-history"];
  const startTab = moduleSubView && validTabs.includes(moduleSubView) ? moduleSubView : initialTab;
  const [prevSubView, setPrevSubView] = useState(moduleSubView);
  const [activeTab, setActiveTab] = useState(startTab);

  if (moduleSubView !== prevSubView) {
    setPrevSubView(moduleSubView);
    if (moduleSubView && validTabs.includes(moduleSubView)) {
      setActiveTab(moduleSubView);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <PageHeader title={t("companyComms.title")} desc={t("companyComms.desc")} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => setModule("communications")}
          >
            <Icons.Megaphone className="size-3.5 text-primary" />
            {t("companyComms.openEditionComms")}
          </Button>
        </div>
      </div>

      {/* ── 7 Sekmeli Genel İletişim Konsolu ── */}
      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setModule("company-communications", val); }} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1 bg-muted/60 p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs py-1.5">
            <Icons.LayoutDashboard className="size-3.5" />
            Genel Bakış
          </TabsTrigger>
          <TabsTrigger value="audiences" className="gap-1.5 text-xs py-1.5">
            <Icons.Users className="size-3.5" />
            Kitleler
          </TabsTrigger>
          <TabsTrigger value="segments" className="gap-1.5 text-xs py-1.5">
            <Icons.Filter className="size-3.5" />
            Segmentler
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5 text-xs py-1.5">
            <Icons.Send className="size-3.5" />
            Kampanyalar
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 text-xs py-1.5">
            <Icons.FileText className="size-3.5" />
            Şablonlar
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-1.5 text-xs py-1.5">
            <Icons.ShieldCheck className="size-3.5" />
            Onaylar
          </TabsTrigger>
          <TabsTrigger value="delivery-history" className="gap-1.5 text-xs py-1.5">
            <Icons.History className="size-3.5" />
            Gönderim Geçmişi
          </TabsTrigger>
        </TabsList>

        {/* 1. Genel Bakış Sekmesi */}
        <TabsContent value="overview" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border bg-card shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-[11px] font-medium text-muted-foreground">Kayıtlı İletişim Havuzu</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-2xl font-bold text-foreground">1,240</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Firma geneli tekil kişi</p>
              </CardContent>
            </Card>
            <Card className="border bg-card shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-[11px] font-medium text-muted-foreground">İzinli E-posta (İYS)</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-2xl font-bold text-emerald-600">%94.2</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">1,168 onaylı e-posta</p>
              </CardContent>
            </Card>
            <Card className="border bg-card shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-[11px] font-medium text-muted-foreground">Aktif Kampanyalar</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-2xl font-bold text-foreground">4</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Bu ay yürütülen</p>
              </CardContent>
            </Card>
            <Card className="border bg-card shadow-2xs">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-[11px] font-medium text-muted-foreground">Ortalama Açılma Oranı</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-2xl font-bold text-primary">%38.6</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Sektör ortalaması %22</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Son İletişim Hareketleri</h4>
                <Badge variant="outline" className="text-[10px]">Canlı Akış</Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">2026 Q2 Etkinlik Takvimi Bülteni</p>
                    <p className="text-[11px] text-muted-foreground">Toplu E-posta · 1,120 alıcı</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">Teslim Edildi</Badge>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">No-Dig Turkey 2026 Erken Kayıt Çağrısı</p>
                    <p className="text-[11px] text-muted-foreground">Hedef Kitle · 340 alıcı</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Tamamlandı</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">VIP Katılımcı Otel Rezervasyon Teyidi</p>
                    <p className="text-[11px] text-muted-foreground">SMS & WhatsApp · 48 alıcı</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">Teslim Edildi</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hızlı İletişim Eylemleri</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Button variant="outline" className="h-auto flex-col items-start p-3 gap-1" onClick={() => setActiveTab("audiences")}>
                  <Icons.UserPlus className="size-4 text-primary" />
                  <span className="font-medium">Müşteri Havuzunu Aç</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Kişi ve iletişim kayıtları</span>
                </Button>
                <Button variant="outline" className="h-auto flex-col items-start p-3 gap-1" onClick={() => setActiveTab("campaigns")}>
                  <Icons.Send className="size-4 text-primary" />
                  <span className="font-medium">Yeni Kampanya</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Duyuru ve bülten iletisi</span>
                </Button>
                <Button variant="outline" className="h-auto flex-col items-start p-3 gap-1" onClick={() => setActiveTab("templates")}>
                  <Icons.FileText className="size-4 text-primary" />
                  <span className="font-medium">Şablonları Düzenle</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Kurumsal mesaj kalıpları</span>
                </Button>
                <Button variant="outline" className="h-auto flex-col items-start p-3 gap-1" onClick={() => setActiveTab("approvals")}>
                  <Icons.ShieldCheck className="size-4 text-primary" />
                  <span className="font-medium">Onay Merkezi</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Gönderim öncesi teyit</span>
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 2. Kitleler Sekmesi */}
        <TabsContent value="audiences" className="mt-4">
          <CustomerDataCard onContactsChanged={() => bump()} />
        </TabsContent>

        {/* 3. Segmentler Sekmesi */}
        <TabsContent value="segments" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">İletişim Segment Kümeleri</h3>
                <p className="text-xs text-muted-foreground">Dinamik filtreler ve ilgi alanlarına göre ayrıştırılmış alıcı listeleri.</p>
              </div>
              <Button size="sm" className="gap-1.5 text-xs">
                <Icons.Plus className="size-3.5" /> Yeni Segment Oluştur
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              {[
                { name: "Tüm İzinli Müşteri Havuzu", channel: "E-posta & SMS", count: 1168, criteria: "İYS Onayı: Var" },
                { name: "Sektörel Karar Vericiler & CEO", channel: "E-posta", count: 184, criteria: "Unvan: Direktör, Genel Müdür" },
                { name: t("companyComms.segmentB2B"), channel: "E-posta & WhatsApp", count: 420, criteria: "Geçmiş İş: Fuar / Sergi" },
                { name: "Akademik Konuşmacı & Yazarlar", channel: "E-posta", count: 310, criteria: "Kategori: Kongre / Bilimsel" },
              ].map((s, idx) => (
                <div key={idx} className="rounded-lg border bg-background/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{s.name}</span>
                    <Badge variant="outline" className="text-[10px]">{s.channel}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{s.criteria}</p>
                  <div className="flex items-center justify-between pt-1 border-t text-xs">
                    <span className="font-semibold text-primary">{s.count} Alıcı</span>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setActiveTab("campaigns")}>
                      Kampanya Başlat →
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* 4. Kampanyalar Sekmesi */}
        <TabsContent value="campaigns" className="mt-4 space-y-4">
          <SectionCard title={t("companyComms.campaignsTitle")} desc={t("companyComms.campaignsDesc")}>
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Firma genelinde planlanan ve yayınlanan duyuru kampanyaları.</p>
                <Button size="sm" className="gap-1.5 text-xs">
                  <Icons.Plus className="size-3.5" /> Kampanya Tasarla
                </Button>
              </div>
              <div className="divide-y rounded-lg border bg-background/50">
                {[
                  { name: t("companyComms.calendarCampaign"), date: "15 Nisan 2026", status: "Zamanlandı", target: "Tüm Portföy (1,240 kişi)" },
                  { name: "Yeni İş Ortaklığı ve Sponsorluk Bilgilendirmesi", date: "28 Mart 2026", status: "Tamamlandı", target: "Sponsor ve Müşteriler (240 kurum)" },
                  { name: "Kurumsal Sürdürülebilirlik Raporu Yayını", date: "12 Mart 2026", status: "Tamamlandı", target: "Genel Abone Listesi (850 kişi)" },
                ].map((camp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <p className="font-medium text-foreground">{camp.name}</p>
                      <p className="text-[11px] text-muted-foreground">Hedef: {camp.target} · Tarih: {camp.date}</p>
                    </div>
                    <Badge variant={camp.status === "Tamamlandı" ? "outline" : "default"} className="text-[10px]">
                      {camp.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* 5. Şablonlar Sekmesi */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Firma Genel Mesaj Şablonları</h3>
                <p className="text-xs text-muted-foreground">Standart kurumsal e-posta başlığı, logo, alt bilgi ve imza taslakları.</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Icons.Plus className="size-3.5" /> Yeni Şablon
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              {[
                { title: "Kurumsal E-bülten Şablonu", type: "HTML E-posta", desc: "Logo, üst bant, iki kolonlu etkinlik kartı ve sosyal medya ikonları." },
                { title: "Resmi Davetiye & Duyuru", type: "Kişiselleştirilmiş E-posta", desc: t("companyComms.invitationDesc") },
                { title: "Kısa Bilgilendirme SMS Şablonu", type: "SMS / WhatsApp", desc: "160 karakter sınırında kısa link ve İYS ret kodu içeren metin." },
              ].map((t, idx) => (
                <div key={idx} className="rounded-lg border bg-background/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{t.title}</span>
                    <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]">Şablonu Düzenle</Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* 6. Onaylar Sekmesi */}
        <TabsContent value="approvals" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Gönderim Öncesi Onay Merkezi</h3>
                <p className="text-xs text-muted-foreground">Toplu gönderimler öncesinde yönetici teyidi ve içerik denetimi.</p>
              </div>
              <Badge variant="outline" className="text-xs">0 Bekleyen Onay</Badge>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              <Icons.ShieldCheck className="size-8 text-emerald-500/60 mb-2" />
              <p className="text-xs font-medium text-foreground">Bekleyen İletişim Onayı Yok</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Tüm planlanmış gönderimler onaylandı veya onay sırası boş.</p>
            </div>
          </div>
        </TabsContent>

        {/* 7. Gönderim Geçmişi Sekmesi */}
        <TabsContent value="delivery-history" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">İletim & Teslimat Günlüğü</h3>
                <p className="text-xs text-muted-foreground">Son gönderilen iletilerin teslimat, açılma ve hata durumları.</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                <Icons.RefreshCw className="size-3" /> Güncelle
              </Button>
            </div>
            <div className="divide-y rounded-lg border bg-background/50 text-xs">
              {[
                { target: "Ahmet Yılmaz (ahmet@firma.com)", channel: "E-posta", status: "Teslim Edildi", time: "10 dk önce" },
                { target: "Selin Kaya (selin@tech.org)", channel: "E-posta", status: "Açıldı", time: "25 dk önce" },
                { target: "0532 *** ** 12", channel: "SMS", status: "İletildi", time: "1 saat önce" },
                { target: "Burak Demir (b.demir@corp.com)", channel: "E-posta", status: "Teslim Edildi", time: "2 saat önce" },
              ].map((log, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5">
                  <div className="flex items-center gap-2">
                    <Icons.CheckCircle2 className="size-3.5 text-emerald-600" />
                    <div>
                      <p className="font-medium text-foreground">{log.target}</p>
                      <p className="text-[10px] text-muted-foreground">{log.channel} · {log.time}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
