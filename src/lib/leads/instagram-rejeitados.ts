/**
 * Lista de @ rejeitados por lead, guardada no navegador.
 *
 * Compartilhada pela busca da ficha e pela busca em lote do Radar: um "não é
 * ele" dado num lugar vale no outro.
 */

/**
 * Perfis que o dono marcou como "não existe" neste lead.
 *
 * O índice da pesquisa guarda perfil apagado ou renomeado, e sem isto o mesmo
 * @ voltava a cada "Buscar de novo". Fica no navegador (localStorage), por
 * lead: é conveniência de quem está conferindo, não dado do lead — e não pede
 * migração. Em outro aparelho a lista começa vazia.
 */
const chaveRejeitados = (leadId: string) => `radar:ig-rejeitados:${leadId}`;

export function lerRejeitados(leadId: string): string[] {
  try {
    const bruto = window.localStorage.getItem(chaveRejeitados(leadId));
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

export function gravarRejeitados(leadId: string, lista: string[]) {
  try {
    if (lista.length) {
      window.localStorage.setItem(chaveRejeitados(leadId), JSON.stringify(lista));
    } else {
      window.localStorage.removeItem(chaveRejeitados(leadId));
    }
  } catch {
    // Sem armazenamento (aba anônima): vale só enquanto a tela está aberta.
  }
}
