"use client";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Kanban,
  Building,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Users,
  Calendar,
  Sparkles,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface KanbanAgreement {
  id: string;
  amount: number;
  currency: string;
  status: string; // LEAD | PROPOSAL | CONTRACT | PAID (veya mevcut status map)
  signedAt?: string | null;
  organization: { id: string; name: string };
  package?: { id: string; name: string } | null;
  tier?: { id: string; name: string } | null;
}

export interface SponsorshipKanbanProps {
  agreements: KanbanAgreement[];
  onMoveStage?: (agreementId: string, targetStage: string) => Promise<void>;
  onNewDeal?: (deal: { orgName: string; amount: number; stage: string; tierName: string }) => Promise<void>;
}

const STAGES = [
  { key: "LEAD", label: "1. Aday / Görüşme (Lead)", color: "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700" },
  { key: "PROPOSAL", label: "2. Teklif Gönderildi", color: "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700" },
  { key: "CONTRACT", label: "3. Sözleşme İmzası", color: "border-purple-300 bg-purple-50/50 dark:bg-purple-950/20 text-purple-700" },
  { key: "PAID", label: "4. Tahsil Edildi (Kesin)", color: "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700" },
];

export function SponsorshipKanban({
  agreements,
  onMoveStage,
  onNewDeal,
}: SponsorshipKanbanProps) {
  const [b2bOpen, setB2bOpen] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [newOrg, setNewOrg] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newStage, setNewStage] = useState("LEAD");
  const [newTier, setNewTier] = useState("GOLD");
  const [saving, setSaving] = useState(false);

  // Normalize agreement status to the 4 pipeline stages
  const stageMap = useMemo(() => {
    const map: Record<string, KanbanAgreement[]> = {
      LEAD: [],
      PROPOSAL: [],
      CONTRACT: [],
      PAID: [],
    };

    for (const a of agreements) {
      const st = (a.status || "").toUpperCase();
      if (st === "PAID" || st === "CONFIRMED" || st === "COMPLETED") {
        map.PAID.push(a);
      } else if (st === "CONTRACT" || st === "SIGNED" || a.signedAt) {
        map.CONTRACT.push(a);
      } else if (st === "PROPOSAL" || st === "OFFERED" || st === "IN_REVIEW") {
        map.PROPOSAL.push(a);
      } else {
        map.LEAD.push(a);
      }
    }
    return map;
  }, [agreements]);

  const handleCreateDeal = async () => {
    if (!newOrg.trim() || !onNewDeal) return;
    setSaving(true);
    try {
      await onNewDeal({
        orgName: newOrg.trim(),
        amount: Number(newAmount) || 0,
        stage: newStage,
        tierName: newTier,
      });
      setNewDealOpen(false);
      setNewOrg("");
      setNewAmount("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Üst Bar: Pipeline Başlığı ve B2B Butonu */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <Kanban className="size-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sponsorluk Satış Boru Hattı (Kanban)</h3>
            <p className="text-[11px] text-muted-foreground">Lead → Teklif → Sözleşme → Tahsilat aşamaları</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setB2bOpen(true)}>
            <Users className="size-3.5 text-primary" /> B2B Matchmaking Matrisi
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setNewDealOpen(true)}>
            <Plus className="size-3.5" /> Yeni Sponsor Anlaşması
          </Button>
        </div>
      </div>

      {/* 4 Kolonlu Kanban Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {STAGES.map((col, idx) => {
          const items = stageMap[col.key] || [];
          const totalAmount = items.reduce((acc, curr) => acc + (curr.amount || 0), 0);

          return (
            <div key={col.key} className="rounded-xl border bg-muted/20 p-3 space-y-3 flex flex-col min-h-[450px]">
              {/* Kolon Başlığı & Hacim */}
              <div className="border-b pb-2">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", col.color)}>
                    {col.label}
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">{items.length}</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Toplam Hacim:</span>
                  <span className="font-bold text-foreground tabular-nums">₺{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* Kolon Kartları */}
              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {items.length === 0 ? (
                  <div className="h-28 flex items-center justify-center text-[11px] text-muted-foreground border border-dashed rounded-lg">
                    Bu aşamada anlaşma yok
                  </div>
                ) : (
                  items.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-lg border bg-background p-3 shadow-xs space-y-2 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-semibold text-xs text-foreground line-clamp-1">
                          {deal.organization.name}
                        </span>
                        {deal.tier && (
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {deal.tier.name}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="font-bold text-emerald-600 tabular-nums">
                          ₺{(deal.amount || 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {deal.package?.name ?? "Standart"}
                        </span>
                      </div>

                      {/* Aşama İlerletme Butonları */}
                      <div className="border-t pt-2 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {deal.signedAt ? "İmzalandı" : "Taslak"}
                        </span>
                        {idx < STAGES.length - 1 && onMoveStage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-1.5 gap-1 text-primary hover:bg-primary/10"
                            onClick={() => onMoveStage(deal.id, STAGES[idx + 1].key)}
                          >
                            İlerlet <ArrowRight className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* B2B Matchmaking Masa x Zaman Randevu Matrisi Modalı */}
      <Dialog open={b2bOpen} onOpenChange={setB2bOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4 text-primary" />
              B2B Matchmaking — Masa × Zaman Randevu Matrisi (Swapcard / Brella Prototipi)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">İkili İş Görüşmeleri (B2B Area)</p>
                <p className="text-[11px] text-muted-foreground">15 dakikalık oturumlar, 10 B2B Masası</p>
              </div>
              <Badge className="bg-primary text-primary-foreground">AI Algoritmik Eşleştirme Aktif</Badge>
            </div>

            {/* Masa x Saat Matrisi */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b bg-muted/60 text-muted-foreground">
                    <th className="p-2.5 font-medium border-r w-20 text-center">Saat</th>
                    {["Masa 1 (İlaç)", "Masa 2 (Cihaz)", "Masa 3 (Biyotek)", "Masa 4 (Yazılım)"].map((m) => (
                      <th key={m} className="p-2.5 font-semibold text-foreground border-r last:border-r-0">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { time: "10:00", t1: "Novartis ↔ Prof. Kaya", t2: "Boş", t3: "Roche ↔ Dr. Akın", t4: "Siemens ↔ Başhekimlik" },
                    { time: "10:30", t1: "Pfizer ↔ Doç. Demir", t2: "Philips ↔ Klinik", t3: "Boş", t4: "GE Health ↔ Satınalma" },
                    { time: "11:00", t1: "Bayer ↔ Onkoloji D.", t2: "Sanofi ↔ Heyet", t3: "AstraZeneca ↔ Ar-Ge", t4: "Boş" },
                    { time: "11:30", t1: "Boş", t2: "Tıbbi Cihazlar ↔ Komite", t3: "Boş", t4: "Klinik Yazılım ↔ IT" },
                  ].map((row) => (
                    <tr key={row.time} className="hover:bg-muted/10">
                      <td className="p-2 border-r text-center font-mono text-muted-foreground bg-muted/20">{row.time}</td>
                      {[row.t1, row.t2, row.t3, row.t4].map((slot, i) => (
                        <td key={i} className="p-2 border-r last:border-r-0">
                          {slot === "Boş" ? (
                            <span className="text-[10px] text-muted-foreground italic">Uygun Slot</span>
                          ) : (
                            <div className="rounded bg-primary/10 border border-primary/20 p-1 font-medium text-foreground text-[11px]">
                              {slot}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setB2bOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni Sponsorluk Anlaşması Modalı */}
      <Dialog open={newDealOpen} onOpenChange={setNewDealOpen}>
        <DialogContent className="sm:max-w-md text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="size-4 text-primary" />
              Yeni Sponsorluk Anlaşması Oluştur
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Firma / Sponsor Adı</Label>
              <Input
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                placeholder="Örn: Acme Medikal A.Ş."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Anlaşma Tutarı (TL)</Label>
                <Input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="250000"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sponsorluk Seviyesi</Label>
                <Select value={newTier} onValueChange={setNewTier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLATINUM">Platinum Sponsor</SelectItem>
                    <SelectItem value="GOLD">Gold Sponsor</SelectItem>
                    <SelectItem value="SILVER">Silver Sponsor</SelectItem>
                    <SelectItem value="BRONZE">Bronze Sponsor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Başlangıç Aşaması</Label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDealOpen(false)} disabled={saving}>Vazgeç</Button>
            <Button onClick={handleCreateDeal} disabled={saving || !newOrg.trim()}>
              {saving ? "Kaydediliyor..." : "Anlaşmayı Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
