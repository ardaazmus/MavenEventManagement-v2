// F2-d: Person ↔ ekip (User) e-posta çakışma tespiti — FK YOK, yalnız BİLGİ etiketi.
// İki dünya ayrı kalır: kayıt (Person) ile giriş hesabı (User) EŞLEŞTİRİLMEZ; arayüzde
// yalnızca "aynı e-posta bir ekip üyesinde" uyarısı gösterilir. Karar/bağlantı üretmez.
export interface OverlapPrisma {
  user: {
    findFirst: (args: {
      where: { tenantId: string; email: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
}

export async function detectStaffEmailMatch(
  prisma: OverlapPrisma,
  tenantId: string,
  email: string | null | undefined,
): Promise<boolean> {
  const normalized = (email ?? "").trim();
  if (!normalized) return false;
  const hit = await prisma.user.findFirst({
    where: { tenantId, email: normalized },
    select: { id: true },
  });
  return hit !== null;
}
