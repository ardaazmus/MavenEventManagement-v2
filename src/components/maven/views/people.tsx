"use client";
// Kişiler & Kurumlar — 360 görünümleri (§54, §55)
// Kişi 360: kimlik → katılımlar → roller → kayıt/ödeme → bilimsel → program → konaklama → rozet/tarama → sertifika
import { useEffect, useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { fmtDate, fmtDateTime, fmtMoney, EVENT_ROLES, REG_SOURCES, FUNDING_SOURCES, REGISTRATION_STATUS, PAYMENT_STATUS, ATTENDANCE_STATUS, SUBMISSION_STATUS, SESSION_STATUS, ACCOMMODATION_STATUS, BADGE_STATUS, CERTIFICATE_STATUS, label } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface PersonRow {
  id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; company?: string | null; title?: string | null; country?: string | null; status: string; mergedIntoId?: string | null;
}
interface Person360 {
  person: PersonRow;
  participations: {
    id: string; source: string; attendance: string; editionId: string;
    edition: { name: string; startDate?: string | null };
    registrations: { id: string; status: string; fundingSource: string; confirmationNo: string; category?: { name: string } | null }[];
    roleAssignments: { id: string; role: string; status: string }[];
    programAssignments: { id: string; role: string; status: string; session: { title: string; startTime: string; status: string } }[];
    scanEvents: { id: string; action: string; result: string; scannedAt: string; location: string }[];
    certIssues: { id: string; status: string; definition: { name: string } }[];
    badgeInstances: { id: string; status: string; profile?: { name: string } | null }[];
  }[];
  submissions: { id: string; code: string; title: string; status: string }[];
  reviewAssignments: { id: string; status: string; submission: { code: string; title: string } }[];
}
// Mükerrer kişi önerileri (R2-b) — /api/people/duplicates sözleşmesi (tenant geneli, edisyon-bağımsız)
interface DuplicatePerson { id: string; fullName: string; email?: string | null; phone?: string | null; title?: string | null; company?: string | null; city?: string | null; status: string; createdAt: string; }
interface DuplicateSuggestion { key: string; reason: string; persons: DuplicatePerson[]; olderId?: string | null; note?: string | null; }
interface DuplicatesData { totalPersons: number; suggestions: DuplicateSuggestion[]; reasonLabels: Record<string, string>; }

// Birleştirme önizlemesi (/api/people/merge-preview sözleşmesi)
interface MergePreviewSide { participationId: string; regStatus: string | null; regNo: string | null; categoryName: string | null; attendance: string; badgeCount: number; }
interface MergeConflictEdition { editionId: string; editionName: string; startDate: string; source: MergePreviewSide; target: MergePreviewSide; defaultWinner: "target" | "source"; }
interface MergePreview {
  source: { id: string; firstName: string; lastName: string; createdAt: string };
  target: { id: string; firstName: string; lastName: string; createdAt: string };
  conflictingEditions: MergeConflictEdition[];
  movableParticipations: number;
  moves: { submissions: number; authorships: number; reviewAssignments: number; scanEvents: number; tasks: number; contacts: number; delegationsLed: number; waitlistEntries: number };
  fieldDiffs: { field: string; source: string | null; target: string | null; kind: "fill" | "conflict" }[];
  loserBadges: number;
}
const MERGE_FIELD_LABELS: Record<string, string> = { email: "E-posta", phone: "Telefon", title: "Unvan", company: "Kurum", city: "Şehir", country: "Ülke", bio: "Bio" };
const MERGE_MOVE_LABELS: Record<string, string> = {
  submissions: "bildiri", authorships: "yazarlık", reviewAssignments: "hakemlik", scanEvents: "saha taraması",
  tasks: "görev", contacts: "iletişim", delegationsLed: "delegasyon liderliği", waitlistEntries: "bekleme kaydı",
};
const REASON_TONE: Record<string, "emerald" | "amber" | "violet"> = { EMAIL: "emerald", NAME_PHONE: "amber", NAME_ORG: "violet" };
interface OrgRow { id: string; name: string; type?: string | null; city?: string | null; country?: string | null; website?: string | null; _count?: { eventAssignments?: number; sponsorAgreements?: number } }
interface Org360 {
  organization: OrgRow;
  eventAssignments: { id: string; role: string; edition: { name: string } }[];
  sponsorAgreements: { id: string; amount: number; currency: string; status: string; tier?: { name: string } | null; package?: { name: string } | null; deliverables: { id: string; name: string; status: string }[] }[];
  entitlements: { id: string; label: string; type: string; quantityGranted: number; quantityConsumed: number; quantityReserved: number }[];
  boothAllocations: { id: string; status: string; boothUnit: { code: string; sizeSqm: number } }[];
  orders: { id: string; orderNo: string; totalAmount: number; status: string; currency: string }[];
  contacts: { id: string; name: string; title?: string | null; email?: string | null }[];
}

function Row360Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

// Mükerrer öneri satırındaki tek kişi kartı (kimlik özeti + kayıt tarihi)
function DupPersonCard({ p }: { p: DuplicatePerson }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="truncate text-sm font-semibold">{p.fullName}</p>
      {p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
      {(p.company || p.title) && <p className="truncate text-xs text-muted-foreground">{[p.company, p.title].filter(Boolean).join(" · ")}</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">kayıt: {fmtDate(p.createdAt)}</p>
    </div>
  );
}

export function PeopleView() {
  const { tenant, bump, currentEditionId, refreshKey } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PersonRow | null>(null);
  const [detail, setDetail] = useState<Person360 | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", title: "" });
  const [mergeSug, setMergeSug] = useState<DuplicateSuggestion | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null); // korunacak (hedef) kişi id
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, "target" | "source">>({});

  const { data, error, reload, loading } = useApi<PersonRow[]>(() => listEntity<PersonRow>("people", { q, limit: 300 }), [q]);

  // Olası mükerrerler — tenant geneli (edisyon-bağımsız, null-guard gerekmez); edisyon değişince tazelensin
  const { data: dupData, error: dupError, reload: dupReload } = useApi<DuplicatesData>(() => apiGet<DuplicatesData>("/api/people/duplicates"), [currentEditionId, refreshKey]);

  const open360 = async (p: PersonRow) => {
    setSelected(p);
    setDetailLoading(true);
    try {
      const d = await apiGet<Person360>(`/api/people/${p.id}`);
      console.log("[360] loaded", p.id, d?.person?.id, Object.keys(d ?? {}).length);
      setDetail(d);
    } catch (e) {
      console.error("[360] failed", p.id, e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const createPerson = async () => {
    try {
      await apiSend("/api/people", "POST", { ...form, tenantId: tenant?.id });
      toast({ title: "Kişi oluşturuldu", description: `${form.firstName} ${form.lastName} tenant içine eklendi.` });
      setCreateOpen(false);
      setForm({ firstName: "", lastName: "", email: "", company: "", title: "" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Kişi oluşturulamadı", variant: "destructive" });
    }
  };

  // Birleştirme diyaloğunu aç — varsayılan hedef: daha eski kayıt (API'nin olderId önerisi)
  const openMerge = (s: DuplicateSuggestion) => {
    const def = s.olderId && s.persons.some((p) => p.id === s.olderId) ? s.olderId : s.persons[0]?.id ?? null;
    setMergeSug(s);
    setMergeTarget(def);
    setMergePreview(null);
    setResolutions({});
  };

  // hedef seçilince çakışma önizlemesi + varsayılan çözümler
  useEffect(() => {
    if (!mergeSug || !mergeTarget) { setMergePreview(null); return; }
    const source = mergeSug.persons.find((p) => p.id !== mergeTarget);
    if (!source) { setMergePreview(null); return; }
    let alive = true;
    setPreviewLoading(true);
    apiGet<MergePreview>(`/api/people/merge-preview?sourceId=${source.id}&targetId=${mergeTarget}`)
      .then((d) => {
        if (!alive) return;
        setMergePreview(d);
        const def: Record<string, "target" | "source"> = {};
        for (const c of d.conflictingEditions) def[c.editionId] = c.defaultWinner;
        setResolutions(def);
      })
      .catch(() => { if (alive) setMergePreview(null); })
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
  }, [mergeSug, mergeTarget]);

  // Onaylı birleştirme — çakışma çözümleriyle (sunucu tek işlemde taşır)
  const confirmMerge = async () => {
    const sug = mergeSug;
    if (!sug || !mergeTarget) return;
    const target = sug.persons.find((p) => p.id === mergeTarget) ?? null;
    const source = sug.persons.find((p) => p.id !== mergeTarget) ?? null;
    if (!target || !source) {
      toast({ title: "Hata", description: "Kaynak ve hedef aynı olamaz.", variant: "destructive" });
      return;
    }
    setMergeBusy(true);
    try {
      const r = await apiSend<{ mergedRegistrations?: number; resolvedEditions?: number }>("/api/flows", "POST", {
        action: "person.merge", sourceId: source.id, targetId: target.id, resolutions, fillProfile: true,
      });
      toast({
        title: "Kişiler birleştirildi — geçmiş korundu",
        description: `${source.fullName} → ${target.fullName}${r.mergedRegistrations ? ` · ${r.mergedRegistrations} kayıt taşındı` : ""}${r.resolvedEditions ? ` · ${r.resolvedEditions} edisyonda çakışma çözüldü` : ""}`,
      });
      setMergeSug(null);
      setMergeTarget(null);
      setMergePreview(null);
      reload(); dupReload(); bump(); // kişi listesi + mükerrer listesi + global sayaçlar
    } catch (e) {
      toast({ title: "Birleştirme başarısız", description: e instanceof Error ? e.message : "Kişiler birleştirilemedi", variant: "destructive" });
    } finally {
      setMergeBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Kişiler" desc="Tenant içinde tekil kimlik — e-posta güçlü işaret, kesin kimlik değil (birleştirme onaylı yapılır)">
        {dupData && dupData.suggestions.length === 0 && (
          <Chip tone="emerald">
            <span className="inline-flex items-center gap-1"><Icons.CheckCircle2 className="size-3" aria-hidden />Mükerrer yok</span>
          </Chip>
        )}
        <Input placeholder="Ad, e-posta, kurum ara…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm"><Icons.UserPlus className="size-4" /> Kişi Ekle</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Yeni Kişi</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Ad</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><Label>Soyad</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>E-posta</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Kurum</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div><Label>Unvan</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={createPerson} disabled={!form.firstName || !form.lastName}>Oluştur</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* ── Olası Mükerrerler (R2-b) — öneri bağlamaz, birleştirme onaylı yapılır ── */}
      {dupError && !dupData && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icons.TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-hidden />
          Mükerrer taraması yüklenemedi — kişi listesi etkilenmedi.
        </p>
      )}
      {dupData && dupData.suggestions.length > 0 && (
        <SectionCard
          title="Olası Mükerrerler"
          desc="Tenant genelinde kimlik eşleşmesi — öneriler bağlamadan incelenmelidir"
          action={<Chip tone="amber">{dupData.suggestions.length} öneri</Chip>}
          className="mb-4"
        >
          <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto">
            {dupData.suggestions.map((s) => {
              const [a, b] = s.persons;
              return (
                <div key={s.key} className="rounded-lg border bg-muted/20 p-3">
                  <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr] md:gap-3">
                    <DupPersonCard p={a} />
                    <div className="flex items-center justify-center gap-2 md:w-40 md:flex-col">
                      <Icons.ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <Chip tone={REASON_TONE[s.reason] ?? "neutral"}>{dupData.reasonLabels[s.reason] ?? s.reason}</Chip>
                      <Button size="sm" variant="outline" onClick={() => openMerge(s)}>
                        <Icons.Merge className="size-4" /> Birleştir
                      </Button>
                    </div>
                    <DupPersonCard p={b} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (data ?? []).length === 0 ? (
        <EmptyState title="Kişi bulunamadı" desc="Filtre sonucu yok — aramayı temizleyin veya yeni kişi ekleyin." />
      ) : (
        <div className="grid gap-2">
          {(data ?? []).map((p) => (
            <button key={p.id} onClick={() => open360(p)} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {p.firstName[0]}{p.lastName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.firstName} {p.lastName}
                  {p.status === "MERGED" && <Chip tone="rose">birleştirildi</Chip>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{p.title ? `${p.title} · ` : ""}{p.company ?? "—"} · {p.email ?? "e-posta yok"}</p>
              </div>
              <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* ── Birleştirme onay diyaloğu — hedef seçimi + çakışma çözümü (R7) ── */}
      <Dialog open={Boolean(mergeSug)} onOpenChange={(o) => { if (!o) setMergeSug(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Kişileri Birleştir</DialogTitle>
            <DialogDescription>{mergeSug?.note ?? "Kaynak kişi hedefe taşınır; hedef kayıt korunur."}</DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="Korunacak kişi" className="grid gap-2 sm:grid-cols-2">
            {mergeSug?.persons.map((p, i) => {
              const checked = mergeTarget === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setMergeTarget(p.id)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    checked ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40"
                  )}
                >
                  <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary" : "border-muted-foreground/40")}>
                    {checked && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {i === 0 ? "A'yı koru" : "B'yi koru"} <span className="font-normal text-muted-foreground">({i === 0 ? "B" : "A"} birleşir)</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{p.fullName} · {p.email ?? "e-posta yok"} · {p.company ?? "—"}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Çakışma önizlemesi — hedef seçilince yüklenir ── */}
          {previewLoading && (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Icons.Loader2 className="size-3.5 animate-spin" /> Çakışma analizi yapılıyor…</p>
          )}
          {mergePreview && !previewLoading && (
            <div className="maven-portal-enter space-y-3">
              {/* profil alan farkları */}
              {mergePreview.fieldDiffs.length > 0 && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Icons.SlidersHorizontal className="size-3.5 text-primary" /> Profil alanları</p>
                  <ul className="space-y-1">
                    {mergePreview.fieldDiffs.map((f) => (
                      <li key={f.field} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                        <span className="w-14 shrink-0 font-medium text-muted-foreground">{MERGE_FIELD_LABELS[f.field] ?? f.field}</span>
                        {f.kind === "fill" ? (
                          <Chip tone="teal">hedef boş → "{f.source}" kaynaktan doldurulur</Chip>
                        ) : (
                          <Chip tone="amber">farklı: hedef "{f.target}" · kaynak "{f.source}" → hedef korunur</Chip>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* aynı edisyonda iki katılım — çözüm zorunlu */}
              {mergePreview.conflictingEditions.length > 0 ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                    <Icons.TriangleAlert className="size-3.5" aria-hidden />
                    {mergePreview.conflictingEditions.length} edisyonda iki katılım var — kazanan seçilmeli
                  </p>
                  {mergePreview.conflictingEditions.map((c) => {
                    const winner = resolutions[c.editionId] ?? c.defaultWinner;
                    const SideBox = ({ sideName, s }: { sideName: "source" | "target"; s: MergePreviewSide }) => {
                      const name = sideName === "target" ? `${mergePreview.target.firstName} ${mergePreview.target.lastName}` : `${mergePreview.source.firstName} ${mergePreview.source.lastName}`;
                      const active = winner === sideName;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setResolutions((r) => ({ ...r, [c.editionId]: sideName }))}
                          className={cn(
                            "flex-1 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            active ? "maven-winner-glow border-primary bg-primary/5 ring-1 ring-primary/30" : "border-dashed opacity-70 hover:opacity-100 hover:border-primary/40"
                          )}
                        >
                          <span className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-semibold">{name}</span>
                            {active && <Icons.CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden />}
                          </span>
                          <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                            {s.regNo ? <><span className="font-mono">{s.regNo}</span> · </> : "kayıt yok · "}
                            {s.regStatus ? <>{REGISTRATION_STATUS[s.regStatus] ?? s.regStatus}{s.categoryName ? ` (${s.categoryName})` : ""} · </> : ""}
                            {s.badgeCount > 0 ? `${s.badgeCount} rozet` : "rozet yok"}
                          </span>
                        </button>
                      );
                    };
                    return (
                      <div key={c.editionId} className="rounded-lg border bg-card p-2.5">
                        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{c.editionName} · {fmtDate(c.startDate)}</p>
                        <div role="radiogroup" aria-label={`${c.editionName} için kazanacak katılım`} className="flex flex-col gap-2 sm:flex-row">
                          <SideBox sideName="source" s={c.source} />
                          <SideBox sideName="target" s={c.target} />
                        </div>
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {winner === "target"
                            ? `${mergePreview.source.firstName} katılımındaki kayıtlar/rozetler/taramalar ${mergePreview.target.firstName} katılımına taşınır, boşalan silinir.`
                            : `${mergePreview.target.firstName} katılımındaki kayıtlar/rozetler/taramalar ${mergePreview.source.firstName} katılımına taşınır, boşalan silinir.`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                  <Icons.CheckCircle2 className="size-3.5" aria-hidden /> Edisyon çakışması yok — katılımlar doğrudan taşınır.
                </p>
              )}

              {/* taşınacaklar özeti */}
              <div className="flex flex-wrap gap-1.5">
                {mergePreview.movableParticipations > 0 && <Chip tone="teal">{mergePreview.movableParticipations} katılım</Chip>}
                {Object.entries(mergePreview.moves).filter(([, n]) => n > 0).map(([k, n]) => (
                  <Chip key={k} tone="neutral">{n} {MERGE_MOVE_LABELS[k] ?? k}</Chip>
                ))}
                {mergePreview.loserBadges > 0 && (
                  <Chip tone="amber">{mergePreview.loserBadges} rozet kaybeden taraftan kazanan tarafına taşınır</Chip>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <Icons.TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <span>Birleştirme geri alınamaz ve tek işlemde yapılır. Kaynak kişinin katılımları, bildirileri, yazarlıkları, hakemlikleri, görevleri ve saha taramaları hedefe taşınır; kaynak kişi MERGED durumuna geçer ve kişiler listesinde gizlenir.</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeSug(null)} disabled={mergeBusy}>İptal</Button>
            <Button onClick={confirmMerge} disabled={mergeBusy || !mergeTarget || previewLoading}>
              {mergeBusy ? <Icons.Loader2 className="size-4 animate-spin" aria-hidden /> : <Icons.Merge className="size-4" aria-hidden />}
              Birleştir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Person 360 çekmecesi (§54) ── */}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto maven-scroll sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selected?.firstName} {selected?.lastName}
              {detail?.person.status === "MERGED" && <Chip tone="rose">birleştirildi</Chip>}
            </SheetTitle>
            <SheetDescription>Kişi 360 — modüllerin gerçeklerini birleştiren görünüm; veri sahibi değildir.</SheetDescription>
          </SheetHeader>
          {detailLoading ? <div className="p-6"><Loading rows={5} /></div> : !detail ? (
            <EmptyState title="360 verisi alınamadı" />
          ) : (
            <div className="space-y-4 px-4 pb-8">
              <SectionCard title="Kimlik">
                <Row360Line label="E-posta">{detail.person.email ?? "—"}</Row360Line>
                <Row360Line label="Telefon">{detail.person.phone ?? "—"}</Row360Line>
                <Row360Line label="Kurum">{detail.person.company ?? "—"}</Row360Line>
                <Row360Line label="Unvan">{detail.person.title ?? "—"}</Row360Line>
                <Row360Line label="Ülke">{detail.person.country ?? "—"}</Row360Line>
              </SectionCard>

              {(detail.participations ?? []).map((part) => {
                const reg = part.registrations?.[0];
                const badge = part.badgeInstances?.[0];
                return (
                  <SectionCard key={part.id} title={part.edition?.name ?? "Edisyon"} desc={`Katılım · kaynak: ${label(REG_SOURCES, part.source)}`}>
                    <Row360Line label="Kayıt">
                      {reg ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-1">
                          <StatusBadge map={REGISTRATION_STATUS} value={reg.status} />
                          <StatusBadge map={PAYMENT_STATUS} value={["SPONSOR_ENTITLEMENT", "SPEAKER_ENTITLEMENT", "HOST_COMPLIMENTARY", "STAFF"].includes(reg.fundingSource) ? "NOT_REQUIRED" : "PENDING"} />
                        </span>
                      ) : "kayıt yok"}
                    </Row360Line>
                    <Row360Line label="Kategori">{reg?.category?.name ?? "—"}</Row360Line>
                    <Row360Line label="Fon kaynak">{label(FUNDING_SOURCES, reg?.fundingSource)}</Row360Line>
                    <Row360Line label="Katılım"><StatusBadge map={ATTENDANCE_STATUS} value={part.attendance} /></Row360Line>
                    <Row360Line label="Rozet">
                      {badge ? <span className="inline-flex items-center gap-1"><Chip tone="violet">{badge.profile?.name ?? "Profil"}</Chip> <StatusBadge map={BADGE_STATUS} value={badge.status} /></span> : "—"}
                    </Row360Line>
                    <Separator className="my-2" />
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Roller</p>
                    <div className="flex flex-wrap gap-1">
                      {(part.roleAssignments ?? []).map((r) => <Chip key={r.id} tone="teal">{label(EVENT_ROLES, r.role)}</Chip>)}
                      {(part.roleAssignments ?? []).length === 0 && <span className="text-xs text-muted-foreground">rol atanmadı</span>}
                    </div>
                    {(part.programAssignments ?? []).length > 0 && (
                      <>
                        <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">Program</p>
                        <div className="space-y-1">
                          {part.programAssignments.map((pa) => (
                            <div key={pa.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">{pa.session.title} <span className="text-muted-foreground">· {fmtDateTime(pa.session.startTime)}</span></span>
                              <Chip tone="emerald">{pa.role}</Chip>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {(part.scanEvents ?? []).length > 0 && (
                      <>
                        <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">Son taramalar</p>
                        <div className="space-y-1">
                          {part.scanEvents.slice(0, 4).map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                              <span>{s.location === "SESSION" ? "Oturum girişi" : s.location} · {fmtDateTime(s.scannedAt)}</span>
                              <Chip tone={s.result === "ALLOWED" ? "emerald" : s.result === "DENIED" ? "rose" : "amber"}>{s.result}</Chip>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {(part.certIssues ?? []).length > 0 && (
                      <>
                        <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">Sertifikalar</p>
                        <div className="space-y-1">
                          {part.certIssues.map((c) => (
                            <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate">{c.definition.name}</span>
                              <StatusBadge map={CERTIFICATE_STATUS} value={c.status} />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </SectionCard>
                );
              })}

              {(detail.submissions ?? []).length > 0 && (
                <SectionCard title="Bilimsel" desc="yazarlık ve hakemlik">
                  {detail.submissions.map((s) => (
                    <Row360Line key={s.id} label={s.code}>
                      <span className="inline-flex items-center justify-end gap-1"><span className="max-w-52 truncate">{s.title}</span> <StatusBadge map={SUBMISSION_STATUS} value={s.status} /></span>
                    </Row360Line>
                  ))}
                  {detail.reviewAssignments.map((r) => (
                    <Row360Line key={r.id} label="Hakemlik">
                      <span className="inline-flex items-center justify-end gap-1"><span className="max-w-52 truncate">{r.submission.code} — {r.submission.title}</span> <Chip tone={r.status === "COMPLETED" ? "emerald" : "amber"}>{r.status}</Chip></span>
                    </Row360Line>
                  ))}
                </SectionCard>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function OrganizationsView() {
  const { tenant, bump } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<OrgRow | null>(null);
  const [detail, setDetail] = useState<Org360 | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "COMPANY", city: "", website: "" });

  const { data, error, reload, loading } = useApi<OrgRow[]>(() => listEntity<OrgRow>("organizations", { q }), [q]);

  const open360 = async (o: OrgRow) => {
    setSelected(o);
    setDetail(null);
    try {
      setDetail(await apiGet<Org360>(`/api/organizations/${o.id}`));
    } catch { /* yoksay */ }
  };

  const createOrg = async () => {
    try {
      await apiSend("/api/organizations", "POST", { ...form, tenantId: tenant?.id });
      toast({ title: "Kurum oluşturuldu" });
      setCreateOpen(false); setForm({ name: "", type: "COMPANY", city: "", website: "" }); reload(); bump();
    } catch (e) {
      toast({ title: "Hata", description: e instanceof Error ? e.message : "Kurum oluşturulamadı", variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader title="Kurumlar" desc="Sponsor bir TÜR değil, edisyona atanan ROL'dür (§4) — kalıcı profil burada, roller edisyon içinde">
        <Input placeholder="Kurum ara…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm"><Icons.Building2 className="size-4" /> Kurum Ekle</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Yeni Kurum</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Ad</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Tür</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPANY">Şirket</SelectItem>
                    <SelectItem value="ASSOCIATION">Dernek</SelectItem>
                    <SelectItem value="UNIVERSITY">Üniversite</SelectItem>
                    <SelectItem value="AGENCY">PCO / Ajans</SelectItem>
                    <SelectItem value="VENUE">Mekân</SelectItem>
                    <SelectItem value="HOTEL">Otel</SelectItem>
                    <SelectItem value="PUBLIC_AUTHORITY">Kamu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Şehir</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Web</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={createOrg} disabled={!form.name}>Oluştur</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((o) => (
            <button key={o.id} onClick={() => open360(o)} className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><Icons.Building2 className="size-4" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.city ?? "—"} · {o.type ?? "—"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="teal">{o._count?.eventAssignments ?? 0} etkinlik rolü</Chip>
                <Chip tone="violet">{o._count?.sponsorAgreements ?? 0} anlaşma</Chip>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Kurum 360 (§55) */}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto maven-scroll sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>Kurum 360 — roller, sözleşmeler, haklar, standlar, finans ve teslimler</SheetDescription>
          </SheetHeader>
          {!detail ? <div className="p-6"><Loading rows={5} /></div> : (
            <div className="space-y-4 px-4 pb-8">
              <SectionCard title="Rol ve Görevler" desc="etkinlik bazında atamalar">
                {detail.eventAssignments.length === 0 ? <EmptyState title="Bu kuruma atanmış etkinlik rolü yok" /> : detail.eventAssignments.map((a) => (
                  <Row360Line key={a.id} label={a.edition.name}><Chip tone="teal">{a.role}</Chip></Row360Line>
                ))}
              </SectionCard>

              {detail.sponsorAgreements.map((ag) => (
                <SectionCard key={ag.id} title={ag.package?.name ?? ag.tier?.name ?? "Sponsorluk"} desc={`durum: ${ag.status} · ${fmtMoney(ag.amount, ag.currency)}`}>
                  <Row360Line label="Sözleşme"><Chip tone={ag.status === "ACTIVE" || ag.status === "CONTRACTED" ? "emerald" : "amber"}>{ag.status}</Chip></Row360Line>
                  {detail.entitlements.filter((e) => e.quantityGranted > 0).map((e) => (
                    <Row360Line key={e.id} label={e.label}>
                      <span className="tabular-nums text-sm font-medium">
                        {e.quantityConsumed} / {e.quantityGranted}
                        {e.quantityReserved > 0 && <span className="ml-1 text-xs text-amber-600">(+{e.quantityReserved} ayrılmış)</span>}
                        <span className="ml-1 text-xs text-emerald-600">kalan {Math.max(0, e.quantityGranted - e.quantityConsumed - e.quantityReserved)}</span>
                      </span>
                    </Row360Line>
                  ))}
                  <Row360Line label="Stand">
                    {detail.boothAllocations.length > 0
                      ? detail.boothAllocations.map((b) => <span key={b.id} className="ml-1"><Chip tone="violet">{b.boothUnit.code}</Chip> {b.boothUnit.sizeSqm} m²</span>)
                      : "—"}
                  </Row360Line>
                  <Separator className="my-2" />
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Teslimler</p>
                  <div className="space-y-1">
                    {ag.deliverables.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                        <span>{d.name}</span>
                        <StatusBadge map={{ NOT_STARTED: "Başlamadı", WAITING_SPONSOR: "Sponsor bekliyor", SUBMITTED: "Gönderildi", UNDER_REVIEW: "İncelemede", APPROVED: "Onaylandı", REJECTED: "Reddedildi", COMPLETED: "Tamamlandı" }} value={d.status} />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ))}

              {detail.orders.length > 0 && (
                <SectionCard title="Finansal" desc="siparişler">
                  {detail.orders.map((o) => (
                    <Row360Line key={o.id} label={o.orderNo}>
                      <span className="tabular-nums">{fmtMoney(o.totalAmount, o.currency)} <StatusBadge map={{ OPEN: "Açık", PARTIALLY_PAID: "Kısmi ödendi", PAID: "Ödendi", CANCELLED: "İptal" }} value={o.status} /></span>
                    </Row360Line>
                  ))}
                </SectionCard>
              )}

              {detail.contacts.length > 0 && (
                <SectionCard title="İletişim Kişileri">
                  {detail.contacts.map((c) => (
                    <Row360Line key={c.id} label={c.title ?? "—"}>{c.name}{c.email ? ` · ${c.email}` : ""}</Row360Line>
                  ))}
                </SectionCard>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
