"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  ComparaDwell,
  ComparaModo,
  ComparaPotencia,
  ComparaSpacing,
  ComparaStack,
  type PerfilBase,
} from "./IlustracaoPele";
import {
  ENTRADA_PADRAO,
  INDICACAO_LABEL,
  REGIAO_LABEL,
  VIABILIDADE_LABEL,
  normalizarEntrada,
  responderDivergencia,
  type ConsultaGravada,
  type DivergenciaFoto,
  type EntradaConsulta,
  type ParametroNumerico,
  type Recomendacao,
  type RespostaConsulta,
  type VinculoLocacao,
} from "@/lib/laser/tipos";
import { FormularioCaso } from "./FormularioCaso";
import { AnaliseFotoCard, CampoFotos, type FotoLocal } from "./Fotos";
import {
  ParametrosRealizadosCard,
  SeletorLocacao,
  VinculoDaConsulta,
  rotuloLocacao,
} from "./Locacao";

export type FonteInfo = { titulo: string; origem: string; url: string | null };

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ParametrosClient({
  historico,
  locacoes,
  fontes,
  semTabela,
  semVinculo,
}: {
  historico: ConsultaGravada[];
  locacoes: VinculoLocacao[];
  fontes: Record<string, FonteInfo>;
  semTabela: boolean;
  semVinculo: boolean;
}) {
  const router = useRouter();
  const [entrada, setEntrada] = useState<EntradaConsulta>(ENTRADA_PADRAO);
  const [resposta, setResposta] = useState<RespostaConsulta | null>(null);
  const [entradaDaResposta, setEntradaDaResposta] =
    useState<EntradaConsulta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Fora de `entrada` de propósito: a locação não muda a recomendação, então
  // não entra no hash nem invalida o reaproveitamento.
  const [rentalId, setRentalId] = useState<string | null>(null);
  // Só na memória do navegador; vão na requisição e não voltam.
  const [fotos, setFotos] = useState<FotoLocal[]>([]);

  async function consultar(forcar = false, caso: EntradaConsulta = entrada) {
    setCarregando(true);
    setErro(null);
    try {
      const dados = { entrada: caso, forcar, rentalId };
      let res: Response;
      if (fotos.length > 0) {
        // Multipart: o navegador define o content-type com o boundary.
        const form = new FormData();
        form.set("dados", JSON.stringify(dados));
        fotos.forEach((f, i) => form.append("fotos", f.blob, `foto-${i + 1}.jpg`));
        res = await fetch("/api/laser/recomendar", { method: "POST", body: form });
      } else {
        res = await fetch("/api/laser/recomendar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dados),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          res.status === 403
            ? "Seu usuário não está liberado na equipe (lux_staff)."
            : (json.message ?? json.error ?? "Falha ao consultar a IA."),
        );
        return;
      }
      setResposta(json as RespostaConsulta);
      setEntradaDaResposta(caso);
      router.refresh();
    } catch {
      setErro("Falha de rede ao consultar a IA. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  function abrirDoHistorico(c: ConsultaGravada) {
    // Consultas antigas não têm os campos novos: normalizar completa com o padrão.
    setEntrada(normalizarEntrada(c.entrada));
    setResposta(c.resposta);
    setEntradaDaResposta(c.entrada);
    setRentalId(c.resposta.locacao?.id ?? null);
    // As fotos atuais são de outro caso; a consulta antiga não guardou as dela.
    setFotos((atual) => {
      atual.forEach((f) => URL.revokeObjectURL(f.url));
      return [];
    });
    setErro(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * O médico confirmou ou descartou um achado da foto: atualiza o formulário
   * e consulta de novo com o caso corrigido. As fotos, se ainda estiverem na
   * tela, vão junto.
   */
  function responderFoto(d: DivergenciaFoto, confere: boolean) {
    const caso = responderDivergencia(entrada, d, confere);
    setEntrada(caso);
    consultar(false, caso);
  }

  function aoAtualizar(c: ConsultaGravada) {
    setResposta(c.resposta);
    setRentalId(c.resposta.locacao?.id ?? null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {semVinculo ? (
        <Alert variant="warning" title="Vínculo com a locação desligado">
          Rode a migração <code>0022_laser_consulta_locacao.sql</code> no
          Supabase para ligar as consultas aos médicos e registrar o que foi
          usado.
        </Alert>
      ) : null}
      {semTabela ? (
        <Alert variant="warning" title="Histórico desligado">
          Rode a migração <code>0021_laser_consultas.sql</code> no Supabase para
          gravar as consultas e reaproveitar casos repetidos sem pagar de novo.
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ */}
        {/*  Formulário                                                   */}
        {/* ------------------------------------------------------------ */}
        <FormularioCaso
          entrada={entrada}
          setEntrada={setEntrada}
          onEnviar={() => consultar(false)}
          carregando={carregando}
          topo={
            semVinculo ? null : (
              <SeletorLocacao locacoes={locacoes} valor={rentalId} onChange={setRentalId} />
            )
          }
          fotos={<CampoFotos fotos={fotos} setFotos={setFotos} />}
        />

        {/* ------------------------------------------------------------ */}
        {/*  Resultado                                                    */}
        {/* ------------------------------------------------------------ */}
        <div className="min-w-0 space-y-4">
          {erro ? (
            <Alert variant="danger" title="Não deu certo">
              {erro}
            </Alert>
          ) : null}

          {resposta && entradaDaResposta ? (
            <Resultado
              resposta={resposta}
              entrada={entradaDaResposta}
              fontes={fontes}
              carregando={carregando}
              onRefazer={() => consultar(true)}
              locacoes={locacoes}
              semVinculo={semVinculo}
              onAtualizada={aoAtualizar}
              entradaAtual={entrada}
              onResponderFoto={responderFoto}
              formularioMudou={
                JSON.stringify(normalizarEntrada(entrada)) !==
                JSON.stringify(normalizarEntrada(entradaDaResposta))
              }
            />
          ) : !erro ? (
            <Card variant="bordered" className="text-sm text-muted">
              Preencha o caso ao lado. A resposta traz o modo de emissão,
              potência, dwell time, spacing, SmartStack, varredura e área, cada
              um com a faixa aceitável, o motivo e a fonte na base de
              conhecimento.
            </Card>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/*  Histórico                                                      */}
      {/* -------------------------------------------------------------- */}
      <Historico
        recentes={historico}
        selecionada={resposta?.id ?? null}
        onAbrir={abrirDoHistorico}
        buscaPorMedico={!semVinculo}
      />
    </div>
  );
}

// ============================================================================
//  Resultado
// ============================================================================
function BadgeViabilidade({ v }: { v: Recomendacao["viabilidade"] }) {
  const variant =
    v === "indicado" ? "success" : v === "nao_recomendado" ? "danger" : "warning";
  return <Badge variant={variant}>{VIABILIDADE_LABEL[v]}</Badge>;
}

function Resultado({
  resposta,
  entrada,
  fontes,
  carregando,
  onRefazer,
  formularioMudou,
  locacoes,
  semVinculo,
  onAtualizada,
  entradaAtual,
  onResponderFoto,
}: {
  resposta: RespostaConsulta;
  entrada: EntradaConsulta;
  fontes: Record<string, FonteInfo>;
  carregando: boolean;
  onRefazer: () => void;
  formularioMudou: boolean;
  locacoes: VinculoLocacao[];
  semVinculo: boolean;
  onAtualizada: (c: ConsultaGravada) => void;
  entradaAtual: EntradaConsulta;
  onResponderFoto: (d: DivergenciaFoto, confere: boolean) => void;
}) {
  const r = resposta.recomendacao;
  const p = r.parametros;
  // Os desenhos variam um parâmetro por vez e mantêm os outros no recomendado.
  const base: PerfilBase | null = p
    ? {
        potencia: p.potencia_w.valor,
        dwell: p.dwell_time_us.valor,
        stack: Math.round(p.smartstack.valor),
        modo: p.modo_emissao.valor,
      }
    : null;

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeViabilidade v={r.viabilidade} />
          <Badge variant="neutral">Confiança {r.confianca}</Badge>
          {resposta.reaproveitada ? (
            <Badge variant="info">Consulta gravada · sem custo</Badge>
          ) : resposta.model ? (
            <span className="text-xs text-muted">
              {resposta.model} · US$ {resposta.costUsd.toFixed(3)}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          {INDICACAO_LABEL[entrada.indicacao]} · {REGIAO_LABEL[entrada.regiao]} ·
          fototipo {entrada.fototipo} · {entrada.sessao === "primeira" ? "1ª sessão" : "sessão subsequente"}
        </p>
        <p className="text-ink">{r.resumo}</p>
        {!semVinculo ? (
          <VinculoDaConsulta
            key={resposta.id ?? "nova"}
            resposta={resposta}
            locacoes={locacoes}
            onAtualizada={onAtualizada}
          />
        ) : null}
        {formularioMudou ? (
          <p className="text-xs text-accent">
            O formulário mudou desde esta resposta. Clique em “Recomendar
            parâmetros” para consultar o caso novo.
          </p>
        ) : null}
      </Card>

      {resposta.verificacoes.length > 0 ? (
        <Alert variant="danger" title="Verificação automática do sistema">
          <ul className="list-disc list-inside space-y-1">
            {resposta.verificacoes.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {r.alertas.length > 0 && !resposta.bloqueadoPor ? (
        <Alert variant="warning" title="Atenção neste caso">
          <ul className="list-disc list-inside space-y-1">
            {r.alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {r.perguntas_pendentes.length > 0 ? (
        <Alert variant="info" title="Respostas que mudariam a recomendação">
          <ul className="list-disc list-inside space-y-1">
            {r.perguntas_pendentes.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Se souber a resposta, acrescente nas observações ou no formulário e
            consulte de novo.
          </p>
        </Alert>
      ) : null}

      {r.analise_foto ? (
        <AnaliseFotoCard
          analise={r.analise_foto}
          entrada={entradaAtual}
          onResponder={onResponderFoto}
          ocupado={carregando}
        />
      ) : null}

      {p ? (
        <Card variant="bordered" className="p-0">
          <h3 className="font-display text-xl text-ink tracking-tight px-6 pt-5 pb-3">
            Parâmetros
          </h3>
          <dl className="divide-y divide-line border-t border-line">
            <LinhaTexto
              nome="Modo de emissão"
              valor={p.modo_emissao.valor}
              motivo={p.modo_emissao.motivo}
              ilustracao={<ComparaModo base={base!} />}
            />
            <LinhaNumero
              nome="Potência"
              unidade="W"
              param={p.potencia_w}
              ilustracao={
                <ComparaPotencia
                  base={base!}
                  faixa={{ min: p.potencia_w.faixa_min, max: p.potencia_w.faixa_max }}
                />
              }
            />
            <LinhaNumero
              nome="Dwell time"
              unidade="µs"
              param={p.dwell_time_us}
              ilustracao={
                <ComparaDwell
                  base={base!}
                  faixa={{ min: p.dwell_time_us.faixa_min, max: p.dwell_time_us.faixa_max }}
                />
              }
            />
            <LinhaNumero
              nome="Spacing (DOT pitch)"
              unidade="µm"
              param={p.spacing_um}
              ilustracao={
                <ComparaSpacing
                  valor={p.spacing_um.valor}
                  faixa={{ min: p.spacing_um.faixa_min, max: p.spacing_um.faixa_max }}
                />
              }
            />
            <LinhaNumero
              nome="SmartStack"
              unidade=""
              param={p.smartstack}
              ilustracao={<ComparaStack base={base!} />}
            />
            <LinhaTexto nome="Varredura" valor={p.modo_varredura.valor} motivo={p.modo_varredura.motivo} />
            <LinhaTexto nome="Forma da área" valor={p.forma_area.valor} motivo={p.forma_area.motivo} />
            <LinhaTexto
              nome="Passadas"
              valor={String(p.passadas.valor)}
              motivo={p.passadas.motivo}
            />
          </dl>
        </Card>
      ) : null}

      {!semVinculo ? (
        <ParametrosRealizadosCard
          key={resposta.id ?? "nova"}
          resposta={resposta}
          onAtualizada={onAtualizada}
        />
      ) : null}

      {!resposta.bloqueadoPor ? (
        <Card variant="bordered" className="space-y-4 text-sm">
          <Bloco titulo="Protocolo">
            <ul className="space-y-1">
              <li><b>Sessões:</b> {r.protocolo.sessoes}</li>
              <li><b>Intervalo:</b> {r.protocolo.intervalo}</li>
              <li><b>Teste prévio:</b> {r.protocolo.teste_previo}</li>
              <li><b>Na próxima sessão:</b> {r.protocolo.como_progredir}</li>
            </ul>
          </Bloco>
          <Lista titulo="Antes da sessão" itens={r.cuidados_pre} />
          <Lista titulo="Depois da sessão" itens={r.cuidados_pos} />
          <Lista titulo="Alternativas e combinações" itens={r.alternativas} />
        </Card>
      ) : null}

      <Card variant="bordered" className="space-y-2 text-sm">
        <h3 className="font-display text-lg text-ink tracking-tight">
          De onde veio
        </h3>
        <p className="text-muted">{r.motivo_confianca}</p>
        <ul className="space-y-1">
          {r.fontes.map((id) => {
            const f = fontes[id];
            if (!f) return null;
            return (
              <li key={id} className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{f.origem}</Badge>
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-ink hover:text-accent"
                  >
                    {f.titulo}
                  </a>
                ) : (
                  <span className="text-ink">{f.titulo}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {resposta.reaproveitada && !resposta.bloqueadoPor ? (
        <Button variant="secondary" size="sm" loading={carregando} onClick={onRefazer}>
          Perguntar de novo à IA
        </Button>
      ) : null}
    </div>
  );
}

function LinhaNumero({
  nome,
  unidade,
  param,
  ilustracao,
}: {
  nome: string;
  unidade: string;
  param: ParametroNumerico;
  ilustracao?: React.ReactNode;
}) {
  const u = unidade ? ` ${unidade}` : "";
  return (
    <div className="px-6 py-3 grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{nome}</dt>
      <dd>
        <p className="text-ink">
          <span className="font-display text-xl">
            {param.valor}
            {u}
          </span>
          <span className="text-xs text-muted ml-2">
            faixa {param.faixa_min}–{param.faixa_max}
            {u}
          </span>
        </p>
        <p className="text-sm text-ink/80 mt-0.5">{param.motivo}</p>
        {ilustracao ? <VerNaPele>{ilustracao}</VerNaPele> : null}
      </dd>
    </div>
  );
}

function LinhaTexto({
  nome,
  valor,
  motivo,
  ilustracao,
}: {
  nome: string;
  valor: string;
  motivo: string;
  ilustracao?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-3 grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{nome}</dt>
      <dd>
        <p className="font-display text-xl text-ink">{valor}</p>
        <p className="text-sm text-ink/80 mt-0.5">{motivo}</p>
        {ilustracao ? <VerNaPele>{ilustracao}</VerNaPele> : null}
      </dd>
    </div>
  );
}

/**
 * Fechado por padrão: com cinco desenhos abertos, a lista de parâmetros vira
 * uma rolagem longa no celular, e o valor é o que se consulta primeiro.
 */
function VerNaPele({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="mt-1.5 text-xs font-medium text-accent hover:text-ink underline"
      >
        {aberto ? "Esconder desenho" : "Ver na pele"}
      </button>
      {aberto ? children : null}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg text-ink tracking-tight mb-1">{titulo}</h3>
      <div className="text-ink">{children}</div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <Bloco titulo={titulo}>
      <ul className="list-disc list-inside space-y-1">
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Bloco>
  );
}

// ============================================================================
//  Histórico, com busca por médico
// ============================================================================
function Historico({
  recentes,
  selecionada,
  onAbrir,
  buscaPorMedico,
}: {
  recentes: ConsultaGravada[];
  selecionada: string | null;
  onAbrir: (c: ConsultaGravada) => void;
  buscaPorMedico: boolean;
}) {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<{ termo: string; consultas: ConsultaGravada[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    const t = termo.trim();
    if (!t) return limpar();
    setBuscando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/laser/consultas?medico=${encodeURIComponent(t)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.message ?? json.error ?? "Falha ao buscar.");
        return;
      }
      setResultado({ termo: t, consultas: json.consultas as ConsultaGravada[] });
    } catch {
      setErro("Falha de rede ao buscar.");
    } finally {
      setBuscando(false);
    }
  }

  function limpar() {
    setTermo("");
    setResultado(null);
    setErro(null);
  }

  const lista = resultado?.consultas ?? recentes;
  if (!buscaPorMedico && recentes.length === 0) return null;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <h2 className="font-display text-xl text-ink tracking-tight">
          {resultado ? `Consultas de “${resultado.termo}”` : "Consultas anteriores"}
        </h2>
        {buscaPorMedico ? (
          <form
            className="flex gap-2 w-full sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              buscar();
            }}
          >
            <input
              className="h-9 px-3 bg-paper border border-line text-ink text-sm focus:outline-none focus:border-ink flex-1 sm:w-56"
              placeholder="Buscar por médico"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
            <Button size="sm" type="submit" loading={buscando}>
              Buscar
            </Button>
            {resultado ? (
              <Button size="sm" variant="ghost" type="button" onClick={limpar}>
                Limpar
              </Button>
            ) : null}
          </form>
        ) : null}
      </div>

      {erro ? <Alert variant="danger">{erro}</Alert> : null}

      {lista.length === 0 ? (
        <p className="text-sm text-muted">
          {resultado
            ? "Nenhuma consulta ligada a uma locação com esse nome."
            : "Nenhuma consulta ainda."}
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper">
          {lista.map((c) => (
            <li key={c.resposta.id ?? c.createdAt}>
              <button
                type="button"
                onClick={() => onAbrir(c)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-line/50 transition-colors text-sm space-y-1",
                  selecionada === c.resposta.id && "bg-line/50",
                )}
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {c.resposta.locacao ? (
                    <span className="text-ink font-medium">
                      {rotuloLocacao(c.resposta.locacao)}
                    </span>
                  ) : (
                    <span className="text-muted tabular-nums">
                      {DATA_HORA.format(new Date(c.createdAt))}
                    </span>
                  )}
                  <BadgeViabilidade v={c.resposta.recomendacao.viabilidade} />
                  {c.resposta.realizado ? (
                    <Badge variant="success">Realizado registrado</Badge>
                  ) : null}
                </span>
                <span className="block text-muted">
                  {INDICACAO_LABEL[c.entrada.indicacao]} · {REGIAO_LABEL[c.entrada.regiao]} ·
                  fototipo {c.entrada.fototipo}
                  {c.resposta.realizado ? ` · ${resumoRealizado(c)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function resumoRealizado(c: ConsultaGravada): string {
  const r = c.resposta.realizado;
  if (!r) return "";
  return [
    r.modo,
    r.potencia != null ? `${r.potencia} W` : null,
    r.dwell != null ? `${r.dwell} µs` : null,
    r.spacing != null ? `${r.spacing} µm` : null,
    r.stack != null ? `stack ${r.stack}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
