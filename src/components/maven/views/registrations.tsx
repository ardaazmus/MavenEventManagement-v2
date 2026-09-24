"use client";
// Kayıt & Katılımcılar — çok eksenli durum (kayıt × ödeme × katılım ayrı), onay akışı, LCV, bekleme listesi
import { useMemo, useState } from "react";
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

export function RegistrationsView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [decideTarget, setDecideTarget] = useState<{ reg: RegRow; decision: "CONFIRMED" | "REJECTED" | "CANCELLED" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"list" | "waitlist" | "lcv">("list");

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
      toast({ title: "Değişiklikler kaydedildi", description: "Kişi, katılım ve kayıt alanları güncellendi." });
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
  const { data: invitations } = useApi<InvitationRow[]>(() => listEntity<InvitationRow>("invitations", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey, tab]);

  const decide = async () => {
    if (!decideTarget) return;
    setBusy(true);
    try {
      if (decideTarget.decision === "CANCELLED") {
        const res = await apiSend<{ waitlistOffered?: { personName: string }[] }>("/api/flows", "POST", { action: "registration.cancel", registrationId: decideTarget.reg.id, reason });
        const offers = res.waitlistOffered ?? [];
        toast({
          title: "Kayıt iptal edildi",
          description: offers.length > 0
            ? `Koltuk boşaldı — bekleme listesinden teklif gönderildi: ${offers.map((o) => o.personName).join(", ")}`
            : "Yaka kartı ve haklar etkilendi; etki önizlemesi kayıtta görülür.",
        });
      } else {
        await apiSend("/api/flows", "POST", { action: "registration.decide", registrationId: decideTarget.reg.id, decision: decideTarget.decision });
        toast({
          title: decideTarget.decision === "CONFIRMED" ? "Kayıt onaylandı" : "Kayıt reddedildi",
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

  const counts = (s: string) => (s === "ALL" ? registrations.length : registrations.filter((r) => r.status === s).length);

  return (
    <div>
      <PageHeader title="Kayıt & Katılımcılar" desc="Kategori → form → onay akışı; kayıt/ödeme/katılım üç ayrı eksen">
        <div className="flex rounded-lg border p-0.5">
          <button onClick={() => setTab("list")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Kayıtlar</button>
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
                <SelectItem value="ALL">Tüm durumlar ({counts("ALL")})</SelectItem>
                {Object.entries(REGISTRATION_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v} ({counts(k)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Ad / e-posta / kayıt no…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64" />
            <Button variant="ghost" size="sm" onClick={reload}><Icons.RefreshCw className="size-4" /></Button>
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
      ) : tab === "waitlist" ? (
        <WaitlistTab editionId={currentEditionId} categories={categories ?? []} onChanged={() => { bump(); }} />
      ) : (
        <SectionCard title="LCV — Davet Listesi Yönetimi" desc="Davet bir kayıt yerine geçmez; 'gelecek' yanıtı kayıt yoluna yönlenir">
          {(invitations ?? []).length === 0 ? (
            <EmptyState title="Henüz davet oluşturmadınız" desc="Davetli ekleyin veya davet listesi yükleyin." />
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
              {editBusy ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Bekleme Listesi sekmesi — otomatik teklif motoru (§12 kayıt politikası) ──
function WaitlistTab({ editionId, categories, onChanged }: { editionId: string | null; categories: CategoryRow[]; onChanged: () => void }) {
  const { refreshKey } = useApp();
  const { toast } = useToast();
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
    if (!addPersonId) throw new Error("Kişi seçin");
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
                        <div className={cn("h-full rounded transition-all", full ? "bg-rose-400" : pct >= 80 ? "bg-amber-400" : "bg-teal-500")} style={{ width: `${c.capacity == null ? 100 : pct}%` }} />
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
                <SelectTrigger className="mt-1"><SelectValue placeholder="Kişi seçin…" /></SelectTrigger>
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
