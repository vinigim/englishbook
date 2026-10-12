import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from "@evenrealities/even_hub_sdk";
import type { ConsultaOculos, RespostaOculos } from "./contrato";
import { BYTES_ITEM, CABECALHO, CORPO, TELA, caberNaLinha, paginar, type Tela } from "./paginar";

/**
 * Parâmetros CO2 da Lux Derma no óculos Even G2.
 *
 * O app roda na WebView do app Even, no celular. Esta página é o que o
 * médico vê no celular (onde digita o código da locação); o óculos recebe
 * as telas pelo bridge. Nada aqui chama a IA: o óculos só mostra as
 * consultas já feitas no painel e ligadas à locação.
 *
 * No óculos:
 *   lista de consultas → toque abre
 *   telas da consulta → deslizar passa, toque avança, toque duplo volta
 *   na lista, toque duplo recarrega
 */

// O painel em produção; VITE_LUX_URL troca (dev local, simulador).
const BASE = (import.meta.env.VITE_LUX_URL || "https://lux-derma.vercel.app").replace(/\/$/, "");
const CHAVE_CODIGO = "lux-codigo";

// ============================================================================
//  Estado
// ============================================================================
type Estado =
  | { tela: "mensagem"; titulo: string; texto: string }
  | { tela: "lista"; dados: RespostaOculos }
  | { tela: "consulta"; dados: RespostaOculos; consulta: number; telas: Tela[]; atual: number };

let bridge: EvenAppBridge | null = null;
let paginaCriada = false;
let estado: Estado = { tela: "mensagem", titulo: "Lux Derma", texto: "Abrindo..." };
let codigo = "";
let carregando = false;

