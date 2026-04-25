-- ============================================================================
-- TÓPICOS DE AULA
-- ============================================================================
-- Professores podem oferecer tópicos específicos; alunos escolhem um ao
-- agendar (ou deixam sem tópico = aula generalista).
-- ============================================================================

create table lesson_topics (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null unique,
  slug           text not null unique,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now()
);

insert into lesson_topics (name, slug, display_order) values
  ('Viagem',    'viagem',    1),
  ('Negócios',  'negocios',  2),
  ('Pronúncia', 'pronuncia', 3),
  ('Leitura',   'leitura',   4),
  ('Escrita',   'escrita',   5);

-- Tópicos que cada professor oferece
create table teacher_topics (
  teacher_id  uuid not null references teachers(id) on delete cascade,
  topic_id    uuid not null references lesson_topics(id) on delete cascade,
  primary key (teacher_id, topic_id)
);

-- Tópico escolhido pelo aluno no agendamento (null = aula generalista)
alter table bookings
  add column topic_id uuid references lesson_topics(id) on delete set null;

-- ============================================================================
-- RLS
-- ============================================================================
alter table lesson_topics enable row level security;
create policy "lesson_topics_read_all" on lesson_topics for select using (true);

alter table teacher_topics enable row level security;
create policy "teacher_topics_read_all"    on teacher_topics for select using (true);
create policy "teacher_topics_insert_self" on teacher_topics for insert with check (auth.uid() = teacher_id);
create policy "teacher_topics_delete_self" on teacher_topics for delete using (auth.uid() = teacher_id);

-- ============================================================================
-- hold_slot revisada — aceita p_topic_id opcional
-- ============================================================================
create or replace function hold_slot(
  p_slot_id      uuid,
  p_student_id   uuid,
  p_hold_minutes integer default 15,
  p_topic_id     uuid    default null
) returns uuid as $$
declare
  v_slot      availability_slots%rowtype;
  v_teacher   teachers%rowtype;
  v_booking_id uuid;
begin
  select * into v_slot
  from availability_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'slot_not_found';
  end if;

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

  select * into v_teacher from teachers where id = v_slot.teacher_id;

  if not v_teacher.active then
    raise exception 'teacher_inactive';
  end if;

  update availability_slots
    set status = 'pending',
        held_by_student_id = p_student_id,
        held_until = now() + (p_hold_minutes || ' minutes')::interval
    where id = p_slot_id;

  insert into bookings (
    student_id, teacher_id, slot_id, status,
    price_cents, currency, scheduled_start_at, scheduled_end_at, topic_id
  ) values (
    p_student_id, v_slot.teacher_id, p_slot_id, 'pending_payment',
    v_teacher.hourly_price_cents, 'BRL', v_slot.start_at, v_slot.end_at, p_topic_id
  ) returning id into v_booking_id;

  return v_booking_id;
end;
$$ language plpgsql security definer;
