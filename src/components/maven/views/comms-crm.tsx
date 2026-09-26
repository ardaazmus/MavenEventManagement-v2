"use client";
// ─── İLETİŞİM — MÜŞTERİ DATASI + ANLIK YAYIN (hiyerarşik iletişim yüzeyi) ────
// Kullanıcı talebi: üst firma, kendi organizasyonlarındaki kişi/kurum-kuruluş
// katılımcılardan müşteri datası üretmeli; bu havuza ve kampanya hedeflerine
// mail/SMS/WhatsApp'tan TEKİL veya TOPLU bildirim gönderebilmeli; anlık program
// değişiklikleri Etkinlik Öncesi/Sırası/Sonrası hiyerarşisinde arşivlenmeli.
// Manuel giriş ilkesi: havuza TEKİL EKLE her zaman mevcuttur (tek veri kaynağı yok).
import { useCallback, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SectionCard, EmptyState, Loading, ErrorState, Chip } from "@/components/maven/bits";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { apiGet, apiSend, listEntity } from "@/lib/client";
import { cn } from "@/lib/utils";
import { CAMPAIGN_PHASE } from "@/lib/constants";

// ─── tipler ─────────────────────────────────────────────────────────────────
export interface CustomerRow {
  id: string; tenantId: string; displayName: string;
  email: string | null; phone: string | null; company: string | null; title: string | null;
  city: string | null; country: string | null; category: string | null;
  kind: string; source: string; tags: string | null; notes: string | null; commsOptIn: boolean;
  lastEmailAt: string | null; lastSmsAt: string | null; lastWhatsAppAt: string | null;
  createdAt: string;
  sourceEdition?: { name: string } | null;
}

interface CategoryLite { id: string; name: string; code: string | null }

export const BROADCAST_CHANNEL_LIST = [
  { key: "EMAIL", icon: Icons.Mail, tone: "text-teal-600" },
  { key: "SMS", icon: Icons.Smartphone, tone: "text-sky-600" },
  { key: "WHATSAPP", icon: Icons.MessageCircle, tone: "text-emerald-600" },
] as const;

export interface SendReportLite {
  at?: string; mode?: string; audienceSize?: number; totalSent?: number;
  channels?: Partial<Record<string, { attempted: number; sent: number; skipped: number; error?: string }>>;
}

export function parseSendReport(json: string | null | undefined): SendReportLite | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SendReportLite;
  } catch {
    return null;
  }
}

// ortak kanal seçim kutusu — kampanya + anlık yayın paylaşıır
export function ChannelsChecklist({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useLang();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {BROADCAST_CHANNEL_LIST.map((ch) => {
        const active = value.includes(ch.key);
        return (
          <label
            key={ch.key}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition",
              active ? "border-teal-400 bg-teal-50/60 dark:bg-teal-900/20" : "bg-muted/20 hover:bg-muted/40",
            )}
          >
            <Checkbox checked={active} onCheckedChange={(v) => onChange(v ? [...value, ch.key] : value.filter((x) => x !== ch.key))} aria-label={t(`commsCrm.ch_${ch.key}`)} />
            <ch.icon className={cn("size-3.5", ch.tone)} aria-hidden />
            {t(`commsCrm.ch_${ch.key}`)}
          </label>
        );
      })}
    </div>
  );
}

