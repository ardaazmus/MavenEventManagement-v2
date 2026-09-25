import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
