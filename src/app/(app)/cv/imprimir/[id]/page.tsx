import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CvSchema } from "@/lib/tipos";
import { BotaoImprimir } from "./botao-imprimir";

export const dynamic = "force-dynamic";

// Layout de uma coluna, sem tabelas nem ícones: é o que os ATS leem melhor.
export default async function ImprimirCv({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("cvs").select("conteudo").eq("id", id).maybeSingle();
  const parsed = CvSchema.safeParse(data?.conteudo);
  if (!parsed.success) notFound();
  const cv = parsed.data;
  const contato = [cv.contato.cidade, cv.contato.telefone, cv.contato.email, cv.contato.linkedin].filter(Boolean);

  return (
    <div className="mx-auto max-w-[800px] bg-white p-10 text-[13px] leading-snug text-black shadow print:p-0 print:shadow-none">
      <div className="no-print mb-6 flex justify-end"><BotaoImprimir /></div>
      <header className="mb-4 border-b border-black pb-2">
        <h1 className="text-2xl font-bold">{cv.nome}</h1>
        <p className="text-base">{cv.titulo}</p>
        <p className="mt-1 text-xs">{contato.join(" · ")}</p>
      </header>

      {cv.resumo && <Bloco titulo="Resumo"><p>{cv.resumo}</p></Bloco>}

      {cv.experiencias.length > 0 && (
        <Bloco titulo="Experiência profissional">
          {cv.experiencias.map((e, i) => (
            <div key={i} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p className="font-bold">{e.cargo} — {e.empresa}</p>
                <p className="shrink-0">{e.inicio} – {e.fim}</p>
              </div>
              {e.local && <p className="text-xs italic">{e.local}</p>}
              {e.resumo && <p className="mt-0.5">{e.resumo}</p>}
              {e.realizacoes.length > 0 && (
                <ul className="mt-0.5 list-disc pl-5">{e.realizacoes.map((r, j) => <li key={j}>{r}</li>)}</ul>
              )}
              {e.tecnologias.length > 0 && <p className="mt-0.5 text-xs">Tecnologias: {e.tecnologias.join(", ")}</p>}
            </div>
          ))}
        </Bloco>
      )}

      {cv.habilidades.length > 0 && (
        <Bloco titulo="Competências técnicas">
          {cv.habilidades.map((h) => <p key={h.grupo}><strong>{h.grupo}:</strong> {h.itens.join(", ")}</p>)}
        </Bloco>
      )}
      {cv.formacao.length > 0 && (
        <Bloco titulo="Formação">
          {cv.formacao.map((f, i) => <p key={i}>{f.curso} — {f.instituicao}{f.conclusao && ` (${f.conclusao})`}</p>)}
        </Bloco>
      )}
      {cv.certificacoes.length > 0 && (
        <Bloco titulo="Certificações"><ul className="list-disc pl-5">{cv.certificacoes.map((c) => <li key={c}>{c}</li>)}</ul></Bloco>
      )}
      {cv.idiomas.length > 0 && (
        <Bloco titulo="Idiomas"><p>{cv.idiomas.map((i) => `${i.idioma} (${i.nivel})`).join(" · ")}</p></Bloco>
      )}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1 border-b border-slate-300 text-sm font-bold uppercase tracking-wide">{titulo}</h2>
      {children}
    </section>
  );
}
