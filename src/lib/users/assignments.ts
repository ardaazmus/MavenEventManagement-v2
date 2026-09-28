// ─── P06.3: Rol/kapsam atama (yetki yükseltme ve son-sahip korumalı) ──────────
// Politika (§10 + P06.3):
//  * Aktör, kendi etkin rütbesinden YÜKSEK rütbeli rol veremez (kendine de).
//  * ORG_OWNER atamasına yalnız rütbe-100 (owner) dokunabilir.
//  * Son sahiplik yolu kaldırılamaz: legacy `role` kolonu + TENANT ORG_OWNER
//    atamaları birlikte sayılır; sonuç sıfırsa revoke 409 LAST_OWNER alır.
//  * Kapsam "TENANT" ya da AYNI kiracının edition id'si olmalı.
export type AssignmentErrorCode =
  | "NOT_FOUND"
  | "UNKNOWN_ROLE"
  | "BAD_SCOPE"
  | "DUPLICATE"
  | "ESCALATION"
  | "LAST_OWNER";

export class AssignmentError extends Error {
  code: AssignmentErrorCode;
  status: number;
  constructor(code: AssignmentErrorCode, message: string) {
    super(message);
    this.name = "AssignmentError";
    this.code = code;
    this.status = code === "NOT_FOUND" || code === "UNKNOWN_ROLE" || code === "BAD_SCOPE" ? 404 : 409;
  }
}

const ROLE_RANKS: Record<string, number> = {
  ORG_OWNER: 100,
  ORG_ADMIN: 90,
  EVENT_MANAGER: 50,
  FINANCE_MANAGER: 50,
  REGISTRATION_MANAGER: 50,
  SPONSORSHIP_MANAGER: 50,
  SCIENTIFIC_MANAGER: 50,
  PROGRAM_MANAGER: 50,
  ONSITE_MANAGER: 50,
  VIEWER: 10,
  AUDITOR: 10,
  OBSERVER: 10,
};

const CUSTOM_ROLE_RANK = 40;

export function rankOf(roleKey: string): number {
  return ROLE_RANKS[roleKey] ?? CUSTOM_ROLE_RANK;
}

export interface AssignmentPrisma {
  user: {
    findFirst: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      role: string;
    } | null>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  roleDefinition: {
    findFirst: (args: { where: Record<string, unknown> }) => Promise<{ id: string; key: string } | null>;
  };
  userRoleAssignment: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; userId: string; roleId: string; scopeKey: string }>;
    findUnique: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<{
      id: string;
      userId: string;
      roleId: string;
      scopeKey: string;
      role?: { key: string } | null;
      user?: { tenantId: string } | null;
    } | null>;
    findMany: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<
      Array<{ role?: { key: string } | null }>
    >;
    delete: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  eventEdition: {
    findFirst: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{ id: string } | null>;
  };
}

export interface ActorRankInput {
  userId: string;
  tenantId: string;
  legacyRole: string;
  scopeKey: string;
}

export async function getActorMaxRank(prisma: AssignmentPrisma, input: ActorRankInput): Promise<number> {
  let rank = rankOf(input.legacyRole);
  const scopes = input.scopeKey === "TENANT" ? ["TENANT"] : [input.scopeKey, "TENANT"];
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId: input.userId, scopeKey: { in: scopes } },
    include: { role: { select: { key: true } } },
  });
  for (const a of assignments) {
    if (a.role) rank = Math.max(rank, rankOf(a.role.key));
  }
  return rank;
}

async function resolveRoleId(
  prisma: AssignmentPrisma,
  tenantId: string,
  roleKey: string,
): Promise<string> {
  const tenantRole = await prisma.roleDefinition.findFirst({ where: { tenantId, key: roleKey } });
  if (tenantRole) return tenantRole.id;
  const systemRole = await prisma.roleDefinition.findFirst({ where: { tenantId: null, key: roleKey } });
  if (systemRole) return systemRole.id;
  throw new AssignmentError("UNKNOWN_ROLE", `Rol bulunamadı: ${roleKey}`);
}

