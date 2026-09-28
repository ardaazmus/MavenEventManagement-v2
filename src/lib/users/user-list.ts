// ─── P06.1: Salt-okunur kiracı kullanıcı listesi ──────────────────────────────
// Admin özeti: durum, MFA, son giriş, rol/kapsam özetleri.
// Gizli alanlar (passwordHash, mfaSecretCipher, recoveryCodes) bu modülden ASLA geçmez:
// Prisma select projeksiyonu + toUserSummary beyaz-listesi çift katman uygular.
// Kiracı kimliği HER ZAMAN sunucu bağlamından gelir; sorgu parametresinden tenant alınmaz.
import type { Prisma } from "@prisma/client";

// Uygulamanın paylaşımlı istemcisi $extends ile genişletilmiştir (bkz. src/lib/db.ts);
// üretilmiş delege tipleriyle doğrudan eşleşmez. Dar yapısal arayüz + çağrı yerinde
// cast kullanılır; çalışma-anı davranışı testlerle kilitlidir.
export interface UserListPrisma {
  user: {
    findMany: (args: {
      where?: unknown;
      select?: unknown;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    }) => Promise<unknown[]>;
    count: (args: { where?: unknown }) => Promise<number>;
  };
}

export class UserListValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "UserListValidationError";
  }
}

export interface UserListParams {
  page: number;
  limit: number;
  q: string | null;
  status: string | null;
  role: string | null;
}

export const USER_LIST_DEFAULT_LIMIT = 50;
export const USER_LIST_MAX_LIMIT = 100;

function parsePositiveInt(raw: string | null, field: string, fallback: number): number {
  if (raw === null || raw === "") {
    if (field === "page" && raw === "") {
      throw new UserListValidationError("page 1 ve üzeri tam sayı olmalı");
    }
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new UserListValidationError(`${field} 1 ve üzeri tam sayı olmalı`);
  }
  const value = parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new UserListValidationError(`${field} 1 ve üzeri tam sayı olmalı`);
  }
  return value;
}

function parseOptionalText(raw: string | null, field: string, maxLength: number): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) {
    throw new UserListValidationError(`${field} en fazla ${maxLength} karakter olmalı`);
  }
  return trimmed;
}

export function parseUserListParams(sp: URLSearchParams): UserListParams {
  const page = parsePositiveInt(sp.get("page"), "page", 1);
  const limit = parsePositiveInt(sp.get("limit"), "limit", USER_LIST_DEFAULT_LIMIT);
  if (limit > USER_LIST_MAX_LIMIT) {
    throw new UserListValidationError(`limit 1-${USER_LIST_MAX_LIMIT} arası tam sayı olmalı`);
  }
  return {
    page,
    limit,
    q: parseOptionalText(sp.get("q"), "q", 100),
    status: parseOptionalText(sp.get("status"), "status", 64),
    role: parseOptionalText(sp.get("role"), "role", 64),
  };
}

export interface UserListWhereInput extends UserListParams {
  tenantId: string;
}

export function buildUserListWhere(input: UserListWhereInput): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { tenantId: input.tenantId };
  if (input.status) where.status = input.status;
  if (input.role) where.role = input.role;
  if (input.q) {
    where.OR = [{ name: { contains: input.q } }, { email: { contains: input.q } }];
  }
  return where;
}

// Beyaz-liste projeksiyon: gizli alanlar select'e hiç girmez.
export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  mfaEnabled: true,
  failedLoginCount: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  roleAssignments: {
    select: {
      id: true,
      scopeKey: true,
      role: { select: { key: true, name: true } },
    },
  },
} as const;

export interface UserRoleSummary {
  id: string;
  roleKey: string;
  roleName: string;
  scopeKey: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  roleAssignments: UserRoleSummary[];
}

type UserListRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  roleAssignments: Array<{
    id: string;
    scopeKey: string;
    role?: { key: string; name: string } | null;
  }>;
};

export function toUserSummary(row: UserListRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    roleAssignments: row.roleAssignments.map((a) => ({
      id: a.id,
      roleKey: a.role?.key ?? "UNKNOWN",
      roleName: a.role?.name ?? "Bilinmeyen rol",
      scopeKey: a.scopeKey,
    })),
  };
}

export interface ListUsersInput extends UserListParams {
  tenantId: string;
}

export interface UserListResult {
  items: UserSummary[];
  total: number;
  page: number;
  limit: number;
}

export async function listUsers(prisma: UserListPrisma, input: ListUsersInput): Promise<UserListResult> {
  const where = buildUserListWhere(input);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SAFE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items: (rows as unknown as UserListRow[]).map(toUserSummary),
    total,
    page: input.page,
    limit: input.limit,
  };
}
