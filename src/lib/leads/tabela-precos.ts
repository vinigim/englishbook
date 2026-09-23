/**
 * Tabela de preços da locação, exatamente como o dono manda pelo WhatsApp.
 *
 * Fica no código, e não no banco, porque é a ÚNICA fonte de preço que a IA
 * pode citar: o prompt proíbe inventar valor, e sem isto um lead que pedia
 * "as informações" recebia uma pergunta de qualificação em vez da tabela.
 *
 * Mudar o texto aqui muda o prompt estável — suba o PROMPT_VERSION em
 * `src/lib/ai/prompt.ts` junto, para as análises antigas não seguirem
 * exibindo a tabela velha.
 */
export const TABELA_CO2 = `Trabalhamos com locação do Laser de CO2 Fracionado SmartXide Punto (DEKA, Itália) por bloco de horas:

⏳ 02 horas - R$ 1.300,00
⏳ 03 horas - R$ 1.800,00
⏳ 04 horas - R$ 1.999,00 (preço promocional)
⏳ 06 horas - R$ 2.200,00
⏳ 08 horas - R$ 2.400,00
⏳ 10 horas - R$ 2.600,00

🧑‍⚕️ Técnica para aplicação (opcional):
R$ 300,00 (até 4 horas) | R$ 400,00 (até 6h) | R$ 600,00 (até 10h)

❄️ Resfriador de pele Freddo para conforto do paciente - R$ 250,00

Levamos o equipamento até sua clínica e ficamos disponíveis durante toda a utilização. E na sua primeira locação conosco, o frete é por nossa conta.`;

const VALOR = /R\$\s*([\d.]+,\d{2})/g;

function valores(texto: string): string[] {
  return Array.from(texto.matchAll(VALOR), (m) => m[1]);
}

const VALORES_DA_TABELA = new Set(valores(TABELA_CO2));

/**
 * Valores em reais no rascunho que não existem na tabela.
 *
 * A IA é instruída a copiar a tabela sem mexer, mas é dinheiro: um "R$ 1.900"
 * trocado por engano sairia no WhatsApp do dono como proposta. Isto não
 * corrige nada — só faz o aviso aparecer na tela antes do envio.
 */
export function precosForaDaTabela(rascunho: string): string[] {
  return Array.from(new Set(valores(rascunho))).filter(
    (v) => !VALORES_DA_TABELA.has(v),
  );
}
