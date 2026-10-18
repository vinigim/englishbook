-- =====================================================================
-- Radar de Vagas Mainframe — schema inicial
-- Rodar no SQL Editor do Supabase. Seguro para rodar de novo.
-- Toda tabela é por usuário: RLS "user_id = auth.uid()".
-- =====================================================================

-- =====================================================================
-- perfil: preferências de busca (uma linha por usuário)
-- =====================================================================
create table if not exists public.perfil (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  -- Resumo usado pela IA para dar a nota de aderência
  resumo_profissional text not null default '',
  -- Termos buscados na Gupy e no pré-filtro
  termos_busca text[] not null default array[
    'mainframe', 'cobol', 'cics', 'jcl', 'z/os', 'alta plataforma', 'natural adabas', 'db2'
  ],
  aceita_remoto boolean not null default true,
  aceita_hibrido boolean not null default true,
  aceita_presencial boolean not null default false,
  aceita_internacional boolean not null default true,
  cidades text[] not null default '{}',
  -- [{ "nome": "Kyndryl", "ats": "workday", "slug": "kyndryl.wd5.myworkdayjobs.com/KyndrylProfessionalCareers" }]
  empresas_alvo jsonb not null default '[]'::jsonb,
  busca_ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- cvs: CV base (base = true, um por usuário) e versões por vaga
-- =====================================================================
create table if not exists public.cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  base boolean not null default false,
  vaga_id uuid,
  conteudo jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cvs_um_base_por_usuario on public.cvs (user_id) where base;

-- =====================================================================
-- vagas: tudo que as fontes trouxeram, já deduplicado
-- =====================================================================
create table if not exists public.vagas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fonte text not null check (fonte in (
    'gupy', 'linkedin', 'indeed', 'glassdoor', 'catho', 'email',
    'greenhouse', 'lever', 'smartrecruiters', 'workable', 'workday', 'manual'
  )),
  id_externo text,
  -- titulo + empresa normalizados: a mesma vaga vinda de duas fontes vira uma linha
  chave text not null,
  url text not null,
  titulo text not null,
  empresa text not null default '',
  local text not null default '',
  modelo text not null default 'desconhecido'
    check (modelo in ('remoto', 'hibrido', 'presencial', 'desconhecido')),
  pais text not null default 'BR',
  descricao text not null default '',
  publicada_em timestamptz,
  encontrada_em timestamptz not null default now(),
  -- pendente → a IA ainda não olhou; relevante / descartada depois da triagem
  triagem_status text not null default 'pendente'
    check (triagem_status in ('pendente', 'relevante', 'descartada')),
  triagem jsonb,
  nota int,
  arquivada boolean not null default false,
  unique (user_id, chave)
);
create index if not exists vagas_lista on public.vagas (user_id, triagem_status, encontrada_em desc);

-- =====================================================================
-- candidaturas: o funil (kanban) e a linha do tempo
-- =====================================================================
create table if not exists public.candidaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  status text not null default 'interessado'
    check (status in ('interessado', 'aplicado', 'entrevista', 'proposta', 'encerrado')),
  resultado text check (resultado in ('contratado', 'reprovado', 'desisti', 'sem_retorno')),
  aplicada_em date,
  proximo_followup date,
  cv_id uuid references public.cvs(id) on delete set null,
  contatos text not null default '',
  notas text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vaga_id)
);

create table if not exists public.candidatura_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidatura_id uuid not null references public.candidaturas(id) on delete cascade,
  tipo text not null check (tipo in ('status', 'nota', 'followup')),
  de_status text,
  para_status text,
  texto text,
  created_at timestamptz not null default now()
);
create index if not exists candidatura_eventos_por_candidatura
  on public.candidatura_eventos (candidatura_id, created_at);

-- =====================================================================
-- materiais: CV adaptado, carta e respostas gerados pela IA para uma vaga
-- =====================================================================
create table if not exists public.materiais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  conteudo jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists materiais_por_vaga on public.materiais (vaga_id, created_at desc);

-- =====================================================================
-- execucoes_busca: histórico do cron e do botão "Buscar agora"
-- =====================================================================
create table if not exists public.execucoes_busca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origem text not null check (origem in ('cron', 'manual')),
  iniciada_em timestamptz not null default now(),
  terminada_em timestamptz,
  -- { "gupy": { "trazidas": 40, "novas": 3 }, "gmail": { "erro": "..." } }
  resumo jsonb not null default '{}'::jsonb,
  erro text
);
create index if not exists execucoes_recentes on public.execucoes_busca (user_id, iniciada_em desc);

-- =====================================================================
-- emails_processados: alertas já lidos, para não pagar a extração duas vezes
-- =====================================================================
create table if not exists public.emails_processados (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  remetente text not null default '',
  vagas_extraidas int not null default 0,
  processado_em timestamptz not null default now(),
  primary key (user_id, message_id)
);

-- =====================================================================
-- uso_ia: cada chamada à API da Anthropic, com custo
-- =====================================================================
create table if not exists public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tarefa text not null,
  modelo text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists uso_ia_por_mes on public.uso_ia (user_id, created_at desc);

-- =====================================================================
-- RLS: cada usuário só vê o que é dele
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'perfil', 'cvs', 'vagas', 'candidaturas', 'candidatura_eventos',
    'materiais', 'execucoes_busca', 'emails_processados', 'uso_ia'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
