// P06.3: Rol/kapsam atama (POST) ve geri alma (DELETE) — admin.
// Aktör etkin rütbesi legacy rol + DB atamalarından hesaplanır; yükseltme ve
// son-sahip kuralları lib katmanında zorlanır. Kiracı sunucu bağlamından gelir.
import { NextRequest, NextResponse } from "next/server";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireAdmin } from "@/lib/auth/request-context";
import { db } from "@/lib/db";
import {
  assignRole,
  AssignmentError,
  type AssignmentPrisma,
  getActorMaxRank,
  revokeAssignment,
} from "@/lib/users/assignments";

type Ctx = { params: Promise<{ id: string }> };

async function adminContext(): Promise<
  | { ok: true; tenantId: string; actorUserId: string; actorMaxRank: number }
  | { ok: false; response: NextResponse }
> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, response: denied as NextResponse };
  const actor = await requestActor();
  let tenantId: string;
  try {
    tenantId = await resolveContext(null);
  } catch (e) {
    if (e instanceof GuardError) {
      return { ok: false, response: NextResponse.json({ error: e.message }, { status: e.status }) };
    }
    throw e;
  }
  // Auth-off demo: aktör yok — kısıtsız demo geçişi (rütbe 100, denetim dışı).
  if (!actor) {
    return { ok: true, tenantId, actorUserId: "demo-admin", actorMaxRank: 100 };
  }
  const actorMaxRank = await getActorMaxRank(db as unknown as AssignmentPrisma, {
    userId: actor.uid,
    tenantId,
    legacyRole: actor.role,
    scopeKey: "TENANT",
  });
  return { ok: true, tenantId, actorUserId: actor.uid, actorMaxRank };
}

function assignmentError(e: unknown): NextResponse | null {
  if (e instanceof AssignmentError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: targetUserId } = await ctx.params;
  const admin = await adminContext();
  if (!admin.ok) return admin.response;

  let body: { roleKey?: unknown; scopeKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.roleKey !== "string" || typeof body.scopeKey !== "string") {
    return NextResponse.json({ error: "roleKey ve scopeKey alanları gerekli" }, { status: 400 });
  }

  try {
    const assigned = await assignRole(db as unknown as AssignmentPrisma, {
      tenantId: admin.tenantId,
      actorUserId: admin.actorUserId,
      actorMaxRank: admin.actorMaxRank,
      targetUserId,
      roleKey: body.roleKey,
      scopeKey: body.scopeKey,
    });
    return NextResponse.json(assigned, { status: 201 });
  } catch (e) {
    return assignmentError(e) ?? NextResponse.json({ error: "Rol atanamadı" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  await ctx.params;
  const admin = await adminContext();
  if (!admin.ok) return admin.response;

  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId sorgu parametresi gerekli" }, { status: 400 });
  }

  try {
    await revokeAssignment(db as unknown as AssignmentPrisma, {
      tenantId: admin.tenantId,
      actorUserId: admin.actorUserId,
      actorMaxRank: admin.actorMaxRank,
      assignmentId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return assignmentError(e) ?? NextResponse.json({ error: "Atama kaldırılamadı" }, { status: 500 });
  }
}
