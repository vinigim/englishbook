-- ============================================================================
--  Lux Derma — marcar que o Instagram do lead não foi encontrado
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE
--
--  Lead sem @ fica em "Sem Instagram" e na fila da busca com IA. Quando nem o
--  dono nem a IA acham o perfil, ele continuava ali para sempre, misturado com
--  quem ainda não foi procurado. A marca tira o lead dessa fila e o põe no chip
--  "Instagram não encontrado", de onde dá para voltar atrás.
--
--  DATA, E NÃO BOOLEANO
--
--  Nulo = não marcado. Preenchido = marcado, e quando. Perfil aparece depois
--  (clínica nova abre conta), e "procurei há um ano" pede outra busca, ao
--  contrário de "procurei ontem".
--
--  Achar o @ depois vence a marca: a tela olha primeiro se há Instagram, e só
--  então a marca. Por isso salvar um @ não precisa limpar esta coluna.
-- ============================================================================

alter table public.wa_leads
  add column if not exists instagram_nao_encontrado_em timestamptz;

comment on column public.wa_leads.instagram_nao_encontrado_em is
  'Quando o dono marcou que não achou o Instagram do lead. Nulo = não marcado. Um @ salvo depois prevalece sobre a marca.';
