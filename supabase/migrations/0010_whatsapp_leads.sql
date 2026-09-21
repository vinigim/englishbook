-- ============================================================================
--  Lux Derma — Radar de Leads do WhatsApp
--  ----------------------------------------------------------------------------
--  Guarda as conversas do WhatsApp da empresa, agrupadas por lead (médico ou
--  clínica), e as análises geradas por IA que recomendam a próxima mensagem.
--
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  DEPOIS DE RODAR: insira o seu usuário na tabela lux_staff, senão o painel
--  abre vazio. Veja o bloco comentado no final do arquivo.
-- ============================================================================

-- ============================================================================
--  Equipe autorizada
--  ----------------------------------------------------------------------------
--  ATENÇÃO: este projeto do Supabase é compartilhado com o EnglishBook, que tem
--  cadastro PÚBLICO em /signup. Por isso as tabelas abaixo NÃO podem usar o
--  padrão "qualquer autenticado" do derma-lux — as conversas contêm dados de
--  paciente (LGPD art. 11, dado sensível de saúde). O acesso é por allowlist.
-- ============================================================================
create table if not exists public.lux_staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

-- ---------- Leads (um por número de telefone) ----------
create table if not exists public.wa_leads (
  id                uuid primary key default gen_random_uuid(),

  -- phone_key é a chave de deduplicação. O WhatsApp devolve números antigos SEM
  -- o 9º dígito (553588887777) enquanto a planilha quase sempre tem ele
  -- (5535988887777). Sem essa normalização o mesmo médico viraria dois leads.
  phone_key         text not null unique,
  phone_e164        text not null,
  wa_jid            text,

  display_name      text,   -- nome que veio do WhatsApp (pushName)
  sheet_name        text,   -- nome como veio da planilha (nunca sobrescreve o acima)
  clinic_name       text,
  specialty         text,
  city              text,
  uf                text,

  lead_kind         text not null default 'desconhecido'
                    check (lead_kind in ('medico', 'clinica', 'desconhecido', 'outro')),
  source            text not null default 'whatsapp'
                    check (source in ('whatsapp', 'planilha', 'manual', 'ambos')),
  status            text not null default 'novo'
                    check (status in ('novo', 'em_conversa', 'cliente', 'inativo', 'descartado')),

  is_group          boolean not null default false,
  notes             text,
  extra             jsonb not null default '{}'::jsonb,

  first_seen_at     timestamptz,
  last_message_at   timestamptz,
  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,

  needs_analysis    boolean not null default true,
  snoozed_until     timestamptz,
  archived          boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists wa_leads_last_message_idx
  on public.wa_leads (last_message_at desc nulls last);
create index if not exists wa_leads_needs_analysis_idx
  on public.wa_leads (needs_analysis) where needs_analysis;
create index if not exists wa_leads_status_idx on public.wa_leads (status);

-- ---------- Mensagens ----------
create table if not exists public.wa_messages (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.wa_leads(id) on delete cascade,

  provider             text not null,
  provider_message_id  text not null,
  chat_id              text,

  direction            text not null check (direction in ('in', 'out')),
  message_type         text not null default 'text'
                       check (message_type in ('text', 'image', 'audio', 'video',
                                               'document', 'sticker', 'location',
                                               'contact', 'other')),
  body                 text,
  caption              text,

  -- Mídia NÃO é baixada: guardamos só a referência. Foto de paciente dentro do
  -- Storage é um problema de LGPD que este projeto não precisa ter.
  media_url            text,
  media_mime           text,

  sent_at              timestamptz not null,
  raw                  jsonb,
  created_at           timestamptz not null default now(),

  -- Idempotência do webhook E do backfill: reprocessar nunca duplica.
  unique (provider, provider_message_id)
);

create index if not exists wa_messages_lead_time_idx
  on public.wa_messages (lead_id, sent_at desc);

-- ---------- Análises da IA (versionadas, nunca sobrescritas) ----------
create table if not exists public.wa_lead_analyses (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.wa_leads(id) on delete cascade,
  version             integer not null,

  -- Cache: se a conversa não mudou, o hash é o mesmo e não pagamos de novo.
  content_hash        text not null,
  prompt_version      integer not null default 1,

  stage               text not null check (stage in (
                        'novo', 'qualificando', 'proposta_enviada', 'negociacao',
                        'agendado', 'cliente_ativo', 'cliente_inativo', 'perdido')),
  temperature         text not null check (temperature in ('quente', 'morno', 'frio')),
  intent              text,
  summary             text,
  objections          text[] not null default '{}',
  equipment_interest  text[] not null default '{}',
  equip_id            uuid references public.equipment(id) on delete set null,
  specialty           text,
  days_since_last_contact integer,
  is_existing_customer    boolean,

  recommended_action  text check (recommended_action in (
                        'primeiro_contato', 'qualificacao', 'resposta_preco',
                        'envio_proposta', 'objecao_preco', 'objecao_confianca',
                        'objecao_timing', 'oferta_disponibilidade',
                        'confirmacao_agendamento', 'preparo_pre_locacao',
                        'pos_locacao_feedback', 'reativacao_inativo',
                        'upsell_equipamento', 'oferta_recorrencia',
                        'pedido_indicacao', 'aguardar', 'descartar')),
  draft_message       text,
  rationale           text,
  confidence          numeric(3,2),
  priority_score      integer,

  -- Auditoria de custo: permite saber exatamente quanto a IA gastou.
  model               text not null,
  input_tokens        integer,
  output_tokens       integer,
  cache_read_tokens   integer,
  cost_usd            numeric(10,6),
  raw_output          jsonb,

  created_at          timestamptz not null default now(),

  unique (lead_id, version),
  unique (lead_id, content_hash, model)
);

create index if not exists wa_lead_analyses_latest_idx
  on public.wa_lead_analyses (lead_id, created_at desc);

-- ---------- Idempotência do webhook (mesmo padrão do Stripe) ----------
create table if not exists public.wa_webhook_events (
  id           text primary key,
  provider     text not null,
  event_type   text,
  payload      jsonb,
  received_at  timestamptz not null default now()
);

-- ---------- Estado do backfill (retomável) ----------
create table if not exists public.wa_sync_state (
  chat_id            text primary key,
  lead_id            uuid references public.wa_leads(id) on delete cascade,
  oldest_fetched_at  timestamptz,
  newest_fetched_at  timestamptz,
  done               boolean not null default false,
  updated_at         timestamptz not null default now()
);

-- ---------- Envios (fora da v1, mas o schema já prevê) ----------
create table if not exists public.wa_outbound (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.wa_leads(id) on delete cascade,
  analysis_id          uuid references public.wa_lead_analyses(id) on delete set null,
  body                 text not null,
  channel              text not null default 'manual'
                       check (channel in ('manual', 'api')),
  status               text not null default 'rascunho'
                       check (status in ('rascunho', 'copiado', 'enviado', 'falhou')),
  provider_message_id  text,
  sent_at              timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists wa_outbound_lead_idx on public.wa_outbound (lead_id, created_at desc);

-- ---------- Ligação com os aluguéis já existentes ----------
-- Dá à IA o contexto de "já é cliente, alugou o equipamento X em tal data".
alter table public.rentals add column if not exists wa_lead_id uuid
  references public.wa_leads(id) on delete set null;
create index if not exists rentals_wa_lead_idx on public.rentals (wa_lead_id);

-- ---------- updated_at automático ----------
create or replace function public.tg_wa_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tg_wa_leads_updated_at on public.wa_leads;
create trigger tg_wa_leads_updated_at before update on public.wa_leads
  for each row execute function public.tg_wa_set_updated_at();

drop trigger if exists tg_wa_sync_state_updated_at on public.wa_sync_state;
create trigger tg_wa_sync_state_updated_at before update on public.wa_sync_state
  for each row execute function public.tg_wa_set_updated_at();

-- ============================================================================
--  Segurança (RLS) — restrito à equipe da Lux Derma
--  ----------------------------------------------------------------------------
--  NÃO use "to authenticated using (true)" aqui, como fazem as tabelas do
--  derma-lux. Qualquer pessoa consegue criar conta em /signup (EnglishBook), e
--  isso daria a ela acesso às conversas com dados de paciente.
-- ============================================================================
alter table public.lux_staff         enable row level security;
alter table public.wa_leads          enable row level security;
alter table public.wa_messages       enable row level security;
alter table public.wa_lead_analyses  enable row level security;
alter table public.wa_webhook_events enable row level security;
alter table public.wa_sync_state     enable row level security;
alter table public.wa_outbound       enable row level security;

-- Cada pessoa só enxerga a própria linha da allowlist.
drop policy if exists "lux_staff_self_read" on public.lux_staff;
create policy "lux_staff_self_read"
  on public.lux_staff for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "wa_leads_staff" on public.wa_leads;
create policy "wa_leads_staff"
  on public.wa_leads for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));

