-- ============================================================================
--  Derma Lux — Agenda de aluguéis de laser (tabelas próprias, prefixo dl_)
--  ----------------------------------------------------------------------------
--  Independente do schema do EnglishBook. Pode rodar no mesmo projeto Supabase
--  ou num projeto separado só para o Derma Lux.
-- ============================================================================

-- ---------- Equipamentos (lasers) ----------
create table if not exists public.dl_equipment (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  use         text,
  color       text not null default '#d4421a',
  created_at  timestamptz not null default now()
);

-- ---------- Aluguéis ----------
create table if not exists public.dl_rentals (
  id          uuid primary key default gen_random_uuid(),
  client      text not null,
  address     text not null,
  phone       text,
  equip_id    uuid references public.dl_equipment(id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  price       numeric(10,2),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists dl_rentals_date_idx  on public.dl_rentals (date);
create index if not exists dl_rentals_equip_idx on public.dl_rentals (equip_id);

-- ============================================================================
--  Segurança (Row Level Security)
--  Dados compartilhados da empresa: qualquer usuário AUTENTICADO (você e a
--  equipe) pode ver e editar tudo. Quem não está logado não acessa nada.
-- ============================================================================
alter table public.dl_equipment enable row level security;
alter table public.dl_rentals   enable row level security;

drop policy if exists "dl_equipment_all_authenticated" on public.dl_equipment;
create policy "dl_equipment_all_authenticated"
  on public.dl_equipment for all
  to authenticated
  using (true) with check (true);

drop policy if exists "dl_rentals_all_authenticated" on public.dl_rentals;
create policy "dl_rentals_all_authenticated"
  on public.dl_rentals for all
  to authenticated
  using (true) with check (true);

-- ============================================================================
--  Tempo real (sincronização automática entre aparelhos)
-- ============================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.dl_equipment;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dl_rentals;
  exception when duplicate_object then null;
  end;
end $$;
