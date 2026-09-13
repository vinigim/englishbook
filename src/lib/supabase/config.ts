// ============================================================================
//  Configuração do Supabase (Lux Derma)
//  ----------------------------------------------------------------------------
//  Valores padrão embutidos para o projeto Supabase do Lux Derma, de modo que
//  o deploy (ex.: Vercel) funcione SEM precisar configurar variáveis de
//  ambiente. Se quiser apontar para outro projeto, defina
//  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY que elas têm
//  prioridade.
//
//  A chave "anon" (publishable) é pública por natureza — ela já é enviada ao
//  navegador. A proteção dos dados vem do login + das políticas de segurança
//  (RLS) definidas em supabase/migrations/0004_derma_lux.sql.
// ============================================================================

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hvhxvrodhkivjfhttayp.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_GnNENyE4t9Pc8GWAqTjsWw_dSvkUASg";
