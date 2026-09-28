// P06.4a: Kullanıcı durum değişimi (PATCH {status: DISABLED|ACTIVE}) — admin.
// disable tüm oturumları öldürür (sessionVersion++); enable eski çerezleri
// diriltmez. Kiracı sunucu bağlamından gelir.
import { NextRequest, NextResponse } from "next/server";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireAdmin } from "@/lib/auth/request-context";
import { db } from "@/lib/db";
import { getActorMaxRank, type AssignmentPrisma } from "@/lib/users/assignments";
import { disableUser, enableUser, LifecycleError, type LifecyclePrisma } from "@/lib/users/lifecycle";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: targetUserId } = await ctx.params;
  const denied = await requireAdmin();
  if (denied) return denied;
  const actor = await requestActor();

  let tenantId: string;
  try {
    tenantId = await resolveContext(null);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (body.status !== "DISABLED" && body.status !== "ACTIVE") {
    return NextResponse.json({ error: "status DISABLED ya da ACTIVE olmalı" }, { status: 400 });
  }

  // Auth-off demo: aktör yok — kısıtsız demo geçişi.
  const actorUserId = actor?.uid ?? "demo-admin";
  const actorMaxRank = actor
    ? await getActorMaxRank(db as unknown as AssignmentPrisma, {
        userId: actor.uid,
        tenantId,
        legacyRole: actor.role,
        scopeKey: "TENANT",
      })
    : 100;

  try {
    const result =
      body.status === "DISABLED"
        ? await disableUser(db as unknown as LifecyclePrisma, { tenantId, actorUserId, actorMaxRank, targetUserId })
        : await enableUser(db as unknown as LifecyclePrisma, { tenantId, actorUserId, actorMaxRank, targetUserId });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LifecycleError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/users/[id]/status", e);
    return NextResponse.json({ error: "Durum değiştirilemedi" }, { status: 500 });
  }
}
