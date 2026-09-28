// Portal PWA gezinme yığını — saf, framework-bağımsız.
// "Her sayfanın bir önceki sayfaya geri dönüşü" kuralı burada kilitlenir:
// push = ileri, pop = geri (kök "home"un altına inilmez), reset = sekme değişimi,
// sync = sistem geri/ileri tuşu (popstate) ile yığın eşitleme.
export const PORTAL_NAV_ROOT = "home";

export const PORTAL_NAV_TABS = ["home", "program", "sponsors", "map", "profile"] as const;

// "form" bilinçli olarak YOK: form ekranı formRef gerektirir, hash/deep-link ile açılmaz.
export const PORTAL_NAV_SCREENS = [
  "home",
  "program",
  "speakers",
  "sponsors",
  "map",
  "qa",
  "forms",
  "b2b",
  "game",
  "profile",
] as const;

export type PortalNavScreen = (typeof PORTAL_NAV_SCREENS)[number];

// yığın şişmesine karşı tavan (aşırı ileri-geri döngülerinde bellek/URL güvenliği)
const MAX_DEPTH = 30;

export function isPortalScreen(s: string): s is PortalNavScreen {
  return (PORTAL_NAV_SCREENS as readonly string[]).includes(s);
}

/** ileri gezinme — aynı ekran üst üste push'lanmaz */
export function pushNav(stack: readonly string[], screen: string): string[] {
  const next = [...stack];
  if (next[next.length - 1] === screen) return next;
  next.push(screen);
  return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
}

/** geri gezinme — kökün altına inilmez, en az ["home"] döner */
export function popNav(stack: readonly string[]): string[] {
  if (stack.length <= 1) return [PORTAL_NAV_ROOT];
  return [...stack.slice(0, -1)];
}

/** sekme değişimi — yığın sıfırlanır (native sekme davranışı) */
export function resetNav(screen: string): string[] {
  return [screen];
}

/**
 * sistem geri/ileri (popstate) eşitlemesi:
 * hedef yığında varsa oraya kırpılır (geri), yoksa push'lanır (yabancı/derin giriş).
 */
export function syncNav(stack: readonly string[], screen: string): string[] {
  const idx = [...stack].lastIndexOf(screen);
  if (idx >= 0) return [...stack.slice(0, idx + 1)];
  return pushNav(stack, screen);
}

/** history hash aynası — sistem geri tuşunun çalışması için */
export function navHash(screen: string): string {
  return `#p=${screen}`;
}

export function parseNavHash(hash: string): PortalNavScreen | null {
  const m = /^#p=([A-Za-z]+)$/.exec(hash.trim());
  if (!m) return null;
  return isPortalScreen(m[1]) ? m[1] : null;
}