// ============================================================================
//  Servidor
// ============================================================================
async function buscar(c: string): Promise<{ ok: true; dados: RespostaOculos } | { ok: false; erro: string }> {
  if (!BASE) return { ok: false, erro: "App sem endereço do painel (VITE_LUX_URL)." };
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}/api/oculos/${encodeURIComponent(c)}`, { signal: controle.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return { ok: false, erro: json?.message ?? `Erro ${res.status} no servidor.` };
    if (json.versao !== 1) return { ok: false, erro: "Atualize o app do óculos." };
    return { ok: true, dados: json as RespostaOculos };
  } catch {
    return { ok: false, erro: "Sem conexão com o painel. Confira a internet do celular." };
  } finally {
    clearTimeout(limite);
  }
}

async function carregar() {
  if (carregando) return;
  if (!codigo) {
    mostrar({
      tela: "mensagem",
      titulo: "Lux Derma · Parâmetros CO2",
      texto: "Digite no celular, no app Even, o código da locação que a Lux Derma enviou.",
    });
    return;
  }
  carregando = true;
  mostrar({ tela: "mensagem", titulo: "Lux Derma", texto: "Carregando parâmetros..." });
  const r = await buscar(codigo);
  carregando = false;
  if (!r.ok) {
    mostrar({ tela: "mensagem", titulo: "Não deu para abrir", texto: r.erro });
    return;
  }
  if (r.dados.consultas.length === 0) {
    mostrar({
      tela: "mensagem",
      titulo: cabecalhoDaLocacao(r.dados),
      texto: "Nenhuma consulta ligada a esta locação ainda. Toque duas vezes para recarregar.",
    });
    return;
  }
  mostrar({ tela: "lista", dados: r.dados });
}

function cabecalhoDaLocacao(d: RespostaOculos): string {
  return [d.locacao.medico, d.locacao.data].join(" · ");
}

function abrirConsulta(dados: RespostaOculos, indice: number) {
  const c: ConsultaOculos | undefined = dados.consultas[indice];
  if (!c) return;
  mostrar({ tela: "consulta", dados, consulta: indice, telas: paginar(c.paginas), atual: 0 });
}

// ============================================================================
//  Óculos
// ============================================================================
function texto(
  id: number,
  nome: string,
  conteudo: string,
  caixa: { y: number; altura: number; padding: number },
  captura: boolean,
  brilho?: number,
): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: caixa.y,
    width: TELA.largura,
    height: caixa.altura,
    paddingLength: caixa.padding,
    containerID: id,
    containerName: nome,
    content: conteudo,
    isEventCapture: captura ? 1 : 0,
    ...(brilho !== undefined ? { textColor: brilho } : {}),
  });
}

function montar(e: Estado): { textObject: TextContainerProperty[]; listObject?: ListContainerProperty[] } {
  const larguraCabecalho = TELA.largura - 2 * CABECALHO.padding;
  if (e.tela === "mensagem") {
    return {
      textObject: [
        texto(1, "cabecalho", caberNaLinha(e.titulo, larguraCabecalho), CABECALHO, false, 3),
        texto(2, "corpo", e.texto, CORPO, true),
      ],
    };
  }
  if (e.tela === "lista") {
    const itens = e.dados.consultas
      .slice(0, 20)
      .map((c) => caberNaLinha(c.titulo, TELA.largura - 40, BYTES_ITEM));
    return {
      textObject: [
        texto(1, "cabecalho", caberNaLinha(cabecalhoDaLocacao(e.dados), larguraCabecalho), CABECALHO, false, 3),
      ],
      listObject: [
        new ListContainerProperty({
          xPosition: 0,
          yPosition: CORPO.y,
          width: TELA.largura,
          height: CORPO.altura,
          containerID: 2,
          containerName: "lista",
          itemContainer: new ListItemContainerProperty({
            itemCount: itens.length,
            itemName: itens,
            isItemSelectBorderEn: 1,
          }),
          isEventCapture: 1,
        }),
      ],
    };
  }
  const t = e.telas[e.atual];
  const titulo = `${t.titulo}  ${e.atual + 1}/${e.telas.length}`;
  return {
    textObject: [
      texto(1, "cabecalho", caberNaLinha(titulo, larguraCabecalho), CABECALHO, false, 3),
      texto(2, "corpo", t.texto, CORPO, true),
    ],
  };
}

/** Uma fila só: duas trocas de tela seguidas não podem cruzar no bridge. */
let fila: Promise<unknown> = Promise.resolve();

function mostrar(e: Estado) {
  estado = e;
  desenharCelular();
  if (!bridge) return;
  const b = bridge;
  fila = fila.then(async () => {
    const pagina = montar(estado);
    const total = pagina.textObject.length + (pagina.listObject?.length ?? 0);
    try {
      if (!paginaCriada) {
        const r = await b.createStartUpPageContainer(
          new CreateStartUpPageContainer({ containerTotalNum: total, ...pagina }),
        );
        paginaCriada = r === StartUpPageCreateResult.success;
        if (!paginaCriada) console.error("[oculos] página inicial recusada", r);
      } else {
        const ok = await b.rebuildPageContainer(
          new RebuildPageContainer({ containerTotalNum: total, ...pagina }),
        );
        if (!ok) console.error("[oculos] rebuild recusado");
      }
    } catch (err) {
      console.error("[oculos] falha ao desenhar", err);
    }
  });
}

function aoEvento(ev: EvenHubEvent) {
  const origem = ev.listEvent ?? ev.textEvent ?? ev.sysEvent;
  if (!origem) return;
  // O firmware manda o clique (0) sem o campo, como todo valor padrão do protobuf.
  const tipo = origem.eventType ?? OsEventTypeList.CLICK_EVENT;

  if (tipo === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
    void carregar();
    return;
  }

  const e = estado;
  if (e.tela === "mensagem") {
    if (tipo === OsEventTypeList.DOUBLE_CLICK_EVENT || tipo === OsEventTypeList.CLICK_EVENT) void carregar();
    return;
  }

  if (e.tela === "lista") {
    if (tipo === OsEventTypeList.DOUBLE_CLICK_EVENT) void carregar();
    else if (tipo === OsEventTypeList.CLICK_EVENT && ev.listEvent) {
      // Índice 0 também chega sem o campo.
      abrirConsulta(e.dados, ev.listEvent.currentSelectItemIndex ?? 0);
    }
    return;
  }

  if (tipo === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    mostrar({ tela: "lista", dados: e.dados });
  } else if (tipo === OsEventTypeList.SCROLL_BOTTOM_EVENT || tipo === OsEventTypeList.CLICK_EVENT) {
    if (e.atual < e.telas.length - 1) mostrar({ ...e, atual: e.atual + 1 });
  } else if (tipo === OsEventTypeList.SCROLL_TOP_EVENT) {
    if (e.atual > 0) mostrar({ ...e, atual: e.atual - 1 });
  }
}

// ============================================================================
//  Celular
// ============================================================================
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function desenharCelular() {
  const status = $("status");
  const lista = $("consultas");
  lista.replaceChildren();
  if (estado.tela === "mensagem") {
    status.textContent = estado.texto;
    return;
  }
  const d = estado.dados;
  status.textContent = `${cabecalhoDaLocacao(d)}${d.locacao.equipamento ? ` · ${d.locacao.equipamento}` : ""}`;
  d.consultas.forEach((c, i) => {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = c.titulo;
    botao.onclick = () => abrirConsulta(d, i);
    li.append(botao);
    lista.append(li);
  });
}

async function lerCodigoGuardado(): Promise<string> {
  try {
    if (bridge) return (await bridge.getLocalStorage(CHAVE_CODIGO)) ?? "";
    return localStorage.getItem(CHAVE_CODIGO) ?? "";
  } catch {
    return "";
  }
}

async function guardarCodigo(c: string) {
  try {
    if (bridge) await bridge.setLocalStorage(CHAVE_CODIGO, c);
    else localStorage.setItem(CHAVE_CODIGO, c);
  } catch {
    // Sem armazenamento, o código vale só até fechar o app.
  }
}

function normalizar(bruto: string): string {
  return bruto.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

// ============================================================================
//  Início
// ============================================================================
async function iniciar() {
  const form = $<HTMLFormElement>("form");
  const campo = $<HTMLInputElement>("codigo");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    codigo = normalizar(campo.value);
    campo.value = codigo ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : "";
    await guardarCodigo(codigo);
    void carregar();
  };
  $("recarregar").onclick = () => void carregar();

  // Fora do app Even (navegador comum) o bridge nunca chega: segue só com a
  // tela do celular, útil para conferir o texto.
  bridge = await Promise.race([
    waitForEvenAppBridge(),
    new Promise<null>((r) => setTimeout(() => r(null), 3000)),
  ]);
  if (bridge) bridge.onEvenHubEvent(aoEvento);
  else $("aviso").hidden = false;

  // `?codigo=` na URL (link ou QR da Lux) tem prioridade sobre o guardado.
  const daUrl = normalizar(new URLSearchParams(location.search).get("codigo") ?? "");
  if (daUrl) await guardarCodigo(daUrl);
  codigo = daUrl || normalizar(await lerCodigoGuardado());
  if (codigo) campo.value = `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
  await carregar();
}

void iniciar();
