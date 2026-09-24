-- ============================================================================
--  Lux Derma — Instagram escolhido pelo dono não é trocado pela planilha
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  O Instagram do lead tem duas origens: a planilha de prospecção e a ficha
--  (a busca com IA ou o @ colado à mão). Até aqui a planilha mandava sempre —
--  ela era a única fonte, e corrigir o @ nela tinha que corrigir no painel.
--
--  Agora que o dono escolhe o perfil conferindo na tela, essa escolha vale
--  mais: uma importação que traga OUTRO @ para o mesmo lead não o substitui.
--  Esta coluna marca quando a escolha foi feita. Nula = o @ veio da planilha
--  (ou não há @), e a planilha continua mandando.
-- ============================================================================

alter table public.wa_leads
  add column if not exists instagram_escolhido_em timestamptz;

comment on column public.wa_leads.instagram_escolhido_em is
  'Quando o dono escolheu o Instagram na ficha (busca com IA ou @ colado). Preenchido = a importação de planilha não troca o @. Nulo = o @ veio da planilha.';