// ─── MÜŞTERİ DATASI KARTI ───────────────────────────────────────────────────
export function CustomerDataCard({ onContactsChanged }: { onContactsChanged?: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { tenant, currentEditionId, bump } = useApp();

  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<CustomerRow | null>(null);

  const load = useCallback(async () => {
    if (!tenant) return;
    setBusy(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ tenantId: tenant.id, limit: "200" });
      if (q.trim()) sp.set("q", q.trim());
      if (tagFilter.trim()) sp.set("tag", tagFilter.trim());
      const d = await apiGet<{ items: CustomerRow[] }>(`/api/customer-contacts?${sp.toString()}`);
      setRows(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("commsCrm.customer.loadFail"));
    } finally {
      setBusy(false);
    }
  }, [tenant, q, tagFilter, t]);

  useCallback(() => { void load(); }, [load]);

  // ilk yükleme + tenant değişimi
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (tenant && !loadedOnce) {
    setLoadedOnce(true);
    void load();
  }

  const reload = () => { void load(); onContactsChanged?.(); };

  const stats = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      email: r.filter((x) => x.email).length,
      phone: r.filter((x) => x.phone).length,
      optIn: r.filter((x) => x.commsOptIn).length,
    };
  }, [rows]);

  const exportHref = useMemo(() => {
    if (!tenant) return "";
    const sp = new URLSearchParams({ tenantId: tenant.id });
    if (tagFilter.trim()) sp.set("tag", tagFilter.trim());
    if (q.trim()) sp.set("q", q.trim());
    if (currentEditionId) sp.set("editionId", currentEditionId);
    return `/api/customer-contacts/export?${sp.toString()}`;
  }, [tenant, q, tagFilter, currentEditionId]);

  const sourceChip = (s: string): string =>
    s === "PARTICIPANT_IMPORT" ? t("commsCrm.customer.srcParticipant")
    : s === "MANUAL" ? t("commsCrm.customer.srcManual")
    : s === "FORM" ? t("commsCrm.customer.srcForm")
    : t("commsCrm.customer.srcImport");

  return (
    <SectionCard
      title={t("commsCrm.customer.title")}
      desc={t("commsCrm.customer.desc")}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={!currentEditionId} title={currentEditionId ? undefined : t("commsCrm.customer.needEdition")}>
            <Icons.UserPlus className="size-3.5" /> {t("commsCrm.customer.importBtn")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Icons.UserRoundPlus className="size-3.5" /> {t("commsCrm.customer.add")}
          </Button>
          <Button size="sm" variant="ghost" disabled={!exportHref} onClick={() => { if (exportHref) { window.location.href = exportHref; toast({ title: t("commsCrm.customer.exportStarted") }); } }}>
            <Icons.FileDown className="size-3.5" /> {t("commsCrm.customer.exportBtn")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* kapsam özeti — hiyerarşik kapsam durum çipleri */}
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="teal">{t("commsCrm.customer.statTotal", { count: stats.total })}</Chip>
          <Chip>{t("commsCrm.customer.statEmail", { count: stats.email })}</Chip>
          <Chip>{t("commsCrm.customer.statPhone", { count: stats.phone })}</Chip>
          <Chip tone="emerald">{t("commsCrm.customer.statOptIn", { count: stats.optIn })}</Chip>
        </div>

        {/* arama + etiket filtresi */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icons.Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("commsCrm.customer.searchPh")} className="h-8 w-56 pl-8 text-xs" aria-label={t("commsCrm.customer.searchPh")} />
          </div>
          <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder={t("commsCrm.customer.tagPh")} className="h-8 w-40 text-xs" aria-label={t("commsCrm.customer.tagPh")} />
          <Button size="sm" variant="outline" className="h-8" onClick={() => void load()} disabled={busy}>
            {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Search className="size-3.5" />} {t("commsCrm.customer.filterBtn")}
          </Button>
        </div>

        {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? (
          <Loading rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState title={t("commsCrm.customer.empty")} desc={t("commsCrm.customer.emptyDesc")} />
        ) : (
          <div className="maven-scroll max-h-96 space-y-1.5 overflow-y-auto" role="list" aria-label={t("commsCrm.customer.title")}>
            {rows.map((c) => (
              <div key={c.id} role="listitem" className="animate-in fade-in slide-in-from-left-1 rounded-lg border bg-card px-3 py-2.5 transition hover:border-teal-300 hover:bg-teal-50/30 motion-reduce:animate-none">
                <div className="flex flex-wrap items-center gap-2">
                  {c.kind === "ORGANIZATION" ? <Icons.Building2 className="size-3.5 shrink-0 text-violet-600" /> : <Icons.User className="size-3.5 shrink-0 text-teal-600" />}
                  <span className="text-xs font-semibold">{c.displayName}</span>
                  {c.category && <Chip>{c.category}</Chip>}
                  <Chip tone={c.source === "PARTICIPANT_IMPORT" ? "teal" : "neutral"}>{sourceChip(c.source)}</Chip>
                  {!c.commsOptIn && <Chip tone="rose">{t("commsCrm.customer.optOut")}</Chip>}
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 gap-1 border-teal-300 bg-teal-50 px-2 text-[11px] text-teal-800 hover:bg-teal-100 hover:text-teal-900" onClick={() => setSendTarget(c)} title={t("commsCrm.customer.sendSingleTitle")}>
                      <Icons.Send className="size-3" /> {t("commsCrm.customer.sendSingle")}
                    </Button>
                  </div>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  {c.company && <span className="flex items-center gap-1"><Icons.Building className="size-3" aria-hidden />{c.company}</span>}
                  {c.email && <span className="flex items-center gap-1"><Icons.Mail className="size-3" aria-hidden />{c.email}</span>}
                  {c.phone && <span className="flex items-center gap-1"><Icons.Phone className="size-3" aria-hidden />{c.phone}</span>}
                  {c.city && <span>{c.city}{c.country ? `, ${c.country}` : ""}</span>}
                  {c.sourceEdition?.name && <span className="flex items-center gap-1"><Icons.CalendarDays className="size-3" aria-hidden />{c.sourceEdition.name}</span>}
                  {c.tags && <span className="flex items-center gap-1"><Icons.Tags className="size-3" aria-hidden />{c.tags}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* tekil ekle diyaloğu — manuel giriş ilkesi */}
      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onSaved={reload} />

      {/* katılımcılardan aktarım diyaloğu */}
      <ImportParticipantsDialog open={importOpen} onOpenChange={setImportOpen} onImported={reload} />

      {/* tekil gönderim diyaloğu */}
      <SingleSendDialog target={sendTarget} onOpenChange={(o) => { if (!o) setSendTarget(null); }} onSent={() => { reload(); bump(); }} />
    </SectionCard>
  );
}

// ─── TEKİL EKLE (manuel giriş) ──────────────────────────────────────────────
const emptyAddForm = { displayName: "", kind: "PERSON", email: "", phone: "", company: "", title: "", city: "", tags: "", notes: "", commsOptIn: true };

function AddContactDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { tenant } = useApp();
  const [form, setForm] = useState(emptyAddForm);
  const [busy, setBusy] = useState(false);
  const invalid = !form.displayName.trim() || (!form.email.trim() && !form.phone.trim());

  const save = async () => {
    if (!tenant || invalid) return;
    setBusy(true);
    try {
      await apiSend("/api/customer-contacts", "POST", { tenantId: tenant.id, ...form });
      toast({ title: t("commsCrm.customer.created"), description: t("commsCrm.customer.createdDesc", { name: form.displayName.trim() }) });
      setForm(emptyAddForm);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: t("commsCrm.customer.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
        <DialogHeader>
          <DialogTitle>{t("commsCrm.customer.manualTitle")}</DialogTitle>
          <DialogDescription>{t("commsCrm.customer.manualDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-display">{t("commsCrm.customer.fDisplay")}</Label>
              <Input id="cc-display" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="h-8 text-xs" aria-required="true" aria-invalid={!form.displayName.trim() || undefined} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-kind">{t("commsCrm.customer.fKind")}</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger id="cc-kind" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSON">{t("commsCrm.customer.kindPerson")}</SelectItem>
                  <SelectItem value="ORGANIZATION">{t("commsCrm.customer.kindOrg")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-email">{t("commsCrm.customer.fEmail")}</Label>
              <Input id="cc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-xs" placeholder="ayse@firma.com" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-phone">{t("commsCrm.customer.fPhone")}</Label>
              <Input id="cc-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" placeholder="+90555…" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-company">{t("commsCrm.customer.fCompany")}</Label>
              <Input id="cc-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-title">{t("commsCrm.customer.fTitle")}</Label>
              <Input id="cc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-city">{t("commsCrm.customer.fCity")}</Label>
              <Input id="cc-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="cc-tags">{t("commsCrm.customer.fTags")}</Label>
              <Input id="cc-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="h-8 text-xs" placeholder={t("commsCrm.customer.fTagsPh")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cc-notes">{t("commsCrm.customer.fNotes")}</Label>
            <Textarea id="cc-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-xs" />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-xs font-medium">{t("commsCrm.customer.fOptIn")}</p>
              <p className="text-[10px] text-muted-foreground">{t("commsCrm.customer.fOptInHint")}</p>
            </div>
            <Switch checked={form.commsOptIn} onCheckedChange={(v) => setForm({ ...form, commsOptIn: v })} aria-label={t("commsCrm.customer.fOptIn")} />
          </div>
          {invalid && <p role="alert" className="text-[11px] font-medium text-rose-600">{t("commsCrm.customer.needContact")}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void save()} disabled={busy || invalid} aria-disabled={busy || invalid}>
            {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Save className="size-3.5" />} {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KATILIMCILARDAN AKTAR (toplu üretim) ───────────────────────────────────
function ImportParticipantsDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (o: boolean) => void; onImported: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { currentEditionId } = useApp();
  const [tag, setTag] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; merged: number; skipped: number; total: number } | null>(null);

  const loadCategories = useCallback(async () => {
    if (!currentEditionId) return [];
    try {
      return await listEntity<CategoryLite>("registration-categories", { editionId: currentEditionId, limit: 100 });
    } catch {
      return [];
    }
  }, [currentEditionId]);

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  if (open && categories.length === 0) {
    void loadCategories().then(setCategories);
  }

  const run = async () => {
    if (!currentEditionId) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await apiSend<{ created: number; merged: number; skipped: number; total: number }>(
        "/api/customer-contacts/import-participants", "POST",
        { editionId: currentEditionId, tag: tag.trim() || undefined, categoryIds: categoryIds.length ? categoryIds : undefined },
      );
      setResult(r);
      toast({ title: t("commsCrm.customer.importDone"), description: t("commsCrm.customer.importDoneDesc", { created: r.created, merged: r.merged, skipped: r.skipped }) });
      onImported();
    } catch (e) {
      toast({ title: t("commsCrm.customer.importFail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setResult(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
        <DialogHeader>
          <DialogTitle>{t("commsCrm.customer.importTitle")}</DialogTitle>
          <DialogDescription>{t("commsCrm.customer.importDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cc-imp-tag">{t("commsCrm.customer.importTag")}</Label>
            <Input id="cc-imp-tag" value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 text-xs" placeholder={t("commsCrm.customer.importTagPh")} />
            <p className="text-[10px] text-muted-foreground">{t("commsCrm.customer.importTagHint")}</p>
          </div>
          {categories.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">{t("commsCrm.customer.importCategories")}</Label>
              <div className="grid max-h-32 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 maven-scroll">
                {categories.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox checked={categoryIds.includes(c.id)} onCheckedChange={(v) => setCategoryIds((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))} aria-label={c.name} />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{t("commsCrm.customer.importCategoriesHint")}</p>
            </div>
          )}
          <p className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-[11px] text-muted-foreground">{t("commsCrm.customer.importNote")}</p>
          {result && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-900/20"><p className="text-base font-semibold tabular-nums">{result.created}</p><p className="text-muted-foreground">{t("commsCrm.customer.resCreated")}</p></div>
              <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-900/20"><p className="text-base font-semibold tabular-nums">{result.merged}</p><p className="text-muted-foreground">{t("commsCrm.customer.resMerged")}</p></div>
              <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-900/20"><p className="text-base font-semibold tabular-nums">{result.skipped}</p><p className="text-muted-foreground">{t("commsCrm.customer.resSkipped")}</p></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.UserPlus className="size-3.5" />} {busy ? t("commsCrm.customer.importing") : t("commsCrm.customer.importRun")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── TEKİL GÖNDERİM (tek kontak) ────────────────────────────────────────────
function SingleSendDialog({ target, onOpenChange, onSent }: { target: CustomerRow | null; onOpenChange: (o: boolean) => void; onSent: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { currentEditionId } = useApp();
  const [channels, setChannels] = useState<string[]>(["EMAIL"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  if (!target) return null;
  const canSend = title.trim() && body.trim() && channels.length > 0;

  const send = async () => {
    if (!currentEditionId || !target || !canSend) return;
    setBusy(true);
    try {
      const r = await apiSend<SendReportLite>("/api/notifications/instant", "POST", {
        editionId: currentEditionId,
        phase: "DURING_EVENT",
        title: title.trim(),
        body: body.trim(),
        channels,
        audienceMode: "SINGLE",
        single: { name: target.displayName, email: target.email, phone: target.phone },
      });
      toast({
        title: t("commsCrm.instant.sentTitle"),
        description: t("commsCrm.instant.sentDesc", { total: r.totalSent ?? 0 }),
      });
      setTitle("");
      setBody("");
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast({ title: t("commsCrm.instant.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg maven-scroll">
        <DialogHeader>
          <DialogTitle>{t("commsCrm.customer.sendTitle", { name: target.displayName })}</DialogTitle>
          <DialogDescription>{t("commsCrm.customer.sendDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            {target.email && <span className="flex items-center gap-1"><Icons.Mail className="size-3" aria-hidden />{target.email}</span>}
            {target.phone && <span className="flex items-center gap-1"><Icons.Phone className="size-3" aria-hidden />{target.phone}</span>}
            {!target.email && !target.phone && <span>{t("commsCrm.customer.needContact")}</span>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("commsCrm.instant.fChannels")}</Label>
            <ChannelsChecklist value={channels} onChange={setChannels} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cc-send-title">{t("commsCrm.instant.fTitle")}</Label>
            <Input id="cc-send-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" aria-required="true" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="cc-send-body">{t("commsCrm.instant.fBody")}</Label>
            <Textarea id="cc-send-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="text-xs" aria-required="true" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void send()} disabled={busy || !canSend} aria-disabled={busy || !canSend}>
            {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Send className="size-3.5" />} {busy ? t("commsCrm.instant.sending") : t("commsCrm.instant.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ANLIK YAYIN DİYALOĞU (program değişikliği vb. — tek/toplu) ─────────────
const INSTANT_AUDIENCES = [
  { key: "ALL_PARTICIPANTS", icon: Icons.Users },
  { key: "CATEGORY", icon: Icons.ListFilter },
  { key: "CUSTOMERS", icon: Icons.Database },
  { key: "CUSTOM", icon: Icons.ClipboardList },
  { key: "SINGLE", icon: Icons.User },
] as const;

export function InstantBroadcastDialog({ open, onOpenChange, onSent }: { open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { currentEditionId } = useApp();

  const [phase, setPhase] = useState("DURING_EVENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<string[]>(["EMAIL"]);
  const [audienceMode, setAudienceMode] = useState<string>("ALL_PARTICIPANTS");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [customRecipients, setCustomRecipients] = useState("");
  const [single, setSingle] = useState({ name: "", email: "", phone: "" });
  const [portal, setPortal] = useState(false);
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const loadCategories = useCallback(async () => {
    if (!currentEditionId) return;
    try {
      setCategories(await listEntity<CategoryLite>("registration-categories", { editionId: currentEditionId, limit: 100 }));
    } catch { /* kategori listesi opsiyonel */ }
  }, [currentEditionId]);

  if (open && categories.length === 0) void loadCategories();

  const audienceInvalid =
    (audienceMode === "CUSTOM" && !customRecipients.trim()) ||
    (audienceMode === "SINGLE" && !single.email.trim() && !single.phone.trim()) ||
    (audienceMode === "CATEGORY" && categories.length > 0 && categoryIds.length === 0);
  const canSend = Boolean(currentEditionId) && title.trim() && body.trim() && channels.length > 0 && !audienceInvalid;

  const send = async () => {
    if (!currentEditionId || !canSend) return;
    setBusy(true);
    try {
      const r = await apiSend<{ report: SendReportLite; campaignId: string }>("/api/notifications/instant", "POST", {
        editionId: currentEditionId,
        phase,
        title: title.trim(),
        body: body.trim(),
        channels,
        audienceMode,
        categoryIds: audienceMode === "CATEGORY" ? categoryIds : undefined,
        customRecipients: audienceMode === "CUSTOM" ? customRecipients : undefined,
        single: audienceMode === "SINGLE" ? single : undefined,
        createPortalAnnouncement: portal,
      });
      const rep = r.report;
      const detail = Object.entries(rep.channels ?? {})
        .filter(([, v]) => (v?.sent ?? 0) > 0)
        .map(([k, v]) => `${t(`commsCrm.ch_${k}`)}: ${v?.sent}`)
        .join(" · ");
      toast({
        title: t("commsCrm.instant.sentTitle"),
        description: detail || t("commsCrm.instant.sentDesc", { total: rep.totalSent ?? 0 }),
      });
      setTitle("");
      setBody("");
      setCustomRecipients("");
      setSingle({ name: "", email: "", phone: "" });
      setCategoryIds([]);
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast({ title: t("commsCrm.instant.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl maven-scroll">
        <DialogHeader>
          <DialogTitle>{t("commsCrm.instant.title")}</DialogTitle>
          <DialogDescription>{t("commsCrm.instant.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="ib-phase">{t("commsCrm.instant.fPhase")}</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger id="ib-phase" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAMPAIGN_PHASE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="ib-aud">{t("commsCrm.instant.fAudience")}</Label>
              <Select value={audienceMode} onValueChange={setAudienceMode}>
                <SelectTrigger id="ib-aud" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSTANT_AUDIENCES.map((a) => <SelectItem key={a.key} value={a.key}>{t(`commsCrm.instant.aud_${a.key}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {audienceMode === "CATEGORY" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("commsCrm.instant.fCategories")}</Label>
              {categories.length === 0 ? <p className="text-[11px] text-muted-foreground">{t("commsCrm.instant.noCategories")}</p> : (
                <div className="grid max-h-28 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 maven-scroll">
                  {categories.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={categoryIds.includes(c.id)} onCheckedChange={(v) => setCategoryIds((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))} aria-label={c.name} />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {audienceMode === "CUSTOM" && (
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="ib-custom">{t("commsCrm.instant.fCustomList")}</Label>
              <Textarea id="ib-custom" value={customRecipients} onChange={(e) => setCustomRecipients(e.target.value)} rows={3} className="text-xs" placeholder={t("commsCrm.instant.fCustomPh")} />
              <p className="text-[10px] text-muted-foreground">{t("commsCrm.instant.customHint")}</p>
            </div>
          )}
          {audienceMode === "SINGLE" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="ib-s-name">{t("commsCrm.instant.fSingleName")}</Label>
                <Input id="ib-s-name" value={single.name} onChange={(e) => setSingle({ ...single, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="ib-s-email">{t("commsCrm.customer.fEmail")}</Label>
                <Input id="ib-s-email" type="email" value={single.email} onChange={(e) => setSingle({ ...single, email: e.target.value })} className="h-8 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="ib-s-phone">{t("commsCrm.customer.fPhone")}</Label>
                <Input id="ib-s-phone" value={single.phone} onChange={(e) => setSingle({ ...single, phone: e.target.value })} className="h-8 text-xs" dir="ltr" />
              </div>
            </div>
          )}
          {audienceInvalid && <p role="alert" className="text-[11px] font-medium text-rose-600">{t("commsCrm.instant.audInvalid")}</p>}

          <div className="space-y-1.5">
            <Label className="text-xs">{t("commsCrm.instant.fChannels")}</Label>
            <ChannelsChecklist value={channels} onChange={setChannels} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ib-title">{t("commsCrm.instant.fTitle")}</Label>
            <Input id="ib-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" placeholder={t("commsCrm.instant.fTitlePh")} aria-required="true" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="ib-body">{t("commsCrm.instant.fBody")}</Label>
            <Textarea id="ib-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="text-xs" placeholder={t("commsCrm.instant.fBodyPh")} aria-required="true" />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-xs font-medium">{t("commsCrm.instant.fPortal")}</p>
              <p className="text-[10px] text-muted-foreground">{t("commsCrm.instant.fPortalHint")}</p>
            </div>
            <Switch checked={portal} onCheckedChange={setPortal} aria-label={t("commsCrm.instant.fPortal")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void send()} disabled={busy || !canSend} aria-disabled={busy || !canSend}>
            {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Zap className="size-3.5" />} {busy ? t("commsCrm.instant.sending") : t("commsCrm.instant.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
