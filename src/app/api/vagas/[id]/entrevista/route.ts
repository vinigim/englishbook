import { NextResponse } from "next/server";
import { ErroIA } from "@/lib/ai/cliente";
import { gerarPreparoEntrevista } from "@/lib/ai/entrevista";
import { usuarioAtual } from "@/lib/supabase/server";
import { CvSchema } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Evento = { tipo: string; para_status: string | null; texto: string | null; created_at: string };

// "Preparar para a entrevista" na página da vaga.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: vaga }, { data: cv }, { data: perfil }, { data: candidatura }] = await Promise.all([
    supabase.from("vagas").select("*").eq("id", id).maybeSingle(),
    supabase.from("cvs").select("conteudo").eq("user_id", user.id).eq("base", true).maybeSingle(),
    supabase.from("perfil").select("resumo_profissional").eq("user_id", user.id).maybeSingle(),
    supabase.from("candidaturas").select("status, contatos, notas, candidatura_eventos(tipo, para_status, texto, created_at)").eq("vaga_id", id).maybeSingle(),
  ]);
  if (!vaga) return NextResponse.json({ error: "vaga_nao_encontrada" }, { status: 404 });
  const cvBase = CvSchema.safeParse(cv?.conteudo);
  if (!cvBase.success || cvBase.data.experiencias.length === 0) {
    return NextResponse.json({ error: "cv_base_vazio" }, { status: 400 });
  }

  // O que já aconteceu nesta candidatura (ex.: "entrevista técnica com o gestor") ajuda a IA a mirar.
  const eventos = ((candidatura?.candidatura_eventos ?? []) as Evento[])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((e) => `- ${e.created_at.slice(0, 10)}: ${e.texto ?? (e.para_status ? `status → ${e.para_status}` : e.tipo)}`)
    .join("\n");
  const contexto = candidatura
    ? [`Status: ${candidatura.status}`, candidatura.notas && `Notas: ${candidatura.notas}`, eventos && `Linha do tempo:\n${eventos}`]
        .filter(Boolean)
        .join("\n")
    : undefined;

  try {
    const preparo = await gerarPreparoEntrevista(supabase, user.id, {
      cv: cvBase.data,
      perfil: perfil?.resumo_profissional ?? "",
      vaga,
      candidatura: contexto,
    });
    const { data, error } = await supabase
      .from("preparos_entrevista")
      .insert({ user_id: user.id, vaga_id: vaga.id, conteudo: preparo })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error("[entrevista]", e);
    if (e instanceof ErroIA) return NextResponse.json({ error: "ia", mensagem: e.message }, { status: 422 });
    return NextResponse.json({ error: "entrevista_falhou" }, { status: 500 });
  }
}
