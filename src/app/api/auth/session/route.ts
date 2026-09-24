// /api/auth/session — A4: mevcut oturum bilgisi (opaque uid; e-posta/PII dönmez)
import { NextRequest, NextResponse } from "next/server";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { sessionFromRequest } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 200 });
  return NextResponse.json({ authenticated: true, uid: session.uid, role: session.role, tenantId: session.tenantId, exp: session.exp });
}
