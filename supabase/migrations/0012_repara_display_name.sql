-- ============================================================================
--  Lux Derma — desfazer os nomes de lead que viraram número
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  O QUE ACONTECEU
--
--  A recuperação do histórico por LID gravava `display_name` a partir do
--  `pushName` da mensagem. Nas cópias cruas da sincronização de histórico, o
--  WhatsApp preenche esse campo com o PRÓPRIO LID ("24515790798917") em vez do
--  nome da pessoa.
--
--  Como o lead vindo de planilha tem `sheet_name` preenchido mas `display_name`
--  nulo, o número ocupou o lugar vazio. O efeito: o lead passou a aparecer na
--  tela como um número de 15 dígitos, e sumiu da busca por nome.
--
--  A origem está corrigida em src/lib/whatsapp/ingest.ts — pushName só é
--  aceito quando contém alguma letra. Isto aqui limpa o que já foi gravado.
--
--  POR QUE É SEGURO
--
--  Só apaga `display_name` formado EXCLUSIVAMENTE por dígitos. Nome de pessoa
--  ou de clínica sempre tem letra; um display_name só com números nunca foi
--  informação útil. E apagar não perde nada: `leadDisplayName()` cai para
--  sheet_name, depois clinic_name, depois o telefone formatado.
--
--  O telefone do lead (phone_e164) NÃO é tocado.
-- ============================================================================

update public.wa_leads
   set display_name = null
 where display_name is not null
   and display_name ~ '^[0-9]+$';

-- ============================================================================
--  Conferência
--  ----------------------------------------------------------------------------
--  Deve devolver 0. Se devolver mais que isso, algo ainda está gravando
--  número no lugar do nome.
-- ============================================================================
-- select count(*) from public.wa_leads where display_name ~ '^[0-9]+$';
