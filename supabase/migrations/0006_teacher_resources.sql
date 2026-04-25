-- ============================================================================
-- INDICAÇÕES DE CONTEÚDO EXTERNO (VIP)
-- ============================================================================
-- Professores podem indicar links externos (blogs, YouTube, artigos, notícias,
-- games, podcasts) relacionados a tópicos, visíveis apenas para alunos VIP.
-- ============================================================================

create type resource_type as enum (
  'blog',
  'youtube',
  'artigo',
  'noticia',
  'game',
  'podcast'
);

create table teacher_resources (
  id          uuid primary key default uuid_generate_v4(),
  teacher_id  uuid not null references teachers(id) on delete cascade,
  topic_id    uuid references lesson_topics(id) on delete set null,
  type        resource_type not null,
  title       text not null,
  url         text not null,
  description text,
  created_at  timestamptz not null default now()
);

create index idx_teacher_resources_teacher
  on teacher_resources(teacher_id, created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================
alter table teacher_resources enable row level security;

-- Professor gerencia as próprias indicações
create policy "resources_teacher_all" on teacher_resources
  for all
  using  (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
