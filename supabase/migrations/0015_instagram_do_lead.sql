-- ============================================================================
--  Lux Derma — Instagram do lead
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  POR QUE UMA COLUNA, E NÃO MAIS UMA CHAVE EM `extra`
--
--  Toda coluna não mapeada da planilha já cai em `wa_leads.extra`, e a ficha do
--  lead mostra o que estiver lá. Fosse só para EXIBIR o Instagram, nada disto
--  seria necessário.
--
--  O que muda é o botão: para montar o link do direct é preciso saber, com
--  certeza, qual campo é o perfil — e `extra` é terreno livre, onde a chave se
--  chama "Instagram", "insta", "@" ou o que a planilha daquele mês trouxer.
--  Pior: `extraFields` corta em doze campos, então numa planilha larga o
--  Instagram poderia simplesmente não aparecer.
--
--  Com papel próprio na importação, a tela de conferência passa a perguntar
--  qual coluna é o Instagram, e a resposta fica guardada em lugar fixo.
--
--  O QUE É GUARDADO
--
--  Só o handle, minúsculo, sem @ e sem link: "drafulana". A planilha traz de
--  tudo — "@drafulana", "instagram.com/drafulana", o link inteiro com o
--  ?igshid= que o app cola junto —, e normalizar na entrada é o que faz o link
--  do direct montar sempre igual. Quem faz isso é `toInstagramHandle`, em
--  src/lib/leads/instagram.ts.
--
--  Não há constraint de formato aqui de propósito: a única escrita vem da
--  importação, que já normaliza, e uma checagem no banco transformaria um
--  handle fora do padrão numa importação inteira falhada.
--
--  QUEM JÁ IMPORTOU ANTES DISTO não precisa reimportar para ganhar o botão: a
--  tela procura o Instagram na coluna e, se ela estiver vazia, nas colunas
--  extras. A coluna é o caminho certo; `extra` é a saída de quem já subiu a
--  planilha.
-- ============================================================================

alter table public.wa_leads
  add column if not exists instagram text;

comment on column public.wa_leads.instagram is
  'Handle do Instagram, minúsculo e sem @ nem link (ex: drafulana). Vem da planilha de prospecção — o WhatsApp não informa isto.';
