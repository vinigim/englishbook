import { createHash } from "node:crypto";
import { fmtDayHeading, toWhatsAppNumber } from "./shared";

/**
 * O link da janela para quem recebe a oferta pelo Instagram.
 *
 * Pelo direct, responder no WhatsApp custava copiar um número, abrir outro app
 * e escrever. O link curto `/j/<codigo>` abre o WhatsApp da Lux com o
 * interesse já escrito, e o código no fim do texto deixa o Radar saber, quando
 * a mensagem chega, de qual oferta ela veio. Só servidor: usa `node:crypto`.
 */

/** Sem 0/O, 1/I/L: o código aparece no texto e às vezes é ditado. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Determinístico de propósito: a tela monta a mensagem antes do clique (a
 * cópia no iPhone precisa terminar dentro do toque, sem esperar o banco), e a
 * mesma janela para o mesmo lead tem que dar sempre o mesmo link.
 */
export function codigoDaJanela(leadId: string, equipId: string, data: string): string {
  const h = createHash("sha256").update(`${leadId}|${equipId}|${data}`).digest();
  let codigo = "";
  for (let i = 0; i < 6; i++) codigo += ALFABETO[h[i] % ALFABETO.length];
  return codigo;
}

/** Acha o código numa mensagem recebida: "... Código: K7P3QX". */
export const CODIGO_NA_MENSAGEM = /c[óo]digo:?\s*([A-HJ-KM-NP-Z2-9]{6})\b/i;

/**
 * O WhatsApp da empresa, só dígitos com DDI. Vem de `LUX_WHATSAPP` porque o
 * número comercial não está em lugar nenhum do banco. Sem ele, a mensagem do
 * Instagram sai sem link, como antes.
 */
export function numeroDaLux(): string | null {
  return toWhatsAppNumber(process.env.LUX_WHATSAPP ?? null);
}

/** "quinta, dia 15/10" — como se fala no WhatsApp. */
export function diaFalado(iso: string): string {
  const { dow } = fmtDayHeading(iso);
  const [, m, d] = iso.split("-");
  return `${dow.replace("-feira", "")}, dia ${d}/${m}`;
}

export type DadosDoLink = {
  equip_nome: string;
  cidade: string;
  data: string;
  periodo: string;
};

/** O texto que o médico manda ao tocar no link. Ele pode editar antes. */
export function textoDeInteresse(dados: DadosDoLink | null, codigo: string | null): string {
  if (!dados) {
    return codigo
      ? `Olá! Vi a janela de locação no Instagram e tenho interesse. Código: ${codigo}`
      : "Olá! Vi a janela de locação no Instagram e tenho interesse.";
  }
  const quando =
    dados.periodo === "manha"
      ? `${diaFalado(dados.data)}, de manhã`
      : dados.periodo === "tarde"
        ? `${diaFalado(dados.data)}, à tarde`
        : diaFalado(dados.data);
  return (
    `Olá! Vi no Instagram a janela do ${dados.equip_nome} (${quando}, região de ` +
    `${dados.cidade}) e tenho interesse. Código: ${codigo}`
  );
}
