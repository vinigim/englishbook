/**
 * Sugestão de lead para uma conversa que chegou só com LID.
 *
 * Sem IA, por regra, e sempre para o dono confirmar: vínculo errado cola a
 * conversa de um médico na ficha de outro. Dois níveis:
 *
 *  - "forte": um nome que o WhatsApp tem para o contato é IGUAL (sem acento,
 *    caixa e pontuação) ao nome de UM lead. É o caso de quem salva o contato
 *    no celular com o nome da planilha.
 *  - "fraca": uma palavra rara — que só aparece no nome de UM lead — está no
 *    nome do contato ou no que ele escreveu ("Dermacor", "Zamarian"). Útil,
 *    mas pede conferência: duas clínicas podem ter o mesmo nome.
 */

export type LeadParaSugestao = {
  id: string;
  nomes: string[];
};

export type Sugestao = {
  leadId: string;
  forca: "forte" | "fraca";
  motivo: string;
};

/**
 * Palavras que aparecem em nome de clínica de todo mundo e não identificam
 * ninguém. Sem esta lista, "Clínica" viraria "palavra rara" num catálogo
 * pequeno e casaria qualquer coisa.
 */
const COMUNS = new Set([
  "clinica", "clinicas", "consultorio", "instituto", "centro", "espaco",
  "dermatologia", "dermatologista", "dermato", "derma", "cirurgia", "cirurgiao",
  "cirurgia", "plastica", "plastico", "estetica", "estetico", "medicina",
  "medico", "medica", "saude", "hospital", "doutor", "doutora", "dra", "dr",
  "blefaroplastia", "laser", "atendimento", "canal", "bem", "vindo", "vinda",
  "seja", "ola", "obrigado", "obrigada", "para", "com", "sua", "seu", "nosso",
  "nossa", "voce", "voces", "sim", "nao", "mais", "muito", "este", "esta",
  "aqui", "como", "pode", "podemos", "horario", "segunda", "sexta", "sabado",
  "mensagem", "whatsapp", "contato", "equipe", "assistente", "administrativo",
  "valor", "locacao", "orcamento", "email", "gmail", "hotmail", "paulo", "sao",
]);

export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function palavras(s: string): string[] {
  return normalizarNome(s)
    .split(" ")
    .filter((p) => p.length >= 5 && !COMUNS.has(p) && !/^\d+$/.test(p));
}

export function criarSugeridor(leads: LeadParaSugestao[]) {
  // Nome exato → leads que o têm.
  const porNomeExato = new Map<string, Set<string>>();
  // Palavra → leads em cujo nome ela aparece.
  const porPalavra = new Map<string, Set<string>>();

  for (const l of leads) {
    for (const nome of l.nomes) {
      const n = normalizarNome(nome);
      if (!n) continue;
      (porNomeExato.get(n) ?? porNomeExato.set(n, new Set()).get(n)!).add(l.id);
      for (const p of palavras(nome)) {
        (porPalavra.get(p) ?? porPalavra.set(p, new Set()).get(p)!).add(l.id);
      }
    }
  }

  return function sugerir(
    nomesDoContato: string[],
    textosDoContato: string[],
  ): Sugestao | null {
    // 1. Nome igual ao de um único lead.
    for (const nome of nomesDoContato) {
      const ids = porNomeExato.get(normalizarNome(nome));
      if (ids && ids.size === 1) {
        return {
          leadId: [...ids][0],
          forca: "forte",
          motivo: `o contato está salvo como "${nome}"`,
        };
      }
    }

    // 2. Palavra rara que aponta para um único lead. Se palavras diferentes
    // apontarem para leads diferentes, não há sugestão: é ambíguo.
    const candidatos = new Map<string, string>();
    const fontes: [string, string[]][] = [
      ["no nome do contato", nomesDoContato],
      ["no que o contato escreveu", textosDoContato],
    ];
    for (const [onde, textos] of fontes) {
      for (const t of textos) {
        for (const p of palavras(t)) {
          const ids = porPalavra.get(p);
          if (ids && ids.size === 1) {
            const id = [...ids][0];
            if (!candidatos.has(id)) candidatos.set(id, `"${p}" aparece ${onde}`);
          }
        }
      }
    }
    if (candidatos.size === 1) {
      const [[leadId, motivo]] = [...candidatos];
      return { leadId, forca: "fraca", motivo };
    }
    return null;
  };
}
