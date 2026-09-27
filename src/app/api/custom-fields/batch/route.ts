import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/custom-fields/batch?entityType=PERSON&entityId=per_123
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const entityIds = searchParams.get("entityIds"); // Virgülle ayrılmış çoklu entity sorgusu

    if (!entityType) {
      return NextResponse.json({ error: "entityType parametresi zorunludur" }, { status: 400 });
    }

    const ids = entityIds ? entityIds.split(",") : entityId ? [entityId] : [];
    if (ids.length === 0) {
      return NextResponse.json({ values: {} });
    }

    const records = await db.customFieldValue.findMany({
      where: {
        entityId: { in: ids },
        definition: { entityType },
      },
      include: {
        definition: true,
      },
    });

    // entityId -> { [key]: value } formatında haritala
    const mapped: Record<string, Record<string, any>> = {};
    for (const id of ids) {
      mapped[id] = {};
    }

    for (const rec of records) {
      if (!mapped[rec.entityId]) mapped[rec.entityId] = {};
      const key = rec.definition.key;
      let val: any = rec.textValue;
      if (rec.numValue !== null && rec.numValue !== undefined) val = rec.numValue;
      else if (rec.boolValue !== null && rec.boolValue !== undefined) val = rec.boolValue;
      mapped[rec.entityId][key] = val;
    }

    return NextResponse.json({
      values: entityId && !entityIds ? mapped[entityId] || {} : mapped,
    });
  } catch (err: any) {
    console.error("GET /api/custom-fields/batch error:", err);
    return NextResponse.json({ error: err.message || "Değerler alınamadı" }, { status: 500 });
  }
}

// POST /api/custom-fields/batch
// Body: { entityType: "PERSON", entityId: "per_123", values: { "tc_kimlik_no": "12345", "dietary": "Vejetaryen" } }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entityType, entityId, values } = body;

    if (!entityType || !entityId || !values || typeof values !== "object") {
      return NextResponse.json(
        { error: "entityType, entityId ve values nesnesi zorunludur" },
        { status: 400 }
      );
    }

    // 1. İlgili entityType için tanımları getir
    const definitions = await db.customFieldDefinition.findMany({
      where: { entityType },
    });

    const defMap = new Map(definitions.map((d) => [d.key, d]));
    const entries = Object.entries(values);
    let updatedCount = 0;

    await db.$transaction(async (tx) => {
      for (const [key, val] of entries) {
        let def = defMap.get(key);

        // Tanım yoksa otomatik text alanı olarak oluştur
        if (!def) {
          def = await tx.customFieldDefinition.create({
            data: {
              entityType,
              key,
              label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              fieldType: typeof val === "number" ? "NUMBER" : typeof val === "boolean" ? "BOOLEAN" : "TEXT",
            },
          });
          defMap.set(key, def);
        }

        const textValue = typeof val === "string" ? val : val !== null && val !== undefined ? String(val) : null;
        const numValue = typeof val === "number" ? val : !isNaN(Number(val)) && val !== "" && val !== null ? Number(val) : null;
        const boolValue = typeof val === "boolean" ? val : val === "true" ? true : val === "false" ? false : null;

        await tx.customFieldValue.upsert({
          where: {
            definitionId_entityId: {
              definitionId: def.id,
              entityId,
            },
          },
          update: {
            textValue,
            numValue,
            boolValue,
          },
          create: {
            definitionId: def.id,
            entityId,
            textValue,
            numValue,
            boolValue,
          },
        });
        updatedCount++;
      }
    });

    return NextResponse.json({ success: true, updatedCount });
  } catch (err: any) {
    console.error("POST /api/custom-fields/batch error:", err);
    return NextResponse.json({ error: err.message || "Değerler kaydedilemedi" }, { status: 500 });
  }
}
