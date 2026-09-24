"use client";
// Uyumluluk (TASK-B 18-19-20) — KVKK silme talepleri, yargı profili, belge sicili, rapor.
// Rapor yüzeyi KİŞİSEL VERİ İÇERMEZ (yalnız agregat sayımlar); silme talebi listesi iç operasyondur.
// Desen: bits.useApi + client.apiGet/apiSend + yerel apiPatch (apiSend PATCH kapsamaz — form-center deseni).
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, Chip, KpiCard } from "../bits";
import { fmtDate, fmtDateTime } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLang, t } from "@/lib/i18n";
import * as Icons from "lucide-react";

// ─── Tipler (API sözleşmeleri) ───────────────────────────────────────────────

interface ErasureRow {
  id: string;
  email: string;
  personId: string | null;
  status: string;
  note: string | null;
  rejectReason: string | null;
  requestedAt: string;
  dueAt: string;
  completedAt: string | null;
  handledBy: string | null;
  slaBreached: boolean;
  daysLeft: number | null;
}
interface ErasureList {
  items: ErasureRow[];
  swept: number;
  retentionNote: string;
}

interface JurisdictionProfile {
  id: string;
  jurisdiction: string;
  dsrSlaDays: number;
  breachWindowHours: number;
  opLogYears: number;
  consentVersion: string | null;
  cookieStrictness: string;
  dpoMode: boolean;
  transferMechanism: string;
  retentionNotes: string | null;
}

interface DocRow {
  id: string;
  kind: string;
  version: number;
  title: string;
  sha256: string;
  mediaAssetId: string | null;
  externalUrl: string | null;
  notes: string | null;
  active: boolean;
  supersededBy: string | null;
  createdBy: string | null;
  createdAt: string;
  asset: { id: string; name: string } | null;
}

interface ReportData {
  erasure: { total: number; pending: number; overdue: number; completed: number };
  consent: { personsWithConsent: number; commsOptInCount: number };
  documents: { total: number; active: number; byKind: { kind: string; count: number }[] };
  jurisdiction: {
    jurisdiction: string;
    dsrSlaDays: number;
    breachWindowHours: number;
    opLogYears: number;
    cookieStrictness: string;
    dpoMode: boolean;
    transferMechanism: string;
    consentVersion: string | null;
    retentionNotesSet: boolean;
  };
  generatedAt: string;
}

interface ProfileForm {
  jurisdiction: string;
  dsrSlaDays: string;
  breachWindowHours: string;
  opLogYears: string;
  cookieStrictness: string;
  transferMechanism: string;
  dpoMode: boolean;
  consentVersion: string;
  retentionNotes: string;
}

interface DocForm {
  kind: string;
  title: string;
  content: string;
  externalUrl: string;
  mediaAssetId: string;
  notes: string;
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

// apiSend PATCH kapsamaz (POST|PUT|DELETE) — yama uçları için yerel yardımcı (göreli yol)
async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? t("compliance.actionFailed"));
  return data as T;
}

// silme talebi durum tonları (KVKK özel — status.* eksenlerinden bağımsız)
const ERS_TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  VERIFIED: "bg-violet-50 text-violet-700 border-violet-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
};
const ERS_STATUS_KEY: Record<string, string> = {
  PENDING: "compliance.ersStatus.PENDING",
  VERIFIED: "compliance.ersStatus.VERIFIED",
  COMPLETED: "compliance.ersStatus.COMPLETED",
  REJECTED: "compliance.ersStatus.REJECTED",
};
const DOC_KIND_KEY: Record<string, string> = {
  AYDINLATMA: "compliance.docKind.AYDINLATMA",
  ACIK_RIZA: "compliance.docKind.ACIK_RIZA",
  VERI_SAKLAMA: "compliance.docKind.VERI_SAKLAMA",
  DST: "compliance.docKind.DST",
  KVKK_POLITIKA: "compliance.docKind.KVKK_POLITIKA",
  E_FATURA: "compliance.docKind.E_FATURA",
  VERBIS: "compliance.docKind.VERBIS",
  OTHER: "compliance.docKind.OTHER",
};
const DOC_KINDS = Object.keys(DOC_KIND_KEY);

const EMPTY_PROFILE_FORM: ProfileForm = {
  jurisdiction: "TR",
  dsrSlaDays: "30",
  breachWindowHours: "72",
  opLogYears: "3",
  cookieStrictness: "STRICT",
  transferMechanism: "BOARD_AUTHORIZATION",
  dpoMode: false,
  consentVersion: "",
  retentionNotes: "",
};

