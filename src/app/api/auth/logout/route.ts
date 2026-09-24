// /api/auth/logout — A4: çerezi temizler (flag-off → 404)
import { NextResponse } from "next/server";
import { requireAuthEnabled } from "@/lib/auth/gate";
import { clearCookieHeader } from "@/lib/auth/session";

export async function POST() {
  const gate = requireAuthEnabled();
  if (gate) return gate;
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Set-Cookie": clearCookieHeader(), "Content-Type": "application/json" },
  });
}
