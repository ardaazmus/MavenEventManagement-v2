// /api/auth/passkeys/options — WebAuthn kayıt seçenekleri (oturum gerekli)
// userID: opaque user.id (PII yok); excludeCredentials: mevcut passkeyler
import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireAuthEnabled, storeChallenge } from "@/lib/auth/gate";
import { sessionFromRequest, rpId } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const existing = await db.passkey.findMany({ where: { userId: session.uid }, select: { credentialId: true } });
  const options = await generateRegistrationOptions({
    rpName: "Maven Event Management",
    rpID: rpId(),
    userID: Buffer.from(session.uid, "utf8"), // opaque handle — e-posta/PII değil
    userName: `uid:${session.uid.slice(-8)}`,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  storeChallenge(`reg:${session.uid}`, options.challenge);
  return NextResponse.json(options);
}
