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

export function urlDoRadar(): string {
  try {
    const query = sessionStorage.getItem(CHAVE);
    return query ? `${RADAR_PATH}?${query}` : RADAR_PATH;
  } catch {
    return RADAR_PATH;
  }
}
