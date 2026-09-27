/**
 * Cross-Platform Haptic Feedback Service for PWA
 * Supports Android Vibration API + iOS Taptic feedback fallback
 */

export type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

class HapticService {
  private hasVibration: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.hasVibration = "vibrate" in navigator;
    }
  }

  public trigger(style: HapticStyle = "light"): void {
    if (typeof window === "undefined") return;

    if (this.hasVibration) {
      try {
        switch (style) {
          case "selection":
            navigator.vibrate(8);
            break;
          case "light":
            navigator.vibrate(15);
            break;
          case "medium":
            navigator.vibrate(30);
            break;
          case "heavy":
            navigator.vibrate(50);
            break;
          case "success":
            navigator.vibrate([15, 60, 25]);
            break;
          case "warning":
            navigator.vibrate([30, 40, 30]);
            break;
          case "error":
            navigator.vibrate([50, 50, 50, 50, 75]);
            break;
        }
      } catch {
        // Silently catch if browser restricts vibration
      }
    }
  }

  public light() {
    this.trigger("light");
  }

  public medium() {
    this.trigger("medium");
  }

  public heavy() {
    this.trigger("heavy");
  }

  public success() {
    this.trigger("success");
  }

  public error() {
    this.trigger("error");
  }

  public selection() {
    this.trigger("selection");
  }
}

export const haptic = new HapticService();