const EMPTY_DOC_FORM: DocForm = { kind: "AYDINLATMA", title: "", content: "", externalUrl: "", mediaAssetId: "", notes: "" };

const shaShort = (sha: string): string => (sha === "LINKED" ? t("compliance.docLinked") : `${sha.slice(0, 12)}…`);

function ToneBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {children}
    </span>
  );
}

const ersBadge = (status: string) => (
  <ToneBadge tone={ERS_TONE[status] ?? "bg-muted text-muted-foreground border-border"}>
    {ERS_STATUS_KEY[status] ? t(ERS_STATUS_KEY[status]) : status}
  </ToneBadge>
);

// ─── Sekme 1: Silme Talepleri ────────────────────────────────────────────────

function ErasureSection({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<ErasureRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, error, reload, loading } = useApi<ErasureList>(() => apiGet<ErasureList>("/api/kvkk/erasure"), [refreshKey]);
  const items = useMemo(() => data?.items ?? [], [data]);
  const openCount = items.filter((r) => r.status === "PENDING" || r.status === "VERIFIED").length;
  const overdueCount = items.filter((r) => r.slaBreached).length;
  const completedCount = items.filter((r) => r.status === "COMPLETED").length;

  const onDone = (title: string, desc: string) => {
    toast({ title, description: desc });
    reload();
  };
  const onFail = (err: unknown) => {
    toast({ title: t("compliance.actionFailedTitle"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
  };

  const act = async (row: ErasureRow, action: "verify" | "complete") => {
    setBusyId(row.id);
    try {
      await apiPatch("/api/kvkk/erasure", { id: row.id, action });
      onDone(
        action === "verify" ? t("compliance.ersVerifyOk") : t("compliance.ersCompleteOk"),
        action === "verify" ? t("compliance.ersVerifyOkDesc") : t("compliance.ersCompleteOkDesc"),
      );
    } catch (err) {
      onFail(err);
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    const reason = rejectReason.trim();
    if (reason.length < 10) {
      toast({ title: t("compliance.ersRejectTooShort"), variant: "destructive" });
      return;
    }
    setBusyId(rejectFor.id);
    try {
      await apiPatch("/api/kvkk/erasure", { id: rejectFor.id, action: "reject", rejectReason: reason });
      setRejectFor(null);
      setRejectReason("");
      onDone(t("compliance.ersRejectOk"), t("compliance.ersRejectOkDesc"));
    } catch (err) {
      onFail(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("compliance.ersKpiOpen")} value={openCount} icon={<Icons.Inbox className="size-4" />} tone="amber" />
        <KpiCard label={t("compliance.ersKpiOverdue")} value={overdueCount} icon={<Icons.AlarmClock className="size-4" />} tone="rose" />
        <KpiCard label={t("compliance.ersKpiCompleted")} value={completedCount} icon={<Icons.CheckCheck className="size-4" />} tone="emerald" />
        <KpiCard label={t("compliance.ersKpiTotal")} value={items.length} icon={<Icons.Files className="size-4" />} tone="teal" />
      </div>

      {data && data.swept > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          <Icons.History className="size-3.5 shrink-0" />
          {t("compliance.ersSwept", { n: data.swept })}
        </div>
      )}

      <SectionCard title={t("compliance.ersListTitle")} desc={t("compliance.ersListDesc")} bodyClass="p-0">
        {loading ? (
          <div className="p-4"><Loading rows={4} /></div>
        ) : error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : items.length === 0 ? (
          <div className="p-4"><EmptyState title={t("compliance.ersEmptyTitle")} desc={t("compliance.ersEmptyDesc")} /></div>
        ) : (
          <div className="maven-scroll max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("compliance.ersColEmail")}</TableHead>
                  <TableHead>{t("compliance.ersColRequested")}</TableHead>
                  <TableHead>{t("compliance.ersColDue")}</TableHead>
                  <TableHead>{t("compliance.ersColStatus")}</TableHead>
                  <TableHead className="text-right">{t("compliance.ersColActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} className={r.slaBreached ? "bg-rose-50/40" : undefined}>
                    <TableCell>
                      <p className="truncate font-medium" title={r.email}>{r.email}</p>
                      {r.rejectReason && (
                        <p className="mt-0.5 max-w-72 truncate text-[11px] text-rose-600" title={r.rejectReason}>
                          {t("compliance.ersLegalHold")}: {r.rejectReason}
                        </p>
                      )}
                      {r.note && !r.rejectReason && (
                        <p className="mt-0.5 max-w-72 truncate text-[11px] text-muted-foreground" title={r.note}>{r.note}</p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.requestedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <span className={r.slaBreached ? "font-medium text-rose-600" : "text-muted-foreground"}>{fmtDate(r.dueAt)}</span>
                      {r.status !== "COMPLETED" && r.status !== "REJECTED" && r.daysLeft !== null && (
                        <span className="ml-1.5">
                          {r.daysLeft >= 0 ? (
                            <Chip tone={r.daysLeft <= 7 ? "amber" : "neutral"}>{t("compliance.ersDaysLeft", { days: r.daysLeft })}</Chip>
                          ) : (
                            <Chip tone="rose">{t("compliance.ersOverdueChip")}</Chip>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ersBadge(r.status)}
                      {r.handledBy && <p className="mt-1 text-[11px] text-muted-foreground">{r.handledBy}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(r.status === "PENDING" || r.status === "VERIFIED") && (
                          <>
                            {r.status === "PENDING" && (
                              <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void act(r, "verify")}>
                                <Icons.UserCheck className="size-3.5" /> {t("compliance.ersBtnVerify")}
                              </Button>
                            )}
                            {r.status === "VERIFIED" && (
                              <Button size="sm" disabled={busyId === r.id} onClick={() => void act(r, "complete")}>
                                <Icons.CheckCheck className="size-3.5" /> {t("compliance.ersBtnComplete")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              disabled={busyId === r.id}
                              onClick={() => { setRejectFor(r); setRejectReason(""); }}
                            >
                              <Icons.Ban className="size-3.5" /> {t("compliance.ersBtnReject")}
                            </Button>
                          </>
                        )}
                        {r.status === "COMPLETED" && r.completedAt && (
                          <span className="text-[11px] text-muted-foreground">{fmtDate(r.completedAt)}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Icons.Lock className="mt-0.5 size-3 shrink-0" />
        <span><b>{t("compliance.ersRetentionLabel")}:</b> {data?.retentionNote ?? t("compliance.ersRetentionFallback")}</span>
      </p>

      {/* Reddetme — yasal saklama gerekçesi ZORUNLU (≥10 karakter; sunucu da doğrular) */}
      <Dialog open={rejectFor !== null} onOpenChange={(o) => { if (!o) setRejectFor(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("compliance.ersRejectTitle")}</DialogTitle>
            <DialogDescription>{t("compliance.ersRejectDesc", { email: rejectFor?.email ?? "" })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t("compliance.ersRejectReason")}</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("compliance.ersRejectPh")}
              rows={3}
            />
            <p className={`text-xs ${rejectReason.trim().length >= 10 ? "text-emerald-600" : "text-amber-600"}`}>
              {t("compliance.ersRejectMinLen", { n: rejectReason.trim().length })}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              disabled={busyId !== null || rejectReason.trim().length < 10}
              onClick={() => void submitReject()}
            >
              <Icons.Ban className="size-4" /> {t("compliance.ersRejectConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sekme 2: Yargı Profili ──────────────────────────────────────────────────

function JurisdictionSection({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const { bump } = useApp();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM);

  const { data: profile, error, reload, loading } = useApi<JurisdictionProfile>(
    () => apiGet<JurisdictionProfile>("/api/compliance/jurisdiction"),
    [refreshKey],
  );

  // sunucu profili → form (yükleme + hazır ayar sonrası senkron)
  useEffect(() => {
    if (!profile) return;
    setForm({
      jurisdiction: profile.jurisdiction,
      dsrSlaDays: String(profile.dsrSlaDays),
      breachWindowHours: String(profile.breachWindowHours),
      opLogYears: String(profile.opLogYears),
      cookieStrictness: profile.cookieStrictness,
      transferMechanism: profile.transferMechanism,
      dpoMode: profile.dpoMode,
      consentVersion: profile.consentVersion ?? "",
      retentionNotes: profile.retentionNotes ?? "",
    });
  }, [profile]);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): string | null => {
    const sla = Number(form.dsrSlaDays);
    if (!Number.isInteger(sla) || sla < 7) return t("compliance.jrInvalidSla");
    if (!["24", "72", "96"].includes(form.breachWindowHours)) return t("compliance.jrInvalidBreach");
    const years = Number(form.opLogYears);
    if (!Number.isInteger(years) || years < 1 || years > 10) return t("compliance.jrInvalidOpLog");
    return null;
  };

  const save = async () => {
    const invalid = validate();
    if (invalid) {
      toast({ title: invalid, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiPatch("/api/compliance/jurisdiction", {
        jurisdiction: form.jurisdiction,
        dsrSlaDays: Number(form.dsrSlaDays),
        breachWindowHours: Number(form.breachWindowHours),
        opLogYears: Number(form.opLogYears),
        cookieStrictness: form.cookieStrictness,
        transferMechanism: form.transferMechanism,
        dpoMode: form.dpoMode,
        consentVersion: form.consentVersion.trim() === "" ? null : form.consentVersion.trim(),
        retentionNotes: form.retentionNotes.trim() === "" ? null : form.retentionNotes.trim(),
      });
      toast({ title: t("compliance.jrSaved"), description: t("compliance.jrSavedDesc") });
      reload();
      bump();
    } catch (err) {
      toast({ title: t("compliance.actionFailedTitle"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = async (key: "TR" | "EU") => {
    setBusy(true);
    try {
      await apiSend("/api/compliance/presets", "POST", { jurisdiction: key });
      toast({ title: t("compliance.jrPresetApplied", { preset: key }), description: t("compliance.jrPresetAppliedDesc") });
      reload();
      bump();
    } catch (err) {
      toast({ title: t("compliance.actionFailedTitle"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading rows={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <SectionCard
        title={t("compliance.jrPresetsTitle")}
        desc={t("compliance.jrPresetsDesc")}
        action={<Icons.Scale className="size-4 text-muted-foreground" />}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void applyPreset("TR")}>
            <Icons.Flag className="size-4" /> {t("compliance.jrPresetTr")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void applyPreset("EU")}>
            <Icons.Globe2 className="size-4" /> {t("compliance.jrPresetEu")}
          </Button>
          <Chip tone="neutral">{t("compliance.jrPresetHint")}</Chip>
        </div>
      </SectionCard>

      <SectionCard title={t("compliance.jrFormTitle")} desc={t("compliance.jrFormDesc")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="jr-jur">{t("compliance.jrFieldJurisdiction")}</Label>
            <Select value={form.jurisdiction} onValueChange={(v) => set("jurisdiction", v)}>
              <SelectTrigger id="jr-jur"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TR">{t("compliance.jrJur.TR")}</SelectItem>
                <SelectItem value="EU">{t("compliance.jrJur.EU")}</SelectItem>
                <SelectItem value="CUSTOM">{t("compliance.jrJur.CUSTOM")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jr-sla">{t("compliance.jrFieldSla")}</Label>
            <Input id="jr-sla" type="number" min={7} max={365} value={form.dsrSlaDays} onChange={(e) => set("dsrSlaDays", e.target.value)} />
            <p className="text-[11px] text-muted-foreground">{t("compliance.jrSlaHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("compliance.jrFieldBreach")}</Label>
            <Select value={form.breachWindowHours} onValueChange={(v) => set("breachWindowHours", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["24", "72", "96"].map((h) => (
                  <SelectItem key={h} value={h}>{t("compliance.jrHoursOption", { h })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jr-oplog">{t("compliance.jrFieldOpLog")}</Label>
            <Input id="jr-oplog" type="number" min={1} max={10} value={form.opLogYears} onChange={(e) => set("opLogYears", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("compliance.jrFieldCookie")}</Label>
            <Select value={form.cookieStrictness} onValueChange={(v) => set("cookieStrictness", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="STRICT">{t("compliance.jrCookie.STRICT")}</SelectItem>
                <SelectItem value="OPT_OUT">{t("compliance.jrCookie.OPT_OUT")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("compliance.jrFieldTransfer")}</Label>
            <Select value={form.transferMechanism} onValueChange={(v) => set("transferMechanism", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BOARD_AUTHORIZATION">{t("compliance.jrTransfer.BOARD_AUTHORIZATION")}</SelectItem>
                <SelectItem value="SCC">{t("compliance.jrTransfer.SCC")}</SelectItem>
                <SelectItem value="ADEQUACY">{t("compliance.jrTransfer.ADEQUACY")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jr-consent">{t("compliance.jrFieldConsent")}</Label>
            <Input id="jr-consent" value={form.consentVersion} maxLength={80} placeholder="v2.1" onChange={(e) => set("consentVersion", e.target.value)} />
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Switch id="jr-dpo" checked={form.dpoMode} onCheckedChange={(v) => set("dpoMode", v)} />
            <div>
              <Label htmlFor="jr-dpo">{t("compliance.jrFieldDpo")}</Label>
              <p className="text-[11px] text-muted-foreground">{t("compliance.jrDpoHint")}</p>
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="jr-retention">{t("compliance.jrFieldRetention")}</Label>
            <Textarea id="jr-retention" rows={3} value={form.retentionNotes} maxLength={2000} onChange={(e) => set("retentionNotes", e.target.value)} />
            <p className="text-[11px] text-muted-foreground">{t("compliance.jrRetentionHint")}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button disabled={busy} onClick={() => void save()}>
            <Icons.Save className="size-4" /> {busy ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Sekme 3: Belge Sicili ───────────────────────────────────────────────────

function DocumentsSection({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const { bump } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<DocForm>(EMPTY_DOC_FORM);

  const { data, error, reload, loading } = useApi<{ items: DocRow[] }>(
    () => apiGet<{ items: DocRow[] }>("/api/compliance/documents"),
    [refreshKey],
  );
  const items = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    for (const d of items) {
      const arr = m.get(d.kind);
      if (arr) arr.push(d);
      else m.set(d.kind, [d]);
    }
    return [...m.entries()];
  }, [items]);

  const set = <K extends keyof DocForm>(k: K, v: DocForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submitNew = async () => {
    if (!form.title.trim()) {
      toast({ title: t("compliance.docTitleRequired"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const created = await apiSend<DocRow>("/api/compliance/documents", "POST", {
        kind: form.kind,
        title: form.title.trim(),
        notes: form.notes.trim() === "" ? undefined : form.notes.trim(),
        externalUrl: form.externalUrl.trim() === "" ? undefined : form.externalUrl.trim(),
        mediaAssetId: form.mediaAssetId.trim() === "" ? undefined : form.mediaAssetId.trim(),
        content: form.content.trim() === "" ? undefined : form.content,
      });
      toast({ title: t("compliance.docSaved"), description: t("compliance.docSavedDesc", { kind: t(DOC_KIND_KEY[created.kind] ?? ""), version: created.version }) });
      setNewOpen(false);
      setForm(EMPTY_DOC_FORM);
      reload();
      bump();
    } catch (err) {
      toast({ title: t("compliance.actionFailedTitle"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const patchDoc = async (row: DocRow, action: "ACTIVATE" | "ARCHIVE") => {
    setBusyId(row.id);
    try {
      await apiPatch("/api/compliance/documents", { id: row.id, action });
      toast({
        title: action === "ACTIVATE" ? t("compliance.docActivateOk") : t("compliance.docArchiveOk"),
        description: t(action === "ACTIVATE" ? "compliance.docActivateOkDesc" : "compliance.docArchiveOkDesc", { kind: t(DOC_KIND_KEY[row.kind] ?? ""), version: row.version }),
      });
      reload();
      bump();
    } catch (err) {
      toast({ title: t("compliance.actionFailedTitle"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip tone="teal">{t("compliance.docCountChip", { n: items.length })}</Chip>
        <Button onClick={() => { setForm(EMPTY_DOC_FORM); setNewOpen(true); }}>
          <Icons.Plus className="size-4" /> {t("compliance.docNew")}
        </Button>
      </div>

      {loading ? (
        <Loading rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <EmptyState title={t("compliance.docEmptyTitle")} desc={t("compliance.docEmptyDesc")} />
      ) : (
        <div className="space-y-4">
          {groups.map(([kind, docs]) => (
            <SectionCard
              key={kind}
              title={t(DOC_KIND_KEY[kind] ?? kind)}
              desc={t("compliance.docVersions", { n: docs.length })}
              action={docs.some((d) => d.active) ? <Chip tone="emerald">{t("compliance.docHasActive")}</Chip> : <Chip tone="amber">{t("compliance.docNoActive")}</Chip>}
            >
              <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                {docs.map((d) => (
                  <div key={d.id} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={d.active ? "default" : "secondary"}>v{d.version}</Badge>
                        <p className="truncate text-sm font-medium">{d.title}</p>
                        {d.active ? (
                          <Chip tone="emerald">{t("compliance.docActive")}</Chip>
                        ) : (
                          <Chip tone="neutral">{t("compliance.docArchived")}</Chip>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Icons.Hash className="size-3" /><code className="rounded bg-muted px-1">{shaShort(d.sha256)}</code></span>
                        <span>{fmtDate(d.createdAt)}</span>
                        {d.createdBy && <span>{t("compliance.docBy", { by: d.createdBy })}</span>}
                        {!d.active && d.supersededBy && <span>{t("compliance.docSupersededBy", { id: d.supersededBy.slice(-6) })}</span>}
                        {d.asset && <span className="inline-flex items-center gap-1"><Icons.Paperclip className="size-3" />{d.asset.name}</span>}
                        {d.externalUrl && (
                          <span className="inline-flex items-center gap-1"><Icons.Link2 className="size-3" /><a href={d.externalUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{d.externalUrl}</a></span>
                        )}
                        {d.notes && <span className="italic">{d.notes}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!d.active && (
                        <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => void patchDoc(d, "ACTIVATE")}>
                          <Icons.BadgeCheck className="size-3.5" /> {t("compliance.docActivate")}
                        </Button>
                      )}
                      {d.active && (
                        <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => void patchDoc(d, "ARCHIVE")}>
                          <Icons.Archive className="size-3.5" /> {t("compliance.docArchive")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Yeni sürüm — içerik verilirse sha256 hesaplanır; tek-aktif sunucuda transaction ile korunur */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[85vh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("compliance.docNewTitle")}</DialogTitle>
            <DialogDescription>{t("compliance.docNewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="maven-scroll grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("compliance.docFieldKind")}</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{t(DOC_KIND_KEY[k])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">{t("compliance.docFieldTitle")}</Label>
              <Input id="doc-title" value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-content">{t("compliance.docFieldContent")}</Label>
              <Textarea id="doc-content" rows={4} value={form.content} onChange={(e) => set("content", e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{t("compliance.docContentHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-url">{t("compliance.docFieldUrl")}</Label>
              <Input id="doc-url" value={form.externalUrl} placeholder="https://…" onChange={(e) => set("externalUrl", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-asset">{t("compliance.docFieldAsset")}</Label>
              <Input id="doc-asset" value={form.mediaAssetId} onChange={(e) => set("mediaAssetId", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-notes">{t("compliance.docFieldNotes")}</Label>
              <Input id="doc-notes" value={form.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void submitNew()}>
              <Icons.Save className="size-4" /> {busy ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sekme 4: Uyumluluk Raporu ───────────────────────────────────────────────

function ReportSection({ refreshKey }: { refreshKey: number }) {
  const { data: rep, error, reload, loading } = useApi<ReportData>(() => apiGet<ReportData>("/api/compliance/report"), [refreshKey]);

  if (loading) return <Loading rows={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!rep) return <EmptyState title={t("compliance.repEmptyTitle")} desc={t("compliance.repEmptyDesc")} />;

  const j = rep.jurisdiction;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <Icons.ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">{t("compliance.repNoPii")}</p>
          <p className="mt-0.5 text-xs text-emerald-700">{t("compliance.repNoPiiDesc")}</p>
        </div>
      </div>

      <SectionCard
        title={t("compliance.repErasureTitle")}
        desc={t("compliance.repErasureDesc")}
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            <Icons.RefreshCw className="size-3.5" /> {t("compliance.repRefresh")}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("compliance.repTotal")} value={rep.erasure.total} sub={t("compliance.repTotalSub")} icon={<Icons.Files className="size-4" />} tone="teal" />
          <KpiCard label={t("compliance.repPending")} value={rep.erasure.pending} sub={t("compliance.repPendingSub")} icon={<Icons.Inbox className="size-4" />} tone="amber" />
          <KpiCard label={t("compliance.repOverdue")} value={rep.erasure.overdue} sub={t("compliance.repOverdueSub")} icon={<Icons.AlarmClock className="size-4" />} tone="rose" />
          <KpiCard label={t("compliance.repCompleted")} value={rep.erasure.completed} sub={t("compliance.repCompletedSub")} icon={<Icons.CheckCheck className="size-4" />} tone="emerald" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={t("compliance.repConsentTitle")} desc={t("compliance.repConsentDesc")}>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label={t("compliance.repConsentPersons")} value={rep.consent.personsWithConsent} sub={t("compliance.repConsentPersonsSub")} icon={<Icons.FileSignature className="size-4" />} tone="violet" />
            <KpiCard label={t("compliance.repCommsOptIn")} value={rep.consent.commsOptInCount} sub={t("compliance.repCommsOptInSub")} icon={<Icons.MailCheck className="size-4" />} tone="teal" />
          </div>
        </SectionCard>

        <SectionCard title={t("compliance.repDocsTitle")} desc={t("compliance.repDocsDesc")}>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label={t("compliance.repDocsTotal")} value={rep.documents.total} sub={t("compliance.repDocsTotalSub")} icon={<Icons.FolderOpen className="size-4" />} tone="teal" />
            <KpiCard label={t("compliance.repDocsActive")} value={rep.documents.active} sub={t("compliance.repDocsActiveSub")} icon={<Icons.BadgeCheck className="size-4" />} tone="emerald" />
          </div>
          {rep.documents.byKind.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("compliance.repDocsByKind")}</p>
              <div className="flex flex-wrap gap-1.5">
                {rep.documents.byKind.map((b) => (
                  <Chip key={b.kind} tone="neutral">{t(DOC_KIND_KEY[b.kind] ?? b.kind)}: {b.count}</Chip>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={t("compliance.repJurisdictionTitle")} desc={t("compliance.repJurisdictionDesc")}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldJurisdiction")}</dt>
            <dd className="font-medium">{t(`compliance.jrJur.${j.jurisdiction}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldSla")}</dt>
            <dd className="font-medium">{t("compliance.jrDays", { n: j.dsrSlaDays })}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldBreach")}</dt>
            <dd className="font-medium">{t("compliance.jrHoursOption", { h: j.breachWindowHours })}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldOpLog")}</dt>
            <dd className="font-medium">{t("compliance.jrYears", { n: j.opLogYears })}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldCookie")}</dt>
            <dd className="font-medium">{t(`compliance.jrCookie.${j.cookieStrictness}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldTransfer")}</dt>
            <dd className="font-medium">{t(`compliance.jrTransfer.${j.transferMechanism}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldDpo")}</dt>
            <dd className="font-medium">{j.dpoMode ? t("compliance.jrDpoOn") : t("compliance.jrDpoOff")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldConsent")}</dt>
            <dd className="font-medium">{j.consentVersion ?? t("compliance.jrNotSet")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("compliance.jrFieldRetention")}</dt>
            <dd className="font-medium">{j.retentionNotesSet ? t("compliance.jrSet") : t("compliance.jrNotSet")}</dd>
          </div>
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icons.Clock className="size-3" /> {t("compliance.repGenerated", { ts: fmtDateTime(rep.generatedAt) })}
        </p>
      </SectionCard>
    </div>
  );
}

// ─── Ana görünüm ─────────────────────────────────────────────────────────────

export function ComplianceView() {
  const { lang } = useLang(); // dil değişiminde yeniden render + içerik dili işareti
  const { refreshKey, bump } = useApp();

  return (
    <div className="space-y-5" lang={lang}>
      <PageHeader title={t("compliance.title")} desc={t("compliance.desc")}>
        <Chip tone="teal"><Icons.ShieldCheck className="mr-1 inline size-3" aria-hidden />{t("compliance.badgeKvkk")}</Chip>
        <Button size="sm" variant="ghost" onClick={bump} aria-label={t("compliance.repRefresh")}>
          <Icons.RefreshCw className="size-4" />
        </Button>
      </PageHeader>

      <Tabs defaultValue="erasure" className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="erasure" className="gap-1.5"><Icons.UserCheck className="size-3.5" /> {t("compliance.tabErasure")}</TabsTrigger>
          <TabsTrigger value="jurisdiction" className="gap-1.5"><Icons.Scale className="size-3.5" /> {t("compliance.tabJurisdiction")}</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5"><Icons.FolderCheck className="size-3.5" /> {t("compliance.tabDocuments")}</TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5"><Icons.BarChart3 className="size-3.5" /> {t("compliance.tabReport")}</TabsTrigger>
        </TabsList>
        <TabsContent value="erasure"><ErasureSection refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="jurisdiction"><JurisdictionSection refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="documents"><DocumentsSection refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="report"><ReportSection refreshKey={refreshKey} /></TabsContent>
      </Tabs>
    </div>
  );
}
