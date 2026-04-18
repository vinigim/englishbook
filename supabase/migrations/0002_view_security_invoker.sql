-- ============================================================================
-- ENGLISHBOOK - HARDENING DA VIEW student_monthly_lessons
-- ============================================================================
-- Por padrão, views no Postgres rodam com as permissões do owner, bypassando
-- RLS das tabelas subjacentes. Isso significa que, sem cuidado no código,
-- um aluno poderia ler linhas de outros alunos via essa view.
--
-- security_invoker = true (disponível em Postgres 15+) faz a view respeitar
-- RLS da tabela bookings, que já restringe por auth.uid().
-- ============================================================================

alter view student_monthly_lessons set (security_invoker = true);
