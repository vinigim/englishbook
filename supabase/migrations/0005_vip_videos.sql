-- ============================================================================
-- VIP E VÍDEOS DE AULA
-- ============================================================================

-- Quais alunos são VIP para cada professor (decisão exclusiva do professor)
create table teacher_student_vip (
  teacher_id  uuid not null references teachers(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (teacher_id, student_id)
);

create index idx_vip_teacher on teacher_student_vip(teacher_id);

-- Vídeos que o professor sobe, opcionalmente vinculados a um tópico
create table teacher_videos (
  id            uuid primary key default uuid_generate_v4(),
  teacher_id    uuid not null references teachers(id) on delete cascade,
  topic_id      uuid references lesson_topics(id) on delete set null,
  title         text not null,
  description   text,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

create index idx_teacher_videos_teacher on teacher_videos(teacher_id, created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================

-- teacher_student_vip
alter table teacher_student_vip enable row level security;
-- Professor gerencia seus VIPs
create policy "vip_select_teacher" on teacher_student_vip for select using (auth.uid() = teacher_id);
create policy "vip_insert_teacher" on teacher_student_vip for insert with check (auth.uid() = teacher_id);
create policy "vip_delete_teacher" on teacher_student_vip for delete using (auth.uid() = teacher_id);
-- Aluno sabe se ele mesmo é VIP
create policy "vip_select_student" on teacher_student_vip for select using (auth.uid() = student_id);

-- teacher_videos: professor gerencia; leitura de alunos VIP é feita via admin
-- client no servidor (sem precisar de policy de SELECT para alunos aqui)
alter table teacher_videos enable row level security;
create policy "videos_teacher_all" on teacher_videos
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================
-- Cria o bucket privado de vídeos.
-- Se o SQL editor não tiver acesso ao schema storage, crie manualmente no
-- Supabase Dashboard > Storage > New bucket (nome: teacher-videos, private).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teacher-videos',
  'teacher-videos',
  false,
  524288000,  -- 500 MB
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
) on conflict (id) do nothing;

-- Professor faz upload na própria pasta (caminho: {teacher_id}/{arquivo})
create policy "teacher_upload_video" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'teacher-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.teachers where id = auth.uid())
  );

-- Professor deleta os próprios arquivos
create policy "teacher_delete_video" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'teacher-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
