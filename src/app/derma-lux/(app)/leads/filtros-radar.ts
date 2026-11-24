/**
 * Última combinação de filtros do radar, para o "← Voltar ao radar".
 *
 * O link fica na página do lead, que não sabe de onde o dono veio. O Voltar do
 * navegador já resolve pela URL; este é o caminho do link da própria tela.
 *
 * sessionStorage, e não localStorage: vale para a aba aberta. Abrir o radar
 * amanhã começa limpo em vez de com um filtro esquecido escondendo leads.
 * Tudo em try/catch porque o armazenamento pode estar bloqueado (aba privada).
 */
const CHAVE = "lux-derma:filtros-radar";

export const RADAR_PATH = "/derma-lux/leads";

export function guardarFiltrosDoRadar(query: string): void {
  try {
    if (query) sessionStorage.setItem(CHAVE, query);
    else sessionStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento, o link só volta ao radar sem filtro — como antes.
  }
}

/**
 * O lead aberto a partir da lista do radar.
 *
 * Com ele, o "← Voltar ao radar" desse lead vira o "Voltar" do navegador: o Next
 * devolve a lista que já estava carregada, na mesma rolagem, em vez de buscar
 * e montar tudo de novo. Se alguma ação na ficha mudou dados (revalidatePath),
 * o Next descarta essa cópia sozinho e busca a lista atualizada, como antes.
 */
const CHAVE_LEAD = "lux-derma:lead-aberto-do-radar";

export function marcarLeadAbertoDoRadar(leadId: string): void {
  try {
    sessionStorage.setItem(CHAVE_LEAD, leadId);
    sessionStorage.setItem(
      CHAVE_ROLAGEM,
      JSON.stringify({ y: Math.round(window.scrollY), em: Date.now() }),
    );
  } catch {
    // Sem armazenamento, o voltar só recarrega a lista — como antes.
  }
}

/** Consome a marca: vale uma vez, e só para o lead que foi aberto. */
export function veioDoRadar(leadId: string): boolean {
  try {
    const ok = sessionStorage.getItem(CHAVE_LEAD) === leadId;
    sessionStorage.removeItem(CHAVE_LEAD);
    return ok;
  } catch {
    return false;
  }
}

export function urlDoRadar(): string {
  try {
    const query = sessionStorage.getItem(CHAVE);
    return query ? `${RADAR_PATH}?${query}` : RADAR_PATH;
  } catch {
    return RADAR_PATH;
  }
}

/**
 * Onde a lista estava rolada quando o dono abriu um lead.
 *
 * O Next só devolve a lista na mesma rolagem quando ainda a tem na memória.
 * Quando precisa buscá-la de novo (uma ação na ficha mudou dados), o navegador
 * aplica a rolagem antiga numa página ainda curta, e ela "descia" sozinha
 * conforme a lista chegava. Guardando a posição, a lista volta para o lugar
 * certo depois de montada, nos dois casos. Vale por 30 minutos e uma vez.
 */
const CHAVE_ROLAGEM = "lux-derma:rolagem-radar";
const VALIDADE_ROLAGEM_MS = 30 * 60 * 1000;

export function rolagemGuardadaDoRadar(): number | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_ROLAGEM);
    sessionStorage.removeItem(CHAVE_ROLAGEM);
    if (!bruto) return null;
    const { y, em } = JSON.parse(bruto) as { y?: unknown; em?: unknown };
    if (typeof y !== "number" || typeof em !== "number") return null;
    if (Date.now() - em > VALIDADE_ROLAGEM_MS) return null;
    return y;
  } catch {
    return null;
  }
}
