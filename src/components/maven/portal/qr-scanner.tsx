"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { haptic } from "@/lib/haptic";
import { Camera, RefreshCw, Zap, ZapOff, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onClose?: () => void;
  active?: boolean;
}

export function QrScanner({ onScan, onClose, active = true }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(true);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback((result: string) => {
    if (!isScanningRef.current) return;
    isScanningRef.current = false;
    haptic.success();
    onScan(result);
    // Cooldown before scanning again if modal remains open
    setTimeout(() => {
      isScanningRef.current = true;
    }, 1200);
  }, [onScan]);

  // H-13: tick kendini useCallback içinden doğrudan çağıramaz (TDZ kapanma riski);
  // güncel sürüm ref üzerinden okunur.
  const tickRef = useRef<() => void>(() => {});
  const tick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanningRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => tickRef.current());
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        handleScanSuccess(code.data);
      }
    }

    animationFrameRef.current = requestAnimationFrame(() => tickRef.current());
  }, [handleScanSuccess]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      setErrorMsg(null);
      isScanningRef.current = true;

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check for torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities ? (videoTrack.getCapabilities() as { torch?: boolean }) : {};
        setHasTorch(Boolean(capabilities.torch));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasPermission(true);
      animationFrameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setHasPermission(false);
      setErrorMsg(err instanceof Error ? err.message : "Kamera erişim izni reddedildi.");
    }
  }, [stopCamera, tick]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      try {
        const nextState = !torchOn;
        await (track.applyConstraints as any)({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
        haptic.light();
      } catch {
        // Torch constraint failed
      }
    }
  };

  useEffect(() => {
    if (active) {
      // H-13: kamera başlatma rAF geri-çağrısında (effect gövdesinde senkron setState yok).
      const id = requestAnimationFrame(() => {
        void startCamera();
      });
      return () => {
        cancelAnimationFrame(id);
        stopCamera();
      };
    }
    stopCamera();
    return () => {
      stopCamera();
    };
  }, [active, startCamera, stopCamera]);

  return (
    <div className="relative w-full h-[360px] sm:h-[420px] rounded-2xl overflow-hidden bg-black flex items-center justify-center">
      {/* Video Stream Element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Target Reticle & Animated Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative size-60 sm:size-64 rounded-2xl border-2 border-white/60 shadow-2xl flex items-center justify-center">
          {/* Corner Guides */}
          <div className="absolute -top-1 -left-1 size-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
          <div className="absolute -top-1 -right-1 size-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
          <div className="absolute -bottom-1 -left-1 size-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
          <div className="absolute -bottom-1 -right-1 size-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

          {/* Animated Laser Scan Line */}
          <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse absolute top-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </div>
      </div>

      {/* Top Controls Overlay */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-medium">
          <Camera className="size-3.5 text-emerald-400" />
          <span>Kamera Aktif</span>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTorch}
              className="size-8 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md"
            >
              {torchOn ? <Zap className="size-4 text-amber-400 fill-amber-400" /> : <ZapOff className="size-4" />}
            </Button>
          )}

          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="size-8 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md"
            >
              <XCircle className="size-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none">
        <span className="inline-block px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 text-xs font-medium">
          Yaka kartı veya QR kodunu çerçevenin içine hizalayın
        </span>
      </div>

      {/* Error or Permission Denied Screen */}
      {hasPermission === false && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
          <AlertCircle className="size-10 text-rose-500" />
          <h4 className="font-semibold text-sm">Kamera İzni Gerekli</h4>
          <p className="text-xs text-white/70 max-w-xs">{errorMsg}</p>
          <Button size="sm" onClick={startCamera} className="gap-1.5">
            <RefreshCw className="size-3.5" /> Yeniden Dene
          </Button>
        </div>
      )}
    </div>
  );
}
