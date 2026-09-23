"use client";
// Dış Portal — sponsor ve katılımcı self-servis önizlemesi.
// Mimari (§20, §60): dış portallar ayrı uygulama, ortak kimlik. Maven veri sahibi;
// bu ekran, dış kullanıcının göreceği portalı gerçek verilerle önizler ve
// portal aksiyonlarını (teklif yanıtı, teslim gönderimi, ödeme linki) çalıştırır.
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { useApp } from "@/lib/store";
import { listEntity, apiGet, apiSend } from "@/lib/client";
import {
  REGISTRATION_STATUS, WAITLIST_STATUS, PAYMENT_STATUS, PAYMENT_METHODS, ORDER_STATUS,
  ATTENDANCE_STATUS, DELIVERABLE_STATUS, EVENT_ROLES, REG_SOURCES, FUNDING_SOURCES,
  BOOTH_STATUS, label, fmtMoney, fmtDate,
} from "@/lib/constants";
import { PageHeader, SectionCard, StatusBadge, Chip, EmptyState, Loading, ErrorState, useApi } from "@/components/maven/bits";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── tipler ─────────────────────────────────────────────────────────────────
type PersonRow = { id: string; firstName: string; lastName: string; title?: string | null; company?: string | null };
type ParticipationRow = { id: string; person: PersonRow; registrations?: { status: string }[] };
type AgreementRow = { id: string; organization: { id: string; name: string }; status: string; tier?: { name: string } | null };

// R10-c: dış portal üst bant tasarımı — EventEdition üzerindeki portalHeader* skalerleri
type PortalHeaderDraft = { title: string; subtitle: string; imageUrl: string; accent: string };
type EditionRow = {
  id: string; name: string;
  portalHeaderTitle?: string | null; portalHeaderSubtitle?: string | null;
  portalHeaderImageUrl?: string | null; portalHeaderAccent?: string | null;
};

type PortalOrder = {
  id: string; orderNo: string; status: string; totalAmount: number; currency: string; payerName?: string | null;
  lines: { id: string; description: string; quantity: number; total: number; personName?: string | null }[];
  payments: { id: string; amount: number; source: string; status: string; reference?: string | null; paidAt?: string | null }[];
  paid: number; pending: number; remaining: number;
};

type ParticipantData = {
  edition: { id: string; name: string; startDate: string; endDate: string; venueName?: string | null; city?: string | null; seriesName?: string | null } | null;
  person: { id: string; firstName: string; lastName: string; email?: string | null; title?: string | null; organizationName?: string | null };
  participation: {
    id: string; source: string; attendance: string; notes?: string | null;
    roleAssignments: { id: string; role: string }[];
    badges: { id: string; status: string; badgeNo: string; profileName?: string | null }[];
    certificates: { id: string; status: string; note?: string | null; definitionName?: string | null; generatedAt?: string | null; deliveredAt?: string | null }[];
    snapshot?: { badgeName: string; company?: string | null; title?: string | null } | null;
    reservations: { id: string; guestName?: string | null; checkIn: string; checkOut: string; status: string; payerType?: string | null; payerName?: string | null; roomType?: string | null; hotel?: string | null }[];
    program: { id: string; role: string; sessionTitle?: string | null; sessionType?: string | null; startTime?: string | null; endTime?: string | null; room?: string | null; cmeCredits?: number }[];
    claims: { id: string; status: string; guestName?: string | null; entitlementLabel?: string | null }[];
  } | null;
  registrations: { id: string; confirmationNo: string; status: string; source: string; fundingSource: string; submittedAt?: string | null; decidedAt?: string | null; cancelReason?: string | null; notes?: string | null; categoryName?: string | null; categoryCode?: string | null; basePrice: number; currency: string }[];
  orders: PortalOrder[];
  waitlist: { id: string; status: string; priority: number; notes?: string | null; offeredAt?: string | null; offerExpiresAt?: string | null; respondedAt?: string | null; categoryName: string; categoryCode?: string | null; convertedRegistrationNo?: string | null }[];
};

type SponsorData = {
  edition: { id: string; name: string; startDate: string; endDate: string; venueName?: string | null; city?: string | null; seriesName?: string | null } | null;
  organization: { id: string; name: string; type: string; city?: string | null; country?: string | null; website?: string | null };
  agreements: {
    id: string; status: string; amount: number; currency: string; signedAt?: string | null; notes?: string | null;
    tierName?: string | null; packageName?: string | null; rightsSpec?: string | null;
    deliverables: { id: string; name: string; type: string; status: string; dueDate?: string | null; responsible?: string | null }[];
    booths: { id: string; status: string; code?: string | null; sizeSqm?: number | null; boothStatus?: string | null; price?: number | null; currency: string }[];
  }[];
  entitlements: { id: string; label: string; type: string; granted: number; consumed: number; reserved: number; restrictions?: string | null; claims: { id: string; status: string; guestName?: string | null }[] }[];
  orders: PortalOrder[];
  staff: { participationId: string; source: string; personName: string; personTitle?: string | null; registrationStatus?: string | null; categoryCode?: string | null; badgeStatus?: string | null }[];
};

// ─── yardımcılar ────────────────────────────────────────────────────────────
const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function offerCountdown(expiresAt?: string | null, now = Date.now()) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return { text: "Süresi doldu", expired: true as const, hours: 0 };
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return { text: `${h} sa ${m} dk kaldı`, expired: false as const, hours: h };
}

