-- ============================================================================
--  Lux Derma — fechamento/bloqueio de agenda (independente de aluguel)
--  ----------------------------------------------------------------------------
--  period: 'full' (dia todo), 'morning' (manhã) ou 'afternoon' (tarde)
--  Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- ============================================================================

create table if not exists public.blocks (
  id          uuid primary key default gen_random_uuid(),
  equip_id    uuid references public.equipment(id) on delete cascade,
  date        date not null,
  period      text not null default 'full'
              check (period in ('full', 'morning', 'afternoon')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists blocks_date_idx  on public.blocks (date);
create index if not exists blocks_equip_idx on public.blocks (equip_id);

alter table public.blocks enable row level security;

drop policy if exists "blocks_all_authenticated" on public.blocks;
create policy "blocks_all_authenticated"
  on public.blocks for all
  to authenticated
  using (true) with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.blocks;
  exception when duplicate_object then null;
  end;
end $$;
