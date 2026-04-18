import { createClient } from "@supabase/supabase-js";

// Usado apenas em rotas de API/webhooks que precisam bypassar RLS.
// Nunca importe isso em código de cliente.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
