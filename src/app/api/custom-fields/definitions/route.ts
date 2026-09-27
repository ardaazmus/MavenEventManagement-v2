import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/custom-fields/definitions?entityType=PERSON&editionId=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType");
    const editionId = searchParams.get("editionId") || undefined;

    if (!entityType) {
      return NextResponse.json({ error: "entityType parametresi gereklidir" }, { status: 400 });
    }

    const definitions = await db.customFieldDefinition.findMany({
      where: {
        entityType,
        ...(editionId ? { editionId } : {}),
      },
      orderBy: { displayOrder: "asc" },
    });

    return NextResponse.json({ definitions });
  } catch (err: any) {
    console.error("GET /api/custom-fields/definitions error:", err);
    return NextResponse.json({ error: err.message || "Alan tanımları alınamadı" }, { status: 500 });
  }
}

// POST /api/custom-fields/definitions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      entityType,
      key,
      label,
      fieldType = "TEXT",
      optionsJson,
      defaultValue,
      isRequired = false,
      isPublic = false,
      displayOrder = 0,
      groupName,
      visibilityRulesJson,
      editionId,
      tenantId,
    } = body;

    if (!entityType || !key || !label) {
      return NextResponse.json({ error: "entityType, key ve label alanları zorunludur" }, { status: 400 });
    }

    const definition = await db.customFieldDefinition.upsert({
      where: {
        entityType_key_editionId: {
          entityType,
          key,
          editionId: editionId || "",
        },
      },
      update: {
        label,
        fieldType,
        optionsJson: typeof optionsJson === "object" ? JSON.stringify(optionsJson) : optionsJson,
        defaultValue,
        isRequired,
        isPublic,
        displayOrder,
        groupName,
        visibilityRulesJson: typeof visibilityRulesJson === "object" ? JSON.stringify(visibilityRulesJson) : visibilityRulesJson,
      },
      create: {
        entityType,
        key,
        label,
        fieldType,
        optionsJson: typeof optionsJson === "object" ? JSON.stringify(optionsJson) : optionsJson,
        defaultValue,
        isRequired,
        isPublic,
        displayOrder,
        groupName,
        visibilityRulesJson: typeof visibilityRulesJson === "object" ? JSON.stringify(visibilityRulesJson) : visibilityRulesJson,
        editionId: editionId || null,
        tenantId: tenantId || null,
      },
    });

    return NextResponse.json({ definition });
  } catch (err: any) {
    console.error("POST /api/custom-fields/definitions error:", err);
    return NextResponse.json({ error: err.message || "Alan tanımı kaydedilemedi" }, { status: 500 });
  }
}
