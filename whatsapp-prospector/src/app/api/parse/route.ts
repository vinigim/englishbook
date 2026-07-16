import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/spreadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado no campo 'file'." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máx. 10 MB)." },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const result = parseSpreadsheet(buffer);

    if (result.totalRows === 0) {
      return NextResponse.json(
        { error: "A planilha está vazia ou não pôde ser lida." },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Falha ao processar a planilha. Verifique o formato (.csv, .xlsx, .xls). " +
          (err instanceof Error ? err.message : ""),
      },
      { status: 500 },
    );
  }
}
