import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { MODULE_IDS, ACTIONS } from "../src/lib/api/permissions.ts";

/**
 * 11 Standard System Roles with deterministic module and action permissions.
 */
export const SYSTEM_ROLE_DEFINITIONS = [
  {
    key: "ORG_OWNER",
    name: "Kurum Sahibi",
    description: "Tüm modüllerde tam yetkili kurum sahibi",
    permissions: MODULE_IDS.flatMap((module) =>
      ACTIONS.map((action) => ({
        module,
        action,
        scopeType: "GLOBAL",
      }))
    ),
  },
  {
    key: "ORG_ADMIN",
    name: "Kurum Yöneticisi",
    description: "Kurum çapında operasyonel ve idari yönetici",
    permissions: MODULE_IDS.flatMap((module) =>
      ACTIONS.map((action) => ({
        module,
        action,
        scopeType: "TENANT",
      }))
    ),
  },
  {
    key: "EVENT_MANAGER",
    name: "Etkinlik Yöneticisi",
    description: "Etkinlik ve edisyon operasyonlarının genel yöneticisi",
    permissions: [
      ...["dashboard", "operations", "editions", "archive", "portals", "people", "organizations", "communications", "registrations", "forms", "finance", "accounting", "scientific", "program", "social", "sponsorship", "b2b", "floors", "media", "accommodation", "onsite", "badges", "certificates"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "compliance", action: "VIEW", scopeType: "EDITION" },
      { module: "compliance", action: "UPDATE", scopeType: "EDITION" },
      { module: "compliance", action: "APPROVE", scopeType: "EDITION" },
      { module: "settings", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "FINANCE_MANAGER",
    name: "Finans Yöneticisi",
    description: "Bütçe, gelir-gider, faturalandırma ve finansal mutabakat yöneticisi",
    permissions: [
      ...["finance", "accounting"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "sponsorship", action: "VIEW", scopeType: "EDITION" },
      { module: "sponsorship", action: "CREATE", scopeType: "EDITION" },
      { module: "sponsorship", action: "UPDATE", scopeType: "EDITION" },
      { module: "sponsorship", action: "EXPORT", scopeType: "EDITION" },
      { module: "sponsorship", action: "APPROVE", scopeType: "EDITION" },
      { module: "registrations", action: "VIEW", scopeType: "EDITION" },
      { module: "registrations", action: "UPDATE", scopeType: "EDITION" },
      { module: "registrations", action: "EXPORT", scopeType: "EDITION" },
      { module: "organizations", action: "VIEW", scopeType: "EDITION" },
      { module: "dashboard", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "REGISTRATION_MANAGER",
    name: "Kayıt Yöneticisi",
    description: "Katılımcı kayıt, form, konaklama ve yaka kartı yöneticisi",
    permissions: [
      ...["registrations", "forms", "accommodation", "badges", "people", "organizations"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "communications", action: "VIEW", scopeType: "EDITION" },
      { module: "communications", action: "CREATE", scopeType: "EDITION" },
      { module: "communications", action: "UPDATE", scopeType: "EDITION" },
      { module: "finance", action: "VIEW", scopeType: "EDITION" },
      { module: "finance", action: "CREATE", scopeType: "EDITION" },
      { module: "dashboard", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "SPONSORSHIP_MANAGER",
    name: "Sponsorluk Yöneticisi",
    description: "Sponsorluk paketleri, anlaşmalar, stant alanları ve B2B yöneticisi",
    permissions: [
      ...["sponsorship", "b2b"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "floors", action: "VIEW", scopeType: "EDITION" },
      { module: "floors", action: "UPDATE", scopeType: "EDITION" },
      { module: "communications", action: "VIEW", scopeType: "EDITION" },
      { module: "communications", action: "CREATE", scopeType: "EDITION" },
      { module: "forms", action: "VIEW", scopeType: "EDITION" },
      { module: "forms", action: "CREATE", scopeType: "EDITION" },
      { module: "dashboard", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "SCIENTIFIC_MANAGER",
    name: "Bilimsel Program Yöneticisi",
    description: "Bildiri değerlendirme, hakemlik ve bilimsel oturum yöneticisi",
    permissions: [
      ...["scientific", "program", "certificates"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "communications", action: "VIEW", scopeType: "EDITION" },
      { module: "communications", action: "CREATE", scopeType: "EDITION" },
      { module: "forms", action: "VIEW", scopeType: "EDITION" },
      { module: "forms", action: "CREATE", scopeType: "EDITION" },
      { module: "dashboard", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "PROGRAM_MANAGER",
    name: "Program Yöneticisi",
    description: "Etkinlik akışı, salon programları ve sosyal etkinlik yöneticisi",
    permissions: [
      ...["program", "social", "floors"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "scientific", action: "VIEW", scopeType: "EDITION" },
      { module: "scientific", action: "UPDATE", scopeType: "EDITION" },
      { module: "communications", action: "VIEW", scopeType: "EDITION" },
      { module: "communications", action: "CREATE", scopeType: "EDITION" },
      { module: "dashboard", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "ONSITE_MANAGER",
    name: "Saha Operasyon Yöneticisi",
    description: "Etkinlik günü karşılama, turnike, baskı ve saha lojistiği yöneticisi",
    permissions: [
      ...["onsite", "badges", "accommodation", "certificates"].flatMap((module) =>
        ACTIONS.map((action) => ({
          module,
          action,
          scopeType: "EDITION",
        }))
      ),
      { module: "registrations", action: "VIEW", scopeType: "EDITION" },
      { module: "registrations", action: "UPDATE", scopeType: "EDITION" },
      { module: "people", action: "VIEW", scopeType: "EDITION" },
      { module: "people", action: "UPDATE", scopeType: "EDITION" },
      { module: "floors", action: "VIEW", scopeType: "EDITION" },
      { module: "floors", action: "UPDATE", scopeType: "EDITION" },
      { module: "dashboard", action: "VIEW", scopeType: "EDITION" },
    ],
  },
  {
    key: "VIEWER",
    name: "Gözlemci / İzleyici",
    description: "Yalnızca görüntüleme yetkisine sahip salt-okunur kullanıcı",
    permissions: MODULE_IDS.map((module) => ({
      module,
      action: "VIEW",
      scopeType: "EDITION",
    })),
  },
  {
    key: "AUDITOR",
    name: "Denetçi",
    description: "Raporlama ve denetim amaçlı salt-okunur ve dışa aktarım yetkisi",
    permissions: ["compliance", "finance", "accounting", "registrations", "settings", "archive"].flatMap((module) => [
      { module, action: "VIEW", scopeType: "TENANT" },
      { module, action: "EXPORT", scopeType: "TENANT" },
    ]),
  },
];

/**
 * Idempotently seed system roles and permissions into database.
 * Returns row counts and SHA256 digest of seeded state.
 */
export async function seedSystemRoles(prisma) {
  let seededRolesCount = 0;
  let seededPermissionsCount = 0;

  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    // 1. Find or create role definition
    let role = await prisma.roleDefinition.findFirst({
      where: {
        tenantId: null,
        key: def.key,
      },
    });

    if (!role) {
      role = await prisma.roleDefinition.create({
        data: {
          tenantId: null,
          key: def.key,
          name: def.name,
          description: def.description,
          isSystem: true,
        },
      });
    } else {
      role = await prisma.roleDefinition.update({
        where: { id: role.id },
        data: {
          name: def.name,
          description: def.description,
          isSystem: true,
        },
      });
    }
    seededRolesCount++;

    // 2. Upsert permissions for this role
    for (const perm of def.permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_module_action: {
            roleId: role.id,
            module: perm.module,
            action: perm.action,
          },
        },
        update: {
          scopeType: perm.scopeType,
        },
        create: {
          roleId: role.id,
          module: perm.module,
          action: perm.action,
          scopeType: perm.scopeType,
        },
      });
      seededPermissionsCount++;
    }
  }

  // 3. Compute deterministic digest of all system roles and permissions in DB
  const allRoles = await prisma.roleDefinition.findMany({
    where: { tenantId: null, isSystem: true },
    orderBy: { key: "asc" },
    include: {
      permissions: {
        orderBy: [{ module: "asc" }, { action: "asc" }],
      },
    },
  });

  const normalized = allRoles.map((r) => ({
    key: r.key,
    name: r.name,
    isSystem: r.isSystem,
    permissions: r.permissions.map((p) => ({
      module: p.module,
      action: p.action,
      scopeType: p.scopeType,
    })),
  }));

  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  const totalRoles = await prisma.roleDefinition.count({
    where: { tenantId: null, isSystem: true },
  });
  const totalPermissions = await prisma.rolePermission.count({
    where: { role: { tenantId: null, isSystem: true } },
  });

  return {
    seededRolesCount,
    totalRolesInDb: totalRoles,
    totalPermissionsInDb: totalPermissions,
    digest,
  };
}

// Direct CLI execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const prisma = new PrismaClient();
  try {
    console.log("Seeding system roles...");
    const result = await seedSystemRoles(prisma);
    console.log("Seeding complete:");
    console.log(`- System Roles: ${result.totalRolesInDb}`);
    console.log(`- System Role Permissions: ${result.totalPermissionsInDb}`);
    console.log(`- Deterministic Digest: ${result.digest}`);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
