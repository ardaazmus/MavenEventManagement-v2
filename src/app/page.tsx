"use client";
// Maven Event Management — tek sayfa uygulama (SPA)
// UI-AKIS 2026: modül→bileşen bağı src/lib/module-components.tsx'e taşındı (tek kaynak);
// bu dosya veri-güdümlü — yeni modül eklemek için switch'e case yazmak GEREKMEZ.
// Kilitler (§03 + §48): 1) YETENEK kilidi — edisyon yeteneği kapalıysa amber panel;
// 2) ROL kilidi — modül kullanıcı rolüne kapalıysa amber panel (auth-on oturumlarda;
// auth-off / oturumsuz rol=null → filtre devre dışı, mevcut davranış korunur).
// F-EXP: ?form=<id|slug> → dış paylaşım sayfası (shell'siz); embed=1 → iframe gömme.
import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useApp, hasCapability } from "@/lib/store";
import { MODULES, roleCanSee } from "@/lib/constants";
import { MODULE_COMPONENTS } from "@/lib/module-components";
import { Shell } from "@/components/maven/shell";
import { EmptyState } from "@/components/maven/bits";
import { Lock } from "lucide-react";
import { t } from "@/lib/i18n";

const ModuleSkeleton = () => (
  <div className="grid min-h-[50vh] place-items-center text-muted-foreground" role="status" aria-label="Modül yükleniyor">
    <div className="flex flex-col items-center gap-2">
      <svg className="size-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" className="opacity-75" />
      </svg>
      <p className="text-xs">Modül yükleniyor…</p>
    </div>
  </div>
);

// PWA Katılımcı Dış Portalı — ?portal=<slug> yüzeyi (Shell'siz, mobil-öncelikli)
const PortalAppPage = dynamic(
  () => import("@/components/maven/portal-app").then((m) => ({ default: m.PortalApp })),
  { loading: ModuleSkeleton, ssr: false },
) as React.ComponentType<{ editionSlug: string; magicToken?: string }>;

// F-EXP: ?form= dış form paylaşımı
const PublicFormPage = dynamic(
  () => import("@/components/maven/public-form").then((m) => ({ default: m.PublicFormPage })),
  { loading: ModuleSkeleton, ssr: false },
) as React.ComponentType<{ idOrSlug: string; embed?: boolean }>;

export default function Home() {
  // F-EXP: ?form= parametresi Suspense sınırıyla okunur (SSR-güvenli, effect'siz)
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <HomeClient />
    </Suspense>
  );
}

function HomeClient() {
  const { module, bootstrap, currentEditionId, editions, setModule, me } = useApp();
  const searchParams = useSearchParams();
  const publicFormRef = searchParams.get("form");
  const embedMode = searchParams.get("embed") === "1";
  const portalSlug = searchParams.get("portal");
  const portalToken = searchParams.get("t") ?? undefined;

  useEffect(() => {
    bootstrap();
  }, []);

  // PWA Katılımcı Dış Portalı — yönetici Shell'i olmadan bağımsız yüzey
  if (portalSlug) {
    return <PortalAppPage editionSlug={portalSlug} magicToken={portalToken} />;
  }

  if (publicFormRef) {
    return <PublicFormPage idOrSlug={publicFormRef} embed={embedMode} />;
  }

  const mod = MODULES.find((m) => m.id === module);
  const edition = editions.find((e) => e.id === currentEditionId);

  // §48 ROL kilidi — modül oturum rolüne kapalıysa içerik yerine açıklama
  if (mod && !roleCanSee(mod, me?.role ?? null)) {
    return (
      <Shell>
        <div className="grid min-h-[50vh] place-items-center">
          <div className="max-w-md text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Lock className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{t("shell.roleLockedTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("shell.roleLockedDesc", { module: mod.label, role: me?.role ?? "" })}
            </p>
            <button
              onClick={() => setModule("dashboard")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              {t("shell.roleLockedBack")}
            </button>
            <div className="mt-3">
              <EmptyState title={t("shell.roleLockedEmpty")} desc={t("shell.roleLockedEmptyDesc")} />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // §03 YETENEK kilidi — modül yeteneği edisyonda kapalıysa içerik yerine açıklama
  if (mod?.capability && edition && !hasCapability(edition, mod.capability)) {
    return (
      <Shell>
        <div className="grid min-h-[50vh] place-items-center">
          <div className="max-w-md text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Lock className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{t("shell.capLockedTitle", { edition: edition.name })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("shell.capLockedDesc", { module: mod.label })}
            </p>
            <button
              onClick={() => setModule("settings")}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              {t("shell.capLockedManage")}
            </button>
            <div className="mt-3">
              <EmptyState title={t("shell.noAccess")} desc={t("shell.capLockedEmpty")} />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // doğrudan harita indeksi — bileşen referansı render'lar arası sabittir
  // (react-hooks/static-components: fonksiyon-çağrılı bileşen üretimi yasak)
  const ModuleView = MODULE_COMPONENTS[module] ?? MODULE_COMPONENTS.dashboard;
  return (
    <Shell>
      <ModuleView />
    </Shell>
  );
}
