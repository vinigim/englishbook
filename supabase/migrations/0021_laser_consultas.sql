-- ============================================================================
--  Lux Derma — Consultas de parâmetros do laser de CO2
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  Cada vez que alguém pede à IA os parâmetros do SmartXide Punto para um
--  caso, a consulta fica gravada aqui: o que foi informado, o que a IA
--  recomendou, os avisos que o código acrescentou e quanto custou.
--
--  Serve a três coisas:
--  - histórico na tela, para rever uma recomendação sem pagar de novo;
--  - reaproveitamento: o mesmo caso (mesmo content_hash) devolve a resposta
--    gravada sem chamar a API;
--  - auditoria do gasto, como em wa_lead_analyses.
--
--  Sem esta tabela a tela funciona, mas não grava nem reaproveita nada.
-- ============================================================================

create table if not exists public.laser_consultas (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,

  -- O formulário inteiro, como foi enviado. Não tem nome de paciente, mas as
  -- observações são texto livre e podem ter dado de saúde: por isso a RLS
  -- abaixo é a allowlist, e não "qualquer autenticado".
  entrada             jsonb not null,
  content_hash        text not null,
  kb_versao           integer not null,
  prompt_versao       integer not null,

  recomendacao        jsonb not null,
  verificacoes        jsonb not null default '[]'::jsonb,
  -- Preenchido quando uma contraindicação absoluta barrou a consulta antes da
  -- IA. Nesses casos model é nulo e o custo é zero.
  bloqueado_por       text,

  model               text,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  cost_usd            numeric(10,6) not null default 0
);

create index if not exists laser_consultas_hash_idx
  on public.laser_consultas (content_hash, created_at desc);
create index if not exists laser_consultas_created_idx
  on public.laser_consultas (created_at desc);

-- ============================================================================
--  Segurança (RLS) — restrito à equipe da Lux Derma, como as tabelas de leads
-- ============================================================================
alter table public.laser_consultas enable row level security;

drop policy if exists "laser_consultas_staff" on public.laser_consultas;
create policy "laser_consultas_staff"
  on public.laser_consultas for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));
