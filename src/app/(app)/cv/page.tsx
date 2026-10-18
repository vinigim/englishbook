import Link from "next/link";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { CV_VAZIO, CvSchema } from "@/lib/tipos";
import { dataCurta } from "@/lib/utils";
import { EditorCv } from "./editor-cv";

export const dynamic = "force-dynamic";

export default async function CvPage() {
  const supabase = await createClient();
  const [{ data: base }, { data: adaptados }] = await Promise.all([
    supabase.from("cvs").select("id, conteudo, updated_at").eq("base", true).maybeSingle(),
    supabase.from("cvs").select("id, titulo, vaga_id, created_at").eq("base", false).order("created_at", { ascending: false }).limit(50),
  ]);
  const cv = CvSchema.safeParse(base?.conteudo);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Meu CV base</h1>
            <p className="text-sm text-slate-500">
              É a fonte da verdade: a IA adapta a partir dele para cada vaga, sem inventar nada além do que está aqui.
            </p>
          </div>
          {base && (
            <Link href={`/cv/imprimir/${base.id}`} target="_blank" className="text-sm text-indigo-700 hover:underline">
              Abrir para salvar em PDF ↗
            </Link>
          )}
        </div>
        <EditorCv id={base?.id ?? null} inicial={cv.success ? cv.data : CV_VAZIO} />
      </div>

      <Card className="h-fit">
        <h2 className="mb-2 font-semibold">Versões adaptadas</h2>
        {adaptados?.length === 0 && <p className="text-sm text-slate-500">Gere materiais em uma vaga para criar a primeira.</p>}
        <ul className="space-y-2">
          {adaptados?.map((c) => (
            <li key={c.id} className="text-sm">
              <Link href={`/cv/imprimir/${c.id}`} target="_blank" className="hover:text-indigo-700">{c.titulo}</Link>
              <p className="text-xs text-slate-400">
                {dataCurta(c.created_at)}
                {c.vaga_id && <> · <Link href={`/vagas/${c.vaga_id}`} className="hover:underline">ver vaga</Link></>}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
