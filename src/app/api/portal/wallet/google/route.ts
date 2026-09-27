import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const registrationId = searchParams.get("registrationId") ?? "DEMO-REG-01";
  const name = searchParams.get("name") ?? "Katılımcı";
  const eventName = searchParams.get("event") ?? "Maven Kongre 2026";

  // Google Wallet EventTicketObject schema
  const googleWalletObject = {
    id: `3388000000022${registrationId}`,
    classId: `3388000000022.maven_event_ticket_class`,
    state: "ACTIVE",
    barcode: {
      type: "QR_CODE",
      value: registrationId,
    },
    ticketHolderName: name,
    eventName: {
      defaultValue: {
        language: "tr",
        value: eventName,
      },
    },
  };

  const saveUrl = `https://pay.google.com/gp/v/save/${registrationId}`;

  return NextResponse.json({
    ok: true,
    type: "google_wallet_pass",
    saveUrl,
    passObject: googleWalletObject,
  });
}
