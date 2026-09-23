"use client";
// Kayıt & Katılımcılar — çok eksenli durum (kayıt × ödeme × katılım ayrı), onay akışı, LCV
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { REGISTRATION_STATUS, REG_SOURCES, FUNDING_SOURCES, ATTENDANCE_STATUS, INVITATION_STATUS, fmtDateTime, fmtDate, label } from "@/lib/constants";
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
    person: { id: string; firstName: string; lastName: string; email?: string | null; company?: string | null };
    roleAssignments?: { role: string }[];
  };
  entitlementClaims?: { id: string; status: string; entitlement: { label: string } }[];
}
interface CategoryRow { id: string; name: string; code: string; basePrice: number; currency: string; requiresApproval: boolean; capacity?: number | null; paymentInstruction?: string | null; isActive: boolean; _count?: { registrations: number } }
interface InvitationRow { id: string; fullName: string; email: string; status: string; sentAt?: string | null; respondedAt?: string | null; organization?: { name: string } | null }

export function RegistrationsView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [decideTarget, setDecideTarget] = useState<{ reg: RegRow; decision: "CONFIRMED" | "REJECTED" | "CANCELLED" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"list" | "lcv">("list");

  const regsLoader = async () => {
    const items = await listEntity<RegRow>("registrations", { editionId: currentEditionId ?? undefined, status: statusFilter === "ALL" ? undefined : statusFilter, limit: 400 });
    const needle = q.toLocaleLowerCase("tr-TR");
    return needle ? items.filter((r) => `${r.participation.person.firstName} ${r.participation.person.lastName} ${r.participation.person.email ?? ""} ${r.confirmationNo}`.toLocaleLowerCase("tr-TR").includes(needle)) : items;
  };
  const { data: registrations, error, reload, loading } = useApi<RegRow[]>(regsLoader, [currentEditionId, statusFilter, q, refreshKey]);
  const { data: categories } = useApi<CategoryRow[]>(() => listEntity<CategoryRow>("registration-categories", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: invitations } = useApi<InvitationRow[]>(() => listEntity<InvitationRow>("invitations", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey, tab]);

  const decide = async () => {
    if (!decideTarget) return;
    setBusy(true);
    try {
      if (decideTarget.decision === "CANCELLED") {
        await apiSend("/api/flows", "POST", { action: "registration.cancel", registrationId: decideTarget.reg.id, reason });
      } else {
        await apiSend("/api/flows", "POST", { action: "registration.decide", registrationId: decideTarget.reg.id, decision: decideTarget.decision });
      }
      toast({
        title: decideTarget.decision === "CONFIRMED" ? "Kayıt onaylandı" : decideTarget.decision === "REJECTED" ? "Kayıt reddedildi" : "Kayıt iptal edildi",
        description: decideTarget.decision === "CONFIRMED"
          ? "Hak claim'i CONSUMED'a geçti, rozet READY — ödeme durumu ayrı hesaplanır."
          : "Rozet ve haklar etkilendi; etki önizlemesi kayıtta görülür.",
      });
      setDecideTarget(null); setReason(""); reload(); bump();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const counts = (s: string) => (s === "ALL" ? (registrations ?? []).length : (registrations ?? []).filter((r) => r.status === s).length);

  return (
    <div>
      <PageHeader title="Kayıt & Katılımcılar" desc="Kategori → form → onay akışı; kayıt/ödeme/katılım üç ayrı eksen">
        <div className="flex rounded-lg border p-0.5">
          <button onClick={() => setTab("list")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Kayıtlar</button>
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
                sub={c.basePrice > 0 ? `${c.basePrice.toLocaleString("tr-TR")} ${c.currency}` : "ücretsiz"}
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
            <span className="ml-auto text-xs text-muted-foreground">{(registrations ?? []).length} kayıt listelendi</span>
          </div>

          {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (registrations ?? []).length === 0 ? (
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
                    {(registrations ?? []).map((r) => (
                      <tr key={r.id} className="border-b transition hover:bg-muted/40 last:border-0">
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
            </div>
          )}
        </>
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
                <li>Rozet <b>READY</b> durumuna geçer</li>
                <li>Ödeme gereksinimi ayrıca hesaplanır — fon kaynağı: {label(FUNDING_SOURCES, decideTarget?.reg.fundingSource)}</li>
              </ul>
            )}
            {decideTarget?.decision === "CANCELLED" && (
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Rozet <b>VOID</b> olur ve erişim hakkı etkilenir</li>
                <li>Sponsor hakları geri yüklenir (politika gereği ayrıca karar)</li>
                <li>İade ayrı bir finansal işlemdir — burada otomatik yapılmaz</li>
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
    </div>
  );
}
