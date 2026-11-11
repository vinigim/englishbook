/**
 * Roteiros de manuseio do laser (SmartXide Punto) em campo.
 *
 * Só texto: para criar uma situação nova, acrescente um item em
 * PROCEDIMENTOS. Os ids dos passos entram no progresso salvo no navegador,
 * então renomear um id só faz aquele passo voltar a aparecer desmarcado.
 */

export type Passo = {
  id: string;
  texto: string;
  /** Detalhe curto mostrado abaixo do passo. */
  nota?: string;
  /** Passo de segurança: destacado e com aviso. */
  seguranca?: boolean;
};

export type Etapa = { titulo: string; passos: Passo[] };

export type Procedimento = {
  id: string;
  titulo: string;
  resumo: string;
  etapas: Etapa[];
};

export const PROCEDIMENTOS: Procedimento[] = [
  {
    id: "instalacao",
    titulo: "Instalação",
    resumo: "Montar o laser na clínica do médico que alugou.",
    etapas: [
      {
        titulo: "Antes de abrir o case",
        passos: [
          {
            id: "tomada",
            texto: "Verificar se a tomada é de 20 A e 220 V",
            nota: "Sem 20 A / 220 V, não ligue o laser.",
            seguranca: true,
          },
          {
            id: "extensao",
            texto: "Verificar se vamos usar a extensão para a tomada",
          },
        ],
      },
      {
        titulo: "Cabos na traseira",
        passos: [
          { id: "energia-laser", texto: "Plugar o fio de energia no laser" },
          { id: "energia-tomada", texto: "Plugar o fio de energia na tomada" },
          {
            id: "scanner-traseira",
            texto: "Plugar o cabo do scanner dermatológico na traseira do laser",
          },
          { id: "ar-traseira", texto: "Plugar o cabo de ar na traseira do laser" },
        ],
      },
      {
        titulo: "Braço e ponteira",
        passos: [
          {
            id: "braco-suporte",
            texto: "Retirar o braço do laser do suporte laranja",
          },
          {
            id: "trava-1",
            texto: "Travar o braço e verificar se a trava está realmente atuando",
            seguranca: true,
          },
          {
            id: "escolha-ponteira",
            texto:
              "Verificar se vamos usar o scanner dermatológico ou a ponteira cirúrgica",
          },
          { id: "protetor-lente", texto: "Retirar o protetor de lente" },
          {
            id: "ponteira",
            texto: "Colocar a ponteira correta",
            nota: "Plugar o cabo de ar e o do scanner dermatológico na ponteira.",
          },
          {
            id: "trava-2",
            texto: "Testar a trava de segurança novamente",
            seguranca: true,
          },
          {
            id: "descanso",
            texto: "Encaixar o braço da ponteira no descanso",
          },
        ],
      },
      {
        titulo: "Ligar",
        passos: [
          { id: "chave", texto: "Ligar a chave de energia" },
          { id: "power-on", texto: "Apertar o botão Power On" },
          { id: "pedal", texto: "Colocar o pedal no chão" },
        ],
      },
    ],
  },
  {
    id: "desinstalacao",
    titulo: "Desinstalação",
    resumo: "Desmontar e guardar o laser para o transporte.",
    etapas: [
      {
        titulo: "Desligar",
        passos: [
          { id: "power-off", texto: "Apertar o botão Power Off" },
          { id: "chave", texto: "Desligar a chave de energia" },
        ],
      },
      {
        titulo: "Ponteira",
        passos: [
          {
            id: "scanner-ponteira",
            texto: "Retirar o cabo do scanner dermatológico da ponteira",
          },
          { id: "ar-ponteira", texto: "Retirar o cabo de ar da ponteira" },
          { id: "ponteira", texto: "Retirar a ponteira" },
          { id: "ponteira-mala", texto: "Guardar a ponteira na mala" },
          {
            id: "protetor-lente",
            texto: "Colocar o protetor de lente",
            seguranca: true,
          },
        ],
      },
      {
        titulo: "Braço",
        passos: [
          { id: "trava", texto: "Retirar a trava do braço" },
          {
            id: "braco-suporte",
            texto: "Recolher o braço do laser no suporte laranja",
          },
        ],
      },
      {
        titulo: "Cabos na traseira",
        passos: [
          {
            id: "scanner-traseira",
            texto: "Retirar o cabo do scanner da traseira do laser",
          },
          {
            id: "ar-traseira",
            texto: "Retirar o cabo de ar da traseira do laser",
          },
          {
            id: "cabos-seguros",
            texto: "Encaixar os dois cabos da traseira em lugar seguro",
            nota: "Evita dano no transformador durante o transporte.",
            seguranca: true,
          },
          {
            id: "pedal",
            texto: "Encaixar o pedal no suporte na traseira do laser",
          },
          {
            id: "energia-laser",
            texto: "Retirar o cabo de energia da traseira do laser",
          },
        ],
      },
      {
        titulo: "Guardar no case",
        passos: [
          { id: "energia-case", texto: "Colocar o cabo de energia no case" },
          { id: "laser-case", texto: "Colocar o laser no case" },
          { id: "conferir-maleta", texto: "Conferir os componentes da maleta" },
          { id: "travar-maleta", texto: "Travar a maleta para o transporte" },
        ],
      },
    ],
  },
];
