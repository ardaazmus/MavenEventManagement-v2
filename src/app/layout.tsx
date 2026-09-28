import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppThemeProvider } from "@/components/theme-provider";
import { THEME_COOKIE, sanitizeThemeChoice } from "@/lib/theme/preferences";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maven Event Management — Ortak Organizasyonel Mimari",
  description: "Çok kiracılı Event Operations Platform: kayıt, bilimsel süreç, program, sponsorluk, konaklama, saha ve finans tek çekirdek üzerinde.",
  keywords: ["Maven", "Event Management", "Etkinlik", "Kongre", "Fuar", "Entitlement"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
    // PWA simgeleri — Katılımcı Dış Portalı (manifest + apple-touch)
    apple: "/portal-icon-180.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Maven Portal",
  },
};

// PWA tarayıcı çubuğu rengi — iOS Safari + Android Chrome standalone uyumu
export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // P15.1: çerezdeki kullanıcı tercihi SSR'e taşınır — hydration uyuşmazlığı yok.
  // Kayıtlı tercih yoksa AÇIK tema varsayılır (koyu kilitlenmesi şikayeti).
  const store = await cookies();
  const defaultTheme = sanitizeThemeChoice(store.get(THEME_COOKIE)?.value) ?? "light";
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AppThemeProvider defaultTheme={defaultTheme}>
          {children}
          <Toaster />
        </AppThemeProvider>
      </body>
    </html>
  );
}
