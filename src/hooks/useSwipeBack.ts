"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptic";

export interface SwipeBackOptions {
  edgeThreshold?: number; // Distance in px from left edge to start gesture (default: 30)
  triggerDistance?: number; // Distance in px to trigger back (default: 80)
  onSwipeBack?: () => void;
  enabled?: boolean;
}

export function useSwipeBack(options: SwipeBackOptions = {}) {
  const {
    edgeThreshold = 35,
    triggerDistance = 85,
    onSwipeBack,
    enabled = true,
  } = options;

  const router = useRouter();
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isEdgeSwipe = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (touch.clientX <= edgeThreshold) {
        startX.current = touch.clientX;
        startY.current = touch.clientY;
        isEdgeSwipe.current = true;
      } else {
        isEdgeSwipe.current = false;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isEdgeSwipe.current || startX.current === null || startY.current === null) {
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX.current;
      const deltaY = Math.abs(touch.clientY - startY.current);

      // Must be predominantly horizontal and exceed threshold
      if (deltaX >= triggerDistance && deltaY < deltaX * 0.6) {
        haptic.selection();
        if (onSwipeBack) {
          onSwipeBack();
        } else {
          router.back();
        }
      }

      startX.current = null;
      startY.current = null;
      isEdgeSwipe.current = false;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, edgeThreshold, triggerDistance, onSwipeBack, router]);
}
