"use client";
// F-EXP — Dış sayfa form motoru: Form Merkezi'nde tasarlanan her formu KENDİ SAYFASI
// dışında (paylaşım bağlantısı ?form=<slug> veya harici site <iframe> gömmesi) çalıştırır.
// Kapsam: 18+ alan bileşeni · mantık kapıları (sunucuyla aynı motor) · honeypot · zaman
// tuzağı ölçümü · HMAC insan doğrulaması (captcha) · ağırlıklı quiz sonucu · oylama
// sonuç ekranı · KVKK rıza kutusu. Embed modunda shell'siz, iframe-içi render eder.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiSend } from "@/lib/client";
import { isFieldVisible } from "@/lib/form-logic";
import { useLang, t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ShieldCheck, CheckCircle2, AlertTriangle, RotateCcw, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

// ─── API tipleri (public DTO — public-forms/[idOrSlug] sözleşmesi) ───────────

interface PublicField {
  id: string; label: string; type: string; required: string;
  options?: string | null; columns?: string | null;
  placeholder?: string | null; helpText?: string | null;
  logicRules?: string | null; logicMode?: string | null; logicAction?: string | null;
  conditionField?: string | null; conditionValue?: string | null;
  points?: number | null; mobileInteractive?: boolean;
  width?: number | null; // STUDIO-DND: tasarımcıdaki elle genişlik %
  step?: number | null; // FORM-EXP2: adım/sayfa numarası
}
interface PublicForm {
  id: string; slug?: string | null; name: string; type: string;
  description?: string | null; successMessage?: string | null;
  captchaEnabled: boolean; honeypotEnabled: boolean; hasPublicResults: boolean;
  enableOnlinePayment?: boolean;
  enableSteps?: boolean; // FORM-EXP2: adım-adım doldurma modu
  fields: PublicField[];
  challenge?: { question: string; token: string } | null;
}
interface SubmitResult {
  submissionId: string; status: string;
  quizScore?: number | null; quizCorrect?: number | null; quizTotal?: number | null;
  registration?: { confirmationNo: string | null; status: string | null } | null;
  order?: { orderNo: string | null; status: string | null } | null;
  payment?: { id: string; status: string } | null;
}
interface PublicResults {
  form: { id: string; name: string; type: string };
  totalVotes: number;
  fields: { fieldId: string; label: string; type: string; responseCount: number; distribution?: { value: string; count: number }[]; average?: number | null }[];
}

// ─── yardımcılar ─────────────────────────────────────────────────────────────

const optsOf = (f: PublicField): string[] =>
  (f.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
const colsOf = (f: PublicField): string[] =>
  (f.columns ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
// MULTI_CHOICE / RANKING / MATRIX cevabı JSON dizi/nesne taşıyabilir
function parseMaybeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

// ─── İmza tuvali (SIGNATURE) ─────────────────────────────────────────────────

function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const cv = canvasRef.current;
    if (cv) onChange(cv.toDataURL("image/png"));
  };
  const clear = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    onChange("");
  };

  return (
    <div className="grid gap-1.5">
      <canvas
        ref={canvasRef}
        width={560}
        height={150}
        role="img"
        aria-label={t("forms.signatureAria")}
        className="h-36 w-full cursor-crosshair touch-none rounded-lg border border-dashed bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t("forms.signatureHint")}</p>
        {value && (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
            <RotateCcw className="size-3" /> {t("forms.signatureClear")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Sıralama bileşeni (RANKING) ─────────────────────────────────────────────

function RankingInput({ opts, value, onChange }: { opts: string[]; value: string; onChange: (v: string) => void }) {
  const [order, setOrder] = useState<string[]>(() => {
    const saved = value ? (parseMaybeJson(value) as unknown) : null;
    if (Array.isArray(saved) && (saved as string[]).length === opts.length && opts.every((o) => (saved as string[]).includes(o))) {
      return saved as string[];
    }
    return [...opts];
  });
  useEffect(() => {
    onChange(JSON.stringify(order));
    // yalnız sıralama değişince yaz
  }, [order]);

  const move = (i: number, dir: -1 | 1) => {
    setOrder((o) => {
      const next = [...o];
      const j = i + dir;
      if (j < 0 || j >= next.length) return o;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <div className="grid gap-1">
      {order.map((opt, i) => (
        <div key={opt} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-100 text-[11px] font-bold text-teal-800">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate">{opt}</span>
          <span className="flex shrink-0">
            <button type="button" aria-label={`${opt}: ${t("forms.moveUp")}`} className="rounded px-1.5 py-0.5 hover:bg-accent" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
            <button type="button" aria-label={`${opt}: ${t("forms.moveDown")}`} className="rounded px-1.5 py-0.5 hover:bg-accent" onClick={() => move(i, 1)} disabled={i === order.length - 1}>▼</button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────

export function PublicFormPage({ idOrSlug, embed = false }: { idOrSlug: string; embed?: boolean }) {
  useLang();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [visitor, setVisitor] = useState({ name: "", email: "", phone: "", organization: "" });
  const [honeypot, setHoneypot] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [commsOptIn, setCommsOptIn] = useState(false);
  const [challenge, setChallenge] = useState<{ question: string; token: string } | null>(null);
  const [payMethod, setPayMethod] = useState("ONLINE_CARD");
  const [pay, setPay] = useState({ cardHolder: "", cardNumber: "", expiry: "", cvc: "" });
  const [payBusy, setPayBusy] = useState(false);
  const [payOutcome, setPayOutcome] = useState<{ outcome: string; message: string; payment?: { id: string; status: string; reference?: string | null } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [results, setResults] = useState<PublicResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepNo, setStepNo] = useState(1); // FORM-EXP2: geçerli adım (enableSteps açıkken)
  const startRef = useRef<number>(Date.now());

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/public-forms/${encodeURIComponent(idOrSlug)}`);
      const data = (await res.json()) as PublicForm & { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("forms.publicNotFound"));
      setForm(data);
      setChallenge(data.challenge ?? null);
      setStepNo(1); // FORM-EXP2: form her yüklendiğinde ilk adımdan başla
      startRef.current = Date.now();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("forms.publicNotFound"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [idOrSlug]);

  const labelIndex = useMemo(
    () => new Map((form?.fields ?? []).map((f) => [f.label, f.id])),
    [form],
  );
  const visible = useMemo(() => {
    if (!form) return new Set<string>();
    const s = new Set<string>();
    for (const f of form.fields) {
      if (isFieldVisible(f, ans, labelIndex)) s.add(f.id);
    }
    return s;
  }, [form, ans, labelIndex]);

  const set = (fid: string, v: string) => setAns((a) => ({ ...a, [fid]: v }));
  const toggleIn = (fid: string, opt: string, on: boolean) =>
    setAns((a) => {
      const cur: string[] = a[fid] ? (Array.isArray(parseMaybeJson(a[fid])) ? (parseMaybeJson(a[fid]) as string[]) : []) : [];
      return { ...a, [fid]: JSON.stringify(on ? [...cur, opt] : cur.filter((x) => x !== opt)) };
    });

  const submit = async () => {
    if (!form) return;
    setError(null);
    if (!visitor.email.trim()) {
      setError(t("forms.publicEmailRequired"));
      return;
    }
    // görünür zorunlu alan denetimi (istemci tarafı — sunucu da denetler)
    const missing = form.fields.filter(
      (f) => f.required === "ALWAYS" && f.type !== "SECTION" && visible.has(f.id) &&
        !(ans[f.id] ?? "").trim() && isFieldVisible(f, ans, labelIndex),
    );
    if (missing.length > 0) {
      setError(`${t("forms.publicMissingFields")}: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    if (form.captchaEnabled && !captchaAnswer.trim()) {
      setError(t("forms.publicCaptchaRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiSend<SubmitResult>("/api/public-register", "POST", {
        formId: idOrSlug, // slug veya id — sunucu ikisini de çözer
        respondentName: visitor.name,
        respondentEmail: visitor.email,
        phone: visitor.phone || undefined,
        organization: visitor.organization || undefined,
        answers: ans,
        honeypotValue: honeypot,
        elapsedSeconds: Math.round((Date.now() - startRef.current) / 1000),
        source: "WEB_PUBLIC",
        paymentMethod: payMethod,
        challengeToken: challenge?.token,
        challengeAnswer: captchaAnswer,
        commsOptIn,
      });
      setResult(res);
      if (form.hasPublicResults && res.status !== "SPAM") {
        fetch(`/api/public-forms/${encodeURIComponent(idOrSlug)}/results`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: PublicResults | null) => d && setResults(d))
          .catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("forms.toastSubmitError"));
    } finally {
      setBusy(false);
    }
  };

  // Kayıt formu + online ödeme: gönderim başarılıysa ödeme simülasyonu (sandbox)
  const processPayment = async () => {
    if (!result?.payment) return;
    setPayBusy(true);
    try {
      const res = await apiSend<{ outcome: string; message: string; payment?: { id: string; status: string; reference?: string | null } }>(
        `/api/payments/${result.payment.id}/process`, "POST",
        { cardHolder: pay.cardHolder, cardNumber: pay.cardNumber, expiry: pay.expiry, cvc: pay.cvc },
      );
      setPayOutcome(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("forms.toastPayError"));
    } finally {
      setPayBusy(false);
    }
  };

  const again = () => {
    setResult(null);
    setResults(null);
    setPayOutcome(null);
    setPay({ cardHolder: "", cardNumber: "", expiry: "", cvc: "" });
    setPayMethod("ONLINE_CARD");
    setAns({});
    setVisitor({ name: "", email: "", phone: "", organization: "" });
    setCaptchaAnswer("");
    setHoneypot("");
    setStepNo(1); // FORM-EXP2: tekrar doldurmada ilk adıma dön
    startRef.current = Date.now();
    if (form?.captchaEnabled) load(); // tek-kullanım challenge tazele
  };

  // ─── yüklenme / hata ekranları ───
  if (loading) {
    return (
      <div className={embed ? "grid min-h-[240px] place-items-center" : "grid min-h-screen place-items-center bg-background"} role="status" aria-label={t("common.loading")}>
        <Loader2 className="size-7 animate-spin text-teal-600" />
      </div>
    );
  }
  if (loadError || !form) {
    return (
      <div className={embed ? "p-6" : "grid min-h-screen place-items-center bg-background p-6"}>
        <div className="max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto size-8 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold">{t("forms.publicNotFoundTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{loadError ?? t("forms.publicNotFound")}</p>
        </div>
      </div>
    );
  }

  const wrap = (children: ReactNode) =>
    embed ? <div className="mx-auto w-full max-w-2xl p-3">{children}</div> : (
      <div className="min-h-screen bg-gradient-to-b from-teal-50/60 via-background to-background px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </div>
    );

  // ─── sonuç ekranı ───
  if (result) {
    const spam = result.status === "SPAM";
    return wrap(
      <div className="space-y-4">
        <div className={`rounded-xl border p-6 text-center ${spam ? "border-rose-200 bg-rose-50" : result.status === "APPROVED" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          {spam ? <AlertTriangle className="mx-auto size-10 text-rose-500" /> : <CheckCircle2 className="mx-auto size-10 text-emerald-600" />}
          <h1 className="mt-3 text-xl font-semibold">
            {spam ? t("forms.toastSpamFlagged") : result.status === "APPROVED" ? t("forms.publicApproved") : t("forms.publicReceived")}
          </h1>
          {!spam && form.successMessage && <p className="mt-2 text-sm text-muted-foreground">{form.successMessage}</p>}
          {result.registration?.confirmationNo && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
              {t("forms.publicRegNo")}: <span className="font-mono font-semibold">{result.registration.confirmationNo}</span>
            </p>
          )}
          {result.quizScore != null && (
            <p className="mt-3 text-sm font-medium text-teal-800">
              {t("forms.quizScoreLine", { score: Math.round(result.quizScore), correct: result.quizCorrect ?? 0, total: result.quizTotal ?? 0 })}
            </p>
          )}
        </div>

        {/* Online kart ödemesi (simülasyon) — ONLINE_CARD seçildiyse */}
        {!spam && payMethod === "ONLINE_CARD" && result.payment && result.payment.status !== "SUCCEEDED" && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">{t("forms.payCardTitle")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1 sm:col-span-2">
                <Label className="text-xs">{t("forms.payCardHolder")}</Label>
                <Input value={pay.cardHolder} onChange={(e) => setPay({ ...pay, cardHolder: e.target.value })} autoComplete="cc-name" />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label className="text-xs">{t("forms.payCardNumber")}</Label>
                <Input value={pay.cardNumber} placeholder="4242 4242 4242 4242" onChange={(e) => setPay({ ...pay, cardNumber: e.target.value })} autoComplete="cc-number" inputMode="numeric" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">{t("forms.payExpiry")}</Label>
                <Input placeholder="AA/YY" value={pay.expiry} onChange={(e) => setPay({ ...pay, expiry: e.target.value })} autoComplete="cc-exp" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">CVC</Label>
                <Input placeholder="123" value={pay.cvc} onChange={(e) => setPay({ ...pay, cvc: e.target.value })} autoComplete="cc-csc" inputMode="numeric" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={payBusy || !pay.cardHolder.trim() || !pay.cardNumber.trim() || !pay.expiry.trim() || !pay.cvc.trim()} onClick={processPayment}>
                {t("forms.payComplete")}
              </Button>
              <span className="text-[11px] text-muted-foreground">4242… → {t("forms.yes")} · …0000 → {t("forms.no")}</span>
            </div>
            {payOutcome?.outcome === "SUCCEEDED" && (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {t("forms.payOkLine", { ref: payOutcome.payment?.reference ?? "—" })}
              </p>
            )}
            {payOutcome && payOutcome.outcome !== "SUCCEEDED" && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {payOutcome.message || t("forms.toastPayError")}
              </p>
            )}
          </div>
        )}
        {results && <ResultsPanel results={results} />}
        <div className="text-center">
          <Button variant="outline" onClick={again}>
            <RefreshCw className="size-4" /> {t("forms.publicAgain")}
          </Button>
        </div>
      </div>,
    );
  }

  // ─── form ekranı ───
  const isReg = form.type === "REGISTRATION";

  // FORM-EXP2: çok-adımlı form — adım matematiği + adım-içi zorunlu-alan denetimi
  const stepsMode = Boolean(form.enableSteps);
  const maxStep = Math.max(1, ...form.fields.map((f) => f.step ?? 1));
  const isLast = stepNo >= maxStep;
  const goNext = () => {
    setError(null);
    const missing = form.fields.filter(
      (f) => f.required === "ALWAYS" && f.type !== "SECTION" &&
        (f.step ?? 1) === stepNo && visible.has(f.id) &&
        !(ans[f.id] ?? "").trim(),
    );
    if (missing.length > 0) {
      setError(t("forms.stepMissing", { fields: missing.map((f) => f.label).join(", ") }));
      return;
    }
    setStepNo((s) => Math.min(maxStep, s + 1));
  };

  return wrap(
    <div className="space-y-4">
      <header className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{form.name}</h1>
          {isReg && <Badge className="bg-teal-600">{t("forms.badgeRegistration")}</Badge>}
          {(form.type === "SURVEY" || form.type === "FEEDBACK") && <Badge variant="outline">{t("forms.badgeSurvey")}</Badge>}
        </div>
        {form.description && <p className="mt-1.5 text-sm text-muted-foreground">{form.description}</p>}
      </header>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="relative space-y-5">
          {/* FORM-EXP2: adım göstergesi — ilerleme çubuğu + adım sayısı */}
          {stepsMode && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-teal-800">{t("forms.stepOf", { n: stepNo, m: maxStep })}</span>
                <span className="tabular-nums text-muted-foreground">{Math.round((stepNo / maxStep) * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all duration-300"
                  style={{ width: `${(stepNo / maxStep) * 100}%` }}
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={maxStep}
                  aria-valuenow={stepNo}
                />
              </div>
            </div>
          )}

          {/* STUDIO-DND: alanlar tasarımcıdaki genişlikleriyle flex satırlarına dizilir —
              FORM-EXP2: adımlı modda yalnız geçerli adımın alanları gösterilir */}
          <div className="flex flex-wrap">
            {form.fields.filter((f) => visible.has(f.id) && (!stepsMode || (f.step ?? 1) === stepNo)).map((f) => {
              const w = f.type === "SECTION" ? 100 : Math.min(100, Math.max(25, Math.round(f.width ?? 100)));
              return (
                <div
                  key={f.id}
                  className="px-1.5 pb-3"
                  style={{ width: `${w}%`, minWidth: w < 100 ? 230 : undefined }}
                >
                  <FieldInput f={f} ans={ans} set={set} toggleIn={toggleIn} />
                </div>
              );
            })}
          </div>

          {/* ziyaretçi kimliği — FORM-EXP2: adımlı modda yalnız SON adımda istenir */}
          {isLast && (
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.publicName")}</Label>
              <Input value={visitor.name} autoComplete="name" onChange={(e) => setVisitor({ ...visitor, name: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">{t("forms.publicEmail")}<span className="text-rose-500"> *</span></Label>
              <Input type="email" required value={visitor.email} autoComplete="email" onChange={(e) => setVisitor({ ...visitor, email: e.target.value })} />
            </div>
            {isReg && (
              <>
                <div className="grid gap-1">
                  <Label className="text-xs">{t("forms.publicPhone")}</Label>
                  <Input type="tel" value={visitor.phone} autoComplete="tel" onChange={(e) => setVisitor({ ...visitor, phone: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">{t("forms.publicOrg")}</Label>
                  <Input value={visitor.organization} autoComplete="organization" onChange={(e) => setVisitor({ ...visitor, organization: e.target.value })} />
                </div>
              </>
            )}
          </div>
          )}

          {/* FORM-EXP2: adım gezinmesi — Geri/İleri (yalnız adımlı mod, son adım hariç) */}
          {stepsMode && !isLast && (
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" disabled={stepNo <= 1 || busy} onClick={() => { setError(null); setStepNo((s) => Math.max(1, s - 1)); }}>
                <ChevronLeft className="size-4" /> {t("forms.stepBack")}
              </Button>
              <Button className="flex-1" onClick={goNext}>
                {t("forms.stepNext")} <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          {/* KVKK rıza */}
          {isLast && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs">
            <Checkbox checked={commsOptIn} onCheckedChange={(c) => setCommsOptIn(c === true)} className="mt-0.5" />
            <span className="text-muted-foreground">{t("forms.publicConsent")}</span>
          </label>
          )}

          {/* Ödeme yöntemi — sadece online ödemeli kayıt formu (son adımda) */}
          {isLast && isReg && form.enableOnlinePayment && (
            <div className="grid gap-1 rounded-lg border bg-muted/20 p-3">
              <Label className="text-xs">{t("forms.payMethodLabel")}</Label>
              <div className="grid gap-1.5">
                {[
                  { value: "ONLINE_CARD", label: t("forms.payOnlineCard") },
                  { value: "BANK_TRANSFER", label: t("forms.payBankTransfer") },
                  { value: "PAYMENT_LINK", label: t("forms.payLink") },
                ].map((m) => (
                  <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="payMethod" checked={payMethod === m.value} onChange={() => setPayMethod(m.value)} className="size-4 accent-teal-700" />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* insan doğrulaması — son adımda */}
          {isLast && form.captchaEnabled && challenge && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-teal-900">
                <ShieldCheck className="size-3.5" /> {t("forms.publicCaptchaTitle")}
              </Label>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md border bg-white px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-teal-900" aria-live="polite">
                  {challenge.question} = ?
                </span>
                <Input
                  className="w-24"
                  inputMode="numeric"
                  value={captchaAnswer}
                  placeholder={t("forms.publicCaptchaPh")}
                  aria-label={t("forms.publicCaptchaTitle")}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("forms.publicCaptchaHint")}</p>
            </div>
          )}

          {/* honeypot — gizli alan */}
          {form.honeypotEnabled && (
            <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
              <Input value={honeypot} name="website" autoComplete="off" tabIndex={-1} onChange={(e) => setHoneypot(e.target.value)} />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
          )}

          {isLast && (
          <>
          <Button className="w-full" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {isReg ? t("forms.publicSubmitReg") : t("forms.publicSubmit")}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            <ShieldCheck className="mr-1 inline size-3" />
            {t("forms.publicSpamNote")}
          </p>
          </>
          )}
        </div>
      </div>
    </div>,
  );
}

// ─── alan giriş bileşeni ─────────────────────────────────────────────────────

function FieldInput({
  f, ans, set, toggleIn,
}: {
  f: PublicField;
  ans: Record<string, string>;
  set: (fid: string, v: string) => void;
  toggleIn: (fid: string, opt: string, on: boolean) => void;
}) {
  const value = ans[f.id] ?? "";
  const reqStar = f.required === "ALWAYS" ? <span className="text-rose-500"> *</span> : null;
  const opts = optsOf(f);
  const cols = colsOf(f);
  const multiSelected: string[] = value ? (Array.isArray(parseMaybeJson(value)) ? (parseMaybeJson(value) as string[]) : []) : [];

  if (f.type === "SECTION") {
    return (
      <div className="border-b pb-1.5">
        <p className="text-sm font-bold tracking-wide text-teal-900">{f.label}</p>
        {f.helpText && <p className="mt-0.5 text-xs text-muted-foreground">{f.helpText}</p>}
      </div>
    );
  }

  const body = (() => {
    switch (f.type) {
      case "LONGTEXT":
        return <Textarea rows={3} value={value} placeholder={f.placeholder ?? ""} onChange={(e) => set(f.id, e.target.value)} />;
      case "NUMBER":
        return <Input type="number" value={value} placeholder={f.placeholder ?? ""} onChange={(e) => set(f.id, e.target.value)} />;
      case "EMAIL":
        return <Input type="email" value={value} placeholder={f.placeholder ?? "ad@ornek.com"} onChange={(e) => set(f.id, e.target.value)} />;
      case "PHONE":
        return <Input type="tel" value={value} placeholder={f.placeholder ?? "+90 5xx xxx xx xx"} onChange={(e) => set(f.id, e.target.value)} />;
      case "URL":
        return <Input type="url" value={value} placeholder="https://…" onChange={(e) => set(f.id, e.target.value)} />;
      case "DATE":
        return <Input type="date" value={value} onChange={(e) => set(f.id, e.target.value)} />;
      case "TIME":
        return <Input type="time" value={value} onChange={(e) => set(f.id, e.target.value)} />;
      case "COUNTRY":
        return <Input value={value} placeholder={f.placeholder ?? t("forms.phCountry")} onChange={(e) => set(f.id, e.target.value)} />;
      case "FILE":
        return <Input type="file" onChange={() => undefined} className="text-xs" aria-label={f.label} />;
      case "SINGLE_CHOICE":
      case "QA_QUIZ":
      case "VOTE":
        return (
          <div className={`grid gap-1.5 ${f.type === "VOTE" ? "rounded-lg border p-2.5" : ""}`} role="radiogroup" aria-label={f.label}>
            {opts.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={f.id}
                  value={o}
                  checked={value === o}
                  onChange={() => set(f.id, o)}
                  className="size-4 accent-teal-700"
                />
                {o}
              </label>
            ))}
            {opts.length === 0 && <p className="text-xs text-muted-foreground">{t("forms.noOptions")}</p>}
          </div>
        );
      case "MULTI_CHOICE":
        return (
          <div className="grid gap-1.5 rounded-lg border p-2.5">
            {opts.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={multiSelected.includes(o)} onCheckedChange={(c) => toggleIn(f.id, o, c === true)} />
                {o}
              </label>
            ))}
            {opts.length === 0 && <p className="text-xs text-muted-foreground">{t("forms.noOptions")}</p>}
          </div>
        );
      case "CHECKBOX":
      case "YESNO":
      case "TERMS":
        return (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={value === "true"} onCheckedChange={(c) => set(f.id, c ? "true" : "false")} aria-label={f.label} />
            {f.type === "YESNO" && (
              <span className="text-muted-foreground">
                {value === "true" ? t("forms.yes") : value === "false" ? t("forms.no") : t("forms.chooseHint")}
              </span>
            )}
          </label>
        );
      case "RATING":
        return (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={t("forms.stars", { n })} aria-pressed={Number(value) >= n}
                onClick={() => set(f.id, String(n))}
                className="rounded-md p-1 transition hover:bg-amber-50">
                <svg viewBox="0 0 24 24" className={`size-6 ${Number(value) >= n ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40"}`} stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9L12 2.5z" />
                </svg>
              </button>
            ))}
            {value && <span className="ml-1 text-xs text-muted-foreground">{value}/5</span>}
          </div>
        );
      case "NPS":
        return (
          <div className="grid gap-1">
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, n) => (
                <button key={n} type="button" aria-pressed={Number(value) === n} aria-label={String(n)}
                  onClick={() => set(f.id, String(n))}
                  className={`rounded-md border py-1.5 text-xs font-medium transition ${Number(value) === n ? "border-teal-600 bg-teal-600 text-white" : "hover:bg-accent"}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{t("forms.npsLow")}</span><span>{t("forms.npsHigh")}</span>
            </div>
          </div>
        );
      case "RANKING":
        return opts.length > 0 ? <RankingInput opts={opts} value={value} onChange={(v) => set(f.id, v)} /> : <p className="text-xs text-muted-foreground">{t("forms.noOptions")}</p>;
      case "MATRIX":
        return (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="p-2 text-left text-xs font-medium" />
                  {cols.map((c) => <th key={c} className="p-2 text-center text-xs font-medium">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {opts.map((r) => {
                  const rowState: Record<string, string> = value ? ((parseMaybeJson(value) as Record<string, string>) ?? {}) : {};
                  return (
                    <tr key={r} className="border-b last:border-0">
                      <td className="p-2 text-xs font-medium">{r}</td>
                      {cols.map((c) => (
                        <td key={c} className="p-2 text-center">
                          <input
                            type="radio"
                            name={`${f.id}-${r}`}
                            aria-label={`${r}: ${c}`}
                            checked={rowState[r] === c}
                            onChange={() => set(f.id, JSON.stringify({ ...rowState, [r]: c }))}
                            className="size-4 accent-teal-700"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      case "SIGNATURE":
        return <SignaturePad value={value} onChange={(v) => set(f.id, v)} />;
      default:
        return <Input value={value} placeholder={f.placeholder ?? ""} onChange={(e) => set(f.id, e.target.value)} />;
    }
  })();

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium">
        {f.label}
        {reqStar}
        {f.points != null && f.type === "QA_QUIZ" && (
          <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{f.points} {t("forms.pts")}</span>
        )}
        {f.mobileInteractive && <Badge variant="outline" className="ml-1.5 text-[10px]">{t("forms.mobileItem")}</Badge>}
      </Label>
      {body}
      {f.helpText && f.type !== "CHECKBOX" && f.type !== "YESNO" && f.type !== "TERMS" && (
        <p className="text-xs text-muted-foreground">{f.helpText}</p>
      )}
      {f.type === "TERMS" && f.helpText && (
        <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">{f.helpText}</p>
      )}
    </div>
  );
}

// ─── oylama sonuç paneli ─────────────────────────────────────────────────────

function ResultsPanel({ results }: { results: PublicResults }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {t("forms.publicResultsTitle")}
        <Badge variant="outline">{t("forms.publicVotesCount", { n: results.totalVotes })}</Badge>
      </h2>
      <div className="mt-3 space-y-4">
        {results.fields.map((f) => (
          <div key={f.fieldId} className="grid gap-1.5">
            <p className="text-xs font-medium">{f.label}</p>
            {f.distribution && f.distribution.length > 0 && (
              <div className="grid gap-1">
                {f.distribution.map((d) => {
                  const pct = results.totalVotes > 0 ? Math.round((d.count / Math.max(1, f.responseCount)) * 100) : 0;
                  return (
                    <div key={d.value} className="flex items-center gap-2 text-xs">
                      <span className="w-40 shrink-0 truncate" title={d.value}>{d.value}</span>
                      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{d.count} · %{pct}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {f.average != null && (
              <p className="text-xs text-muted-foreground">{t("forms.publicAvg")}: <b className="text-teal-800">{f.average}</b></p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
