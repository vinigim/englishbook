-- ============================================================
--  Derma Lux — Banco de dados (Supabase / PostgreSQL)
--  ------------------------------------------------------------
--  Como usar:
--    1. No painel do Supabase, abra "SQL Editor"
--    2. Cole TODO este arquivo e clique em "Run"
--  Isso cria as tabelas, a segurança (RLS) e ativa o tempo real.
-- ============================================================

-- ---------- Tabela de equipamentos (lasers) ----------
create table if not exists public.equipment (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  use         text,
  color       text default '#8b7bff',
  created_at  timestamptz not null default now()
);

-- ---------- Tabela de aluguéis ----------
create table if not exists public.rentals (
  id          uuid primary key default gen_random_uuid(),
  client      text not null,
  address     text not null,
  phone       text,
  equip_id    uuid references public.equipment(id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  price       numeric(10,2),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists rentals_date_idx  on public.rentals (date);
create index if not exists rentals_equip_idx on public.rentals (equip_id);

-- ============================================================
--  Segurança (Row Level Security)
--  Dados compartilhados da empresa: qualquer usuário AUTENTICADO
--  (você e sua equipe) pode ver e editar tudo. Quem não está
--  logado não acessa nada.
-- ============================================================
alter table public.equipment enable row level security;
alter table public.rentals   enable row level security;

drop policy if exists "equipment_all_authenticated" on public.equipment;
create policy "equipment_all_authenticated"
  on public.equipment for all
  to authenticated
  using (true) with check (true);

drop policy if exists "rentals_all_authenticated" on public.rentals;
create policy "rentals_all_authenticated"
  on public.rentals for all
  to authenticated
  using (true) with check (true);

-- ============================================================
--  Tempo real (sincronização automática entre aparelhos)
-- ============================================================
alter publication supabase_realtime add table public.equipment;
alter publication supabase_realtime add table public.rentals;
