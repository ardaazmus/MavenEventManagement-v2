// ─── P06.2: Kullanıcı davetleri (oluşturma + kabul) ────────────────────────────
// Ham belirteç YALNIZ oluşturma yanıtında bir kez döner; saklanan sha256 hash'tir.
// Yeniden gönderim önceki aktif daveti hükümsüz kılar. Kabul akışı herkese açıktır
// (token kapısı) ve kiracıyı davet kaydından alır — çağıran kiracı seçemez.
import crypto from "node:crypto";
import { hashPassword, passwordPolicyError } from "../auth/password.ts";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const INVITE_MAX_NAME_LENGTH = 100;

export class InviteValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "InviteValidationError";
  }
}

export type InviteErrorCode =
  | "INVALID"
  | "EXPIRED"
  | "REPLAY"
  | "REVOKED"
  | "EMAIL_TAKEN"
  | "WEAK_PASSWORD"
  | "INVALID_NAME";

export class InviteError extends Error {
  code: InviteErrorCode;
  status: number;
  constructor(code: InviteErrorCode, message: string) {
    super(message);
    this.name = "InviteError";
    this.code = code;
    this.status = code === "EMAIL_TAKEN" ? 409 : code === "INVALID" ? 404 : code === "WEAK_PASSWORD" || code === "INVALID_NAME" ? 400 : 410;
  }
}

const INVITABLE_ROLES = new Set([
  "ORG_ADMIN",
  "EVENT_MANAGER",
  "FINANCE_MANAGER",
  "REGISTRATION_MANAGER",
  "SPONSORSHIP_MANAGER",
  "SCIENTIFIC_MANAGER",
  "PROGRAM_MANAGER",
  "ONSITE_MANAGER",
  "VIEWER",
  "AUDITOR",
  "OBSERVER",
]);

export function assertInvitableRole(role: string): void {
  if (!INVITABLE_ROLES.has(role)) {
    throw new InviteValidationError(
      role === "ORG_OWNER"
        ? "ORG_OWNER rolü davetle verilemez"
        : `Davet için geçersiz rol: ${role}`,
    );
  }
}

export function normalizeInviteEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new InviteValidationError("Geçerli bir e-posta adresi gerekli");
  }
  return email;
}

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export interface InvitePrisma {
  userInvite: {
    create: (args: { data: Record<string, unknown> }) => Promise<{
      id: string;
      tenantId: string;
      email: string;
      role: string;
      expiresAt: Date;
    }>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      tenantId: string;
      email: string;
      role: string;
      expiresAt: Date;
      usedAt: Date | null;
      revokedAt: Date | null;
    } | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
  };
  user: {
    findFirst: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{ id: string } | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
}

export interface CreateInviteInput {
  tenantId: string;
  email: string;
  role: string;
  createdBy?: string | null;
}

export interface CreatedInvite {
  invite: { id: string; tenantId: string; email: string; role: string; expiresAt: Date };
  token: string;
}

export async function createInvite(
  prisma: InvitePrisma,
  input: CreateInviteInput,
  overrides?: { ttlMs?: number },
): Promise<CreatedInvite> {
  const email = normalizeInviteEmail(input.email);
  assertInvitableRole(input.role);
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + (overrides?.ttlMs ?? INVITE_TTL_MS));

  // Yeniden gönderim: aynı kiracı+e-posta için bekleyen davetleri hükümsüz kıl.
  await prisma.userInvite.updateMany({
    where: { tenantId: input.tenantId, email, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const invite = await prisma.userInvite.create({
    data: {
      tenantId: input.tenantId,
      email,
      role: input.role,
      tokenHash: hashInviteToken(token),
      expiresAt,
      createdBy: input.createdBy ?? null,
    },
  });
  return { invite, token };
}

export interface AcceptInviteInput {
  token: string;
  name: string;
  password: string;
}

export interface AcceptedInvite {
  userId: string;
  tenantId: string;
  email: string;
}

export async function acceptInvite(prisma: InvitePrisma, input: AcceptInviteInput): Promise<AcceptedInvite> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > INVITE_MAX_NAME_LENGTH) {
    throw new InviteError("INVALID_NAME", "Geçerli bir ad gerekli");
  }
  const policyError = passwordPolicyError(input.password);
  if (policyError) {
    throw new InviteError("WEAK_PASSWORD", policyError);
  }

  const record = await prisma.userInvite.findUnique({ where: { tokenHash: hashInviteToken(input.token) } });
  if (!record) throw new InviteError("INVALID", "Davet bulunamadı");
  if (record.usedAt) throw new InviteError("REPLAY", "Bu davet zaten kullanıldı");
  if (record.revokedAt) throw new InviteError("REVOKED", "Bu davet hükümsüz kılındı");
  if (record.expiresAt.getTime() <= Date.now()) throw new InviteError("EXPIRED", "Bu davetin süresi doldu");

  const existing = await prisma.user.findFirst({
    where: { tenantId: record.tenantId, email: record.email },
    select: { id: true },
  });
  if (existing) throw new InviteError("EMAIL_TAKEN", "Bu e-posta zaten kayıtlı");

  const created = await prisma.user.create({
    data: {
      tenantId: record.tenantId,
      email: record.email,
      name,
      role: record.role,
      status: "ACTIVE",
      passwordHash: await hashPassword(input.password),
    },
  });
  await prisma.userInvite.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return { userId: created.id, tenantId: record.tenantId, email: record.email };
}
