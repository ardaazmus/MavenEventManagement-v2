// F1-b: Yetki izi (P05.3) — aktörün karar KAYNAĞINI raporlar; karar VERMEZ.
// Kaynaklar: db_rbac (kalıcı atama var) · legacy_fallback (atama yok, taban rol)
// · demo_bypass (auth-off / oturum yok). Sözleşme: `source` alanı ZORUNLU.
// Not: `role` oturum rolüdür (sessionVersion yalnız disable/enable'da bump edilir) — rol
// değişikliği yeniden girişte izde görünür; `assignments` her istekte DB'den tazedir.
export type AuthoritySource = "db_rbac" | "legacy_fallback" | "demo_bypass";

export interface TraceAssignment {
  roleKey: string;
  scopeKey: string;
}

export interface PermissionTrace {
  authenticated: boolean;
  role: string | null;
  source: AuthoritySource;
  assignments: TraceAssignment[];
}

export interface TracePrisma {
  userRoleAssignment: {
    findMany: (args: {
      where: { userId: string };
      include: { role: { select: { key: true } } };
    }) => Promise<{ scopeKey: string; role: { key: string } | null }[]>;
  };
}

export async function buildPermissionTrace(
  prisma: TracePrisma,
  actor: { uid: string; role: string } | null,
): Promise<PermissionTrace> {
  if (!actor || !actor.role) {
    return { authenticated: false, role: null, source: "demo_bypass", assignments: [] };
  }
  const rows = await prisma.userRoleAssignment.findMany({
    where: { userId: actor.uid },
    include: { role: { select: { key: true } } },
  });
  const assignments: TraceAssignment[] = [];
  for (const r of rows) {
    if (r.role) assignments.push({ roleKey: r.role.key, scopeKey: r.scopeKey });
  }
  return {
    authenticated: true,
    role: actor.role,
    source: assignments.length > 0 ? "db_rbac" : "legacy_fallback",
    assignments,
  };
}
