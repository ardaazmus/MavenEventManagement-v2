"use client";
// Kayıt & Katılımcılar — çok eksenli durum (kayıt × ödeme × katılım ayrı), onay akışı, LCV, bekleme listesi
import { useMemo, useState, useEffect } from "react";
import { listEntity, listEntityPaged, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { REGISTRATION_STATUS, WAITLIST_STATUS, REG_SOURCES, FUNDING_SOURCES, ATTENDANCE_STATUS, INVITATION_STATUS, fmtDateTime, fmtDate, label } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

import { InlineEditableCell, QuickAddRow, BulkPasteDialog, CustomFieldsRenderer } from "@/components/maven/data-tools";
import { eventBus } from "@/lib/events";


interface RegRow {
  id: string; confirmationNo: string; status: string; source: string; fundingSource: string; submittedAt?: string | null; decidedAt?: string | null; notes?: string | null;
  category?: { id: string; name: string; basePrice: number; currency: string } | null;
  participation: {
    id: string; attendance: string;
    person: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; title?: string | null; company?: string | null; city?: string | null; country?: string | null };
    roleAssignments?: { role: string }[];
  };
  entitlementClaims?: { id: string; status: string; entitlement: { label: string } }[];
}
interface CategoryRow { id: string; name: string; code: string; basePrice: number; currency: string; requiresApproval: boolean; capacity?: number | null; paymentInstruction?: string | null; isActive: boolean; _count?: { registrations: number } }
interface InvitationRow { id: string; fullName: string; email: string; status: string; sentAt?: string | null; respondedAt?: string | null; organization?: { name: string } | null }

// ── Bekleme listesi tipleri (/api/waitlist sözleşmesi) ──
interface WaitlistPerson { id: string; firstName: string; lastName: string; email?: string | null; company?: string | null; title?: string | null; status: string }
interface WaitlistEntryRow {
  id: string; personId: string; priority: number; status: string; offeredAt?: string | null; offerExpiresAt?: string | null; respondedAt?: string | null; notes?: string | null; createdAt: string; categoryId?: string | null;
  person: WaitlistPerson;
  category?: { id: string; name: string; code: string; capacity?: number | null } | null;
  convertedRegistration?: { id: string; confirmationNo: string; status: string } | null;
}
interface WaitlistCategory { id: string; name: string; code: string; capacity: number | null; taken: number; seatsLeft: number | null; waitingCount: number; offeredCount: number; fillPercent: number | null }
interface WaitlistData {
  summary: { waiting: number; offered: number; converted: number; declinedExpired: number; fullCategories: number; categoriesWithQueue: number };
  categories: WaitlistCategory[];
  entries: WaitlistEntryRow[];
}
interface PersonLite { id: string; firstName: string; lastName: string; email?: string | null; company?: string | null }

// ── İçe aktarma sözleşmeleri (/api/registrations/import) ──
interface ImportIssue { row: number; name: string; kind: "VALIDATION" | "CATEGORY" | "DUPLICATE_FILE" | "DUPLICATE_DB" | "CAPACITY" | "ERROR"; reason: string }
interface ImportPreview { mode: "preview"; total: number; valid: number; issues: ImportIssue[]; mapping: Record<string, string>; categories: { input: string; resolved: string | null }[]; editionName: string }
interface ImportResult { mode: "commit"; imported: number; skipped: ImportIssue[]; confirmationNos: string[]; total: number }
interface ManualResult { registrationId: string; confirmationNo: string; status: string; personCreated: boolean; orderCreated: boolean }

