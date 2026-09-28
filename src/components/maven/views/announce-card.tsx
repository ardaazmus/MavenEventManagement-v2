"use client";
// H-11: Şirket duyuruları yönetim kartı (Ayarlar → GRUP 1).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { apiGet, apiSend } from "@/lib/client";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, Chip } from "../bits";
import * as Icons from "lucide-react";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: Omit<Announcement, "id"> = {
  title: "",
  body: "",
  imageUrl: null,
  linkUrl: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
  sortOrder: 0,
};

export function AnnounceAdminCard() {
  const { t } = useLang();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const listApi = useApi<{ items: Announcement[] }>(() => apiGet("/api/announcements?activeOnly=0"), []);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await apiSend(`/api/announcements/${id}`, "DELETE");
      toast({ title: t("announce.deleted") });
      listApi.reload();
    } catch (e) {
      toast({ title: t("announce.deleteFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title={t("announce.title")}
      desc={t("announce.desc")}
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Icons.Plus className="size-3.5" /> {t("announce.new")}
        </Button>
      }
    >
      {listApi.loading && <Loading rows={2} />}
      {listApi.error && <ErrorState message={listApi.error} onRetry={listApi.reload} />}
      {listApi.data && listApi.data.items.length === 0 && <EmptyState title={t("announce.empty")} />}
      {listApi.data && listApi.data.items.length > 0 && (
        <div className="space-y-2">
          {listApi.data.items.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-foreground">{a.title}</p>
                  <Chip tone={a.isActive ? "emerald" : "neutral"}>{a.isActive ? t("announce.active") : t("announce.passive")}</Chip>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{a.body}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditing(a)}>
                  {t("announce.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] text-destructive"
                  disabled={busy === a.id}
                  onClick={() => remove(a.id)}
                >
                  {t("announce.delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnnounceDialog
        value={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onDone={() => {
          setEditing(null);
          listApi.reload();
        }}
      />
    </SectionCard>
  );
}

function AnnounceDialog({ value, onOpenChange, onDone }: {
  value: Announcement | "new" | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [form, setForm] = useState<Omit<Announcement, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const open = value !== null;
  const isNew = value === "new";

  // Dialog her açılışta formu sıfırlar (senkron effect-setState yok: key ile).
  const seed: Omit<Announcement, "id"> =
    value === null || value === "new"
      ? EMPTY
      : {
          title: value.title,
          body: value.body,
          imageUrl: value.imageUrl,
          linkUrl: value.linkUrl,
          startsAt: value.startsAt,
          endsAt: value.endsAt,
          isActive: value.isActive,
          sortOrder: value.sortOrder,
        };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        imageUrl: form.imageUrl || null,
        linkUrl: form.linkUrl || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      };
      if (isNew) {
        await apiSend("/api/announcements", "POST", payload);
      } else {
        await apiSend(`/api/announcements/${(value as Announcement).id}`, "PUT", payload);
      }
      toast({ title: t("announce.saved") });
      onDone();
    } catch (e) {
      toast({ title: t("announce.saveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setForm(seed);
          setFormKey((n) => n + 1);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent key={formKey} className="max-w-lg text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {isNew ? t("announce.newTitle") : t("announce.editTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t("announce.fTitle")}</Label>
            <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("announce.fBody")}</Label>
            <Textarea value={form.body} maxLength={2000} rows={3} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("announce.fImage")}</Label>
              <Input value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value || null })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("announce.fLink")}</Label>
              <Input value={form.linkUrl ?? ""} onChange={(e) => setForm({ ...form, linkUrl: e.target.value || null })} />
            </div>
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("announce.fStart")}</Label>
              <Input
                type="date"
                value={form.startsAt ? form.startsAt.slice(0, 10) : ""}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("announce.fEnd")}</Label>
              <Input
                type="date"
                value={form.endsAt ? form.endsAt.slice(0, 10) : ""}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value || null })}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
              {t("announce.fActive")}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving || !form.title.trim() || !form.body.trim()}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Dashboard portföy şeridi: yayındaki duyurular.
export function AnnounceStrip() {
  const { t } = useLang();
  const { data } = useApi<{ items: Announcement[] }>(() => apiGet("/api/announcements"), []);
  if (!data || data.items.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.items.slice(0, 6).map((a) => (
        <div key={a.id} className="flex gap-3 rounded-xl border bg-card p-3 shadow-sm">
          {a.imageUrl ? (
            <img src={a.imageUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icons.Megaphone className="size-5 text-primary" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{a.title}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{a.body}</p>
            {a.linkUrl && (
              <a href={a.linkUrl} className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">
                {t("announce.more")}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
