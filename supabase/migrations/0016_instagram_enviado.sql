-- ============================================================================
--  Lux Derma — marcar que a mensagem já saiu pelo Instagram
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE ISTO PRECISA SER MANUAL
--
--  Mensagem enviada pelo WhatsApp VOLTA sozinha: a sincronização traz as
--  mensagens de saída e o `last_outbound_at` do lead se atualiza sem ninguém
--  fazer nada. O painel sabe.
--
--  Pelo Instagram não volta nada, nunca. Não há API, não há sincronização, e o
--  direct é aberto fora do sistema. O dono é a única fonte possível dessa
--  informação — e sem ela, um lead que já recebeu mensagem é indistinguível de
--  um que nunca recebeu.
--
--  POR QUE UM CAMPO, E NÃO UMA LINHA EM `wa_outbound`
--
--  A `wa_outbound` existe e registra saída, mas ela guarda o TEXTO (body é not
--  null) e serve de trilha do que o painel produziu. A marcação aqui é outra
--  coisa: o dono pode ter escrito a mensagem dentro do próprio Instagram, sem
--  passar pelo rascunho. Forçar um texto para poder marcar seria inventar dado.
--
--  A pergunta que ele faz é "já mandei ou não", e a resposta é uma data.
--
--  DATA, E NÃO BOOLEANO
--
--  Nulo = não mandei. Preenchido = mandei, e faz tanto tempo. "Mandei há três
--  meses e não respondeu" é uma situação diferente de "mandei ontem", e só a
--  data distingue as duas — inclusive para a IA, que passa a ler isso no
--  contexto pelo mesmo motivo que já lê o `last_outbound_at`.
--
--  Mandar de novo sobrescreve: a coluna guarda o ÚLTIMO envio, que é o que
--  importa para decidir o próximo passo.
-- ============================================================================

alter table public.wa_leads
  add column if not exists instagram_sent_at timestamptz;

comment on column public.wa_leads.instagram_sent_at is
  'Quando o dono marcou que mandou mensagem pelo direct do Instagram. Nulo = não mandou. É manual porque envio pelo Instagram não volta em nenhuma sincronização.';

-- A caixa de entrada carrega o lead inteiro, então não há consulta por esta
-- coluna a indexar. O índice existe para o dia em que houver filtro por ela.
create index if not exists wa_leads_instagram_sent_idx
  on public.wa_leads (instagram_sent_at desc)
  where instagram_sent_at is not null;
