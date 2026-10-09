"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { apiSend } from "@/lib/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPLATES, CAPABILITIES } from "@/lib/constants";

export interface NewWorkWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (editionId: string) => void;
}

export type WorkGroup = "EVENT_ORG" | "TRAVEL_CLIENT" | "SPECIAL_WORK";

export interface WizardFormState {
  // 1. İş Grubu
  workGroup: WorkGroup;
  // 2. İş Türü & Şablon
  template: string;
  seriesName: string;
  name: string;
  editionLabel: string;
  description: string;
  // 3. Tarih ve Lokasyon
  startDate: string;
  endDate: string;
  city: string;
  venueName: string;
  timeZone: string;
  // 4. Müşteri & Paydaş
  ownership: "OWN_WORK" | "CLIENT_WORK";
  clientName: string;
  clientRole: string;
  // 5. İş Profili
  scale: "INDIVIDUAL" | "GROUP";
  tier: "STANDARD" | "VIP";
  access: "PUBLIC" | "PRIVATE";
  // 7. Ekip ve Departman
  department: string;
}

export function NewWorkWizard({ open, onOpenChange, onCreated }: NewWorkWizardProps) {
  const { tenant, setCurrentEdition, setModule, bump, bootstrap } = useApp();
  const { toast } = useToast();
  const { t } = useLang();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<WizardFormState>({
    workGroup: "EVENT_ORG",
    template: "SCIENTIFIC_CONGRESS",
    seriesName: "No-Dig Turkey",
    name: "",
    editionLabel: String(new Date().getFullYear() + 1),
    description: "",
    startDate: "",
    endDate: "",
    city: "İstanbul",
    venueName: "",
    timeZone: "Europe/Istanbul",
    ownership: "OWN_WORK",
    clientName: "",
    clientRole: "Müşteri",
    scale: "GROUP",
    tier: "STANDARD",
    access: "PUBLIC",
    department: "Kongre & Organizasyon Departmanı",
  });

  const [selectedCaps, setSelectedCaps] = useState<string[]>(
    TEMPLATES.SCIENTIFIC_CONGRESS ?? []
  );

  // Tarih doğrulama sözleşmesi (P3.11 ve Güvenlik Bekçisi)
  const wizardDateError = (() => {
    if (!form.startDate) return "Başlama tarihi zorunludur";
    const s = new Date(form.startDate);
    if (Number.isNaN(s.getTime())) return "Başlama tarihi geçersiz";
    if (form.endDate) {
      const e = new Date(form.endDate);
      if (Number.isNaN(e.getTime())) return "Bitiş tarihi geçersiz";
      if (e < s) return "Bitiş tarihi başlangıçtan önce olamaz";
    }
    return null;
  })();

  const handleTemplateSelect = (tmplKey: string) => {
    setForm((prev) => ({ ...prev, template: tmplKey }));
    setSelectedCaps(TEMPLATES[tmplKey] ?? []);
  };

  const toggleCapSelected = (key: string) => {
    setSelectedCaps((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const create = async () => {
    if (wizardDateError) {
      toast({ title: wizardDateError, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // 1. Kiracı kontrolü
      const bootRes = await fetch("/api/bootstrap", { cache: "no-store" });
      const bootData = await bootRes.json();
      let tenantId: string | undefined = bootData?.tenant?.id ?? bootData?.id;

      if (!tenantId) {
        // Otomatik sağla
        const ensureRes = await fetch("/api/tenant/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Firma B Organizasyon" }),
        });
        const ensureData = await ensureRes.json();
        if (ensureRes.ok) tenantId = ensureData.id;
      }

      if (!tenantId) {
        toast({ title: t("editions.orgNeeded"), variant: "destructive" });
        return;
      }

      // 2. Seri Oluştur veya Bağla
      const seriesRes = await fetch("/api/event-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.seriesName,
          slug: `${form.seriesName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36).slice(-4)}`,
          template: form.template,
          tenantId,
        }),
      });
      const series = await seriesRes.json();
      if (!seriesRes.ok) throw new Error(series.error ?? "Seri oluşturulamadı");

      // 3. Edisyon (İş) Kaydı Oluştur
      const displayName = form.name || `${form.seriesName} ${form.editionLabel}`;
      const slug = `${displayName}-${Date.now().toString(36).slice(-4)}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");

      const editionRes = await fetch("/api/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName,
          slug,
          editionLabel: form.editionLabel,
          seriesId: series.id,
          template: form.template,
          status: "PLANNING",
          startDate: new Date(form.startDate).toISOString(),
          endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
          city: form.city,
          venueName: form.venueName,
          description: form.description,
          tenantId,
        }),
      });
      const edition = await editionRes.json();
      if (!editionRes.ok) throw new Error(edition.error ?? "İş oluşturulamadı");

      // 4. Seçilen Yetenekleri (Capabilities) Ekle
      for (const capKey of selectedCaps) {
        await apiSend("/api/capabilities", "POST", {
          editionId: edition.id,
          key: capKey,
          enabled: true,
          setupNote: "kurulum bekleniyor",
        });
      }

      toast({
        title: t("editions.draftCreated"),
        description: t("editions.capsOpened", { n: selectedCaps.length }),
      });

      // Sihirbazı kapat ve doğrudan İş Özeti (Cockpit) ekranına geçir
      onOpenChange(false);
      setStep(1);
      await bootstrap();
      setCurrentEdition(edition.id);
      setModule("dashboard"); // İş Özeti Cockpit
      bump();
      onCreated?.(edition.id);
    } catch (e) {
      toast({
        title: t("editions.createFailed"),
        description: e instanceof Error ? e.message : t("editions.errorOccurred"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const workTypeTemplates = [
    { key: "SCIENTIFIC_CONGRESS", label: t("editions.scientificCongress"), icon: Icons.BookOpenCheck, desc: "Bildiri, hakem, oturum programı, sponsorluk ve turnike" },
    { key: "TRADE_FAIR", label: t("editions.tradeFair"), icon: Icons.Store, desc: "Stant alanı, fuar planı, sponsorlar, B2B eşleşme ve yaka kartı" },
    { key: "CORPORATE_EVENT", label: t("editions.corporateEvent"), icon: Icons.Building2, desc: "Davetli katılımı, kurumsal program, sosyal gala ve konaklama" },
    { key: "SPECIAL_GALA", label: t("editions.specialGala"), icon: Icons.GlassWater, desc: "Özel davet, gala, masa oturma planı ve erişim kontrolü" },
    { key: "TRAVEL_GROUP", label: t("editions.travelGroup"), icon: Icons.Plane, desc: "Grup seyahati, otel konaklama, transfer ve katılımcı listesi" },
    { key: "CUSTOM_PROJECT", label: t("editions.customProject"), icon: Icons.FolderKanban, desc: "Esnek modüller, özel operasyon görevleri ve süreçler" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto maven-scroll">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="text-base font-bold">
              {t("editions.wizardTitle")}
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              Adım {step}/3
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            {t("editions.wizardSubtitle")}
          </DialogDescription>
        </DialogHeader>

        {/* ── ADIM 1: İş Grubu, Şablon ve Temel Kimlik ── */}
        {step === 1 && (
          <div className="space-y-4 py-1">
            {/* 1. İş Grubu */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("editions.workGroupLabel")}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "EVENT_ORG", label: t("editions.eventOrg"), icon: Icons.Calendar },
                  { id: "TRAVEL_CLIENT", label: t("editions.travelClient"), icon: Icons.Compass },
                  { id: "SPECIAL_WORK", label: t("editions.specialWork"), icon: Icons.Sparkles },
                ].map((g) => {
                  const IconC = g.icon;
                  const isSel = form.workGroup === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setForm({ ...form, workGroup: g.id as WorkGroup })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center text-xs transition",
                        isSel
                          ? "border-primary bg-primary/10 font-semibold text-primary shadow-2xs"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40"
                      )}
                    >
                      <IconC className="size-4 shrink-0" />
                      <span className="leading-tight">{g.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. İş Türü & Şablon */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("editions.workTypeLabel")}
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {workTypeTemplates.map((tmpl) => {
                  const IconC = tmpl.icon;
                  const isSel = form.template === tmpl.key;
                  return (
                    <button
                      key={tmpl.key}
                      type="button"
                      onClick={() => handleTemplateSelect(tmpl.key)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left text-xs transition",
                        isSel
                          ? "border-primary bg-primary/10 font-medium text-foreground shadow-2xs"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <IconC className="size-3.5 text-primary" />
                        <span className="truncate">{tmpl.label}</span>
                      </div>
                      <p className="line-clamp-2 text-[10px] text-muted-foreground">{tmpl.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temel Kimlik Alanları */}
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs">Etkinlik Seri / Çatı Adı</Label>
                <Input
                  value={form.seriesName}
                  onChange={(e) => setForm({ ...form, seriesName: e.target.value })}
                  placeholder="No-Dig Turkey"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-xs">Görünen İş Adı</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="No-Dig Turkey 2027"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Edisyon / Kod Etiketi</Label>
                  <Input
                    value={form.editionLabel}
                    onChange={(e) => setForm({ ...form, editionLabel: e.target.value })}
                    placeholder="2027"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Kısa Açıklama</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="İşin kapsamı ve temel hedefi…"
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── ADIM 2: Tarih, Zaman ve Yer/Rota (P3.11 Test Sözleşmesi) ── */}
        {step === 2 && (
          <div className="space-y-3 py-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("editions.dateAndLocationLabel")}
            </Label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="editions-wizard-start" className="text-xs font-medium">
                  Başlama Tarihi *
                </Label>
                <Input
                  id="editions-wizard-start"
                  type="date"
                  aria-required="true"
                  aria-invalid={wizardDateError ? true : undefined}
                  aria-describedby={wizardDateError ? "editions-wizard-date-error" : undefined}
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="editions-wizard-end" className="text-xs font-medium">
                  Bitiş Tarihi
                </Label>
                <Input
                  id="editions-wizard-end"
                  type="date"
                  aria-invalid={wizardDateError ? true : undefined}
                  aria-describedby={wizardDateError ? "editions-wizard-date-error" : undefined}
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="editions-wizard-city" className="text-xs font-medium">
                  Şehir
                </Label>
                <Input
                  id="editions-wizard-city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="İstanbul"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="editions-wizard-venue" className="text-xs font-medium">
                  Mekân / Rota
                </Label>
                <Input
                  id="editions-wizard-venue"
                  value={form.venueName}
                  onChange={(e) => setForm({ ...form, venueName: e.target.value })}
                  placeholder="Lütfi Kırdar Kongre Merkezi"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Hata kutusu — P3.11 için role=alert ve id zorunludur */}
            {wizardDateError && (
              <p
                id="editions-wizard-date-error"
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-700"
              >
                {wizardDateError}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Başlama tarihi zorunludur; bitiş tarihi seçimli olup başlangıçtan önce olamaz.
            </p>
          </div>
        )}

        {/* ── ADIM 3: Yapılandırma, Müşteri, Profil, Yetenekler & Ekip ── */}
        {step === 3 && (
          <div className="space-y-4 py-1">
            {/* 4. Müşteri & Paydaş Seçimi */}
            <div className="space-y-2 rounded-xl border p-3 bg-muted/20">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("editions.stakeholderLabel")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, ownership: "OWN_WORK" })}
                  className={cn(
                    "rounded-lg border p-2 text-center text-xs font-medium transition",
                    form.ownership === "OWN_WORK"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {t("editions.ownWork")}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, ownership: "CLIENT_WORK" })}
                  className={cn(
                    "rounded-lg border p-2 text-center text-xs font-medium transition",
                    form.ownership === "CLIENT_WORK"
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {t("editions.clientWork")}
                </button>
              </div>

              {form.ownership === "CLIENT_WORK" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <Label className="text-[11px]">{t("editions.clientNameLabel")}</Label>
                    <Input
                      value={form.clientName}
                      onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                      placeholder="Müşteri Kurumu / Şirketi"
                      className="mt-0.5 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">{t("editions.clientRoleLabel")}</Label>
                    <Input
                      value={form.clientRole}
                      onChange={(e) => setForm({ ...form, clientRole: e.target.value })}
                      placeholder="Düzenleyen / Müşteri"
                      className="mt-0.5 h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 5. İş Profili Boyutları */}
            <div className="space-y-2 rounded-xl border p-3 bg-muted/20">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("editions.profileDimensionsLabel")}
              </Label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {/* Kitle */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Kitle Ölçeği</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, scale: "INDIVIDUAL" })}
                      className={cn(
                        "flex-1 rounded border py-1 text-[11px]",
                        form.scale === "INDIVIDUAL" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t("editions.scaleIndividual")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, scale: "GROUP" })}
                      className={cn(
                        "flex-1 rounded border py-1 text-[11px]",
                        form.scale === "GROUP" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t("editions.scaleGroup")}
                    </button>
                  </div>
                </div>

                {/* Hizmet */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Hizmet Seviyesi</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, tier: "STANDARD" })}
                      className={cn(
                        "flex-1 rounded border py-1 text-[11px]",
                        form.tier === "STANDARD" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t("editions.tierStandard")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, tier: "VIP" })}
                      className={cn(
                        "flex-1 rounded border py-1 text-[11px]",
                        form.tier === "VIP" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t("editions.tierVip")}
                    </button>
                  </div>
                </div>

                {/* Erişim */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Erişim Tipi</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, access: "PUBLIC" })}
                      className={cn(
                        "flex-1 rounded border py-1 text-[11px]",
                        form.access === "PUBLIC" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t("editions.accessPublic")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, access: "PRIVATE" })}
                      className={cn(
                        "flex-1 rounded border py-1 text-[11px]",
                        form.access === "PRIVATE" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {t("editions.accessPrivate")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Yetenekler & Modüller */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("editions.capabilitiesLabel")} ({selectedCaps.length}/{CAPABILITIES.length})
                </Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => setSelectedCaps(CAPABILITIES.map((c) => c.key))}
                  >
                    Tümü
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => setSelectedCaps([])}
                  >
                    Temizle
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => setSelectedCaps(TEMPLATES[form.template] ?? [])}
                  >
                    Şablon Önerisi
                  </Button>
                </div>
              </div>

              <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2 maven-scroll">
                {CAPABILITIES.map((cap) => {
                  const checked = selectedCaps.includes(cap.key);
                  const suggested = (TEMPLATES[form.template] ?? []).includes(cap.key);
                  return (
                    <button
                      key={cap.key}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleCapSelected(cap.key)}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2 text-left transition",
                        checked ? "border-primary bg-primary/5" : "hover:border-primary/30",
                        !checked && suggested && "border-dashed border-primary/40"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {checked && <Icons.Check className="size-2.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium leading-tight">
                          {cap.label}
                          {suggested && !checked ? (
                            <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                              (öneri)
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {cap.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 7. Departman & Ekip */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("editions.departmentLabel")}
              </Label>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
          >
            {t("editions.prevStep")}
          </Button>

          {step < 3 ? (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && !!wizardDateError}
            >
              {t("editions.nextStep")}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={create}
              disabled={busy || !form.seriesName || !!wizardDateError}
            >
              {busy ? t("editions.creating") : t("editions.createDraft")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
