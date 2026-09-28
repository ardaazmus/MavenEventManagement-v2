// ─── H-05: Atanabilir/davet edilebilir rol listeleri (kullanıcı yönetimi UI) ───
// Davet rolleri INVITABLE_ROLES sabitinden (tek kaynak); atama rolleri DB'den
// (sistem şablonları + kiracı özel rolleri). Yalnız admin uçları kullanır.
import { INVITABLE_ROLES } from "./invites.ts";

export interface AssignableRole {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface RolesPrisma {
  roleDefinition: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
      orderBy: Record<string, string>;
    }): Promise<AssignableRole[]>;
  };
}

export function listInvitableRoles(): string[] {
  return [...INVITABLE_ROLES];
}

export async function getAssignableRoles(prisma: RolesPrisma, tenantId: string): Promise<AssignableRole[]> {
  return prisma.roleDefinition.findMany({
    where: { OR: [{ tenantId: null }, { tenantId }] },
    select: { key: true, name: true, description: true, isSystem: true },
    orderBy: { key: "asc" },
  });
}
