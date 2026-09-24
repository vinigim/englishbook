-- ============================================================================
--  Lux Derma — conta do Instagram ligada ao Radar
--  ----------------------------------------------------------------------------
--  Rode no SQL Editor do Supabase. É seguro rodar mais de uma vez.
--
--  O Radar passa a ler o direct do @luxderma.lasers pela API oficial da Meta
--  (Instagram API com login do Instagram). As mensagens vão para a mesma
--  wa_messages do WhatsApp, com provider = 'instagram', coladas no lead cujo
--  Instagram da planilha é o @ da conversa. Nada de tabela nova para elas.
--
--  Esta tabela guarda só o que a sincronização precisa lembrar entre uma
--  rodada e outra:
--
--   - o token RENOVADO. O token gerado no painel da Meta vive 60 dias e fica
--     na variável INSTAGRAM_ACCESS_TOKEN da Vercel. A cada sincronização o
--     sistema troca por um novo, com mais 60 dias, e guarda aqui — a Vercel
--     não pode ser escrita por código. `token_origem` é um pedaço do hash do
--     token da Vercel: se o dono gerar outro e trocar a variável, o hash muda
--     e o guardado aqui deixa de valer.
--   - quando foi a última sincronização completa, para a próxima só ler as
--     conversas que mudaram desde então.
--
--  SEGURANÇA: RLS ligada e NENHUMA policy. Só o service role (as rotas do
--  servidor) lê e escreve. O token dá acesso ao direct da empresa e não pode
--  chegar ao navegador de ninguém, nem de quem está em lux_staff.
-- ============================================================================

create table if not exists public.ig_conta (
  -- Uma linha só: o Radar tem uma conta de Instagram.
  id                  smallint primary key default 1 check (id = 1),

  ig_user_id          text,
  username            text,

  access_token        text,
  token_origem        text,
  token_expira_em     timestamptz,
  token_renovado_em   timestamptz,

  ultima_sync_em      timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table public.ig_conta is
  'Conta do Instagram do Radar: token renovado e marca da última sincronização. Só o service role acessa (RLS sem policy).';

alter table public.ig_conta enable row level security;
