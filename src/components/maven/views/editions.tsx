"use client";
// Etkinlikler — seri/edisyon, şablon önerileri, 9 adımlı wizard (özet form), yayın denetimi
import { useState } from "react";
import { apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, PageHeader, StatusBadge, Chip } from "../bits";
import { EDITION_STATUS, label, TEMPLATES, fmtDate } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

export function EditionsView() {
  const { editions, currentEditionId, setCurrentEdition, setModule, bump, bootstrap } = useApp();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    seriesMode: "new" as "new" | "existing",
    seriesName: "No-Dig Turkey",
    template: "SCIENTIFIC_CONGRESS",
    name: "",
    editionLabel: String(new Date().getFullYear() + 1),
    startDate: "",
    endDate: "",
    city: "İstanbul",
    venueName: "",
    description: "",
    coverColor: "teal",
  });

  const create = async () => {
    setBusy(true);
    try {
      // seri: basitlik için yeni seri adı ile (aynı ad varsa mevcut seri kullanılır — slug çakışması yoksa)
      const seriesRes = await fetch("/api/event-series", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.seriesName, slug: `${form.seriesName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36).slice(-4)}`, template: form.template }),
      });
      const series = await seriesRes.json();
      if (!seriesRes.ok) throw new Error(series.error ?? "Seri oluşturulamadı");

      const slug = `${form.name || form.seriesName}-${form.editionLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const editionRes = await fetch("/api/editions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || `${form.seriesName} ${form.editionLabel}`,
          slug, editionLabel: form.editionLabel,
          seriesId: series.id,
          template: form.template,
          status: "PLANNING",
          startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
          endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
          city: form.city, venueName: form.venueName, description: form.description, coverColor: form.coverColor,
          tenantId: (await bootstrapData())?.tenantId,
        }),
      });
      const edition = await editionRes.json();
      if (!editionRes.ok) throw new Error(edition.error ?? "Edisyon oluşturulamadı");

      // şablon yeteneklerini uygula (§6: seçim yalnız başlangıç modüllerini önerir)
      const caps = TEMPLATES[form.template] ?? [];
      for (const key of caps) {
        await apiSend("/api/capabilities", "POST", { editionId: edition.id, key, enabled: true, setupNote: "yapılacak" });
      }
      toast({ title: "Etkinlik taslağı oluşturuldu", description: "Katılımcılar henüz göremez. Kurulum wizard'ı ile devam edin." });
      setCreateOpen(false); setStep(1);
      await bootstrap();
      setCurrentEdition(edition.id);
      setModule("settings");
      bump();
    } catch (e) {
      toast({ title: "Oluşturulamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const bootstrapData = async () => {
    const res = await fetch("/api/bootstrap", { cache: "no-store" });
    const data = await res.json();
    return data.tenant;
  };

  const steps = ["Kimlik", "Tarih/Yer", "Yetenekler"];

  return (
    <div>
      <PageHeader title="Etkinlikler" desc="Seri (marka) ≠ Edisyon (tarihli gerçek etkinlik) — yeni yıl önceki edisyondan yapı taşlarını kopyalayabilir, tarihsel veri asla değişmez">
        <Button size="sm" onClick={() => setCreateOpen(true)}><Icons.Plus className="size-4" /> Yeni Etkinlik</Button>
      </PageHeader>

      {editions.length === 0 ? (
        <EmptyState title="Henüz bir etkinliğiniz yok" desc="İlk etkinliğinizi oluşturup kayıt ve program akışını birlikte planlayın." action={<Button onClick={() => setCreateOpen(true)}>Etkinlik oluştur</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {editions.map((e) => (
            <SectionCard
              key={e.id}
              title={e.name}
              desc={`${e.series?.name ? `${e.series.name} · ` : ""}${fmtDate(e.startDate)} — ${fmtDate(e.endDate)}${e.city ? ` · ${e.city}` : ""}`}
              action={<StatusBadge map={EDITION_STATUS} value={e.status} />}
              className={cn(currentEditionId === e.id && "ring-2 ring-primary/40")}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {e.isPublished ? <Chip tone="emerald">yayında — kayıt bağlantısı açık</Chip> : <Chip tone="amber">taslak — katılımcılar göremez</Chip>}
                <Chip>{e._count?.registrations ?? 0} kayıt</Chip>
                <Chip>{e._count?.participations ?? 0} katılım</Chip>
                <Chip tone="violet">{e._count?.sponsorAgreements ?? 0} sponsor</Chip>
                <Chip>{e._count?.sessions ?? 0} oturum</Chip>
                <Chip tone="amber">{e._count?.tasks ?? 0} açık iş</Chip>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {e.capabilities?.filter((c) => c.enabled).slice(0, 8).map((c) => (
                  <span key={c.id} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{c.key}</span>
                ))}
                {(e.capabilities?.filter((c) => c.enabled).length ?? 0) > 8 && <span className="text-[10px] text-muted-foreground">+{(e.capabilities?.filter((c) => c.enabled).length ?? 0) - 8}</span>}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant={currentEditionId === e.id ? "secondary" : "outline"} onClick={() => { setCurrentEdition(e.id); setModule("dashboard"); }}>
                  {currentEditionId === e.id ? "Açık — Dashboard" : "Edisyona geç"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setCurrentEdition(e.id); setModule("settings"); }}>
                  <Icons.Settings className="size-4" /> Ayarlar
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Kurulum sihirbazı (özet) — §05: 9 adımın ilk 3'ü + şablon */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Yeni Etkinlik — {steps[step - 1]} ({step}/3)</DialogTitle>
            <DialogDescription>Seçim yalnız başlangıç yeteneklerini önerir; etkinlik türü sabit koda kilitlenmez.</DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {Object.entries({ SCIENTIFIC_CONGRESS: "Bilimsel Kongre", TRADE_FAIR: "Fuar", CORPORATE_EVENT: "Kurumsal" }).map(([k, v]) => (
                  <button key={k} onClick={() => setForm({ ...form, template: k })}
                    className={cn("rounded-lg border-2 p-3 text-center text-xs font-medium transition", form.template === k ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-primary/30")}>
                    {v}
                  </button>
                ))}
              </div>
              <div><Label>Etkinlik Seri Adı</Label><Input value={form.seriesName} onChange={(ev) => setForm({ ...form, seriesName: ev.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Görünen Ad</Label><Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} placeholder="No-Dig Turkey 2027" className="mt-1" /></div>
                <div><Label>Edisyon Etiketi</Label><Input value={form.editionLabel} onChange={(ev) => setForm({ ...form, editionLabel: ev.target.value })} className="mt-1" /></div>
              </div>
              <div><Label>Kısa Açıklama</Label><Textarea value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} className="mt-1" rows={2} /></div>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Başlama Tarihi</Label><Input type="date" value={form.startDate} onChange={(ev) => setForm({ ...form, startDate: ev.target.value })} className="mt-1" /></div>
              <div><Label>Bitiş Tarihi</Label><Input type="date" value={form.endDate} onChange={(ev) => setForm({ ...form, endDate: ev.target.value })} className="mt-1" /></div>
              <div><Label>Şehir</Label><Input value={form.city} onChange={(ev) => setForm({ ...form, city: ev.target.value })} className="mt-1" /></div>
              <div><Label>Mekân</Label><Input value={form.venueName} onChange={(ev) => setForm({ ...form, venueName: ev.target.value })} className="mt-1" /></div>
              <p className="sm:col-span-2 text-xs text-muted-foreground">Bitiş başlangıçtan sonra olmalı; tarih değişimi program ve otel uyarısı üretir.</p>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Önerilen başlangıç yetenekleri — {label(EDITION_STATUS, "PLANNING")} ile başlar</p>
              <div className="flex flex-wrap gap-1.5">
                {(TEMPLATES[form.template] ?? []).map((c) => <Chip key={c} tone="teal">{c}</Chip>)}
                {(TEMPLATES[form.template] ?? []).length === 0 && <span className="text-xs text-muted-foreground">Boş şablon — yetenekleri sonra seçin.</span>}
              </div>
              <p className="text-xs text-muted-foreground">Önceki edisyondan kopyalanabilecekler: kategori, form, sponsor paketi, badge, bilimsel iz. Kişiler, ödeme ve check-in kopyalanmaz.</p>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between">
            <Button variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>Geri</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>Devam et</Button>
            ) : (
              <Button onClick={create} disabled={busy || !form.seriesName}>{busy ? "Oluşturuluyor…" : "Taslağı Oluştur"}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
