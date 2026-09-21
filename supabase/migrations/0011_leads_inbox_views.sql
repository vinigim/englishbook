-- ============================================================================
--  Lux Derma — Radar de Leads: views de "mais recente por lead"
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE EXISTE
--
--  A caixa de entrada precisa, para cada lead, da análise mais recente e da
--  última mensagem. Isso era feito buscando TODAS as análises e TODAS as
--  mensagens dos leads da página e reduzindo em memória — o que quebrou de
--  duas formas assim que a primeira sincronização real trouxe volume:
--
--   1. o filtro `.in("lead_id", [...])` vai na query string, e algumas centenas
--      de UUIDs estouram o limite de tamanho da URL do gateway;
--   2. o PostgREST corta a resposta em 1000 linhas por padrão, então a lista de
--      mensagens era truncada em silêncio.
--
--  Com `distinct on` o banco devolve exatamente uma linha por lead, o que
--  elimina os dois problemas de uma vez.
-- ============================================================================

-- ============================================================================
--  ATENÇÃO — security_invoker
--  ----------------------------------------------------------------------------
--  Sem `security_invoker = on` a view roda com os privilégios de quem a criou
--  e IGNORA o RLS das tabelas por baixo. Isso furaria o allowlist do lux_staff,
--  que é a proteção das conversas com dado de paciente (LGPD art. 11) neste
--  projeto compartilhado do Supabase.
--
--  Com a opção ligada, a policy de wa_lead_analyses / wa_messages continua
--  valendo para quem consulta a view. Não remova.
--
--  Requer PostgreSQL 15+.
-- ============================================================================

-- ---------- Análise mais recente de cada lead ----------
drop view if exists public.wa_latest_analyses;
create view public.wa_latest_analyses
  with (security_invoker = on)
  as
select distinct on (a.lead_id) a.*
  from public.wa_lead_analyses a
 order by a.lead_id, a.created_at desc, a.version desc;

comment on view public.wa_latest_analyses is
  'Uma linha por lead: a análise vigente. As anteriores continuam em wa_lead_analyses — a tabela é versionada e nunca sobrescrita.';

-- ---------- Última mensagem de cada lead ----------
drop view if exists public.wa_latest_messages;
create view public.wa_latest_messages
  with (security_invoker = on)
  as
select distinct on (m.lead_id) m.*
  from public.wa_messages m
 order by m.lead_id, m.sent_at desc;

comment on view public.wa_latest_messages is
  'Uma linha por lead: a mensagem mais recente, para o preview da caixa de entrada.';

-- ============================================================================
--  Índices de apoio
--  ----------------------------------------------------------------------------
--  O `distinct on` varre na ordem da chave; sem índice casando com ela o
--  planner cai em sort completo a cada carga da tela.
--  (wa_lead_analyses já tem o seu em 0010: wa_lead_analyses_latest_idx.)
-- ============================================================================
create index if not exists wa_messages_lead_sent_idx
  on public.wa_messages (lead_id, sent_at desc);
