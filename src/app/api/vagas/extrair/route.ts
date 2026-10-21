import { NextResponse } from "next/server";
import { z } from "zod";
import { ErroIA } from "@/lib/ai/cliente";
import { extrairVagaDoLink } from "@/lib/ai/extracao-link";
import { ErroLink, lerPaginaVaga } from "@/lib/fontes/link";
import { usuarioAtual } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Corpo = z.object({ url: z.string().trim().min(1).max(2000) });

// "+ Vaga manual": lê o link colado e devolve os campos do formulário (sem salvar).
export async function POST(request: Request) {
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Corpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "url_invalida", mensagem: "Informe o link da vaga." }, { status: 400 });

  try {
    const pagina = await lerPaginaVaga(parsed.data.url);
    return NextResponse.json({ vaga: await extrairVagaDoLink(supabase, user.id, pagina) });
  } catch (e) {
    if (e instanceof ErroLink) return NextResponse.json({ error: e.codigo, mensagem: e.message }, { status: 422 });
    if (e instanceof ErroIA) return NextResponse.json({ error: "ia", mensagem: e.message }, { status: 422 });
    console.error("[vagas-extrair]", e);
    return NextResponse.json({ error: "extracao_falhou", mensagem: "Não consegui ler esse link." }, { status: 500 });
  }
}
