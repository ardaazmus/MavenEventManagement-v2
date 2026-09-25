// STUDIO-DND — Toplu alan sırası güncelleme (sürükle-bırak bırakma anı).
// Gövde: { formId: string, orderedIds: string[] } → tüm order değerleri TEK tx'te
// hedef sıraya yazılır (index+1). Parçalı iki-PUT güncellemesinden farklı olarak
// taşıma SONRASI tüm satırlar tutarlı; ekleme/taşıma/geri-sarma tek noktadan yapılır.
// Güvenlik: orderedIds listedeki HER alan gerçekten formId'ye ait olmalı (yabancı id → 409).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { formId?: unknown; orderedIds?: unknown };
    const formId = typeof body.formId === "string" ? body.formId : "";
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.filter((v): v is string => typeof v === "string")
      : [];
    if (!formId || orderedIds.length === 0) {
      return NextResponse.json({ error: "formId ve orderedIds zorunludur" }, { status: 400 });
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      return NextResponse.json({ error: "orderedIds yinelenen alan içeriyor" }, { status: 400 });
    }
    const form = await db.formDefinition.findUnique({ where: { id: formId }, select: { id: true } });
    if (!form) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
    // sahiplik: sıralanan alanların tamamı bu forma ait olmalı
    const owned = await db.formField.findMany({
      where: { id: { in: orderedIds }, formId },
      select: { id: true },
    });
    if (owned.length !== orderedIds.length) {
      return NextResponse.json({ error: "Sıralanan alanlardan bazıları bu forma ait değil" }, { status: 409 });
    }
    await db.$transaction(
      orderedIds.map((id, i) => db.formField.update({ where: { id }, data: { order: i + 1 } })),
    );
    const fields = await db.formField.findMany({
      where: { formId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    return NextResponse.json({ ok: true, fields });
  } catch (e) {
    console.error("POST /api/form-fields/reorder", e);
    return NextResponse.json({ error: "Sıralama güncellenemedi" }, { status: 500 });
  }
}
