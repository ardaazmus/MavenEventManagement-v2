"use client";
// H-10: Dışa aktarma merkezi — şirket snapshot + etkinlik çıktıları toplu erişim.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { SectionCard } from "../bits";
import * as Icons from "lucide-react";

export function ExportHubCard() {
  const { t } = useLang();
  const { toast } = useToast();
  const { currentEditionId } = useApp();
  const [busy, setBusy] = useState(false);

  // QA: tüm indirmeler fetch+blob — düz <a> tıklamasında sunucu hatası ham JSON
  // sayfasına yönlendiriyordu (uygulamadan çıkış + hata görünmezdi).
  const downloadFile = async (href: string, fallbackName: string) => {
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("exportHub.failed"));
      }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: t("exportHub.done") });
    } catch (e) {
      toast({ title: t("exportHub.failed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const downloadSnapshot = () => downloadFile("/api/export/company-snapshot", "company-snapshot.json");

  const editionLinks = currentEditionId
    ? [
        { href: `/api/registrations/export?editionId=${currentEditionId}`, label: t("exportHub.regExport"), file: "kayitlar.xlsx" },
        { href: `/api/reservations/export?editionId=${currentEditionId}`, label: t("exportHub.resExport"), file: "rezervasyonlar.xlsx" },
        { href: `/api/customer-contacts/export?editionId=${currentEditionId}`, label: t("exportHub.ccExport"), file: "musteri-datasi.xlsx" },
        { href: `/api/media/export?editionId=${currentEditionId}`, label: t("exportHub.mediaExport"), file: "medya-arsivi.zip" },
      ]
    : [];

  return (
    <SectionCard
      title={t("exportHub.title")}
      desc={t("exportHub.desc")}
      action={
        <Button size="sm" onClick={downloadSnapshot} disabled={busy}>
          <Icons.Download className="size-3.5" /> {busy ? t("common.saving") : t("exportHub.snapshot")}
        </Button>
      }
    >
      {editionLinks.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("exportHub.noEdition")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {editionLinks.map((l) => (
            <button
              key={l.href}
              type="button"
              onClick={() => downloadFile(l.href, l.file)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs text-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              <Icons.FileDown className="size-3.5 text-primary" /> {l.label}
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
