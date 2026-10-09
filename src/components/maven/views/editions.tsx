"use client";
// Etkinlikler ve İş Portföyü — JobsView, Setup Checklist ve NewWorkWizard entegrasyonu
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { SetupChecklistCard } from "./setup-checklist-card";
import { JobsView } from "./jobs-view";
import { NewWorkWizard } from "../forms/new-work-wizard";
import type { SetupChecklistResult } from "@/lib/events/setup-checklist";

export function EditionsView() {
  const { tenant, currentEditionId, setModule, bootstrap, editionWizardNonce, moduleSubView } = useApp();
  const { toast } = useToast();
  const { t } = useLang();
  const [createOpen, setCreateOpen] = useState(false);
  // ONBOARD-1: sıfır-tenant girişi — needOrg=true iken sihirbaz yerine org paneli
  const [orgName, setOrgName] = useState("");
  const [needOrg, setNeedOrg] = useState<boolean | null>(null);
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<SetupChecklistResult | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);

  const fetchChecklist = async (editionId: string) => {
    setChecklistLoading(true);
    try {
      const res = await fetch(`/api/editions/${editionId}/setup-checklist`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setChecklist(data.checklist ?? null);
      }
    } catch {
      // sessizce geç
    } finally {
      setChecklistLoading(false);
    }
  };

  useEffect(() => {
    if (!currentEditionId) {
      const id = requestAnimationFrame(() => setChecklist(null));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    fetch(`/api/editions/${currentEditionId}/setup-checklist`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.checklist) setChecklist(d.checklist);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentEditionId]);

  // Kabuk CTA köprüsü: mount'ta nonce>0 ise sihirbazı aç (ensure sonrası akış)
  // H-13 kalıbı: senkron setState yerine rAF geri-çağrısı (kademeli render yok).
  useEffect(() => {
    if (editionWizardNonce <= 0) return;
    const id = requestAnimationFrame(() => setCreateOpen(true));
    return () => cancelAnimationFrame(id);
  }, [editionWizardNonce]);

  // Sihirbaz açılışında kiracı probu — yoksa org paneli (adım cerrahisi yok)
  useEffect(() => {
    if (!createOpen) return;
    if (tenant) {
      const id = requestAnimationFrame(() => setNeedOrg(false));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    fetch("/api/bootstrap", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setNeedOrg(!d?.tenant); })
      .catch(() => { if (!cancelled) setNeedOrg(false); });
    return () => { cancelled = true; };
  }, [createOpen, tenant]);

  const ensureOrg = async () => {
    const name = orgName.trim();
    if (!name || orgBusy) return;
    setOrgBusy(true);
    setOrgError(null);
    try {
      const res = await fetch("/api/tenant/ensure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kuruluş oluşturulamadı");
      setNeedOrg(false);
      await bootstrap();
      toast({ title: data.name ?? name, description: t("editions.orgCreated") });
    } catch (e) {
      setOrgError(e instanceof Error ? e.message : "Hata");
    } finally {
      setOrgBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {currentEditionId && (
        <SetupChecklistCard
          checklist={checklist}
          loading={checklistLoading}
          onRefresh={() => currentEditionId && void fetchChecklist(currentEditionId)}
          onNavigateModule={(mod) => setModule(mod)}
        />
      )}

      <JobsView initialFilter={moduleSubView ?? "all"} />

      {/* ONBOARD-1: sıfır-tenant org paneli — ayrı diyalog, sihirbaz arkasında hazır bekler */}
      <Dialog open={createOpen && needOrg === true} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icons.Building2 className="size-4 text-primary" /> {t("editions.orgTitle")}
            </DialogTitle>
            <DialogDescription>{t("editions.orgDesc")}</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="editions-org-name">{t("editions.orgNameLabel")}</Label>
            <Input id="editions-org-name" value={orgName} onChange={(ev) => setOrgName(ev.target.value)}
              placeholder={t("editions.orgNamePh")} className="mt-1"
              onKeyDown={(ev) => { if (ev.key === "Enter") ensureOrg(); }} />
          </div>
          {orgError && (
            <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
              {orgError}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={orgBusy} onClick={() => setCreateOpen(false)}>{t("editions.orgCancel")}</Button>
            <Button disabled={orgBusy || !orgName.trim()} onClick={ensureOrg}>
              {orgBusy ? t("editions.orgCreating") : t("editions.orgContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kurulum sihirbazı — Faz 4: NewWorkWizard */}
      <NewWorkWizard
        open={createOpen && needOrg !== true}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          if (id) void fetchChecklist(id);
        }}
      />
    </div>
  );
}
