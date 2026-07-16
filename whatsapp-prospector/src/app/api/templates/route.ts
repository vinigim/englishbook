import { NextResponse } from "next/server";
import { getConfig, isConfigured, listTemplates } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista os templates aprovados na conta, para o usuário escolher. */
export async function GET() {
  const cfg = getConfig();

  if (!isConfigured(cfg)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Credenciais da Cloud API não configuradas (.env). Defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.",
      },
      { status: 200 },
    );
  }

  const result = await listTemplates(cfg);
  return NextResponse.json(result, { status: 200 });
}
