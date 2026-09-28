// P15.1/P15.4: next-themes sağlayıcısı + portal/yönetici tema ayrımı.
// Sunucu çerezdeki kullanıcı tercihini defaultTheme olarak verir (hydration
// tutarlılığı); portal yüzeyi PortalThemeGuard ile daima açık temaya zorlanır
// ve çıkışta önceki tercih geri yüklenir (yönetici tercihi ezilmez).
"use client";
import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import type { ThemeChoice } from "@/lib/theme/preferences";

export function AppThemeProvider({
  children,
  defaultTheme,
}: {
  children: React.ReactNode;
  defaultTheme: ThemeChoice;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange storageKey="maven-admin-theme">
      {children}
    </ThemeProvider>
  );
}

export function PortalThemeGuard({ children }: { children: React.ReactNode }) {
  // next-themes deposuna DOKUNMAZ — yönetici tercihi ezilmez; yalnız DOM sınıfı
  // portal süresince açık temaya zorlanır (tam sayfa dönüşte sağlayıcı
  // saklı tercihi yeniden uygular).
  useEffect(() => {
    const el = document.documentElement;
    const hadDark = el.classList.contains("dark");
    el.classList.remove("dark");
    el.classList.add("light");
    return () => {
      el.classList.remove("light");
      if (hadDark) el.classList.add("dark");
    };
  }, []);
  return <>{children}</>;
}
