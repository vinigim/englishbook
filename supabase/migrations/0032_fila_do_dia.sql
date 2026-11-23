-- ============================================================================
--  Lux Derma — Fila do dia
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  Todo dia às 6h (cron da Vercel, `vercel.json`) o Radar monta o trabalho de
--  leads do dia: quem responder, quentes, quem retomar pela cadência, primeiros
--  contatos e ex-clientes. A lista é GUARDADA aqui para ficar parada o dia
--  inteiro — se fosse recalculada a cada visita, cada lead atendido daria lugar
--  ao próximo e o "3 de 15 feitos" nunca chegaria ao fim.
--
--  O QUE GUARDA
--
--  Uma linha por dia (data de São Paulo). `secoes` tem só ids de lead e a etapa
--  da cadência; nome, rascunho e o "feito" vêm do lead ao vivo, na tela.
--  `analisados` e `custo_usd`: quanto a análise das 6h gastou para deixar os
--  rascunhos prontos.
--
--  RLS de lead (lux_staff): a fila aponta para leads com conversa de WhatsApp.
-- ============================================================================

create table if not exists public.fila_do_dia (
  dia          date primary key,
  gerada_em    timestamptz not null default now(),
  secoes       jsonb not null,
  locacoes_7d  integer not null default 0,
  analisados   integer not null default 0,
  custo_usd    numeric(10,6) not null default 0,
  origem       text not null default 'cron'
               check (origem in ('cron', 'manual'))
);

comment on table public.fila_do_dia is
  'Fila de trabalho de leads de cada dia, montada às 6h. Ver src/app/derma-lux/fila-do-dia.ts.';

alter table public.fila_do_dia enable row level security;

drop policy if exists "fila_do_dia_staff" on public.fila_do_dia;
create policy "fila_do_dia_staff"
  on public.fila_do_dia
  for all
  to authenticated
  using (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));
