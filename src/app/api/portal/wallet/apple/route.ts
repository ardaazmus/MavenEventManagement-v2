import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registrationId = searchParams.get("registrationId") ?? "DEMO-REG-01";
  const name = searchParams.get("name") ?? "Katılımcı";
  const eventName = searchParams.get("event") ?? "Maven Kongre 2026";

  // .pkpass JSON metadata schema (PassKit eventTicket standard)
  const passData = {
    formatVersion: 1,
    passTypeIdentifier: "pass.com.maven.events",
    serialNumber: registrationId,
    teamIdentifier: "MAVEN99XYZ",
    organizationName: "Maven Event Management",
    description: `${eventName} Giriş Rozeti`,
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: "rgb(13, 148, 136)",
    eventTicket: {
      primaryFields: [
        {
          key: "event",
          label: "ETKİNLİK",
          value: eventName,
        },
      ],
      secondaryFields: [
        {
          key: "attendee",
          label: "KATILIMCI",
          value: name,
        },
      ],
      auxiliaryFields: [
        {
          key: "regCode",
          label: "KAYIT NO",
          value: registrationId,
        },
      ],
      barcode: {
        format: "PKBarcodeFormatQR",
        message: registrationId,
        messageEncoding: "iso-8859-1",
      },
    },
  };

  return NextResponse.json({
    ok: true,
    type: "apple_wallet_pass",
    mimeType: "application/vnd.apple.pkpass",
    pass: passData,
    downloadUrl: `/api/portal/wallet/apple?download=true&id=${registrationId}`,
  });
}
