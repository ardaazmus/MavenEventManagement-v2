// P06.2: Davet oluşturma / yeniden gönderme (admin). Ham belirteç yanıtta BİR KEZ
// döner (tek görünlük); yeniden gönderim önceki aktif daveti hükümsüz kılar.
import { NextRequest, NextResponse } from "next/server";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";
import { db } from "@/lib/db";
import { enforceRateLimitById } from "@/lib/rate-limit";
import {
  createInvite,
  type InvitePrisma,
  InviteValidationError,
} from "@/lib/users/invites";

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let tenantId: string;
  try {
    tenantId = await resolveContext(null);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const limited = enforceRateLimitById(req, {
    key: "users:invites:create",
    limit: 30,
    windowMs: 60 * 60 * 1000,
    scopeId: tenantId,
  });
  if (limited) return limited;

  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.email !== "string" || typeof body.role !== "string") {
    return NextResponse.json({ error: "email ve role alanları gerekli" }, { status: 400 });
  }

  try {
    const actor = req.headers.get("x-maven-session-uid");
    const { invite, token } = await createInvite(db as unknown as InvitePrisma, {
      tenantId,
      email: body.email,
      role: body.role,
      createdBy: actor,
    });
    return NextResponse.json(
      {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        token,
        tokenNote: "Ham belirteç bir kez gösterilir; güvenli kanalla iletin",
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof InviteValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/users/invites", e);
    return NextResponse.json({ error: "Davet oluşturulamadı" }, { status: 500 });
  }
}
