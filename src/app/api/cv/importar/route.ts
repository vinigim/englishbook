import { NextResponse } from "next/server";
import { ErroIA } from "@/lib/ai/cliente";
import { importarCv } from "@/lib/ai/importar-cv";
import { usuarioAtual } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_PDF = 8 * 1024 * 1024;

// Recebe um PDF ou texto colado e devolve o CV estruturado (sem salvar:
// a tela mostra o resultado no editor e o usuário confere antes de gravar).
export async function POST(request: Request) {
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const arquivo = form.get("arquivo");
  const texto = String(form.get("texto") ?? "").trim();

  let entrada: { pdfBase64: string } | { texto: string };
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > MAX_PDF) return NextResponse.json({ error: "arquivo_grande" }, { status: 413 });
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ error: "nao_e_pdf" }, { status: 415 });
    }
    entrada = { pdfBase64: bytes.toString("base64") };
  } else if (texto.length >= 100) {
    entrada = { texto };
  } else {
    return NextResponse.json({ error: "entrada_vazia" }, { status: 400 });
  }

  try {
    return NextResponse.json({ cv: await importarCv(supabase, user.id, entrada) });
  } catch (e) {
    console.error("[cv-importar]", e);
    if (e instanceof ErroIA) return NextResponse.json({ error: "ia", mensagem: e.message }, { status: 422 });
    return NextResponse.json({ error: "importacao_falhou" }, { status: 500 });
  }
}
