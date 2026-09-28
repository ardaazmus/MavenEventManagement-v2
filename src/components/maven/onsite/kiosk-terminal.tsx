"use client";

import React, { useState, useEffect, useRef } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrScanner } from "@/components/maven/portal/qr-scanner";
import { haptic } from "@/lib/haptic";
import { useLang } from "@/lib/i18n";
import { generateZplBadge, sendZplToThermalPrinter, PrintJobResult } from "@/lib/onsite/zpl-engine";
import { apiSend, apiGet } from "@/lib/client";
import { cn } from "@/lib/utils";

interface KioskTerminalProps {
  editionId?: string;
  editionName?: string;
  doorName?: string;
  onClose: () => void;
  onScanComplete?: () => void;
}

interface ScanResponse {
  result: "ALLOWED" | "RESCAN_WARNING" | "DENIED";
  scanId?: string;
  reason?: string | null;
  person?: {
    id: string;
    name: string;
    company?: string | null;
    title?: string | null;
  };
  registration?: {
    status: string;
    category?: string | null;
    funding?: string;
  } | null;
  badge?: {
    id?: string;
    badgeNo?: string;
    status: string;
    profile?: string | null;
    reprintCount?: number;
  } | null;
}

export function KioskTerminal({
  editionId,
  editionName = "MAVEN EVENT",
  doorName = "Kiosk İstasyonu #1",
  onClose,
  onScanComplete,
}: KioskTerminalProps) {
  const { t } = useLang();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResponse | null>(null);
  const [printResult, setPrintResult] = useState<PrintJobResult | null>(null);
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);

  // Anti-fraud reprint supervisor state
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState("");
  const [reprintReason, setReprintReason] = useState("Kayıp / Hasar gördü");
  const [pinError, setPinError] = useState(false);
  const [pendingBadgeData, setPendingBadgeData] = useState<any>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Keep barcode input focused for hardware USB barcode scanners
  useEffect(() => {
    const focusBarcode = () => {
      if (!showSupervisorModal && barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    };
    focusBarcode();
    const interval = setInterval(focusBarcode, 2000);
    return () => clearInterval(interval);
  }, [showSupervisorModal]);

  // Handle Fullscreen tracking
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen toggle failed:", e);
    }
  };

  // Auto-reset countdown after successful check-in
  useEffect(() => {
    if (resetCountdown === null) return;
    if (resetCountdown <= 0) {
      resetToScanning();
      return;
    }
    const timer = setTimeout(() => {
      setResetCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resetCountdown]);

  const resetToScanning = () => {
    setLastResult(null);
    setPrintResult(null);
    setResetCountdown(null);
    setManualCode("");
    setIsProcessing(false);
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  // Perform thermal badge print
  const dispatchBadgePrint = async (person: any, badge: any, isReprint = false) => {
    const reprintNum = isReprint ? (badge?.reprintCount ?? 0) + 1 : 0;
    const zpl = generateZplBadge({
      fullName: person.name,
      title: person.title,
      company: person.company,
      category: badge?.profile || "KATILIMCI",
      profileName: badge?.profile,
      badgeNo: badge?.badgeNo || badge?.id || "MAV-001",
      qrCodeData: `MAVEN:${badge?.badgeNo || person.id}`,
      reprintCount: reprintNum,
      editionName,
    });

    const job = await sendZplToThermalPrinter(zpl);
    setPrintResult(job);

    // Call print queue endpoint to record print/reprint in database
    if (badge?.id) {
      try {
        await apiSend("/api/badges/print-queue", "POST", {
          ids: [badge.id],
          action: isReprint ? "REPRINT" : "PRINT",
          reason: isReprint ? reprintReason : undefined,
        });
      } catch (err) {
        console.warn("Failed to record badge print in database:", err);
      }
    }
  };

  // Process scanned code
  const handleCodeScanned = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || isProcessing) return;

    setIsProcessing(true);
    haptic.medium();

    try {
      const res = await apiSend<ScanResponse>("/api/scan", "POST", {
        code,
        door: doorName,
        action: "ENTRY",
      });

      setLastResult(res);

      if (res.result === "ALLOWED" || res.result === "RESCAN_WARNING") {
        haptic.success();

        // Check if badge was already printed (Anti-Fraud)
        const isAlreadyPrinted =
          res.badge && (res.badge.status === "PRINTED" || res.badge.status === "ISSUED" || (res.badge.reprintCount ?? 0) > 0);

        if (isAlreadyPrinted) {
          // Open Supervisor PIN Modal for anti-fraud reprint
          setPendingBadgeData({ person: res.person, badge: res.badge });
          setShowSupervisorModal(true);
        } else if (res.person) {
          // Normal first-time instant thermal print
          await dispatchBadgePrint(res.person, res.badge, false);
          setResetCountdown(4);
        }
      } else {
        haptic.error();
        setResetCountdown(5);
      }

      onScanComplete?.();
    } catch (err) {
      haptic.error();
      setLastResult({
        result: "DENIED",
        reason: err instanceof Error ? err.message : "Geçersiz veya okunamayan kod.",
      });
      setResetCountdown(4);
    } finally {
      setIsProcessing(false);
      setManualCode("");
    }
  };

  // Supervisor PIN confirmation
  const handleSupervisorReprint = async () => {
    // PIN Check: default master PIN 1234 or 9999
    if (supervisorPin.trim() !== "1234" && supervisorPin.trim() !== "9999") {
      setPinError(true);
      haptic.error();
      return;
    }

    setPinError(false);
    setShowSupervisorModal(false);

    if (pendingBadgeData?.person && pendingBadgeData?.badge) {
      await dispatchBadgePrint(pendingBadgeData.person, pendingBadgeData.badge, true);
      setResetCountdown(4);
    }
    setSupervisorPin("");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-zinc-100 select-none overflow-hidden">
      {/* Hidden input for USB Barcode Reader */}
      <input
        ref={barcodeInputRef}
        type="text"
        value={manualCode}
        onChange={(e) => setManualCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleCodeScanned(manualCode);
          }
        }}
        className="opacity-0 absolute pointer-events-none -top-10"
        aria-hidden="true"
      />

      {/* Kiosk Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-teal-500 text-zinc-950 font-black text-xl">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">{editionName}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{doorName} — Kiosk Hızlı Giriş</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700"
          >
            {isFullscreen ? <Icons.Minimize className="size-4" /> : <Icons.Maximize className="size-4" />}
            <span className="ml-1.5 hidden sm:inline">{isFullscreen ? "Pencereye Dön" : "Tam Ekran (F11)"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="Kiosk Modundan Çık"
          >
            <Icons.X className="size-5" />
          </Button>
        </div>
      </header>

      {/* Main Kiosk Body */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {/* State 1: Active Scanning */}
        {!lastResult && !isProcessing && (
          <div className="w-full max-w-xl flex flex-col items-center text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 border border-teal-500/30 px-4 py-1.5 text-sm font-medium text-teal-400">
                <Icons.QrCode className="size-4" /> Dokunmatik Hızlı Check-in
              </div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
                Yaka Kartınızı Basmak İçin QR Kodunuzu Okutunuz
              </h2>
              <p className="text-sm text-zinc-400 max-w-md mx-auto">
                Kayıt onay e-postanızdaki veya mobil cüzdanınızdaki karekodu kameraya veya barkod okuyucuya yaklaştırınız.
              </p>
            </div>

            {/* Camera Viewfinder */}
            <div className="w-full max-w-md aspect-square rounded-3xl overflow-hidden border-2 border-dashed border-teal-500/50 bg-zinc-900/60 shadow-2xl relative">
              <QrScanner
                onScan={handleCodeScanned}
                active={true}
              />
            </div>

            {/* Alternative Manual Code input */}
            <div className="w-full max-w-md flex gap-2">
              <Input
                placeholder="veya 6 haneli kayıt kodunuzu giriniz..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCodeScanned(manualCode)}
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 font-mono text-center"
              />
              <Button
                onClick={() => handleCodeScanned(manualCode)}
                disabled={!manualCode.trim()}
                className="bg-teal-600 hover:bg-teal-500 text-white"
              >
                Giriş Yap
              </Button>
            </div>
          </div>
        )}

        {/* State 2: Processing Scanner (<2s) */}
        {isProcessing && (
          <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-200">
            <div className="size-20 rounded-full border-4 border-teal-500/30 border-t-teal-400 animate-spin" />
            <h3 className="text-2xl font-bold text-white">Doğrulanıyor...</h3>
            <p className="text-sm text-zinc-400">Yaka kartı verisi hazırlanıyor</p>
          </div>
        )}

        {/* State 3: Success & Thermal Printing Display */}
        {lastResult && (lastResult.result === "ALLOWED" || lastResult.result === "RESCAN_WARNING") && (
          <div className="w-full max-w-xl flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-300">
            {/* Success Icon */}
            <div className="size-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 grid place-items-center text-emerald-400 shadow-xl shadow-emerald-500/10">
              <Icons.Check className="size-10 stroke-[3]" />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                {lastResult.result === "RESCAN_WARNING" ? "Tekrar Giriş Doğrulandı" : "Giriş Başarılı"}
              </span>
              <h2 className="text-3xl font-black text-white">
                Hoş Geldiniz, {lastResult.person?.name}!
              </h2>
              {lastResult.person?.company && (
                <p className="text-lg text-zinc-300 font-medium">{lastResult.person.company}</p>
              )}
            </div>

            {/* Thermal Print Feedback Card */}
            <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <Icons.Printer className="size-4 text-teal-400 animate-bounce" />
                  Termal Yazıcı Durumu
                </span>
                <span className="font-mono text-teal-400">
                  {printResult?.latencyMs ? `${printResult.latencyMs} ms (<2s)` : "Hazırlanıyor"}
                </span>
              </div>

              <div className="flex items-center justify-center gap-3 py-2">
                <div className="size-3 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-sm font-semibold text-zinc-200">
                  {printResult?.method === "websocket"
                    ? "Zebra ZPL II Doğrudan Termal Yazdırıldı"
                    : t("kiosk.badgePrinting")}
                </span>
              </div>

              {lastResult.badge && (
                <div className="flex justify-center gap-2 text-xs">
                  <span className="rounded-md bg-teal-500/20 text-teal-300 px-2.5 py-1 font-mono">
                    #{lastResult.badge.badgeNo || lastResult.badge.id?.slice(-6)}
                  </span>
                  <span className="rounded-md bg-zinc-800 text-zinc-300 px-2.5 py-1">
                    {lastResult.badge.profile || "Genel Katılımcı"}
                  </span>
                </div>
              )}
            </div>

            {/* Countdown reset button */}
            <Button
              size="lg"
              onClick={resetToScanning}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 h-12 shadow-lg"
            >
              Sıradaki Katılımcı ({resetCountdown ?? 3}s)
            </Button>
          </div>
        )}

        {/* State 4: Denied / Error */}
        {lastResult && lastResult.result === "DENIED" && (
          <div className="w-full max-w-lg flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="size-20 rounded-full bg-rose-500/20 border-2 border-rose-500 grid place-items-center text-rose-400 shadow-xl shadow-rose-500/10">
              <Icons.Ban className="size-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-white">Giriş Onaylanamadı</h2>
              <p className="text-rose-400 font-medium">
                {lastResult.reason || t("kiosk.recordNotFound")}
              </p>
              <p className="text-sm text-zinc-400 max-w-sm mx-auto">
                Lütfen Danışma / Kayıt Deski görevlisine başvurunuz.
              </p>
            </div>

            <Button
              variant="outline"
              size="lg"
              onClick={resetToScanning}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              Tekrar Dene ({resetCountdown ?? 4}s)
            </Button>
          </div>
        )}
      </main>

      {/* Anti-Fraud Supervisor PIN Modal */}
      <Dialog open={showSupervisorModal} onOpenChange={(open) => !open && setShowSupervisorModal(false)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/20 text-amber-400 mb-2">
              <Icons.ShieldAlert className="size-6" />
            </div>
            <DialogTitle className="text-center text-xl font-bold">
              Yeniden Basım Koruması (Anti-Fraud)
            </DialogTitle>
            <DialogDescription className="text-center text-zinc-400 text-xs">
              Bu yaka kartı daha önce basılmıştır. Çift girişin önlenmesi amacıyla tekrar basım yetkili personel onayı gerektirir.
            </DialogDescription>
          </DialogHeader>

          {pendingBadgeData && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Katılımcı:</span>
                <span className="font-semibold text-zinc-200">{pendingBadgeData.person?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Rozet No:</span>
                <span className="font-mono text-teal-400">#{pendingBadgeData.badge?.badgeNo || pendingBadgeData.badge?.id?.slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Önceki Basım:</span>
                <span className="text-amber-400 font-semibold">{pendingBadgeData.badge?.reprintCount ?? 1}. Basım yapılmış</span>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-zinc-400">Tekrar Basım Nedeni</label>
              <Select value={reprintReason} onValueChange={setReprintReason}>
                <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="Kayıp / Hasar gördü">Kayıp / Hasar gördü</SelectItem>
                  <SelectItem value="İsim / Ünvan hatası düzeltildi">İsim / Ünvan hatası düzeltildi</SelectItem>
                  <SelectItem value="Yazıcı kağıt sıkıştırdı">Yazıcı kağıt sıkıştırdı</SelectItem>
                  <SelectItem value="Yönetici özel onayı">Yönetici özel onayı</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400">Süpervizör PIN Kodu</label>
              <Input
                type="password"
                maxLength={6}
                value={supervisorPin}
                onChange={(e) => {
                  setSupervisorPin(e.target.value);
                  setPinError(false);
                }}
                placeholder="4 haneli yetkili PIN giriniz (örn: 1234)"
                className="mt-1 bg-zinc-950 border-zinc-800 text-white text-center font-mono tracking-widest text-lg"
              />
              {pinError && (
                <p className="mt-1 text-xs text-rose-400">Geçersiz PIN! Lütfen süpervizör kodunu kontrol edin.</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowSupervisorModal(false);
                resetToScanning();
              }}
              className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              İptal
            </Button>
            <Button
              onClick={handleSupervisorReprint}
              disabled={supervisorPin.length < 4}
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
            >
              Onayla ve Yeniden Bas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
