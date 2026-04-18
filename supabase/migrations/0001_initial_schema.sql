-- ============================================================================
-- ENGLISHBOOK - SCHEMA INICIAL
-- ============================================================================
-- Rode este arquivo no SQL Editor do Supabase (uma vez).
-- Ele cria as tabelas, índices, triggers e políticas RLS.
-- ============================================================================

-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- TIPOS
-- ============================================================================
create type user_role as enum ('aluno', 'professor');
create type slot_status as enum ('available', 'pending', 'booked', 'cancelled');
create type booking_status as enum ('pending_payment', 'confirmed', 'cancelled', 'completed');
create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

-- ============================================================================
-- PROFILES (estende auth.users do Supabase)
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  email text not null,
  avatar_url text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on profiles(role);

-- ============================================================================
-- TEACHERS (dados específicos do professor)
-- ============================================================================
create table teachers (
  id uuid primary key references profiles(id) on delete cascade,
  bio text,
  hourly_price_cents integer not null default 5000, -- R$ 50,00 em centavos
  active boolean not null default true,
  accepted_currencies text[] not null default array['BRL'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- STUDENTS (preferências do aluno)
-- ============================================================================
create table students (
  id uuid primary key references profiles(id) on delete cascade,
  daily_availability_email boolean not null default false,
  preferred_teacher_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- AVAILABILITY SLOTS (horários disponíveis dos professores)
-- ============================================================================
-- Um slot representa um horário específico (ex: terça 14h-15h em 22/04/2026).
-- Slots são criados pelo professor e consumidos no agendamento.
create table availability_slots (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status slot_status not null default 'available',
  -- Quem está segurando o slot (durante pending)
  held_by_student_id uuid references students(id) on delete set null,
  held_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_range check (end_at > start_at),
  constraint hold_requires_expiry check (
    (status = 'pending' and held_until is not null and held_by_student_id is not null)
    or status != 'pending'
  )
);

-- Garante que um professor não tenha dois slots no mesmo horário
create unique index uq_slot_teacher_start on availability_slots(teacher_id, start_at);
create index idx_slots_teacher_status on availability_slots(teacher_id, status, start_at);
create index idx_slots_status_start on availability_slots(status, start_at);
create index idx_slots_held_until on availability_slots(held_until) where status = 'pending';

-- ============================================================================
-- BOOKINGS (agendamentos)
-- ============================================================================
create table bookings (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete restrict,
  teacher_id uuid not null references teachers(id) on delete restrict,
  slot_id uuid not null references availability_slots(id) on delete restrict,
  status booking_status not null default 'pending_payment',
  price_cents integer not null,
  currency text not null default 'BRL',
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  cancelled_at timestamptz,
  cancelled_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_bookings_slot on bookings(slot_id) where status in ('pending_payment', 'confirmed', 'completed');
create index idx_bookings_student on bookings(student_id, scheduled_start_at desc);
create index idx_bookings_teacher on bookings(teacher_id, scheduled_start_at desc);
create index idx_bookings_status on bookings(status);

-- ============================================================================
-- PAYMENTS (pagamentos Stripe)
-- ============================================================================
create table payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  amount_cents integer not null,
  currency text not null default 'BRL',
  status payment_status not null default 'pending',
  stripe_event_ids text[] not null default '{}', -- idempotência de webhooks
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payments_booking on payments(booking_id);
create index idx_payments_status on payments(status);

-- ============================================================================
-- STRIPE WEBHOOK EVENTS (idempotência global)
-- ============================================================================
create table stripe_webhook_events (
  id text primary key, -- event.id do Stripe
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

-- ============================================================================
-- FUNÇÃO: updated_at automático
-- ============================================================================
create or replace function tg_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tg_profiles_updated_at before update on profiles
  for each row execute function tg_set_updated_at();
create trigger tg_teachers_updated_at before update on teachers
  for each row execute function tg_set_updated_at();
create trigger tg_slots_updated_at before update on availability_slots
  for each row execute function tg_set_updated_at();
create trigger tg_bookings_updated_at before update on bookings
  for each row execute function tg_set_updated_at();
create trigger tg_payments_updated_at before update on payments
  for each row execute function tg_set_updated_at();

-- ============================================================================
-- FUNÇÃO: criar profile ao signup
-- ============================================================================
-- O signup passa metadata { role, full_name } via supabase.auth.signUp
create or replace function handle_new_user() returns trigger as $$
declare
  user_role_value user_role;
  user_name text;
begin
  user_role_value := coalesce(new.raw_user_meta_data->>'role', 'aluno')::user_role;
  user_name := coalesce(new.raw_user_meta_data->>'full_name', new.email);

  insert into profiles (id, role, full_name, email)
  values (new.id, user_role_value, user_name, new.email);

  if user_role_value = 'professor' then
    insert into teachers (id) values (new.id);
  else
    insert into students (id) values (new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- FUNÇÃO ATÔMICA: reservar slot (hold)
-- ============================================================================
-- Essa função é o coração do sistema. Ela:
-- 1. Trava a linha do slot (FOR UPDATE)
-- 2. Valida que está available
-- 3. Marca como pending + cria booking pending_payment
-- 4. Retorna o booking_id
-- Se dois alunos clicarem ao mesmo tempo, apenas um vence.
create or replace function hold_slot(
  p_slot_id uuid,
  p_student_id uuid,
  p_hold_minutes integer default 15
) returns uuid as $$
declare
  v_slot availability_slots%rowtype;
  v_teacher teachers%rowtype;
  v_booking_id uuid;
begin
  -- Trava o slot
  select * into v_slot
  from availability_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'slot_not_found';
  end if;

  -- Se está pending mas expirou, libera
  if v_slot.status = 'pending' and v_slot.held_until < now() then
    update availability_slots
      set status = 'available', held_by_student_id = null, held_until = null
      where id = p_slot_id;
    v_slot.status := 'available';
  end if;

  if v_slot.status != 'available' then
    raise exception 'slot_not_available';
  end if;

  if v_slot.start_at < now() then
    raise exception 'slot_in_past';
  end if;

  -- Busca preço do professor
  select * into v_teacher from teachers where id = v_slot.teacher_id;

  if not v_teacher.active then
    raise exception 'teacher_inactive';
  end if;

  -- Marca slot como pending
  update availability_slots
    set status = 'pending',
        held_by_student_id = p_student_id,
        held_until = now() + (p_hold_minutes || ' minutes')::interval
    where id = p_slot_id;

  -- Cria booking
  insert into bookings (
    student_id, teacher_id, slot_id, status,
    price_cents, currency, scheduled_start_at, scheduled_end_at
  ) values (
    p_student_id, v_slot.teacher_id, p_slot_id, 'pending_payment',
    v_teacher.hourly_price_cents, 'BRL', v_slot.start_at, v_slot.end_at
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- FUNÇÃO: confirmar booking após pagamento
-- ============================================================================
create or replace function confirm_booking(p_booking_id uuid) returns void as $$
declare
  v_slot_id uuid;
begin
  select slot_id into v_slot_id from bookings where id = p_booking_id for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  update bookings set status = 'confirmed' where id = p_booking_id;
  update availability_slots
    set status = 'booked', held_by_student_id = null, held_until = null
    where id = v_slot_id;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- FUNÇÃO: cancelar booking e liberar slot
-- ============================================================================
create or replace function cancel_booking(
  p_booking_id uuid,
  p_reason text default null
) returns void as $$
declare
  v_slot_id uuid;
begin
  select slot_id into v_slot_id from bookings where id = p_booking_id for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  update bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason
    where id = p_booking_id;

  update availability_slots
    set status = 'available', held_by_student_id = null, held_until = null
    where id = v_slot_id;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- FUNÇÃO: liberar holds expirados (chamar via cron)
-- ============================================================================
create or replace function release_expired_holds() returns integer as $$
declare
  v_count integer;
begin
  with expired as (
    update availability_slots
      set status = 'available', held_by_student_id = null, held_until = null
      where status = 'pending' and held_until < now()
      returning id
  )
  select count(*) into v_count from expired;

  -- Cancela bookings órfãos
  update bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'payment_timeout'
    where status = 'pending_payment'
      and slot_id in (
        select id from availability_slots where status = 'available' and held_by_student_id is null
      );

  return v_count;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- VIEW: aulas por mês por professor (para a área do aluno)
-- ============================================================================
create view student_monthly_lessons as
select
  b.student_id,
  b.teacher_id,
  p.full_name as teacher_name,
  date_trunc('month', b.scheduled_start_at) as month,
  count(*) as lessons_count,
  sum(b.price_cents) as total_spent_cents
from bookings b
join profiles p on p.id = b.teacher_id
where b.status in ('confirmed', 'completed')
group by b.student_id, b.teacher_id, p.full_name, date_trunc('month', b.scheduled_start_at);

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================
alter table profiles enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table availability_slots enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;

-- Profiles: todos podem ler, só o dono edita
create policy "profiles_read_all" on profiles for select using (true);
create policy "profiles_update_self" on profiles for update using (auth.uid() = id);

-- Teachers: todos leem, só o próprio edita
create policy "teachers_read_all" on teachers for select using (true);
create policy "teachers_update_self" on teachers for update using (auth.uid() = id);

-- Students: só o próprio lê/edita
create policy "students_read_self" on students for select using (auth.uid() = id);
create policy "students_update_self" on students for update using (auth.uid() = id);

-- Availability slots:
-- - Qualquer usuário autenticado lê slots available e pending
-- - Professor dono lê/edita os seus
create policy "slots_read_public" on availability_slots for select
  using (status in ('available', 'pending', 'booked'));
create policy "slots_insert_own_teacher" on availability_slots for insert
  with check (auth.uid() = teacher_id);
create policy "slots_update_own_teacher" on availability_slots for update
  using (auth.uid() = teacher_id);
create policy "slots_delete_own_teacher" on availability_slots for delete
  using (auth.uid() = teacher_id and status = 'available');

-- Bookings: aluno vê os seus, professor vê os dele
create policy "bookings_read_student" on bookings for select using (auth.uid() = student_id);
create policy "bookings_read_teacher" on bookings for select using (auth.uid() = teacher_id);

-- Payments: só o aluno dono do booking
create policy "payments_read_student" on payments for select
  using (exists (select 1 from bookings b where b.id = booking_id and b.student_id = auth.uid()));
