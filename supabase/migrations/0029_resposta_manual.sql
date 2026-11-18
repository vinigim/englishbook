-- ============================================================================
--  Lux Derma — marcar à mão o tipo de resposta do lead
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  Os chips "Resposta automática" e "Nunca respondeu" são calculados: o
--  primeiro por regra de texto na última mensagem dele, o segundo por "mandamos
--  e nunca chegou nada". A regra erra (template com nome de atendente, resposta
--  pelo direct que não sincroniza), e o dono precisa corrigir sem esperar.
--
--  O QUE GUARDA
--
--  Nulo = segue a regra. Preenchido = vale o que o dono marcou, por cima dela:
--    'automatica'       entra em "Resposta automática"
--    'nunca_respondeu'  entra em "Nunca respondeu"
--    'humana'           sai dos dois (ele respondeu de verdade)
--
--  text + check, e não enum, como o resto do Radar.
-- ============================================================================

alter table public.wa_leads
  add column if not exists resposta_manual text;

alter table public.wa_leads
  drop constraint if exists wa_leads_resposta_manual_check;

alter table public.wa_leads
  add constraint wa_leads_resposta_manual_check
  check (resposta_manual in ('automatica', 'humana', 'nunca_respondeu'));

comment on column public.wa_leads.resposta_manual is
  'Tipo de resposta marcado pelo dono, por cima da regra: automatica, humana ou nunca_respondeu. Nulo = segue a regra.';
