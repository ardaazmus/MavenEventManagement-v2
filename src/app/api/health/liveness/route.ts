// ─── P03.2: Liveness Probe ────────────────────────────────────────────────────
// Yalnız sürecin hayatta olup olmadığını kontrol eder.
// Veritabanına veya harici servislere ASLA istek atmaz (DB geçici kesintisinde container restart loop önlenir).
// SIFIR sır / SIFIR PII sızıntısı.
import { NextResponse } from "next/server.js";

const STARTED_AT = Date.now();

export function evaluateLiveness() {
  return {
    alive: true,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    version: "task-b",
    timestamp: new Date().toISOString(),
  };
}

export async function GET() {
  const data = evaluateLiveness();
  return NextResponse.json(data, { status: 200 });
}
