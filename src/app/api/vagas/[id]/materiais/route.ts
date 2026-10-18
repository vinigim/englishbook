import { NextResponse } from "next/server";
import { ErroIA } from "@/lib/ai/cliente";
import { gerarMateriais } from "@/lib/ai/materiais";
import { usuarioAtual } from "@/lib/supabase/server";
import { CvSchema } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: vaga }, { data: cv }] = await Promise.all([
    supabase.from("vagas").select("*").eq("id", id).maybeSingle(),
    supabase.from("cvs").select("conteudo").eq("user_id", user.id).eq("base", true).maybeSingle(),
  ]);
  if (!vaga) return NextResponse.json({ error: "vaga_nao_encontrada" }, { status: 404 });
  const cvBase = CvSchema.safeParse(cv?.conteudo);
  if (!cvBase.success || cvBase.data.experiencias.length === 0) {
    return NextResponse.json({ error: "cv_base_vazio" }, { status: 400 });
  }

  try {
    const materiais = await gerarMateriais(supabase, user.id, cvBase.data, vaga);
    // O CV adaptado vira uma linha em `cvs`, para a página de impressão servir aos dois.
    const { data: cvAdaptado } = await supabase
      .from("cvs")
      .insert({
        user_id: user.id,
        titulo: `${vaga.titulo} — ${vaga.empresa || "sem empresa"}`,
        base: false,
        vaga_id: vaga.id,
        conteudo: materiais.cv,
      })
      .select("id")
      .single();
    const { data, error } = await supabase
      .from("materiais")
      .insert({ user_id: user.id, vaga_id: vaga.id, conteudo: { ...materiais, cv_id: cvAdaptado?.id ?? null } })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error("[materiais]", e);
    if (e instanceof ErroIA) return NextResponse.json({ error: "ia", mensagem: e.message }, { status: 422 });
    return NextResponse.json({ error: "materiais_falhou" }, { status: 500 });
  }
}
