-- ============================================================================
--  Lux Derma — Acesso do óculos Even G2 aos parâmetros de uma locação
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  O médico que aluga o laser não tem login no painel. Para ver no óculos os
--  parâmetros das consultas ligadas à locação dele, ele digita um código de
--  oito caracteres no app do óculos. Uma linha por locação: gerar de novo
--  troca o código (o antigo para de funcionar), apagar a linha corta o acesso.
--
--  O código só abre a locação perto do dia dela (da véspera a dois dias
--  depois). Essa janela é conferida na rota pública, pela data da locação,
--  e não fica gravada aqui: se a locação mudar de dia, o acesso acompanha.
-- ============================================================================

create table if not exists public.laser_oculos_acessos (
  rental_id         uuid primary key references public.rentals(id) on delete cascade,
  -- Oito caracteres sem 0/O/1/I/L: é digitado no celular, às vezes ditado.
  codigo            text not null unique check (codigo ~ '^[A-HJKMNP-Z2-9]{8}$'),
  criado_em         timestamptz not null default now(),
  criado_por        uuid references auth.users(id) on delete set null,
  ultimo_acesso_em  timestamptz
);

-- ============================================================================
--  Segurança (RLS) — allowlist, como as consultas
--  ----------------------------------------------------------------------------
--  A rota pública do óculos (/api/oculos/<codigo>) lê com a service role, que
--  ignora o RLS. Ninguém de fora lê esta tabela diretamente.
-- ============================================================================
alter table public.laser_oculos_acessos enable row level security;

drop policy if exists "laser_oculos_acessos_staff" on public.laser_oculos_acessos;
create policy "laser_oculos_acessos_staff"
  on public.laser_oculos_acessos for all to authenticated
  using      (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()))
  with check (exists (select 1 from public.lux_staff s where s.user_id = auth.uid()));
