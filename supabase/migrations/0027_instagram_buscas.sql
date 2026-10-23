-- ============================================================================
--  Lux Derma — custo de cada busca de Instagram com IA
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  A busca de Instagram (ficha e lote) é a chamada de IA mais cara do Radar:
--  cada lead paga até 4 pesquisas na web, e os resultados entram como dezenas
--  de milhares de tokens. O custo só aparecia no log do servidor, então o
--  painel mostrava o gasto das análises e escondia o maior item da fatura.
--  Cada busca grava uma linha aqui, com ou sem candidato encontrado.
--
--  O lead pode ser apagado; a linha fica (lead_id vira nulo), porque o
--  dinheiro já foi gasto.
-- ============================================================================

create table if not exists public.wa_instagram_buscas (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid references public.wa_leads(id) on delete set null,
  modelo         text not null,
  -- 'lote' (painel da caixa) ou 'ficha' (botão na tela do lead).
  origem         text not null check (origem in ('lote', 'ficha')),
  pesquisas      integer not null default 0,
  candidatos     integer not null default 0,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd       numeric(10,6) not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists wa_instagram_buscas_lead_idx
  on public.wa_instagram_buscas (lead_id);
create index if not exists wa_instagram_buscas_data_idx
  on public.wa_instagram_buscas (created_at);

-- Mesma allowlist das outras tabelas do Radar.
alter table public.wa_instagram_buscas enable row level security;

drop policy if exists "wa_instagram_buscas_staff" on public.wa_instagram_buscas;
create policy "wa_instagram_buscas_staff"
  on public.wa_instagram_buscas for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));
