// ─── P06.4a: Kullanıcı yaşam döngüsü (devre dışı bırakma / yeniden etkinleştirme)
// disable: status=DISABLED + sessionVersion++ (tüm çerezler anında ölür).
// enable: status=ACTIVE, sürüm DEĞİŞMEZ (disable-öncesi çerezler dirilmez).
// Son-sahiplik: AKTİF sahiplik yolları (legacy ORG_OWNER + TENANT ORG_OWNER
// ataması) sayılır; hedef son yolsa 409 LAST_OWNER. Self-disable, başka sahip
// varsa serbesttir (kilitlenmeyi önlemek için başka admin gerekir — bilinçli).
export type LifecycleErrorCode = "NOT_FOUND" | "ESCALATION" | "LAST_OWNER";

export class LifecycleError extends Error {
  code: LifecycleErrorCode;
  status: number;
  constructor(code: LifecycleErrorCode, message: string) {
    super(message);
    this.name = "LifecycleError";
    this.code = code;
    this.status = code === "NOT_FOUND" ? 404 : 409;
  }
}

export interface LifecyclePrisma {
  user: {
    findFirst: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      role: string;
      status: string;
      sessionVersion: number;
    } | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{
      id: string;
      status: string;
      sessionVersion: number;
    }>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  userRoleAssignment: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
}

export interface LifecycleInput {
  tenantId: string;
  actorUserId: string;
  actorMaxRank: number;
  targetUserId: string;
}

export interface LifecycleResult {
  id: string;
  status: string;
  sessionVersion: number;
}

async function loadTarget(prisma: LifecyclePrisma, input: LifecycleInput) {
  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, tenantId: input.tenantId },
    select: { id: true, role: true, status: true, sessionVersion: true },
  });
  if (!target) throw new LifecycleError("NOT_FOUND", "Kullanıcı bulunamadı");
  return target;
}

function isOwnershipPath(role: string): boolean {
  return role === "ORG_OWNER";
}

async function countActiveOwnershipPaths(prisma: LifecyclePrisma, tenantId: string, excludeUserId: string): Promise<number> {
  const legacyOwners = await prisma.user.count({
    where: { tenantId, role: "ORG_OWNER", status: "ACTIVE", id: { not: excludeUserId } },
  });
  const dbOwners = await prisma.userRoleAssignment.count({
    where: {
      scopeKey: "TENANT",
      role: { key: "ORG_OWNER" },
      user: { tenantId, status: "ACTIVE", id: { not: excludeUserId } },
    },
  });
  return legacyOwners + dbOwners;
}

async function targetHasDbOwnership(prisma: LifecyclePrisma, userId: string): Promise<boolean> {
  const n = await prisma.userRoleAssignment.count({
    where: { userId, scopeKey: "TENANT", role: { key: "ORG_OWNER" } },
  });
  return n > 0;
}

export async function disableUser(prisma: LifecyclePrisma, input: LifecycleInput): Promise<LifecycleResult> {
  const target = await loadTarget(prisma, input);
  if (target.status === "DISABLED") {
    return { id: target.id, status: target.status, sessionVersion: target.sessionVersion };
  }
  const targetIsOwnerPath = isOwnershipPath(target.role) || (await targetHasDbOwnership(prisma, target.id));
  if (targetIsOwnerPath) {
    if (input.actorMaxRank < 100) {
      throw new LifecycleError("ESCALATION", "Sahip hesabını yalnız bir sahip devre dışı bırakabilir");
    }
    const remaining = await countActiveOwnershipPaths(prisma, input.tenantId, target.id);
    if (remaining < 1) {
      throw new LifecycleError("LAST_OWNER", "Son sahiplik yolu devre dışı bırakılamaz");
    }
  }
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { status: "DISABLED", sessionVersion: target.sessionVersion + 1 },
  });
  return { id: updated.id, status: updated.status, sessionVersion: updated.sessionVersion };
}

export async function enableUser(prisma: LifecyclePrisma, input: LifecycleInput): Promise<LifecycleResult> {
  const target = await loadTarget(prisma, input);
  if (target.status === "ACTIVE") {
    return { id: target.id, status: target.status, sessionVersion: target.sessionVersion };
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
  return { id: updated.id, status: updated.status, sessionVersion: updated.sessionVersion };
}
