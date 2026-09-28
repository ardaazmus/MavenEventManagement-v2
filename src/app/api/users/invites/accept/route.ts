// P06.2: Davet kabulü — herkese açık token akışı (oturum gerekmez).
// Kiracı davet kaydından gelir; çağıran kiracı/e-posta/rol seçemez.
// Kaba-kuvvet koruması: paylaşılan kayan-pencere limiter (IP bilinçli, 429).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { acceptInvite, InviteError, type InvitePrisma } from "@/lib/users/invites";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "users:invites:accept",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  let body: { token?: unknown; name?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.token !== "string" || typeof body.name !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "token, name ve password alanları gerekli" }, { status: 400 });
  }

  try {
    const accepted = await acceptInvite(db as unknown as InvitePrisma, {
      token: body.token,
      name: body.name,
      password: body.password,
    });
    return NextResponse.json({ userId: accepted.userId, email: accepted.email }, { status: 201 });
  } catch (e) {
    if (e instanceof InviteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/users/invites/accept", e);
    return NextResponse.json({ error: "Davet kabul edilemedi" }, { status: 500 });
  }
}