// portal durumu adımları: Katılım → Kayıt → Onay → Yaka Kartı → Giriş
function buildSteps(p: NonNullable<ParticipantData["participation"]>, regs: ParticipantData["registrations"]) {
  const activeReg = regs.find((r) => r.status !== "CANCELLED") ?? regs[0];
  const badge = p.badges[0];
  const steps: { key: string; title: string; state: "done" | "current" | "pending" | "error"; hint?: string }[] = [
    { key: "part", title: "Katılım", state: "done", hint: label(REG_SOURCES, p.source) },
    activeReg
      ? {
          key: "reg", title: "Kayıt",
          state: ["REJECTED", "CANCELLED"].includes(activeReg.status) ? "error" : "done",
          hint: activeReg.confirmationNo,
        }
      : { key: "reg", title: "Kayıt", state: "pending", hint: "Henüz kayıt yok" },
    activeReg && ["CONFIRMED"].includes(activeReg.status)
      ? { key: "appr", title: "Onay", state: "done", hint: activeReg.decidedAt ? fmtDate(activeReg.decidedAt) : undefined }
      : activeReg && ["SUBMITTED", "PENDING_APPROVAL"].includes(activeReg.status)
        ? { key: "appr", title: "Onay", state: "current", hint: "İncelemede" }
        : { key: "appr", title: "Onay", state: activeReg ? "pending" : "pending" },
    badge
      ? { key: "badge", title: "Yaka Kartı", state: ["READY", "PRINTED", "REPRINTED", "ISSUED"].includes(badge.status) ? "done" : "current", hint: badge.badgeNo }
      : { key: "badge", title: "Yaka Kartı", state: "pending" },
    p.attendance === "CHECKED_IN" || p.attendance === "CHECKED_OUT"
      ? { key: "in", title: "Giriş", state: "done", hint: label(ATTENDANCE_STATUS, p.attendance) }
      : { key: "in", title: "Giriş", state: "pending", hint: label(ATTENDANCE_STATUS, p.attendance) },
  ];
  return steps;
}