async function assertScopeInTenant(prisma: AssignmentPrisma, tenantId: string, scopeKey: string): Promise<void> {
  if (scopeKey === "TENANT") return;
  const edition = await prisma.eventEdition.findFirst({ where: { id: scopeKey, tenantId }, select: { id: true } });
  if (!edition) throw new AssignmentError("BAD_SCOPE", "Kapsam bu kiracıya ait bir etkinlik olmalı");
}

export interface AssignRoleInput {
  tenantId: string;
  actorUserId: string;
  actorMaxRank: number;
  targetUserId: string;
  roleKey: string;
  scopeKey: string;
}

export interface AssignedRole {
  id: string;
  userId: string;
  roleId: string;
  scopeKey: string;
}

export async function assignRole(prisma: AssignmentPrisma, input: AssignRoleInput): Promise<AssignedRole> {
  const targetRank = rankOf(input.roleKey);
  if (targetRank > input.actorMaxRank) {
    throw new AssignmentError("ESCALATION", "Kendi yetkinizden yüksek rol veremezsiniz");
  }
  if (input.roleKey === "ORG_OWNER" && input.actorMaxRank < 100) {
    throw new AssignmentError("ESCALATION", "ORG_OWNER rolü yalnız mevcut bir sahip tarafından verilebilir");
  }

  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, tenantId: input.tenantId },
    select: { id: true, role: true },
  });
  if (!target) throw new AssignmentError("NOT_FOUND", "Kullanıcı bulunamadı");
  await assertScopeInTenant(prisma, input.tenantId, input.scopeKey);
  const roleId = await resolveRoleId(prisma, input.tenantId, input.roleKey);

  try {
    return await prisma.userRoleAssignment.create({
      data: { userId: target.id, roleId, scopeKey: input.scopeKey },
    });
  } catch (e) {
    if (e instanceof Error && (e.message.includes("Unique constraint") || (e as { code?: string }).code === "P2002")) {
      throw new AssignmentError("DUPLICATE", "Bu rol/kapsam zaten atanmış");
    }
    throw e;
  }
}

export interface RevokeAssignmentInput {
  tenantId: string;
  actorUserId: string;
  actorMaxRank: number;
  assignmentId: string;
}

async function countOwnershipPaths(
  prisma: AssignmentPrisma,
  tenantId: string,
  excludeAssignmentId: string,
): Promise<number> {
  const legacyOwners = await prisma.user.count({ where: { tenantId, role: "ORG_OWNER" } });
  const dbOwners = await prisma.userRoleAssignment.count({
    where: {
      id: { not: excludeAssignmentId },
      scopeKey: "TENANT",
      role: { key: "ORG_OWNER" },
      user: { tenantId },
    },
  });
  return legacyOwners + dbOwners;
}

export async function revokeAssignment(prisma: AssignmentPrisma, input: RevokeAssignmentInput): Promise<void> {
  const assignment = await prisma.userRoleAssignment.findUnique({
    where: { id: input.assignmentId },
    include: { role: { select: { key: true } }, user: { select: { tenantId: true } } },
  });
  if (!assignment || !assignment.role || assignment.user?.tenantId !== input.tenantId) {
    throw new AssignmentError("NOT_FOUND", "Atama bulunamadı");
  }
  if (assignment.role.key === "ORG_OWNER") {
    if (input.actorMaxRank < 100) {
      throw new AssignmentError("ESCALATION", "ORG_OWNER atamasını yalnız bir sahip kaldırabilir");
    }
    const remaining = await countOwnershipPaths(prisma, input.tenantId, assignment.id);
    if (remaining < 1) {
      throw new AssignmentError("LAST_OWNER", "Son sahiplik yolu kaldırılamaz");
    }
  } else if (rankOf(assignment.role.key) > input.actorMaxRank) {
    throw new AssignmentError("ESCALATION", "Kendi yetkinizden yüksek bir atamayı kaldıramazsınız");
  }
  await prisma.userRoleAssignment.delete({ where: { id: assignment.id } });
}
