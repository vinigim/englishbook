import { citaMainframe, htmlParaTexto, inferirModelo } from "../filtro";
import type { EmpresaAlvo, VagaColetada } from "../tipos";

// ---------------------------------------------------------------------
// Páginas de carreira com JSON público. Cada empresa-alvo diz qual ATS usa
// e o "slug" que aparece na URL da página de vagas dela:
//   greenhouse       boards.greenhouse.io/<slug>
//   lever            jobs.lever.co/<slug>
//   smartrecruiters  jobs.smartrecruiters.com/<slug>
//   workable         apply.workable.com/<slug>
//   workday          <host>/<site>, ex.: kyndryl.wd5.myworkdayjobs.com/KyndrylProfessionalCareers
// As APIs que não filtram por texto devolvem tudo; aplicamos o pré-filtro
// aqui para não guardar centenas de vagas que não têm nada a ver.
// ---------------------------------------------------------------------

type Json = Record<string, any>; // respostas de APIs externas, lidas campo a campo

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store", headers: { accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

function base(empresa: EmpresaAlvo, v: Partial<VagaColetada>): VagaColetada {
  const descricao = v.descricao ?? "";
  return {
    fonte: empresa.ats,
    idExterno: v.idExterno ?? null,
    url: v.url!,
    titulo: (v.titulo ?? "").trim(),
    empresa: empresa.nome,
    local: v.local ?? "",
    modelo: v.modelo ?? inferirModelo(`${v.local ?? ""} ${descricao}`),
    pais: v.pais ?? "BR",
    descricao,
    publicadaEm: v.publicadaEm ?? null,
    semDescricao: v.semDescricao,
  };
}

async function greenhouse(e: EmpresaAlvo): Promise<VagaColetada[]> {
  const r = await getJson(`https://boards-api.greenhouse.io/v1/boards/${e.slug}/jobs?content=true`);
  return (r.jobs ?? []).map((j: Json) =>
    base(e, {
      idExterno: String(j.id),
      url: j.absolute_url,
      titulo: j.title,
      local: j.location?.name ?? "",
      // `content` vem com o HTML escapado (&lt;p&gt;)
      descricao: htmlParaTexto(htmlParaTexto(j.content ?? "")),
      publicadaEm: j.first_published ?? j.updated_at ?? null,
    }),
  );
}

async function lever(e: EmpresaAlvo): Promise<VagaColetada[]> {
  const r = await getJson(`https://api.lever.co/v0/postings/${e.slug}?mode=json`);
  return (r ?? []).map((j: Json) =>
    base(e, {
      idExterno: j.id,
      url: j.hostedUrl,
      titulo: j.text,
      local: j.categories?.location ?? "",
      modelo:
        j.workplaceType === "remote" ? "remoto" : j.workplaceType === "hybrid" ? "hibrido"
        : j.workplaceType === "onsite" ? "presencial" : undefined,
      pais: j.country ?? undefined,
      descricao: [j.descriptionPlain, ...(j.lists ?? []).map((l: Json) => `${l.text}\n${htmlParaTexto(l.content ?? "")}`), j.additionalPlain]
        .filter(Boolean)
        .join("\n\n"),
      publicadaEm: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    }),
  );
}

async function smartrecruiters(e: EmpresaAlvo, termos: string[]): Promise<VagaColetada[]> {
  // Aqui a API filtra por texto; a lista não traz descrição.
  const vistos = new Map<string, VagaColetada>();
  for (const termo of termos) {
    const r = await getJson(
      `https://api.smartrecruiters.com/v1/companies/${e.slug}/postings?limit=100&q=${encodeURIComponent(termo)}`,
    );
    for (const j of r.content ?? []) {
      const loc = j.location ?? {};
      vistos.set(
        j.id,
        base(e, {
          idExterno: j.id,
          url: `https://jobs.smartrecruiters.com/${e.slug}/${j.id}`,
          titulo: j.name,
          local: [loc.city, loc.region].filter(Boolean).join(" - "),
          modelo: loc.remote ? "remoto" : loc.hybrid ? "hibrido" : undefined,
          pais: (loc.country ?? "br").toUpperCase(),
          publicadaEm: j.releasedDate ?? null,
          semDescricao: true,
        }),
      );
    }
  }
  return [...vistos.values()];
}

async function workable(e: EmpresaAlvo): Promise<VagaColetada[]> {
  const r = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${e.slug}?details=true`);
  return (r.jobs ?? []).map((j: Json) =>
    base(e, {
      idExterno: j.shortcode,
      url: j.url ?? j.shortlink,
      titulo: j.title,
      local: [j.city, j.state].filter(Boolean).join(" - "),
      modelo: j.telecommuting ? "remoto" : undefined,
      pais: j.country ?? undefined,
      descricao: htmlParaTexto(j.description ?? ""),
      publicadaEm: j.published_on ?? null,
    }),
  );
}

async function workday(e: EmpresaAlvo, termos: string[]): Promise<VagaColetada[]> {
  // slug = "<tenant>.wdN.myworkdayjobs.com/<site>" — o mesmo JSON que o site de carreiras usa.
  const [host, site] = e.slug.replace(/^https?:\/\//, "").split("/");
  const tenant = host.split(".")[0];
  const vistos = new Map<string, VagaColetada>();
  for (const termo of termos) {
    const r = await getJson(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: termo }),
    });
    for (const j of r.jobPostings ?? []) {
      if (!j.externalPath) continue;
      vistos.set(
        j.externalPath,
        base(e, {
          idExterno: j.bulletFields?.[0] ?? j.externalPath,
          url: `https://${host}/${site}${j.externalPath}`,
          titulo: j.title,
          local: j.locationsText ?? "",
          pais: /brazil|brasil|são paulo|sao paulo|rio de janeiro/i.test(j.locationsText ?? "") ? "BR" : "",
          semDescricao: true,
        }),
      );
    }
  }
  return [...vistos.values()];
}

/** Coleta uma empresa e já descarta o que não cita mainframe. */
export async function coletarEmpresa(e: EmpresaAlvo, termos: string[]): Promise<VagaColetada[]> {
  let vagas: VagaColetada[];
  switch (e.ats) {
    case "greenhouse": vagas = await greenhouse(e); break;
    case "lever": vagas = await lever(e); break;
    case "workable": vagas = await workable(e); break;
    // Estas duas já buscaram pelos termos; sem descrição, não dá para refiltrar.
    case "smartrecruiters": return smartrecruiters(e, termos);
    case "workday": return workday(e, termos);
  }
  return vagas.filter((v) => v.url && citaMainframe(`${v.titulo}\n${v.descricao}`));
}