export function RegistrationsView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const { t } = useLang(); // dil değişiminde re-render (F9-R-b)
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [decideTarget, setDecideTarget] = useState<{ reg: RegRow; decision: "CONFIRMED" | "REJECTED" | "CANCELLED" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"list" | "agency" | "waitlist" | "lcv">("list");


  // ── Manuel kayıt + içe/dışa aktarma (form-dışı kayıt yüzeyleri) ──
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [approvalMailOpen, setApprovalMailOpen] = useState(false);

  // ── R10-a: çift tıkla tam durum düzenleme — kişi + katılım + kayıt tek diyaloğda ──
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<RegRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const emptyEdit = { firstName: "", lastName: "", email: "", phone: "", title: "", company: "", city: "", country: "", attendance: "NOT_ARRIVED", categoryId: "", status: "DRAFT", fundingSource: "SELF_PAID", notes: "" };
  const [editForm, setEditForm] = useState(emptyEdit);

  const openFullEdit = (r: RegRow) => {
    setEditRow(r);
    setEditForm({
      firstName: r.participation.person.firstName, lastName: r.participation.person.lastName,
      email: r.participation.person.email ?? "", phone: r.participation.person.phone ?? "",
      title: r.participation.person.title ?? "", company: r.participation.person.company ?? "",
      city: r.participation.person.city ?? "", country: r.participation.person.country ?? "",
      attendance: r.participation.attendance,
      categoryId: r.category?.id ?? "", status: r.status, fundingSource: r.fundingSource, notes: r.notes ?? "",
    });
    setEditOpen(true);
  };

  const saveFullEdit = async () => {
    if (!editRow) return;
    setEditBusy(true);
    try {
      // 1) Kişi — yalnız skaler alanlar (registry sanitize: "" → null; asla iç içe nesne yok)
      await apiSend(`/api/people/${editRow.participation.person.id}`, "PUT", {
        firstName: editForm.firstName, lastName: editForm.lastName,
        email: editForm.email || null, phone: editForm.phone || null, title: editForm.title || null,
        company: editForm.company || null, city: editForm.city || null, country: editForm.country || null,
      });
      // 2) Katılım — katılım durumu
      await apiSend(`/api/participations/${editRow.participation.id}`, "PUT", { attendance: editForm.attendance });
      // 3) Kayıt — kategori + durum + fon kaynağı + not
      await apiSend(`/api/registrations/${editRow.id}`, "PUT", {
        categoryId: editForm.categoryId || null, status: editForm.status,
        fundingSource: editForm.fundingSource, notes: editForm.notes || null,
      });
      toast({ title: "Değişiklikler kaydedildi", description: t("registrations.updatedAll") });
      setEditOpen(false); setEditRow(null);
      reload(); bump();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setEditBusy(false);
    }
  };

  // TASK-A F6: sunucu-taraflı relation-aware arama (teyit no + kategori + kişi ad/e-posta)
  // + imleçli load-more — 400 satırlık sessiz kesme KALDIRILDI; tüm kayıtlar erişilebilir.
  const regsLoader = (cursor?: string) =>
    listEntityPaged<RegRow>("registrations", {
      editionId: currentEditionId ?? undefined,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      q: q.trim() || undefined,
      limit: 200,
    }, cursor);
  const { data: regsPaged, error, reload, loading, more } = useApi<{ items: RegRow[]; nextCursor?: string | null }>(regsLoader, [currentEditionId, statusFilter, q, refreshKey], { append: true });
  const registrations = useMemo(() => regsPaged?.items ?? [], [regsPaged]);
  const { data: categories } = useApi<CategoryRow[]>(() => listEntity<CategoryRow>("registration-categories", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: invitations, reload: reloadInvitations } = useApi<InvitationRow[]>(() => listEntity<InvitationRow>("invitations", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey, tab]);
  // QA: LCV sekmesi salt-okunurdu (ekleme butonu yoktu) — davetli ekleme diyaloğu.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "", notes: "" });
  const [inviteBusy, setInviteBusy] = useState(false);

  const saveInvitation = async () => {
    if (!currentEditionId || !inviteForm.fullName.trim() || !inviteForm.email.trim()) return;
    setInviteBusy(true);
    try {
      await apiSend("/api/invitations", "POST", {
        editionId: currentEditionId,
        fullName: inviteForm.fullName.trim(),
        email: inviteForm.email.trim().toLowerCase(),
        notes: inviteForm.notes.trim() || null,
      });
      toast({ title: "Davetli eklendi", description: `${inviteForm.fullName.trim()} — LCV listesine kaydedildi.` });
      setInviteForm({ fullName: "", email: "", notes: "" });
      setInviteOpen(false);
      reloadInvitations(); bump();
    } catch (e) {
      toast({ title: "Davetli eklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setInviteBusy(false); }
  };

  const decide = async () => {
    if (!decideTarget) return;
    setBusy(true);
    try {
      if (decideTarget.decision === "CANCELLED") {
        const res = await apiSend<{ waitlistOffered?: { personName: string }[] }>("/api/flows", "POST", { action: "registration.cancel", registrationId: decideTarget.reg.id, reason });
        const offers = res.waitlistOffered ?? [];
        toast({
          title: t("registrations.cancelled"),
          description: offers.length > 0
            ? `Koltuk boşaldı — bekleme listesinden teklif gönderildi: ${offers.map((o) => o.personName).join(", ")}`
            : "Yaka kartı ve haklar etkilendi; etki önizlemesi kayıtta görülür.",
        });
      } else {
        await apiSend("/api/flows", "POST", { action: "registration.decide", registrationId: decideTarget.reg.id, decision: decideTarget.decision });
        toast({
          title: decideTarget.decision === "CONFIRMED" ? t("registrations.approved") : t("registrations.rejected"),
          description: decideTarget.decision === "CONFIRMED"
            ? "Hak claim'i CONSUMED'a geçti, yaka kartı READY — ödeme durumu ayrı hesaplanır."
            : "Yaka kartı ve haklar etkilendi; etki önizlemesi kayıtta görülür.",
        });
      }
      setDecideTarget(null); setReason(""); reload(); bump();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // QA: durum sayıları KALDIRILDI — liste sunucuda status ile filtrelenip sayfalı
  // yüklendiği için istemci sayımı her zaman yanlıştı (filtre=CONFIRMED iken diğer
  // durumlar 0 görünüyordu). Doğru sayılar kategori KPI kartlarında zaten var.

  return (
    <div>
      <PageHeader title={t("registrations.title")} desc="Kategori → form → onay akışı; kayıt/ödeme/katılım üç ayrı eksen">
        <div className="flex rounded-lg border p-0.5">
          <button onClick={() => setTab("list")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Kayıtlar</button>
          <button onClick={() => setTab("agency")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "agency" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Acente Konsolu</button>
          <button onClick={() => setTab("waitlist")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "waitlist" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Bekleme</button>
          <button onClick={() => setTab("lcv")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "lcv" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>LCV / Davetler</button>
        </div>

      </PageHeader>

      {tab === "list" ? (
        <>
          {/* Kategori kartları — doluluk */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {(categories ?? []).map((c) => (
              <KpiCard
                key={c.id}
                label={c.name}
                value={`${c._count?.registrations ?? 0}${c.capacity ? ` / ${c.capacity}` : ""}`}
                sub={c.basePrice > 0 ? `${(c.basePrice / 100).toLocaleString("tr-TR")} ${c.currency}` : "ücretsiz"} // F6: kuruş→₺
                tone={c.requiresApproval ? "amber" : "teal"}
              />
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm durumlar</SelectItem>
                {Object.entries(REGISTRATION_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Ad / e-posta / kayıt no…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64" />
            <Button variant="ghost" size="sm" onClick={reload} aria-label="Listeyi yenile"><Icons.RefreshCw className="size-4" /></Button>
            {/* ── Manuel kayıt + içe/dışa aktarma: form-dışı kayıt yüzeyleri ── */}
            <Button size="sm" className="gap-1.5" disabled={!currentEditionId} onClick={() => setManualOpen(true)}>
              <Icons.UserPlus className="size-4" aria-hidden />{t("regIo.manual.btn")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!currentEditionId} onClick={() => setImportOpen(true)}>
              <Icons.FileUp className="size-4" aria-hidden />{t("regIo.import.btn")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!currentEditionId} onClick={() => setExportOpen(true)}>
              <Icons.FileDown className="size-4" aria-hidden />{t("regIo.export.btn")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50" disabled={!currentEditionId} onClick={() => setApprovalMailOpen(true)}>
              <Icons.MailCheck className="size-4" aria-hidden />{t("regMail.btn")}
            </Button>
            <span className="ml-auto flex items-center gap-2">
              <Chip tone="neutral">
                <span className="inline-flex items-center gap-1"><Icons.MousePointerClick className="size-3" aria-hidden />Çift tıklama ile de açılır</span>
              </Chip>
              <span className="text-xs text-muted-foreground">{registrations.length} kayıt listelendi</span>
            </span>
          </div>

          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : registrations.length === 0 ? (
            <EmptyState title="Bu filtrelerle eşleşen kayıt yok" desc="Henüz kayıt yoksa kayıt bağlantısını paylaşın veya ilk kişiyi ekleyin." />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="overflow-x-auto maven-scroll">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Kişi</th>
                      <th className="px-3 py-2.5 font-medium">Kayıt No</th>
                      <th className="px-3 py-2.5 font-medium">Kategori</th>
                      <th className="px-3 py-2.5 font-medium">Kayıt Durumu</th>
                      <th className="px-3 py-2.5 font-medium">Fon Kaynağı</th>
                      <th className="px-3 py-2.5 font-medium">Kaynak</th>
                      <th className="px-3 py-2.5 font-medium">Katılım</th>
                      <th className="px-3 py-2.5 font-medium text-right">Eylem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b transition hover:bg-muted/40 last:border-0"
                        onDoubleClick={() => openFullEdit(r)}
                        title="Çift tıkla: tüm durumları gör/düzenle"
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium leading-tight">{r.participation.person.firstName} {r.participation.person.lastName}</p>
                          <p className="text-xs text-muted-foreground">{r.participation.person.company ?? "—"}</p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">{r.confirmationNo}</td>
                        <td className="px-3 py-2.5">
                          {r.category?.name ?? "—"}
                          {r.entitlementClaims && r.entitlementClaims.length > 0 && (
                            <Chip tone="violet">{r.entitlementClaims[0].entitlement.label.slice(0, 22)}</Chip>
                          )}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge map={REGISTRATION_STATUS} value={r.status} /></td>
                        <td className="px-3 py-2.5 text-xs">{label(FUNDING_SOURCES, r.fundingSource)}</td>
                        <td className="px-3 py-2.5 text-xs">{label(REG_SOURCES, r.source)}</td>
                        <td className="px-3 py-2.5"><StatusBadge map={ATTENDANCE_STATUS} value={r.participation.attendance} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                              onClick={() => openFullEdit(r)}
                              aria-label={`${r.participation.person.firstName} ${r.participation.person.lastName} kaydının tüm durumlarını gör/düzenle`}
                              title="Tüm durumları gör/düzenle"
                            >
                              <Icons.Pencil className="size-3.5" />
                            </Button>
                            {r.status === "PENDING_APPROVAL" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setDecideTarget({ reg: r, decision: "CONFIRMED" })}>
                                  <Icons.Check className="size-3.5" /> Onayla
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setDecideTarget({ reg: r, decision: "REJECTED" })}>
                                  <Icons.X className="size-3.5" /> Reddet
                                </Button>
                              </>
                            )}
                            {["CONFIRMED", "PENDING_APPROVAL", "SUBMITTED"].includes(r.status) && (
                              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setDecideTarget({ reg: r, decision: "CANCELLED" })}>
                                İptal
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* TASK-A F6: kesintisiz yükleme — 200'er sayfalık imleç yürüyüşü, sessiz kesme yok */}
              {more?.hasMore && (
                <div className="flex items-center justify-center border-t bg-muted/20 p-3">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={more.loading} onClick={more.next}>
                    {more.loading ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.ChevronsDown className="size-3.5" />}
                    Daha fazla yükle
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : tab === "agency" ? (
        <AgencyGroupTab
          editionId={currentEditionId}
          categories={categories ?? []}
          onSuccess={() => { bump(); reload(); setTab("list"); }}
        />
      ) : tab === "waitlist" ? (

        <WaitlistTab editionId={currentEditionId} categories={categories ?? []} onChanged={() => { bump(); }} />
      ) : (
        <SectionCard
          title="LCV — Davet Listesi Yönetimi"
          desc="Davet bir kayıt yerine geçmez; 'gelecek' yanıtı kayıt yoluna yönlenir"
          action={
            <Button size="sm" onClick={() => setInviteOpen(true)} disabled={!currentEditionId}>
              <Icons.UserPlus className="size-3.5" /> Davetli Ekle
            </Button>
          }
        >
          {(invitations ?? []).length === 0 ? (
            <EmptyState
              title="Henüz davet oluşturmadınız"
              desc="Davetli ekleyin veya davet listesi yükleyin."
              action={<Button size="sm" onClick={() => setInviteOpen(true)} disabled={!currentEditionId}><Icons.UserPlus className="size-3.5" /> Davetli Ekle</Button>}
            />
          ) : (
            <div className="grid gap-2">
              {(invitations ?? []).map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{inv.fullName}</p>
                    <p className="text-xs text-muted-foreground">{inv.email}{inv.organization ? ` · ${inv.organization.name}` : ""}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inv.sentAt ? `gönderim ${fmtDate(inv.sentAt)}` : "gönderilmedi"}
                    {inv.respondedAt ? ` · yanıt ${fmtDate(inv.respondedAt)}` : ""}
                  </div>
                  <StatusBadge map={INVITATION_STATUS} value={inv.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Davetli ekleme (LCV) — ad + e-posta + not; durum INVITED başlar */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Davetli Ekle</DialogTitle>
            <DialogDescription>LCV listesine yeni davetli kaydedilir. Davet bir kayıt yerine geçmez.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Ad Soyad</Label>
              <Input className="mt-1" value={inviteForm.fullName} onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })} placeholder="Ad Soyad" />
            </div>
            <div>
              <Label>E-posta</Label>
              <Input className="mt-1" type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="ornek@eposta.com" />
            </div>
            <div>
              <Label>Not</Label>
              <Textarea className="mt-1" rows={2} value={inviteForm.notes} onChange={(e) => setInviteForm({ ...inviteForm, notes: e.target.value })} placeholder="İsteğe bağlı not" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Vazgeç</Button>
            <Button onClick={saveInvitation} disabled={inviteBusy || !inviteForm.fullName.trim() || !inviteForm.email.trim()}>
              {inviteBusy ? "Ekleniyor…" : "Davetli Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onay/ret/iptal dialogu — etki önizlemesi ile */}
      <Dialog open={Boolean(decideTarget)} onOpenChange={(o) => !o && setDecideTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decideTarget?.decision === "CONFIRMED" ? "Kaydı onayla" : decideTarget?.decision === "REJECTED" ? "Kaydı reddet" : "Kaydı iptal et"}
            </DialogTitle>
            <DialogDescription>
              {decideTarget?.reg.participation.person.firstName} {decideTarget?.reg.participation.person.lastName} — {decideTarget?.reg.confirmationNo}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Etki önizlemesi</p>
            {decideTarget?.decision === "CONFIRMED" && (
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Ayrılmış hak claim'i <b>CONSUMED</b> olur (davette ayır, onayda kullan)</li>
                <li>Yaka kartı <b>READY</b> durumuna geçer</li>
                <li>Ödeme gereksinimi ayrıca hesaplanır — fon kaynağı: {label(FUNDING_SOURCES, decideTarget?.reg.fundingSource)}</li>
              </ul>
            )}
            {decideTarget?.decision === "CANCELLED" && (
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Yaka kartı <b>VOID</b> olur ve erişim hakkı etkilenir</li>
                <li>Sponsor hakları geri yüklenir (politika gereği ayrıca karar)</li>
                <li>İade ayrı bir finansal işlemdir — burada otomatik yapılmaz</li>
                <li>Kategoride bekleme listesi varsa koltuk sıradakine <b>otomatik teklif edilir</b></li>
              </ul>
            )}
            {decideTarget?.decision === "REJECTED" && <ul className="list-disc space-y-0.5 pl-4"><li>Katılımcıya gerekçe ile bildirim gider</li></ul>}
          </div>
          {decideTarget?.decision !== "CONFIRMED" && (
            <div>
              <Label>Gerekçe</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Karar gerekçesi…" className="mt-1" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideTarget(null)}>Vazgeç</Button>
            <Button
              onClick={decide}
              disabled={busy || (decideTarget?.decision !== "CONFIRMED" && !reason)}
              variant={decideTarget?.decision === "CONFIRMED" ? "default" : "destructive"}
            >
              {busy ? "İşleniyor…" : "Onayla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── R10-a: tam durum düzenleme — kişi + katılım + kayıt tek diyaloğda (çift tık da açar) ── */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Kaydı Düzenle — {editRow?.participation.person.firstName} {editRow?.participation.person.lastName}
            </DialogTitle>
            <DialogDescription>
              Adı yanlış → değiştir, kategorisi yanlış → düzelt: kişi, katılım ve kayıt durumlarının tamamı burada. Kayıt no{" "}
              <span className="font-mono">{editRow?.confirmationNo}</span> · çift tıklama ile de açılır.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Bölüm 1: Kişi Bilgileri */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Icons.User className="size-3.5" aria-hidden /> Kişi Bilgileri
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Ad *</Label><Input className="mt-1" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
                <div><Label>Soyad *</Label><Input className="mt-1" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
                <div><Label>E-posta</Label><Input type="email" className="mt-1" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                <div><Label>Telefon</Label><Input type="tel" className="mt-1" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
                <div><Label>Unvan</Label><Input className="mt-1" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
                <div><Label>Kurum</Label><Input className="mt-1" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} /></div>
                <div><Label>Şehir</Label><Input className="mt-1" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></div>
                <div><Label>Ülke</Label><Input className="mt-1" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} /></div>
              </div>
            </section>

            {/* Bölüm 2: Katılım */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Icons.ScanLine className="size-3.5" aria-hidden /> Katılım
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Katılım durumu</Label>
                  <Select value={editForm.attendance} onValueChange={(v) => setEditForm({ ...editForm, attendance: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Bölüm 3: Kayıt */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Icons.ClipboardList className="size-3.5" aria-hidden /> Kayıt
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Kategori</Label>
                  <Select
                    value={editForm.categoryId === "" ? "none" : editForm.categoryId}
                    onValueChange={(v) => setEditForm({ ...editForm, categoryId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Kategori seçin" /></SelectTrigger>
                    <SelectContent className="maven-scroll max-h-64">
                      <SelectItem value="none">— Kategori yok —</SelectItem>
                      {(categories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} · {c.basePrice > 0 ? `${(c.basePrice / 100).toLocaleString("tr-TR")} ${c.currency}` : "ücretsiz"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kayıt durumu</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(REGISTRATION_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fon kaynağı</Label>
                  <Select value={editForm.fundingSource} onValueChange={(v) => setEditForm({ ...editForm, fundingSource: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="maven-scroll max-h-64">
                      {Object.entries(FUNDING_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Notlar</Label>
                  <Textarea rows={2} className="mt-1" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Vazgeç</Button>
            <Button onClick={saveFullEdit} disabled={editBusy || !editForm.firstName.trim() || !editForm.lastName.trim()}>
              {editBusy ? "Kaydediliyor…" : t("registrations.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manuel Kayıt — detaylı tekil giriş (form-dışı kayıtlar) ── */}
      <ManualRegistrationDialog
        open={manualOpen} onOpenChange={setManualOpen} editionId={currentEditionId}
        categories={categories ?? []}
        onSaved={() => { reload(); bump(); }}
      />
      {/* ── Toplu İçe Aktarma — Excel/CSV, önizleme + commit ── */}
      <ImportRegistrationsDialog
        open={importOpen} onOpenChange={setImportOpen} editionId={currentEditionId}
        categories={categories ?? []}
        onImported={() => { reload(); bump(); }}
      />
      {/* ── Dışa Aktarma — Excel + resmi onay belgesi modu ── */}
      <ExportRegistrationsDialog
        open={exportOpen} onOpenChange={setExportOpen} editionId={currentEditionId}
        statusFilter={statusFilter} q={q}
      />
      {/* ── Kurum Onay Postası — birleştirilmiş "kayıtlarınız tamamlandı" maili ── */}
      <ApprovalMailDialog
        open={approvalMailOpen} onOpenChange={setApprovalMailOpen} editionId={currentEditionId}
      />
    </div>
  );
}

// ── Acente Toplu Kayıt Konsolu (IAPCO Toplu Acente Faturası & Cvent Çoklu Eksen) ──

interface AgencyGroupTabProps {
  editionId: string | null;
  categories: CategoryRow[];
  onSuccess: () => void;
}

interface DelegateItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  categoryId: string;
}

function AgencyGroupTab({ editionId, categories, onSuccess }: AgencyGroupTabProps) {
  const { toast } = useToast();
  const { t } = useLang();
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [newAgencyName, setNewAgencyName] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [delegates, setDelegates] = useState<DelegateItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    listEntity<{ id: string; name: string; type: string }>("organizations", { limit: 200 })
      .then((orgs) => {
        setAgencies(orgs.map((o) => ({ id: o.id, name: o.name })));
      })
      .catch(console.error);
  }, []);

  const pasteColumns = [
    { key: "firstName", label: "Ad", synonyms: ["first name", "name", "isim", "ad"], required: true },
    { key: "lastName", label: "Soyad", synonyms: ["last name", "surname", "soyad"], required: true },
    { key: "email", label: "E-posta", synonyms: ["e-mail", "mail", "eposta"] },
    { key: "phone", label: "Telefon", synonyms: ["tel", "gsm", "phone"] },
    { key: "company", label: t("regIo.agency.companyLabel"), synonyms: ["company", "kurum", "firma"] },
    { key: "title", label: "Ünvan", synonyms: ["title", "unvan"] },
  ];

  const handleBulkImport = (rows: Record<string, string>[]) => {
    const defaultCatId = categories[0]?.id ?? "";
    const items: DelegateItem[] = rows
      .filter((r) => r.firstName?.trim() || r.lastName?.trim())
      .map((r) => ({
        id: crypto.randomUUID(),
        firstName: r.firstName?.trim() || "Delege",
        lastName: r.lastName?.trim() || "-",
        email: r.email?.trim() || "",
        phone: r.phone?.trim() || "",
        company: r.company?.trim() || "",
        title: r.title?.trim() || "",
        categoryId: defaultCatId,
      }));
    setDelegates((prev) => [...prev, ...items]);
    toast({ title: "Delegeler Eklendi", description: `${items.length} delege listeye aktarıldı.` });
  };

  const handleQuickAdd = async (row: Record<string, string>): Promise<boolean> => {
    if (!row.firstName?.trim() || !row.lastName?.trim()) {
      toast({ title: "Eksik Bilgi", description: "Ad ve Soyad zorunludur.", variant: "destructive" });
      return false;
    }
    const defaultCatId = categories[0]?.id ?? "";
    setDelegates((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        email: row.email?.trim() || "",
        phone: row.phone?.trim() || "",
        company: row.company?.trim() || "",
        title: row.title?.trim() || "",
        categoryId: defaultCatId,
      },
    ]);
    return true;
  };

  const removeDelegate = (id: string) => {
    setDelegates((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDelegate = (id: string, field: keyof DelegateItem, val: string) => {
    setDelegates((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: val } : d))
    );
  };

  const handleSaveAndConfirm = async () => {
    if (!editionId) return;
    if (delegates.length === 0) {
      toast({ title: t("regIo.agency.emptyTitle"), description: t("regIo.agency.emptyDesc"), variant: "destructive" });
      return;
    }

    let targetAgencyOrgId = selectedAgencyId;
    setBusy(true);

    try {
      if (!targetAgencyOrgId && newAgencyName.trim()) {
        const createdOrg = await apiSend<{ id: string }>("/api/organizations", "POST", {
          name: newAgencyName.trim(),
          type: "AGENCY",
          generalEmail: primaryContactEmail || null,
        });
        targetAgencyOrgId = createdOrg.id;
      }

      if (!targetAgencyOrgId) {
        toast({ title: t("regIo.agency.noAgencyTitle"), description: t("regIo.agency.noAgencyDesc"), variant: "destructive" });
        return;
      }

      // 1. AgencyGroup oluştur
      const agencyGroup = await apiSend<{ id: string }>("/api/agency-groups", "POST", {
        editionId,
        agencyOrganizationId: targetAgencyOrgId,
        primaryContactName: primaryContactName.trim() || "Acente Yetkilisi",
        primaryContactEmail: primaryContactEmail.trim() || "acente@example.com",
        primaryContactPhone: primaryContactPhone.trim() || null,
        invoiceId: invoiceNo.trim() || null,
        totalQuota: delegates.length,
        notes: notes.trim() || null,
      });

      // 2. Delegeleri kaydet ve eventBus yayınla
      let count = 0;
      for (const d of delegates) {
        const person = await apiSend<{ id: string }>("/api/people", "POST", {
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email || null,
          phone: d.phone || null,
          company: d.company || null,
          title: d.title || null,
          status: "ACTIVE",
        });

        const reg = await apiSend<{ id: string; confirmationNo: string }>("/api/registrations", "POST", {
          editionId,
          personId: person.id,
          categoryId: d.categoryId || categories[0]?.id,
          source: "AGENCY_PORTAL",
          fundingSource: "AGENCY",
          status: "CONFIRMED",
          notes: `Acente: ${agencyGroup.id} - Fatura: ${invoiceNo || "Konsolide"}`,
        });

        // EventBus yayınla: badge auto-queue ve side effect'ler tetiklenir
        await eventBus.publish("registration.confirmed", {
          registrationId: reg.id,
          editionId,
          personId: person.id,
        });

        count++;
      }

      toast({
        title: "Acente Grubu Onaylandı",
        description: `${count} delege başarıyla kaydedildi, faturaya bağlandı ve rozet kuyruğuna alındı.`,
      });

      onSuccess();
    } catch (err: any) {
      toast({ title: t("regIo.agency.saveError"), description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Acente & Grup Bilgileri"
        desc="IAPCO Standardı: Tek konsolide fatura altında çoklu delege yönetimi"
      >
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <Label className="text-xs">Mevcut Acente Seçin</Label>
            <Select value={selectedAgencyId} onValueChange={(v) => { setSelectedAgencyId(v); if (v !== "none") setNewAgencyName(""); }}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Acente seçin..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Yeni Acente Oluştur...</SelectItem>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(selectedAgencyId === "none" || !selectedAgencyId) && (
            <div>
              <Label className="text-xs">Yeni Acente Adı *</Label>
              <Input
                placeholder="Örn: Setur Turizm A.Ş."
                value={newAgencyName}
                onChange={(e) => setNewAgencyName(e.target.value)}
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}

          <div>
            <Label className="text-xs">Toplu Fatura / Fiş No</Label>
            <Input
              placeholder="Örn: FAT-2026-0089"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">Acente Yetkili Adı</Label>
            <Input
              placeholder="Yetkili Adı Soyadı"
              value={primaryContactName}
              onChange={(e) => setPrimaryContactName(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">Acente Yetkili E-posta</Label>
            <Input
              type="email"
              placeholder="acente@sirket.com"
              value={primaryContactEmail}
              onChange={(e) => setPrimaryContactEmail(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">Acente Yetkili Telefon</Label>
            <Input
              placeholder="0532..."
              value={primaryContactPhone}
              onChange={(e) => setPrimaryContactPhone(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("regIo.agency.groupTitle", { count: delegates.length })}
        desc={t("regIo.agency.groupDesc")}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="h-8 gap-1.5 text-xs"
            >
              <Icons.ClipboardPaste className="size-3.5" />
              Excel'den Yapıştır
            </Button>
            <Button
              size="sm"
              disabled={busy || delegates.length === 0}
              onClick={handleSaveAndConfirm}
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.CheckCheck className="size-3.5" />}
              Grubu Kaydet & Onayla
            </Button>
          </div>
        }
      >
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-muted/60 border-b font-medium text-muted-foreground">
                <tr>
                  <th className="p-2 w-8 text-center">#</th>
                  <th className="p-2">Ad</th>
                  <th className="p-2">Soyad</th>
                  <th className="p-2">E-posta</th>
                  <th className="p-2">Telefon</th>
                  <th className="p-2">Kurum / Şirket</th>
                  <th className="p-2">Kategori</th>
                  <th className="p-2 w-10 text-center">Sil</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {delegates.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground italic">
                      Henüz delege eklenmedi. "Excel'den Yapıştır" butonunu kullanın veya aşağıdaki satırdan ekleyin.
                    </td>
                  </tr>
                ) : (
                  delegates.map((d, idx) => (
                    <tr key={d.id} className="hover:bg-muted/20">
                      <td className="p-2 text-center text-muted-foreground font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-2 font-medium">
                        <InlineEditableCell value={d.firstName} onSave={async (v) => { updateDelegate(d.id, "firstName", v); return true; }} />
                      </td>
                      <td className="p-2 font-medium">
                        <InlineEditableCell value={d.lastName} onSave={async (v) => { updateDelegate(d.id, "lastName", v); return true; }} />
                      </td>
                      <td className="p-2">
                        <InlineEditableCell value={d.email} onSave={async (v) => { updateDelegate(d.id, "email", v); return true; }} placeholder="E-posta" />
                      </td>
                      <td className="p-2">
                        <InlineEditableCell value={d.phone} onSave={async (v) => { updateDelegate(d.id, "phone", v); return true; }} placeholder="Telefon" />
                      </td>
                      <td className="p-2">
                        <InlineEditableCell value={d.company} onSave={async (v) => { updateDelegate(d.id, "company", v); return true; }} placeholder="Kurum" />
                      </td>
                      <td className="p-2">
                        <select
                          className="h-7 rounded border bg-background px-1.5 text-xs text-foreground"
                          value={d.categoryId}
                          onChange={(e) => updateDelegate(d.id, "categoryId", e.target.value)}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removeDelegate(d.id)}
                          className="text-muted-foreground hover:text-rose-600 transition-colors p-1"
                        >
                          <Icons.Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <QuickAddRow
            columns={[
              { key: "firstName", placeholder: "Ad *" },
              { key: "lastName", placeholder: "Soyad *" },
              { key: "email", placeholder: "E-posta" },
              { key: "phone", placeholder: "Telefon" },
              { key: "company", placeholder: t("regIo.agency.companyPh") },
            ]}
            onAdd={handleQuickAdd}
            buttonLabel={t("regIo.agency.quickAddDelegate")}
          />
        </div>
      </SectionCard>

      <BulkPasteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        targetEntityName="Acente Delegeleri"
        availableColumns={pasteColumns}
        onImport={async (rows) => handleBulkImport(rows)}
      />
    </div>
  );
}


function WaitlistTab({ editionId, categories, onChanged }: { editionId: string | null; categories: CategoryRow[]; onChanged: () => void }) {
  const { refreshKey } = useApp();
  const { toast } = useToast();
  const { t } = useLang(); // dil değişiminde re-render (F9-R-b)
  const [catFilter, setCatFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPersonId, setAddPersonId] = useState("");
  const [addCategoryId, setAddCategoryId] = useState("GENERAL");
  const [addPriority, setAddPriority] = useState("");
  const [addNotes, setAddNotes] = useState("");

  const loader = async (): Promise<WaitlistData | null> => {
    if (!editionId) return null;
    return apiGet<WaitlistData>(`/api/waitlist?editionId=${encodeURIComponent(editionId)}`);
  };
  const { data, error, reload, loading } = useApi<WaitlistData | null>(loader, [editionId, refreshKey]);

  const { data: people } = useApi<PersonLite[]>(() => listEntity<PersonLite>("people", { limit: 300 }), [editionId]);

  const entries = (data?.entries ?? []).filter((e) => catFilter === "ALL" || (catFilter === "GENERAL" ? !e.categoryId : e.categoryId === catFilter));
  const summary = data?.summary;
  const catName = (id?: string | null) => (data?.categories ?? []).find((c) => c.id === id)?.name;
  const isFullCategory = (categoryId?: string | null) => {
    if (!categoryId) return false;
    const c = (data?.categories ?? []).find((x) => x.id === categoryId);
    // açık teklifler de koltuk tutar — boş koltuk başına tek teklif kuralı
    return Boolean(c && c.capacity != null && (c.seatsLeft ?? 0) - c.offeredCount <= 0);
  };

  // aktif sırada kategori içi pozisyon (WAITING + OFFERED)
  const positionOf = (e: WaitlistEntryRow): number | null => {
    if (!["WAITING", "OFFERED"].includes(e.status)) return null;
    const sameQueue = (data?.entries ?? []).filter((x) => x.categoryId === e.categoryId && ["WAITING", "OFFERED"].includes(x.status));
    return sameQueue.findIndex((x) => x.id === e.id) + 1;
  };

  const offerCountdown = (e: WaitlistEntryRow): { text: string; expired: boolean } | null => {
    if (e.status !== "OFFERED" || !e.offerExpiresAt) return null;
    const ms = new Date(e.offerExpiresAt).getTime() - Date.now();
    if (ms <= 0) return { text: "Süresi doldu", expired: true };
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return { text: hours >= 1 ? `${hours} sa ${minutes} dk kaldı` : `${minutes} dk kaldı`, expired: false };
  };

  const runAction = async (fn: () => Promise<{ toastTitle: string; toastDesc?: string }>, id?: string) => {
    setBusyId(id ?? "global");
    try {
      const t = await fn();
      toast({ title: t.toastTitle, description: t.toastDesc });
      reload(); onChanged();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const sendOffer = (e: WaitlistEntryRow) => runAction(async () => {
    await apiSend("/api/waitlist", "POST", { action: "offer", entryId: e.id });
    return { toastTitle: `Teklif gönderildi: ${e.person.firstName} ${e.person.lastName}`, toastDesc: "48 saat içinde yanıt beklenir — kabul edilirse kayıt açılır." };
  }, e.id);

  const respond = (e: WaitlistEntryRow, response: "ACCEPT" | "DECLINE") => runAction(async () => {
    const res = await apiSend<{ chained?: { personName: string }[]; registration?: { confirmationNo: string } }>("/api/waitlist", "POST", { action: "respond", entryId: e.id, response });
    if (response === "ACCEPT") {
      return { toastTitle: `Teklif kabul edildi — kayıt açıldı: ${res.registration?.confirmationNo ?? ""}`, toastDesc: "Bekleme listesi girişi CONVERTED oldu, yaka kartı READY." };
    }
    const chained = res.chained ?? [];
    return {
      toastTitle: `Teklif reddedildi: ${e.person.firstName} ${e.person.lastName}`,
      toastDesc: chained.length > 0 ? `Sıradakine teklif gitti: ${chained.map((c) => c.personName).join(", ")}` : "Sırada bekleyen yok.",
    };
  }, e.id);

  const autoOffer = (categoryId?: string) => runAction(async () => {
    setAutoBusy(true);
    try {
      const res = await apiSend<{ total: number }>("/api/waitlist", "POST", { action: "auto-offer", editionId, categoryId });
      return {
        toastTitle: res.total > 0 ? `${res.total} otomatik teklif gönderildi` : "Otomatik teklif gönderilemedi",
        toastDesc: res.total > 0 ? "Boş koltuklar öncelik sırasına göre dağıtıldı (48 saat geçerli)." : "Boş koltuk olan kategoride bekleyen yok veya kategoriler dolu.",
      };
    } finally {
      setAutoBusy(false);
    }
  }, categoryId ?? "global");

  const removeEntry = (e: WaitlistEntryRow) => runAction(async () => {
    const res = await apiSend<{ chained?: { personName: string }[] }>("/api/waitlist", "POST", { action: "cancel", entryId: e.id });
    const chained = res.chained ?? [];
    return {
      toastTitle: `Listeden çıkarıldı: ${e.person.firstName} ${e.person.lastName}`,
      toastDesc: chained.length > 0 ? `Boşalan teklif sıradakine gitti: ${chained.map((c) => c.personName).join(", ")}` : undefined,
    };
  }, e.id);

  const addEntry = () => runAction(async () => {
    if (!addPersonId) throw new Error(t("registrations.selectPerson"));
    await apiSend("/api/waitlist", "POST", {
      action: "add",
      editionId,
      personId: addPersonId,
      categoryId: addCategoryId === "GENERAL" ? null : addCategoryId,
      priority: addPriority ? Number(addPriority) : undefined,
      notes: addNotes || undefined,
    });
    setAddOpen(false); setAddPersonId(""); setAddPriority(""); setAddNotes("");
    return { toastTitle: "Bekleme listesine eklendi", toastDesc: "Koltuk boşaldığında öncelik sırasına göre otomatik teklif gider." };
  }, "add");

  const busyAll = busyId != null;

  if (!editionId) return <EmptyState title="Edisyon seçilmedi" desc="Bekleme listesi edisyona bağlıdır." />;
  if (loading && !data) return <Loading rows={5} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const activeEntries = entries.filter((e) => ["WAITING", "OFFERED"].includes(e.status));
  const closedEntries = entries.filter((e) => !["WAITING", "OFFERED"].includes(e.status));
  const categoriesWithCapacity = (data?.categories ?? []).filter((c) => c.capacity != null || c.waitingCount > 0 || c.offeredCount > 0);

  return (
    <div>
      {/* KPI satırı */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Bekleyen" value={summary?.waiting ?? 0} sub={`${summary?.categoriesWithQueue ?? 0} kategoride sıra`} icon={<Icons.Hourglass className="size-4" />} tone="amber" />
        <KpiCard label="Teklif Aşamasında" value={summary?.offered ?? 0} sub="48 saat yanıtlık" icon={<Icons.MailOpen className="size-4" />} tone="teal" />
        <KpiCard label="Kayda Dönüşen" value={summary?.converted ?? 0} sub="onaylı kayıt açıldı" icon={<Icons.UserCheck className="size-4" />} tone="emerald" />
        <KpiCard label="Ret / Süre Aşımı" value={summary?.declinedExpired ?? 0} sub="sıradakine geçildi" icon={<Icons.MailX className="size-4" />} tone="rose" />
        <KpiCard label="Tam Dolu Kategori" value={summary?.fullCategories ?? 0} sub="koltuk bekleniyor" icon={<Icons.Lock className="size-4" />} tone="violet" />
      </div>

      {/* Kategori doluluk + otomatik teklif */}
      <SectionCard
        title="Kategori Doluluğu & Otomatik Teklif"
        desc="Koltuk boşaldığında sıradaki bekleyene 48 saatlik teklif otomatik gider (§12)"
        action={
          <Button size="sm" onClick={() => autoOffer()} disabled={busyAll || autoBusy}>
            {busyId === "global" || autoBusy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Wand2 className="size-4" />}
            Tümünü Tara
          </Button>
        }
        className="mb-4"
      >
        {categoriesWithCapacity.length === 0 ? (
          <EmptyState title="Kontenjanlı kategori yok" desc="Kategoriye capacity tanımlayın; doluluk ve bekleme burada izlenir." />
        ) : (
          <div className="grid gap-2.5">
            {categoriesWithCapacity.map((c) => {
              const full = c.capacity != null && (c.seatsLeft ?? 0) <= 0;
              const pct = c.fillPercent ?? 0;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/30">
                  <div className="min-w-36 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{c.name}</p>
                      <Chip tone="neutral">{c.code}</Chip>
                      {full && <Chip tone="rose">Dolu</Chip>}
                      {c.waitingCount > 0 && <Chip tone="amber">{c.waitingCount} bekleyen</Chip>}
                      {c.offeredCount > 0 && <Chip tone="teal">{c.offeredCount} teklifte</Chip>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-full max-w-52 overflow-hidden rounded bg-muted">
                        <div className={cn("h-full w-full origin-left rounded transition-transform duration-500", full ? "bg-rose-400" : pct >= 80 ? "bg-amber-400" : "bg-teal-500")} style={{ transform: `scaleX(${c.capacity == null ? 1 : Math.min(100, Math.max(0, pct)) / 100})` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {c.capacity == null ? `${c.taken} kayıt — sınırsız` : `${c.taken} / ${c.capacity} · boş ${c.seatsLeft}`}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={full ? "default" : "outline"}
                    className="h-8"
                    disabled={busyAll || c.waitingCount === 0}
                    onClick={() => autoOffer(c.id)}
                    title={full ? "Koltuk boşalınca otomatik çalışır — boşsa şimdi tarar" : "Boş koltuklara şimdi teklif dağıt"}
                  >
                    {busyId === c.id ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Wand2 className="size-4" />}
                    Otomatik Teklif
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Sıra listesi */}
      <SectionCard
        title="Bekleme Sırası"
        desc="Öncelik numarası küçük olan önce teklif alır; pozisyon kategori bazlıdır"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm kategoriler</SelectItem>
                <SelectItem value="GENERAL">Genel (kategorisiz)</SelectItem>
                {(data?.categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => setAddOpen(true)}>
              <Icons.UserPlus className="size-4" /> Listeye Ekle
            </Button>
          </div>
        }
      >
        {entries.length === 0 ? (
          <EmptyState title="Bekleme listesi boş" desc="Kategori dolduğunda kayıt formu otomatik bekleme önerir; buradan da elle ekleyebilirsiniz." />
        ) : (
          <>
            {/* aktif sıra */}
            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto maven-scroll">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Pozisyon</th>
                      <th className="px-3 py-2.5 font-medium">Kişi</th>
                      <th className="px-3 py-2.5 font-medium">Kategori</th>
                      <th className="px-3 py-2.5 font-medium">Öncelik</th>
                      <th className="px-3 py-2.5 font-medium">Durum</th>
                      <th className="px-3 py-2.5 font-medium">Teklif</th>
                      <th className="px-3 py-2.5 font-medium text-right">Eylem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEntries.map((e) => {
                      const pos = positionOf(e);
                      const cd = offerCountdown(e);
                      const rowBusy = busyId === e.id;
                      return (
                        <tr key={e.id} className="border-b transition hover:bg-muted/40 last:border-0">
                          <td className="px-3 py-2.5">
                            <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">{pos ?? "—"}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium leading-tight">{e.person.firstName} {e.person.lastName}</p>
                            <p className="text-xs text-muted-foreground">{e.person.company ?? e.person.email ?? "—"}</p>
                          </td>
                          <td className="px-3 py-2.5 text-xs">{e.category ? catName(e.category.id) ?? e.category.name : <span className="text-muted-foreground">Genel</span>}</td>
                          <td className="px-3 py-2.5 font-mono text-xs tabular-nums">#{e.priority}</td>
                          <td className="px-3 py-2.5"><StatusBadge map={WAITLIST_STATUS} value={e.status} /></td>
                          <td className="px-3 py-2.5 text-xs">
                            {e.status === "OFFERED" && cd ? (
                              <span className={cn("inline-flex items-center gap-1.5", cd.expired ? "font-medium text-rose-600" : "text-muted-foreground")}>
                                <Icons.Clock3 className={cn("size-3.5", cd.expired && "text-rose-500")} />
                                {cd.expired ? "Süresi doldu" : `${fmtDateTime(e.offeredAt)} — ${cd.text}`}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              {e.status === "WAITING" && (
                                isFullCategory(e.categoryId) ? (
                                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground/60" disabled title="Koltuk başına tek teklif — açık teklif yanıtlanınca sıradakine geçer">
                                    <Icons.Lock className="size-3.5" /> Koltuk Bekleniyor
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 border-sky-200 text-sky-700 hover:bg-sky-50" disabled={busyAll} onClick={() => sendOffer(e)}>
                                    {rowBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Send className="size-3.5" />} Teklif Gönder
                                  </Button>
                                )
                              )}
                              {e.status === "OFFERED" && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={busyAll} onClick={() => respond(e, "ACCEPT")} title="Davetli teklifi kabul etti (portal yanıtı simülasyonu)">
                                    <Icons.Check className="size-3.5" /> Kabul
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 border-rose-200 text-rose-700 hover:bg-rose-50" disabled={busyAll} onClick={() => respond(e, "DECLINE")} title="Davetli teklifi reddetti — sıradakine geçilir">
                                    <Icons.X className="size-3.5" /> Ret
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-primary/70 hover:text-primary" disabled={busyAll} title="Kişinin portal görünümünü aç"
                                onClick={() => {
                                  try { sessionStorage.setItem("maven.portal.person", e.personId); } catch { /* yoksay */ }
                                  useApp.getState().setModule("portals");
                                }}>
                                <Icons.ExternalLink className="size-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={busyAll} onClick={() => removeEntry(e)} title="Listeden çıkar">
                                <Icons.ListX className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* geçmiş (terminal durumlar) */}
            {closedEntries.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Geçmiş ({closedEntries.length})</p>
                <div className="grid gap-1.5">
                  {closedEntries.map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                      <span className="font-medium">{e.person.firstName} {e.person.lastName}</span>
                      <span className="text-muted-foreground">{e.category ? catName(e.category.id) ?? e.category.name : "Genel"}</span>
                      {e.status === "CONVERTED" && e.convertedRegistration && (
                        <span className="font-mono text-[11px] text-emerald-700">{e.convertedRegistration.confirmationNo}</span>
                      )}
                      <span className="ml-auto text-muted-foreground">{e.respondedAt ? `yanıt ${fmtDate(e.respondedAt)}` : `eklenme ${fmtDate(e.createdAt)}`}</span>
                      <StatusBadge map={WAITLIST_STATUS} value={e.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Listeye ekle dialogu */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bekleme listesine ekle</DialogTitle>
            <DialogDescription>Kişi koltuk boşaldığında öncelik sırasına göre otomatik teklif alır.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Kişi *</Label>
              <Select value={addPersonId} onValueChange={setAddPersonId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("registrations.selectPersonPh")} /></SelectTrigger>
                <SelectContent>
                  {(people ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.company ? ` — ${p.company}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategori</Label>
              <Select value={addCategoryId} onValueChange={setAddCategoryId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">Genel (kategorisiz sıra)</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Öncelik</Label>
                <Input type="number" min={1} value={addPriority} onChange={(e) => setAddPriority(e.target.value)} placeholder="otomatik: sıra sonu" className="mt-1" />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground">Küçük sayı önce teklif alır. Boş bırakılırsa sıranın sonuna eklenir.</p>
              </div>
            </div>
            <div>
              <Label>Not</Label>
              <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Örn. sponsor ile görüştü…" className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Vazgeç</Button>
            <Button onClick={addEntry} disabled={busyAll || !addPersonId}>
              {busyId === "add" ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.UserPlus className="size-4" />}
              Listeye Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Manuel Kayıt — detaylı tekil giriş (form-dışı: e-posta, telefon, saha) ──
// Kişi yoksa oluşturulur; e-posta eşleşirse mevcut kişiye kayıt açılır (canlı uyarı).
// ══════════════════════════════════════════════════════════════════════════
function ManualRegistrationDialog({ open, onOpenChange, editionId, categories, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editionId: string | null; categories: CategoryRow[]; onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const emptyManual = { firstName: "", lastName: "", email: "", phone: "", title: "", company: "", city: "", country: "", attendance: "NOT_ARRIVED", categoryId: "", status: "CONFIRMED", fundingSource: "SELF_PAID", notes: "" };
  const [form, setForm] = useState(emptyManual);
  const [busy, setBusy] = useState(false);
  const [emailHit, setEmailHit] = useState<PersonLite | null>(null);

  // canlı e-posta eşleşmesi — mevcut kişiye kayıt açılacağını önceden bildir
  // N-06: geçersiz e-postada temizleme render-fazında; arama effect'te kalır.
  {
    const emailCheck = form.email.trim().toLowerCase();
    const emailValid = emailCheck !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCheck);
    if (!emailValid && emailHit !== null) setEmailHit(null);
  }
  useEffect(() => {
    const email = form.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const people = await listEntity<PersonLite>("people", { q: email, limit: 10 });
        if (!alive) return;
        setEmailHit(people.find((p) => (p.email ?? "").toLowerCase() === email) ?? null);
      } catch { if (alive) setEmailHit(null); }
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [form.email]);

  const submit = async () => {
    if (!editionId) return;
    setBusy(true);
    try {
      const res = await apiSend<ManualResult>("/api/registrations/manual", "POST", {
        editionId,
        firstName: form.firstName, lastName: form.lastName,
        email: form.email || null, phone: form.phone || null, title: form.title || null,
        company: form.company || null, city: form.city || null, country: form.country || null,
        attendance: form.attendance, categoryId: form.categoryId || null,
        status: form.status, fundingSource: form.fundingSource, notes: form.notes || null,
      });
      toast({ title: t("regIo.manual.createdTitle"), description: t("regIo.manual.createdDesc", { no: res.confirmationNo, status: label(REGISTRATION_STATUS, res.status) }) });
      setForm(emptyManual); setEmailHit(null);
      onOpenChange(false); onSaved();
    } catch (e) {
      toast({ title: t("regIo.manual.failTitle"), description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof emptyManual, labelKey: string, type = "text", id?: string) => (
    <div>
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <Input id={id} type={type} className="mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onOpenChange(false); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("regIo.manual.title")}</DialogTitle>
          <DialogDescription>{t("regIo.manual.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Icons.User className="size-3.5" aria-hidden /> {t("regIo.manual.sectionPerson")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("firstName", "regIo.manual.firstName", "text", "manual-firstName")}
              {field("lastName", "regIo.manual.lastName", "text", "manual-lastName")}
              <div className="sm:col-span-2">
                <div><Label htmlFor="manual-email">{t("regIo.manual.email")}</Label>
                  <Input id="manual-email" type="email" className="mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                {emailHit && (
                  <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300" role="status">
                    <Icons.Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{t("regIo.manual.emailExists", { name: `${emailHit.firstName} ${emailHit.lastName}` })}</span>
                  </div>
                )}
              </div>
              {field("phone", "regIo.manual.phone", "tel")}
              {field("title", "regIo.manual.jobTitle")}
              {field("company", "regIo.manual.company")}
              {field("city", "regIo.manual.city")}
              {field("country", "regIo.manual.country")}
            </div>
          </section>

          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Icons.ScanLine className="size-3.5" aria-hidden /> {t("regIo.manual.sectionAttendance")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("regIo.manual.attendance")}</Label>
                <Select value={form.attendance} onValueChange={(v) => setForm({ ...form, attendance: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("regIo.manual.status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"].map((k) => (
                      <SelectItem key={k} value={k}>{label(REGISTRATION_STATUS, k)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Icons.ClipboardList className="size-3.5" aria-hidden /> {t("regIo.manual.sectionReg")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t("regIo.manual.category")}</Label>
                <Select
                  value={form.categoryId === "" ? "none" : form.categoryId}
                  onValueChange={(v) => setForm({ ...form, categoryId: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t("regIo.manual.categoryPh")} /></SelectTrigger>
                  <SelectContent className="maven-scroll max-h-64">
                    <SelectItem value="none">{t("regIo.manual.categoryNone")}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} · {c.basePrice > 0 ? `${(c.basePrice / 100).toLocaleString("tr-TR")} ${c.currency}` : "ücretsiz"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t("regIo.manual.funding")}</Label>
                <Select value={form.fundingSource} onValueChange={(v) => setForm({ ...form, fundingSource: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="maven-scroll max-h-64">
                    {Object.entries(FUNDING_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t("regIo.manual.notes")}</Label>
                <Textarea rows={2} className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("regIo.manual.notesPh")} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button onClick={submit} disabled={busy || !form.firstName.trim() || !form.lastName.trim()}>
            {busy ? <><Icons.Loader2 className="size-4 animate-spin" />{t("regIo.manual.submitting")}</> : <><Icons.UserPlus className="size-4" />{t("regIo.manual.submit")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Toplu İçe Aktarma — Excel/CSV → önizleme → commit ──────────────────────
// Firma listeleri ve e-postayla gelen toplu kayıtlar; mükerrer/hatalı satırlar
// önizlemede işaretlenir, commit'te otomatik atlanıp raporlanır.
// ══════════════════════════════════════════════════════════════════════════
const ISSUE_KIND_KEYS: Record<string, string> = {
  VALIDATION: "issueValidation", CATEGORY: "issueCategory", DUPLICATE_FILE: "issueDupFile",
  DUPLICATE_DB: "issueDupDb", CAPACITY: "issueCapacity", ERROR: "issueError",
};

function ImportRegistrationsDialog({ open, onOpenChange, editionId, categories, onImported }: {
  open: boolean; onOpenChange: (o: boolean) => void; editionId: string | null; categories: CategoryRow[]; onImported: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "parsing" | "previewing" | "preview" | "committing" | "done">("idle");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [defaultStatus, setDefaultStatus] = useState("CONFIRMED");
  const [defaultFunding, setDefaultFunding] = useState("SELF_PAID");

  const reset = () => { setPhase("idle"); setRows([]); setPreview(null); setResult(null); setFileName(""); };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
      t("regIo.manual.firstName"), t("regIo.manual.lastName"), t("regIo.manual.email"), t("regIo.manual.phone"),
      t("regIo.manual.jobTitle"), t("regIo.manual.company"), t("regIo.manual.city"), t("regIo.manual.country"),
      t("regIo.manual.category"), t("regIo.manual.notes"),
    ];
    const sample = [
      ["Ayşe", "Yılmaz", "ayse@ornek.com", "+905551112233", "Proje Direktörü", "Örnek A.Ş.", "İstanbul", "Türkiye", categories[0]?.name ?? "", ""],
      ["Mehmet", "Demir", "mehmet@ornek.com", "", "", "Diğer Ltd.", "Ankara", "Türkiye", "", ""],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...sample]), "Sablon");
    XLSX.writeFile(wb, "kayit-import-sablonu.xlsx");
  };

  const handleFile = async (file: File) => {
    if (!editionId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("regIo.import.failTitle"), description: t("regIo.import.fileTooBig"), variant: "destructive" });
      return;
    }
    setFileName(file.name); setPhase("parsing");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      // N-05: sheetRows tavanı — bozuk/devasa dosyanın parse maliyetini sınırlar
      // (CVE-2024-22363 ReDoS yüzeyini küçültür; tam çözüm exceljs göçüdür).
      const wb = XLSX.read(buf, { type: "array", sheetRows: 1005 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error(t("regIo.import.fileEmpty"));
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
      if (parsed.length === 0) throw new Error(t("regIo.import.fileNoRows"));
      setRows(parsed);
      setPhase("previewing");
      const pv = await apiSend<ImportPreview>("/api/registrations/import", "POST", {
        editionId, rows: parsed, defaultStatus, defaultFundingSource: defaultFunding,
      });
      setPreview(pv); setPhase("preview");
    } catch (e) {
      toast({ title: t("regIo.import.failTitle"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
      setPhase("idle");
    }
  };

  const commit = async () => {
    if (!editionId || rows.length === 0) return;
    setPhase("committing");
    try {
      const res = await apiSend<ImportResult>("/api/registrations/import", "POST", {
        editionId, rows, commit: true, defaultStatus, defaultFundingSource: defaultFunding,
      });
      setResult(res); setPhase("done");
      toast({ title: t("regIo.import.doneTitle"), description: t("regIo.import.doneDesc", { imported: res.imported, skipped: res.skipped.length }) });
      onImported();
    } catch (e) {
      toast({ title: t("regIo.import.failTitle"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
      setPhase("preview");
    }
  };

  const issueLine = (x: ImportIssue) => (
    <li key={`${x.row}-${x.kind}-${x.reason}`} className="flex items-start gap-2 text-xs">
      <Chip tone={x.kind === "CAPACITY" || x.kind === "DUPLICATE_DB" || x.kind === "DUPLICATE_FILE" ? "amber" : "rose"}>{t(`regIo.import.${ISSUE_KIND_KEYS[x.kind] ?? "issueError"}`)}</Chip>
      <span className="min-w-0 flex-1"><b>{x.name}</b> · {x.reason}</span>
      <span className="shrink-0 text-muted-foreground">#{x.row}</span>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && phase !== "committing") { onOpenChange(false); reset(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("regIo.import.title")}</DialogTitle>
          <DialogDescription>{t("regIo.import.desc")}</DialogDescription>
        </DialogHeader>

        {/* 1) dosya seçimi + şablon */}
        {phase === "idle" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/40">
              <Icons.FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{t("regIo.import.pickFile")}</span>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            </label>
            <div className="flex justify-center">
              <Button variant="link" size="sm" className="gap-1.5 text-xs" onClick={() => void downloadTemplate()}>
                <Icons.Download className="size-3.5" aria-hidden />{t("regIo.import.template")}
              </Button>
            </div>
          </div>
        )}

        {(phase === "parsing" || phase === "previewing") && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
            {phase === "parsing" ? t("regIo.import.parsing") : t("regIo.import.previewing")}
          </div>
        )}

        {/* 2) önizleme — sayım çipleri + sorunlar + tablo */}
        {phase === "preview" && preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone="neutral">{t("regIo.import.rowsTotal", { n: preview.total })}</Chip>
              <Chip tone="emerald">{t("regIo.import.rowsValid", { n: preview.valid })}</Chip>
              {preview.issues.length > 0 && <Chip tone="rose">{t("regIo.import.rowsIssues", { n: preview.issues.length })}</Chip>}
            </div>
            <p className="text-xs text-muted-foreground">
              {Object.keys(preview.mapping).length > 0
                ? t("regIo.import.mappedCols", { cols: Object.values(preview.mapping).join(", ") })
                : t("regIo.import.colNotMapped")}
            </p>

            {/* toplu varsayılanlar — kolon yoksa uygulanan durum/fon kaynağı */}
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("regIo.import.defaultStatus")}</Label>
                <Select value={defaultStatus} onValueChange={setDefaultStatus}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"].map((k) => (
                      <SelectItem key={k} value={k}>{label(REGISTRATION_STATUS, k)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("regIo.import.defaultFunding")}</Label>
                <Select value={defaultFunding} onValueChange={setDefaultFunding}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="maven-scroll max-h-60">
                    {Object.entries(FUNDING_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preview.issues.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{t("regIo.import.issuesTitle")}</p>
                <ul className="maven-scroll max-h-40 space-y-1.5 overflow-y-auto rounded-lg border p-2.5">
                  {preview.issues.slice(0, 100).map(issueLine)}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("regIo.import.previewTitle", { n: Math.min(8, preview.total) })}</p>
              <div className="maven-scroll max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2.5 py-2 font-medium">#</th>
                      <th className="px-2.5 py-2 font-medium">{t("regIo.import.headerName")}</th>
                      <th className="px-2.5 py-2 font-medium">{t("regIo.import.headerEmail")}</th>
                      <th className="px-2.5 py-2 font-medium">{t("regIo.import.headerCompany")}</th>
                      <th className="px-2.5 py-2 font-medium">{t("regIo.import.headerCategory")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2.5 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-2.5 py-1.5">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</td>
                        <td className="px-2.5 py-1.5">{String(r.email ?? "") || "—"}</td>
                        <td className="px-2.5 py-1.5">{String(r.company ?? "") || "—"}</td>
                        <td className="px-2.5 py-1.5">{String(r.category ?? "") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={reset}>{t("regIo.import.repick")}</Button>
              <Button size="sm" disabled={preview.valid === 0} onClick={commit}>
                <Icons.FileUp className="size-4" aria-hidden />{t("regIo.import.commit", { n: preview.valid })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* 3) sonuç */}
        {phase === "committing" && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Icons.Loader2 className="size-4 animate-spin" aria-hidden />{t("regIo.import.committing")}
          </div>
        )}
        {phase === "done" && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
              <Icons.CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm font-medium">{t("regIo.import.doneDesc", { imported: result.imported, skipped: result.skipped.length })}</p>
            </div>
            {result.skipped.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">{t("regIo.import.skippedTitle")}</p>
                <ul className="maven-scroll max-h-40 space-y-1.5 overflow-y-auto rounded-lg border p-2.5">
                  {result.skipped.slice(0, 100).map(issueLine)}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button size="sm" onClick={() => { onOpenChange(false); reset(); }}>Tamam</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ── Dışa Aktarma — Excel listesi + resmi onay belgesi modu ─────────────────
// Kurum/kuruluş "kayıtlarınız tamamlandı — son resmi onay" yazışmaları için
// başlık + künye + tablo + imza bloğu içeren belge formatı.
// ══════════════════════════════════════════════════════════════════════════
function ExportRegistrationsDialog({ open, onOpenChange, editionId, statusFilter, q }: {
  open: boolean; onOpenChange: (o: boolean) => void; editionId: string | null; statusFilter: string; q: string;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [company, setCompany] = useState("");
  const [official, setOfficial] = useState(false);

  // kurum filtresi girilince resmi belge modu otomatik önerilir (olay-güdümlü — effect yok)
  const onCompanyChange = (value: string) => {
    setCompany(value);
    if (value.trim()) setOfficial(true);
  };

  const doExport = () => {
    if (!editionId) return;
    const sp = new URLSearchParams({ editionId });
    if (statusFilter !== "ALL") sp.set("status", statusFilter);
    if (q.trim()) sp.set("q", q.trim());
    if (company.trim()) sp.set("company", company.trim());
    if (official) sp.set("official", "1");
    // N-06: indirme geçici bağlantıyla tetiklenir (sayfa gezinmesi yok).
    const a = document.createElement("a");
    a.href = `/api/registrations/export?${sp.toString()}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast({ title: t("regIo.export.startedTitle"), description: t("regIo.export.startedDesc") });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("regIo.export.title")}</DialogTitle>
          <DialogDescription>{t("regIo.export.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("regIo.export.scope")}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="neutral">
                {statusFilter === "ALL" ? t("regIo.export.scopeAll") : t("regIo.export.scopeStatus", { status: label(REGISTRATION_STATUS, statusFilter) })}
              </Chip>
              {q.trim() && <Chip tone="teal">{t("regIo.export.scopeQ", { q: q.trim() })}</Chip>}
            </div>
          </div>

          <div>
            <Label htmlFor="export-company">{t("regIo.export.company")}</Label>
            <Input id="export-company" className="mt-1" value={company} onChange={(e) => onCompanyChange(e.target.value)} placeholder={t("regIo.export.companyPh")} />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              checked={official}
              onChange={(e) => setOfficial(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-teal-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("regIo.export.official")}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{t("regIo.export.officialHint")}</span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button onClick={doExport}><Icons.FileDown className="size-4" aria-hidden />{t("regIo.export.download")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Kurum Onay Postası — birleştirilmiş "kayıtlarınız tamamlandı + son resmî onay" ──
// Kullanıcı ilkesi: firma/kurum/kuruluşlar kayıtlarının tamamlandığına dair resmî
// onay ister. Her seçilen kuruma TEK mektup gönderilir; içinde kurumun onaylı
// katılımcı tablosu vardır (ad, kategori, teyit no, durum). Alıcı: Organization
// genel e-postası. Önizleme yazım yapmaz; gönderim dispatchMail çekirdeğinden geçer.
interface ApprovalOrgRow {
  organizationId: string;
  name: string;
  email: string | null;
  approvedCount: number;
}
interface ApprovalSendReport {
  mode: "send";
  sent: number;
  failed: number;
  totalApproved: number;
  details: { organizationId: string; name: string; approvedCount: number; ok: boolean; error?: string }[];
}

function ApprovalMailDialog({ open, onOpenChange, editionId }: { open: boolean; onOpenChange: (o: boolean) => void; editionId: string | null }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<ApprovalOrgRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ApprovalSendReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async () => {
    if (!editionId) return;
    setOrgs(null); setReport(null); setError(null); setSelected(new Set());
    try {
      const res = await apiSend<{ mode: string; organizations: ApprovalOrgRow[] }>("/api/registrations/approval-mail", "POST", { editionId });
      setOrgs(res.organizations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    }
  };

  // açılışta önizleme yükle (N-06: tetikleme microtask'te — effect gövdesinde senkron setState yok).
  useEffect(() => {
    if (!(open && editionId)) return;
    queueMicrotask(() => void loadPreview());
  }, [open, editionId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectable = (orgs ?? []).filter((o) => Boolean(o.email) && o.approvedCount > 0);

  const send = async () => {
    if (!editionId || selected.size === 0) return;
    setBusy(true);
    try {
      const res = await apiSend<ApprovalSendReport>("/api/registrations/approval-mail", "POST", {
        editionId, mode: "send", organizationIds: [...selected],
      });
      setReport(res);
      toast({
        title: t("regMail.doneTitle"),
        description: t("regMail.doneDesc", { sent: res.sent, failed: res.failed, n: res.totalApproved }),
        variant: res.failed > 0 ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: t("regMail.failTitle"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReport(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto maven-scroll sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("regMail.title")}</DialogTitle>
          <DialogDescription>{t("regMail.desc")}</DialogDescription>
        </DialogHeader>

        {!report && (
          <div className="space-y-3">
            {orgs === null ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                <Icons.Loader2 className="size-4 animate-spin" aria-hidden />{t("regMail.loading")}
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={() => void loadPreview()} />
            ) : orgs.length === 0 ? (
              <EmptyState title={t("regMail.emptyTitle")} desc={t("regMail.emptyDesc")} />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{t("regMail.listTitle", { n: orgs.length })}</p>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-teal-700 hover:underline"
                    onClick={() => setSelected(new Set(selectable.map((o) => o.organizationId)))}
                  >
                    {t("regMail.selectAll")}
                  </button>
                </div>
                <div className="maven-scroll max-h-64 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                  {orgs.map((o) => {
                    const reachable = Boolean(o.email) && o.approvedCount > 0;
                    return (
                      <label key={o.organizationId} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors", !reachable && "cursor-not-allowed opacity-55", selected.has(o.organizationId) && "border-teal-300 bg-teal-50/50 dark:bg-teal-900/10")}>
                        <input
                          type="checkbox"
                          disabled={!reachable}
                          checked={selected.has(o.organizationId)}
                          onChange={() => toggle(o.organizationId)}
                          className="mt-0.5 size-4 shrink-0 accent-teal-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{o.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <Chip tone="emerald">{t("regMail.approvedCount", { n: o.approvedCount })}</Chip>
                            {o.email ? <span dir="ltr">{o.email}</span> : <span className="text-amber-600">{t("regMail.noEmail")}</span>}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="flex items-start gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
                  <Icons.Info className="mt-0.5 size-3 shrink-0" aria-hidden />{t("regMail.hint")}
                </p>
              </>
            )}
          </div>
        )}

        {report && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20"><p className="text-lg font-semibold tabular-nums">{report.sent}</p><p className="text-muted-foreground">{t("regMail.resSent")}</p></div>
              <div className="rounded-lg bg-sky-50 p-3 dark:bg-sky-900/20"><p className="text-lg font-semibold tabular-nums">{report.totalApproved}</p><p className="text-muted-foreground">{t("regMail.resApproved")}</p></div>
              <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20"><p className="text-lg font-semibold tabular-nums">{report.failed}</p><p className="text-muted-foreground">{t("regMail.resFailed")}</p></div>
            </div>
            {report.details.filter((d) => !d.ok).length > 0 && (
              <ul className="maven-scroll max-h-32 space-y-1.5 overflow-y-auto rounded-lg border p-2.5">
                {report.details.filter((d) => !d.ok).map((d) => (
                  <li key={d.organizationId} className="text-xs"><b>{d.name}</b> · {d.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          {!report && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => void send()} disabled={busy || selectable.length === 0 || selected.size === 0}>
                <Icons.MailCheck className="size-4" aria-hidden />{busy ? t("regMail.sending") : t("regMail.sendBtn", { n: selected.size })}
              </Button>
            </>
          )}
          {report && <Button onClick={() => { onOpenChange(false); setReport(null); }}>{t("common.close")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