// ─── portal çerçevesi: tarayıcı mock'u + önizleme damgası ───────────────────
function PortalFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="maven-portal-frame overflow-hidden rounded-2xl border bg-card shadow-xl ring-1 ring-black/[0.03]">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-rose-400/90" />
          <span className="size-2.5 rounded-full bg-amber-400/90" />
          <span className="size-2.5 rounded-full bg-emerald-400/90" />
        </span>
        <span className="mx-auto hidden max-w-md flex-1 items-center gap-1.5 truncate rounded-full border bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm sm:flex">
          <Icons.Lock className="size-3 text-emerald-500" aria-hidden />
          <span className="truncate font-mono">{url}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          <Icons.Eye className="size-3" aria-hidden /> Önizleme
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── portal üst bandı: etkinlik kimliği + ziyaretçi ─────────────────────────
// R10-c: edition üzerindeki portalHeader* alanlarıyla üst bant özelleştirilir
// (arka plan görseli + koyu degrade, başlık/alt başlık, vurgu rengi). Alanlar
// null ise mevcut görünüm aynen korunur.
function PortalHero({
  name, dates, venue, seriesName, avatarText, visitorName, visitorSub, badge, design,
}: {
  name: string; dates: string; venue?: string | null; seriesName?: string | null;
  avatarText: string; visitorName: string; visitorSub?: string | null; badge?: React.ReactNode;
  design?: PortalHeaderDraft | null;
}) {
  const title = design?.title?.trim() ? design.title : name;
  const subtitle = design?.subtitle?.trim() ? design.subtitle : null;
  const accent = design?.accent?.trim() || null;
  return (
    <div className="maven-portal-hero relative overflow-hidden px-5 pb-5 pt-6 text-white sm:px-7">
      {design?.imageUrl && (
        <>
          <img src={design.imageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/25" aria-hidden />
        </>
      )}
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {seriesName && <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">{seriesName}</p>}
          <h3 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">{title}</h3>
          {accent && <div className="mt-1.5 h-1 w-14 rounded-full" style={{ backgroundColor: accent }} aria-hidden />}
          {subtitle && <p className="mt-2 max-w-xl text-xs text-white/85 sm:text-sm">{subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">
            <span className="inline-flex items-center gap-1.5"><Icons.CalendarDays className="size-3.5" /> {dates}</span>
            {venue && <span className="inline-flex items-center gap-1.5"><Icons.MapPin className="size-3.5" /> {venue}</span>}
          </div>
          {badge && <div className="mt-3 flex flex-wrap gap-1.5">{badge}</div>}
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/90 text-sm font-bold text-teal-700 shadow-sm">{avatarText}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{visitorName}</p>
            {visitorSub && <p className="truncate text-[11px] text-white/75">{visitorSub}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── durum zaman çizelgesi ──────────────────────────────────────────────────
function Steps({ steps }: { steps: ReturnType<typeof buildSteps> }) {
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0" aria-label="Kayıt durum adımları">
      {steps.map((s, i) => (
        <li key={s.key} className="flex flex-1 gap-3 sm:block sm:px-2 sm:text-center">
          <div className="flex flex-col items-center sm:flex-row">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition-all",
                s.state === "done" && "border-teal-500 bg-teal-500 text-white shadow-sm",
                s.state === "current" && "maven-step-pulse border-teal-500 bg-white text-teal-600",
                s.state === "pending" && "border-border bg-white text-muted-foreground",
                s.state === "error" && "border-rose-400 bg-rose-50 text-rose-500",
              )}
            >
              {s.state === "done" ? <Icons.Check className="size-4" aria-hidden /> : s.state === "error" ? <Icons.X className="size-4" aria-hidden /> : i + 1}
            </span>
            {i < steps.length - 1 && <span aria-hidden className={cn("ml-0 h-6 w-0.5 sm:ml-0 sm:h-0.5 sm:w-full", s.state === "done" ? "bg-teal-400" : "bg-border")} />}
          </div>
          <div className="pb-3 sm:pb-0 sm:pt-2">
            <p className={cn("text-xs font-semibold leading-none sm:mt-1", s.state === "pending" ? "text-muted-foreground" : "text-foreground")}>{s.title}</p>
            {s.hint && <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{s.hint}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── ödeme bloğu (katılımcı + sponsor ortak) ────────────────────────────────
const PAY_SOURCE_ICON: Record<string, typeof Icons.CreditCard> = {
  ONLINE_CARD: Icons.CreditCard, BANK_TRANSFER: Icons.Landmark, POS: Icons.Nfc,
  CASH: Icons.Banknote, PAYMENT_LINK: Icons.Link2, MANUAL_EXTERNAL: Icons.FilePenLine,
};

function OrderBlock({ orders, onPayLink, busyId }: { orders: PortalOrder[]; onPayLink: (o: PortalOrder) => void; busyId?: string | null }) {
  if (orders.length === 0) return <p className="text-xs text-muted-foreground">Sipariş bulunmuyor.</p>;
  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-lg border bg-background/60 p-3 transition-colors hover:bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-foreground">{o.orderNo}</span>
              <StatusBadge map={ORDER_STATUS as unknown as Record<string, string>} value={o.status} />
            </div>
            <span className="text-sm font-semibold tabular-nums">{fmtMoney(o.totalAmount, o.currency)}</span>
          </div>
          {o.lines.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {o.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="truncate">{l.quantity}× {l.description}{l.personName ? ` — ${l.personName}` : ""}</span>
                  <span className="tabular-nums">{fmtMoney(l.total, o.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-2">
            <div className="flex flex-wrap gap-1.5">
              {o.payments.slice(0, 3).map((p) => {
                const I = PAY_SOURCE_ICON[p.source] ?? Icons.CreditCard;
                return (
                  <span key={p.id} className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]",
                    p.status === "SUCCEEDED" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    p.status === "PENDING" && "border-amber-200 bg-amber-50 text-amber-700",
                    p.status === "FAILED" && "border-rose-200 bg-rose-50 text-rose-700",
                  )}>
                    <I className="size-3" aria-hidden /> {label(PAYMENT_METHODS, p.source)} · {fmtMoney(p.amount, o.currency)}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium tabular-nums", o.remaining > 0 ? "text-amber-600" : "text-emerald-600")}>
                {o.remaining > 0 ? `Kalan: ${fmtMoney(o.remaining, o.currency)}` : "Bakiye kapalı"}
              </span>
              {o.remaining > 0 && (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={busyId === o.id} onClick={() => onPayLink(o)}>
                  {busyId === o.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Link2 className="size-3.5" />} Ödeme bağlantısı
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── beklenmeyen durumlar için ortak kutu ───────────────────────────────────
function PortalEmpty({ icon: I, title, desc }: { icon: typeof Icons.Inbox; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
      <I className="size-7 text-muted-foreground/50" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {desc && <p className="max-w-xs text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

// ═══ KATILIMCI PORTALI ═══════════════════════════════════════════════════════
function ParticipantPortal({ editionId, headerDesign }: { editionId: string; headerDesign?: PortalHeaderDraft | null }) {
  const { toast } = useToast();
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const people = useApi(() => listEntity<ParticipationRow>("participations", { editionId, limit: "500" }), [editionId]);

  // varsayılan seçim: yönetim ekranından "portalda gör" deep-link'i, yoksa ilk katılımcı
  useEffect(() => {
    if (!people.data || selectedId) return;
    let deep: string | null = null;
    try { deep = sessionStorage.getItem("maven.portal.person"); sessionStorage.removeItem("maven.portal.person"); } catch { /* yoksay */ }
    const exists = deep && people.data.some((p) => p.person.id === deep);
    const first = exists ? people.data.find((p) => p.person.id === deep) : people.data[0];
    if (first) setSelectedId(first.person.id);
  }, [people.data, selectedId]);

  const filtered = useMemo(() => {
    const items = people.data ?? [];
    if (!query.trim()) return items.slice(0, 80);
    const q = query.toLocaleLowerCase("tr");
    return items
      .filter((p) => `${p.person.firstName} ${p.person.lastName}`.toLocaleLowerCase("tr").includes(q) || (p.person.company ?? "").toLocaleLowerCase("tr").includes(q))
      .slice(0, 80);
  }, [people.data, query]);

  const data = useApi<ParticipantData | null>(
    () => (selectedId ? apiGet<ParticipantData>(`/api/portal/participant?editionId=${editionId}&personId=${selectedId}`) : Promise.resolve(null)),
    [editionId, selectedId],
  );

  const respond = async (entryId: string, response: "ACCEPT" | "DECLINE") => {
    if (!data.data) return;
    const name = `${data.data.person.firstName} ${data.data.person.lastName}`;
    setBusy(entryId);
    try {
      const r = await apiSend<{ registration?: { confirmationNo: string }; chained?: unknown[] }>("/api/waitlist", "POST", { action: "respond", entryId, response, actor: `Katılımcı Portalı — ${name}` });
      toast({
        title: response === "ACCEPT" ? "Teklif kabul edildi" : "Teklif reddedildi",
        description: response === "ACCEPT"
          ? `Kayıt açıldı: ${r.registration?.confirmationNo ?? "—"} — tebrikler!`
          : "Yanıtınız kaydedildi; sıradaki kişiye teklif gidecek.",
      });
      data.reload();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const payLink = async (o: PortalOrder) => {
    if (!data.data) return;
    const name = `${data.data.person.firstName} ${data.data.person.lastName}`;
    setBusy(o.id);
    try {
      const r = await apiSend<{ link: string }>("/api/portal/action", "POST", { action: "payment-link", orderId: o.id, actor: `Katılımcı Portalı — ${name}` });
      await navigator.clipboard?.writeText(r.link).catch(() => undefined);
      toast({ title: "Ödeme bağlantısı üretildi", description: `${r.link} — panoya kopyalandı (simülasyon)` });
      data.reload();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const d = data.data;
  const steps = d?.participation ? buildSteps(d.participation, d.registrations) : [];
  const activeOffer = d?.waitlist.find((w) => w.status === "OFFERED");
  const waitingEntry = d?.waitlist.find((w) => w.status === "WAITING");

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* kimlik rayı */}
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground"><Icons.Users className="size-3.5" /> Katılımcı seç — portal kimliği</p>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İsim veya kurum ara…" className="h-8 text-xs" aria-label="Katılımcı ara" />
        <div className="maven-scroll -mx-1 max-h-[420px] min-h-24 overflow-y-auto px-1 lg:max-h-[calc(100vh-320px)]">
          {people.loading && <Loading rows={5} />}
          {people.error && <ErrorState message={people.error} onRetry={people.reload} />}
          {!people.loading && filtered.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Eşleşen katılımcı yok</p>}
          <ul className="space-y-1">
            {filtered.map((p) => {
              const name = `${p.person.firstName} ${p.person.lastName}`;
              const active = selectedId === p.person.id;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.person.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-all",
                      active ? "border-primary/40 bg-primary/10 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/50",
                    )}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{initials(name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium leading-tight">{name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{p.person.company ?? p.person.title ?? "—"}</span>
                    </span>
                    {p.registrations?.some((r) => r.status === "CONFIRMED") && <Icons.BadgeCheck className="size-3.5 shrink-0 text-emerald-500" aria-label="Onaylı kayıt" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="px-1 text-[10px] text-muted-foreground">{people.data?.length ?? 0} katılımcı · portala gerçek veriyle bakılır</p>
      </div>

      {/* portal gövdesi */}
      <div className="min-w-0">
        {!selectedId || data.loading ? (
          <div className="grid min-h-72 place-items-center rounded-2xl border bg-card"><Icons.Loader2 className="size-7 animate-spin text-primary" /></div>
        ) : data.error ? (
          <ErrorState message={data.error} onRetry={data.reload} />
        ) : !d ? null : (
          <PortalFrame url={`portal.maven.events/katilimci/${d.person.firstName.toLocaleLowerCase("tr")}-${d.person.lastName.toLocaleLowerCase("tr")}`}>
            <PortalHero
              name={d.edition?.name ?? "Etkinlik"}
              dates={`${fmtDate(d.edition?.startDate)} — ${fmtDate(d.edition?.endDate)}`}
              venue={d.edition?.venueName ? `${d.edition.venueName}${d.edition.city ? `, ${d.edition.city}` : ""}` : null}
              seriesName={d.edition?.seriesName}
              avatarText={initials(`${d.person.firstName} ${d.person.lastName}`)}
              visitorName={`${d.person.firstName} ${d.person.lastName}`}
              visitorSub={d.person.organizationName ?? d.person.title ?? "Katılımcı"}
              design={headerDesign}
              badge={
                d.participation ? (
                  <>
                    <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-medium">{label(REG_SOURCES, d.participation.source)}</span>
                    <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-medium">{label(ATTENDANCE_STATUS, d.participation.attendance)}</span>
                  </>
                ) : null
              }
            />

            <div className="maven-portal-body space-y-4 bg-muted/20 p-4 sm:p-5">
              {!d.participation ? (
                <PortalEmpty icon={Icons.UserPlus} title="Bu edisyonda katılımınız bulunmuyor" desc="Kayıt formuyla başvurduğunuzda katılımınız oluşturulur ve bu ekrancan takip edebilirsiniz." />
              ) : (
                <>
                  {/* durum adımları */}
                  <div className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "0ms" }}>
                    <p className="mb-3 text-xs font-semibold text-muted-foreground">KAYIT SÜRECİNİZ</p>
                    <Steps steps={steps} />
                  </div>

                  {/* bekleme teklifi — canlı aksiyon */}
                  {activeOffer && (
                    <div className="maven-portal-enter rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm ring-1 ring-amber-200/60" style={{ animationDelay: "40ms" }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600"><Icons.MailCheck className="size-5" aria-hidden /></span>
                          <div>
                            <p className="text-sm font-semibold text-amber-900">Kontenjan açıldı — size teklif gönderildi!</p>
                            <p className="mt-0.5 text-xs text-amber-800">
                              <b>{activeOffer.categoryName}</b> kategorisine davetlisiniz · #{activeOffer.priority} öncelik
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                              <Icons.Timer className="size-3" /> {offerCountdown(activeOffer.offerExpiresAt, now)?.text ?? ""} içinde yanıtlayın
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busy === activeOffer.id} onClick={() => respond(activeOffer.id, "ACCEPT")}>
                            {busy === activeOffer.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Check className="size-3.5" />} Kabul et
                          </Button>
                          <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50" disabled={busy === activeOffer.id} onClick={() => respond(activeOffer.id, "DECLINE")}>
                            Reddet
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {waitingEntry && !activeOffer && (
                    <div className="maven-portal-enter flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "40ms" }}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icons.Hourglass className="size-5" aria-hidden /></span>
                      <div>
                        <p className="text-sm font-medium">Bekleme listesindesiniz — {waitingEntry.categoryName}</p>
                        <p className="text-xs text-muted-foreground">#{waitingEntry.priority} öncelik · kontenjan açıldığında burada teklif göreceksiniz</p>
                      </div>
                      <StatusBadge map={WAITLIST_STATUS as unknown as Record<string, string>} value="WAITING" className="ml-auto" />
                    </div>
                  )}

                  <div className="grid gap-4 xl:grid-cols-2">
                    {/* kayıt kartı */}
                    <section className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "80ms" }}>
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.ClipboardCheck className="size-4 text-primary" /> Kaydınız</h4>
                      {d.registrations.length === 0 ? (
                        <p className="mt-3 text-xs text-muted-foreground">Henüz kayıt oluşturulmadı.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {d.registrations.map((r) => (
                            <div key={r.id} className="rounded-lg border bg-background/60 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-sm font-bold tracking-tight text-foreground">{r.confirmationNo}</span>
                                <StatusBadge map={REGISTRATION_STATUS as unknown as Record<string, string>} value={r.status} />
                              </div>
                              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                <dt className="text-muted-foreground">Kategori</dt><dd className="font-medium">{r.categoryName ?? "—"}</dd>
                                <dt className="text-muted-foreground">Kaynak</dt><dd>{label(REG_SOURCES, r.source)}</dd>
                                <dt className="text-muted-foreground">Fon</dt><dd>{label(FUNDING_SOURCES, r.fundingSource)}</dd>
                                <dt className="text-muted-foreground">Ücret</dt><dd className="tabular-nums">{r.basePrice > 0 ? fmtMoney(r.basePrice, r.currency) : "Ücretsiz"}</dd>
                              </dl>
                              {r.cancelReason && <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">İptal gerekçesi: {r.cancelReason}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* ödeme kartı */}
                    <section className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "120ms" }}>
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.Wallet className="size-4 text-primary" /> Ödemeleriniz</h4>
                      <div className="mt-3"><OrderBlock orders={d.orders} onPayLink={payLink} busyId={busy} /></div>
                    </section>

                    {/* programım */}
                    <section className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "160ms" }}>
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.Clock className="size-4 text-primary" /> Programınız</h4>
                      {d.participation.program.length === 0 ? (
                        <p className="mt-3 text-xs text-muted-foreground">Size atanmış oturum bulunmuyor.</p>
                      ) : (
                        <ul className="maven-scroll mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                          {d.participation.program.map((s) => (
                            <li key={s.id} className="flex items-start gap-2.5 rounded-lg border bg-background/60 p-2.5 transition-colors hover:bg-background">
                              <span className="mt-0.5 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                                {s.startTime ? new Date(s.startTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{s.sessionTitle ?? "Oturum"}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                                  {s.room && <span className="inline-flex items-center gap-0.5"><Icons.DoorOpen className="size-3" /> {s.room}</span>}
                                  {s.cmeCredits ? <span className="inline-flex items-center gap-0.5"><Icons.GraduationCap className="size-3" /> {s.cmeCredits} CME</span> : null}
                                </p>
                              </div>
                              <Chip tone="teal">{label(EVENT_ROLES, s.role)}</Chip>
                            </li>
                          ))}
                        </ul>
                      )}
                      {d.participation.roleAssignments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5">
                          {d.participation.roleAssignments.map((r) => <Chip key={r.id} tone="violet">{label(EVENT_ROLES, r.role)}</Chip>)}
                        </div>
                      )}
                    </section>

                    {/* konaklama + yaka kartı + belgeler */}
                    <section className="maven-portal-enter space-y-4 rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "200ms" }}>
                      <div>
                        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.BedDouble className="size-4 text-primary" /> Konaklama</h4>
                        {d.participation.reservations.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">Rezervasyon bulunmuyor.</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {d.participation.reservations.map((r) => (
                              <li key={r.id} className="rounded-lg border bg-background/60 p-2.5 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium">{r.hotel ?? "Otel"} · {r.roomType ?? "Oda"}</span>
                                  <StatusBadge map={{ NOT_REQUESTED: "Talep yok", REQUESTED: "Talep", WAITLIST: "Bekleme", RESERVED: "Ayrıldı", CONFIRMED: "Teyit", CHECKED_IN: "Giriş", CHECKED_OUT: "Çıkış", CANCELLED: "İptal" }} value={r.status} />
                                </div>
                                <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(r.checkIn)} — {fmtDate(r.checkOut)}{r.payerName ? ` · Ödeyen: ${r.payerName}` : ""}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="border-t pt-3">
                        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.IdCard className="size-4 text-primary" /> Yaka Kartı & Belgeler</h4>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {d.participation.badges.map((b) => <StatusBadge key={b.id} map={{ NOT_ELIGIBLE: "Hak yok", READY: "Hazır", PRINTED: "Basıldı", REPRINTED: "Yeniden basıldı", ISSUED: "Verildi", VOID: "İptal" }} value={b.status} />)}
                          {d.participation.certificates.map((c) => <StatusBadge key={c.id} map={{ NOT_ELIGIBLE: "Hak yok", ELIGIBLE: "Hak kazandı", GENERATED: "Üretildi", DELIVERED: "Teslim edildi", REVOKED: "İptal" }} value={c.status} />)}
                          {d.participation.badges.length === 0 && d.participation.certificates.length === 0 && <p className="text-xs text-muted-foreground">Henüz belge üretilmedi.</p>}
                        </div>
                      </div>
                      {d.participation.claims.length > 0 && (
                        <div className="border-t pt-3">
                          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.Gift className="size-4 text-primary" /> Haklarınız</h4>
                          <ul className="mt-2 space-y-1">
                            {d.participation.claims.map((c) => (
                              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">{c.entitlementLabel ?? "Hak"}{c.guestName ? ` — ${c.guestName}` : ""}</span>
                                <Chip tone={c.status === "CONSUMED" ? "emerald" : c.status === "RESERVED" ? "amber" : "neutral"}>{c.status === "CONSUMED" ? "Kullanıldı" : c.status === "RESERVED" ? "Ayrıldı" : label({ RESERVED: "Ayrıldı", CONSUMED: "Kullanıldı", RELEASED: "Serbest", EXPIRED: "Süre aşımı" }, c.status)}</Chip>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </PortalFrame>
        )}
      </div>
    </div>
  );
}

// ═══ SPONSOR PORTALI ═════════════════════════════════════════════════════════
const DELIVERABLE_ICON: Record<string, typeof Icons.FileImage> = {
  LOGO: Icons.Image, BANNER: Icons.RectangleHorizontal, GUEST_LIST: Icons.ListOrdered,
  STAND_DESIGN: Icons.DraftingCompass, DESCRIPTION: Icons.FileText, AD: Icons.Megaphone,
};
// portaldan gönderilebilir teslim durumları
const SUBMITTABLE = ["NOT_STARTED", "WAITING_SPONSOR", "REJECTED"];

function SponsorPortal({ editionId, headerDesign }: { editionId: string; headerDesign?: PortalHeaderDraft | null }) {
  const { toast } = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const agreements = useApi(() => listEntity<AgreementRow>("sponsor-agreements", { editionId }), [editionId]);
  const orgs = useMemo(() => {
    const map = new Map<string, AgreementRow["organization"]>();
    for (const a of agreements.data ?? []) map.set(a.organization.id, a.organization);
    return Array.from(map.values());
  }, [agreements.data]);

  useEffect(() => {
    if (!orgs.length || orgId) return;
    setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  const data = useApi<SponsorData | null>(
    () => (orgId ? apiGet<SponsorData>(`/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}`) : Promise.resolve(null)),
    [editionId, orgId],
  );

  const submitDeliverable = async (id: string, name: string) => {
    if (!data.data) return;
    setBusy(id);
    try {
      await apiSend("/api/portal/action", "POST", { action: "deliverable-submit", deliverableId: id, actor: `Sponsor Portalı — ${data.data.organization.name}` });
      toast({ title: "Teslim gönderildi", description: `${name} incelemeye alındı — organizasyon ekibi bildirim alır.` });
      data.reload();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const payLink = async (o: PortalOrder) => {
    if (!data.data) return;
    setBusy(o.id);
    try {
      const r = await apiSend<{ link: string }>("/api/portal/action", "POST", { action: "payment-link", orderId: o.id, actor: `Sponsor Portalı — ${data.data.organization.name}` });
      await navigator.clipboard?.writeText(r.link).catch(() => undefined);
      toast({ title: "Ödeme bağlantısı üretildi", description: `${r.link} — panoya kopyalandı (simülasyon)` });
      data.reload();
    } catch (e) {
      toast({ title: "İşlem başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const d = data.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground"><Icons.Handshake className="size-3.5" /> Sponsor seç — portal kimliği</p>
        <div className="maven-scroll -mx-1 max-h-[420px] min-h-16 overflow-y-auto px-1 lg:max-h-[calc(100vh-320px)]">
          {agreements.loading && <Loading rows={4} />}
          {agreements.error && <ErrorState message={agreements.error} onRetry={agreements.reload} />}
          <ul className="space-y-1">
            {orgs.map((o) => {
              const active = orgId === o.id;
              return (
                <li key={o.id}>
                  <button
                    onClick={() => setOrgId(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left transition-all",
                      active ? "border-primary/40 bg-primary/10 shadow-sm" : "border-transparent hover:border-border hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{initials(o.name)}</span>
                    <span className="truncate text-xs font-medium">{o.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!agreements.loading && orgs.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Bu edisyonda sponsor sözleşmesi yok</p>}
        </div>
      </div>

      <div className="min-w-0">
        {!orgId || data.loading ? (
          <div className="grid min-h-72 place-items-center rounded-2xl border bg-card"><Icons.Loader2 className="size-7 animate-spin text-primary" /></div>
        ) : data.error ? (
          <ErrorState message={data.error} onRetry={data.reload} />
        ) : !d ? null : (
          <PortalFrame url={`portal.maven.events/sponsor/${d.organization.name.toLocaleLowerCase("tr").replaceAll(" ", "-")}`}>
            <PortalHero
              name={d.edition?.name ?? "Etkinlik"}
              dates={`${fmtDate(d.edition?.startDate)} — ${fmtDate(d.edition?.endDate)}`}
              venue={d.edition?.venueName ? `${d.edition.venueName}${d.edition.city ? `, ${d.edition.city}` : ""}` : null}
              seriesName={d.edition?.seriesName}
              avatarText={initials(d.organization.name)}
              visitorName={d.organization.name}
              visitorSub={d.agreements[0]?.tierName ?? "Sponsor"}
              design={headerDesign}
              badge={d.agreements.map((a) => (
                <span key={a.id} className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-medium">
                  {a.tierName ?? a.packageName ?? "Sponsor"} · {label({ PROSPECT: "Aday", NEGOTIATION: "Görüşme", CONTRACTED: "Sözleşmeli", ACTIVE: "Aktif", COMPLETED: "Tamamlandı", CANCELLED: "İptal" }, a.status)}
                </span>
              ))}
            />

            <div className="maven-portal-body space-y-4 bg-muted/20 p-4 sm:p-5">
              {d.agreements.length === 0 ? (
                <PortalEmpty icon={Icons.FileSignature} title="Sözleşme bulunamadı" desc="Bu kurumun edisyonda aktif sponsor sözleşmesi yok." />
              ) : (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {/* sözleşme + stantlar */}
                    <section className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "0ms" }}>
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.FileSignature className="size-4 text-primary" /> Sözleşmeniz</h4>
                      <div className="mt-3 space-y-3">
                        {d.agreements.map((a) => (
                          <div key={a.id} className="rounded-lg border bg-background/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold">{a.tierName ?? a.packageName ?? "Sponsorluk"}</span>
                              <StatusBadge map={{ PROSPECT: "Aday", NEGOTIATION: "Görüşme", CONTRACTED: "Sözleşmeli", ACTIVE: "Aktif", COMPLETED: "Tamamlandı", CANCELLED: "İptal" }} value={a.status} />
                            </div>
                            <p className="mt-1 text-lg font-bold tabular-nums tracking-tight">{fmtMoney(a.amount, a.currency)}</p>
                            {a.signedAt && <p className="text-[11px] text-muted-foreground">İmza: {fmtDate(a.signedAt)}</p>}
                            {a.rightsSpec && <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">{a.rightsSpec}</p>}
                            {a.booths.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-dashed pt-2">
                                {a.booths.map((b) => (
                                  <span key={b.id} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px]">
                                    <Icons.MapPin className="size-3 text-primary" aria-hidden />
                                    <b className="font-mono">{b.code}</b> · {b.sizeSqm} m² · {label(BOOTH_STATUS, b.boothStatus)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* haklar & kullanım */}
                    <section className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "40ms" }}>
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.Gift className="size-4 text-primary" /> Haklarınız & Kullanım</h4>
                      {d.entitlements.length === 0 ? (
                        <p className="mt-3 text-xs text-muted-foreground">Bu kuruma tanımlı hak bulunmuyor.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {d.entitlements.map((e) => {
                            const total = Math.max(1, e.granted);
                            const consumedPct = Math.min(100, Math.round((e.consumed / total) * 100));
                            const reservedPct = Math.min(100 - consumedPct, Math.round((e.reserved / total) * 100));
                            return (
                              <div key={e.id} className="rounded-lg border bg-background/60 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-semibold">{e.label}</p>
                                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{e.consumed}+{e.reserved}/{e.granted}</span>
                                </div>
                                <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${e.consumed} kullanıldı, ${e.reserved} ayrılmış, ${e.granted} toplam`}>
                                  <span className="h-full bg-teal-500 transition-all duration-500" style={{ width: `${consumedPct}%` }} />
                                  <span className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${reservedPct}%` }} />
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-teal-500" /> {e.consumed} kullanıldı</span>
                                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-400" /> {e.reserved} ayrılmış</span>
                                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-muted-foreground/30" /> {Math.max(0, e.granted - e.consumed - e.reserved)} boş</span>
                                </div>
                                {e.claims.length > 0 && (
                                  <ul className="mt-2 space-y-0.5 border-t border-dashed pt-1.5">
                                    {e.claims.slice(0, 4).map((c) => (
                                      <li key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="truncate text-muted-foreground">{c.guestName ?? "İsimsiz misafir"}</span>
                                        <Chip tone={c.status === "CONSUMED" ? "emerald" : c.status === "RESERVED" ? "amber" : "neutral"}>{c.status === "CONSUMED" ? "Kullanıldı" : c.status === "RESERVED" ? "Davette" : label({ RELEASED: "Serbest", EXPIRED: "Süre aşımı" }, c.status)}</Chip>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* teslim edilecekler */}
                    <section className="maven-portal-enter rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "80ms" }}>
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.FileUp className="size-4 text-primary" /> Teslim Edilecekler</h4>
                      <ul className="mt-3 space-y-2">
                        {d.agreements.flatMap((a) => a.deliverables).map((dl) => {
                          const I = DELIVERABLE_ICON[dl.type] ?? Icons.File;
                          const canSubmit = SUBMITTABLE.includes(dl.status);
                          return (
                            <li key={dl.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/60 p-2.5 transition-colors hover:bg-background">
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><I className="size-4" aria-hidden /></span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{dl.name}</p>
                                <p className="text-[10px] text-muted-foreground">Termin: {dl.dueDate ? fmtDate(dl.dueDate) : "—"}{dl.responsible ? ` · ${dl.responsible}` : ""}</p>
                              </div>
                              <StatusBadge map={DELIVERABLE_STATUS as unknown as Record<string, string>} value={dl.status} />
                              {canSubmit && (
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={busy === dl.id} onClick={() => submitDeliverable(dl.id, dl.name)}>
                                  {busy === dl.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.Upload className="size-3" />} Teslim et
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    {/* siparişler + ekip */}
                    <section className="maven-portal-enter space-y-4 rounded-xl border bg-card p-4 shadow-sm" style={{ animationDelay: "120ms" }}>
                      <div>
                        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.Wallet className="size-4 text-primary" /> Siparişleriniz</h4>
                        <div className="mt-3"><OrderBlock orders={d.orders} onPayLink={payLink} busyId={busy} /></div>
                      </div>
                      {d.staff.length > 0 && (
                        <div className="border-t pt-3">
                          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Icons.Users className="size-4 text-primary" /> Ekibiniz</h4>
                          <ul className="maven-scroll mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                            {d.staff.map((s) => (
                              <li key={s.participationId} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted/50">
                                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">{initials(s.personName)}</span>
                                <span className="min-w-0 flex-1 truncate">{s.personName}{s.personTitle ? <span className="text-muted-foreground"> · {s.personTitle}</span> : null}</span>
                                {s.registrationStatus ? <StatusBadge map={REGISTRATION_STATUS as unknown as Record<string, string>} value={s.registrationStatus} /> : <span className="text-[10px] text-muted-foreground">kayıt yok</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </PortalFrame>
        )}
      </div>
    </div>
  );
}

// ═══ PORTAL HEADER TASARIMCISI (R10-c) ══════════════════════════════════════
// EventEdition.portalHeader* skaler alanlarını düzenler; canlı önizleme yazarken
// güncellenir, "Kaydet" PUT /api/editions/{id} ile kalıcılaştırır.
function PortalHeaderDesigner({
  editionId, editionName, draft, setDraft,
}: {
  editionId: string; editionName: string;
  draft: PortalHeaderDraft; setDraft: React.Dispatch<React.SetStateAction<PortalHeaderDraft>>;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);

  const validAccent = /^#[0-9a-fA-F]{3,8}$/.test(draft.accent.trim()) ? draft.accent.trim() : "#0d9488";

  const onImagePick = (file: File) => {
    if (file.size > 600 * 1024) {
      toast({ title: "Dosya 600KB sınırı aşılıyor", description: "Daha küçük bir görsel seçin — arşive gömme tavanı 600KB'dir.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:")) return;
      setMediaBusy(true);
      try {
        const r = await apiSend<{ asset: { id: string; dataUrl: string | null } }>("/api/media/upload-linked", "POST", {
          editionId, systemFolder: "PORTAL", linkedType: "PORTAL", name: "portal-header-arkaplan", dataUrl,
        });
        setDraft((d) => ({ ...d, imageUrl: r.asset.dataUrl ?? dataUrl }));
        toast({ title: "Arka plan görseli yüklendi", description: "Medya Arşivi → Portal Görselleri klasörüne benzersiz adla kaydedildi." });
      } catch (e) {
        toast({ title: "Görsel yüklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
      } finally {
        setMediaBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiSend(`/api/editions/${editionId}`, "PUT", {
        portalHeaderTitle: draft.title.trim(),
        portalHeaderSubtitle: draft.subtitle.trim(),
        portalHeaderImageUrl: draft.imageUrl.trim() || null,
        portalHeaderAccent: draft.accent.trim() || null,
      });
      toast({ title: "Portal header kaydedildi", description: "Katılımcı ve sponsor portalının üst bandı bu tasarımı kullanır." });
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Portal Header Tasarımcısı"
      desc="Dış portalın üst bandını tasarlayın — kaydedilen başlık, alt başlık, vurgu rengi ve arka plan katılımcı + sponsor portalında görünür."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* form */}
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ph-title">Portal başlığı</Label>
            <Input id="ph-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={120} placeholder="Boş bırakılırsa etkinlik adı kullanılır" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-subtitle">Alt başlık</Label>
            <Input id="ph-subtitle" value={draft.subtitle} onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} maxLength={160} placeholder="örn. Kayıt, ödeme ve programınız tek yerde" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ph-accent">Vurgu rengi</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={validAccent}
                  onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value }))}
                  aria-label="Vurgu rengi seçici"
                  className="size-9 shrink-0 cursor-pointer rounded-md border bg-card p-1"
                />
                <Input id="ph-accent" value={draft.accent} onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value }))} placeholder="#0d9488" className="w-28 font-mono text-xs uppercase" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ph-image">Arka plan görseli</Label>
              <div className="flex items-center gap-2">
                <label htmlFor="ph-image" className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                  {mediaBusy ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.ImagePlus className="size-3.5" aria-hidden />}
                  {draft.imageUrl ? "Değiştir" : "Görsel yükle"}
                </label>
                {draft.imageUrl && (
                  <Button type="button" size="sm" variant="ghost" className="h-9 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDraft((d) => ({ ...d, imageUrl: "" }))}>
                    Kaldır
                  </Button>
                )}
              </div>
              <Input
                id="ph-image"
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Portal arka plan görseli yükle"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImagePick(f); e.target.value = ""; }}
              />
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Icons.Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            Görsel Medya Arşivi → Portal Görselleri klasörüne benzersiz adla kaydedilir (≤600KB). Önizleme yazarken canlı güncellenir.
          </p>
          <Button onClick={save} disabled={saving}>
            {saving ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Save className="size-4" aria-hidden />} Kaydet
          </Button>
        </div>

        {/* canlı önizleme */}
        <div className="min-w-0">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Icons.Eye className="size-3.5" aria-hidden /> Canlı önizleme</p>
          <div className="overflow-hidden rounded-xl border shadow-sm">
            <div className={cn("relative flex min-h-44 flex-col justify-center px-5 py-6 text-white sm:px-7", !draft.imageUrl && "maven-portal-hero")}>
              {draft.imageUrl && (
                <>
                  <img src={draft.imageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/25" aria-hidden />
                </>
              )}
              <div className="relative min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">{editionName}</p>
                <h4 className="mt-0.5 truncate text-2xl font-bold tracking-tight">{draft.title.trim() || editionName}</h4>
                <div className="mt-1.5 h-1 w-16 rounded-full" style={{ backgroundColor: validAccent }} aria-hidden />
                {draft.subtitle.trim() && <p className="mt-2 max-w-lg text-xs text-white/85 sm:text-sm">{draft.subtitle}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-sm" style={{ backgroundColor: validAccent }}>
                    <Icons.CalendarDays className="size-3" aria-hidden /> Kayıt & Giriş
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Arka plan görseline koyu degrade bindirilir — beyaz tipografi her görselde okunur.</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ═══ MODÜL KÖKÜ ══════════════════════════════════════════════════════════════
export function PortalsView() {
  const { currentEditionId, editions } = useApp();
  const edition = editions.find((e) => e.id === currentEditionId);
  const [tab, setTab] = useState("participant");

  // R10-c: portal header taslağı — edisyon kaydı geldiğinde sunucudaki değerlerle doldurulur
  const [headerDraft, setHeaderDraft] = useState<PortalHeaderDraft>({ title: "", subtitle: "", imageUrl: "", accent: "#0d9488" });
  useEffect(() => {
    if (!currentEditionId) return;
    let alive = true;
    listEntity<EditionRow>("editions", { limit: 100 }).then((rows) => {
      if (!alive) return;
      const src = rows.find((e) => e.id === currentEditionId);
      setHeaderDraft({
        title: src?.portalHeaderTitle ?? "",
        subtitle: src?.portalHeaderSubtitle ?? "",
        imageUrl: src?.portalHeaderImageUrl ?? "",
        accent: src?.portalHeaderAccent ?? "#0d9488",
      });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [currentEditionId]);

  return (
    <div>
      <PageHeader
        title="Dış Portal"
        desc="Sponsor ve katılımcı self-servis görünümü — ayrı uygulama, ortak kimlik ilkesiyle gerçek verilerin dışarıdan hali."
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="participant" className="gap-1.5"><Icons.UserRound className="size-3.5" /> Katılımcı</TabsTrigger>
            <TabsTrigger value="sponsor" className="gap-1.5"><Icons.Handshake className="size-3.5" /> Sponsor</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      {!edition ? (
        <EmptyState title="Edisyon seçin" desc="Portal önizlemesi için bir edisyon gerekli." />
      ) : (
        <div className="space-y-4">
          <PortalHeaderDesigner editionId={edition.id} editionName={edition.name} draft={headerDraft} setDraft={setHeaderDraft} />
          {tab === "participant" ? (
            <ParticipantPortal editionId={edition.id} headerDesign={headerDraft} />
          ) : (
            <SponsorPortal editionId={edition.id} headerDesign={headerDraft} />
          )}
        </div>
      )}
    </div>
  );
}
