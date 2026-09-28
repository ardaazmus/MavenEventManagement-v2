// P15.2: GET/PATCH /api/account/theme — oturum sahibinin tema tercihi (çerez).
// Çerez istemcide okunur (next-themes ile eşitlenir); httpOnly DEĞİL, Lax.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { hasSession, AUTH_ENABLED } from "@/lib/auth-flag";
import { THEME_COOKIE, sanitizeThemeChoice } from "@/lib/theme/preferences";

const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  if (AUTH_ENABLED && !(await hasSession(req))) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }
  try {
    const tenantId = await resolveContext(null);
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { themeDefault: true, brandPrimary: true } });
    return NextResponse.json({
      user: sanitizeThemeChoice(req.cookies.get(THEME_COOKIE)?.value) ?? null,
      tenantDefault: sanitizeThemeChoice(tenant?.themeDefault) ?? "system",
      brandPrimary: tenant?.brandPrimary ?? null,
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/account/theme", e);
    return NextResponse.json({ error: "Tema okunamadı" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (AUTH_ENABLED && !(await hasSession(req))) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }
  let body: { theme?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const theme = sanitizeThemeChoice(body.theme);
  if (!theme) {
    return NextResponse.json({ error: "theme system|light|dark olmalı" }, { status: 422 });
  }
  const res = NextResponse.json({ user: theme });
  res.cookies.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