drop policy if exists "wa_messages_staff" on public.wa_messages;
create policy "wa_messages_staff"
  on public.wa_messages for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));

drop policy if exists "wa_lead_analyses_staff" on public.wa_lead_analyses;
create policy "wa_lead_analyses_staff"
  on public.wa_lead_analyses for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));

drop policy if exists "wa_sync_state_staff" on public.wa_sync_state;
create policy "wa_sync_state_staff"
  on public.wa_sync_state for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));

drop policy if exists "wa_outbound_staff" on public.wa_outbound;
create policy "wa_outbound_staff"
  on public.wa_outbound for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));

-- wa_webhook_events fica SEM policy de propósito: só a service role escreve lá,
-- e a service role ignora RLS. Nenhum usuário logado precisa ler essa tabela.

-- ============================================================================
--  Tempo real (o painel atualiza sozinho quando chega mensagem)
-- ============================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.wa_leads;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.wa_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.wa_lead_analyses;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
--  PASSO MANUAL OBRIGATÓRIO
--  ----------------------------------------------------------------------------
--  Libere o seu acesso ao painel (troque pelo e-mail que você usa no login):
--
--    insert into public.lux_staff (user_id, email)
--    select id, email from auth.users where email = 'seu-email@exemplo.com'
--    on conflict (user_id) do nothing;
--
--  Confira: select * from public.lux_staff;
-- ============================================================================

-- ============================================================================
--  CONCILIAÇÃO (rode só DEPOIS do primeiro backfill/importação)
--  ----------------------------------------------------------------------------
--  Liga os aluguéis antigos aos leads, comparando os 8 últimos dígitos do
--  telefone — o que ignora diferenças de DDI, formatação e do 9º dígito.
--
--    update public.rentals r
--       set wa_lead_id = l.id
--      from public.wa_leads l
--     where r.wa_lead_id is null
--       and r.phone is not null
--       and right(regexp_replace(r.phone, '\D', '', 'g'), 8) = right(l.phone_key, 8);
-- ============================================================================
