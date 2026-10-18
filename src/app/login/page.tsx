"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alerta, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const semAcesso = useSearchParams().get("erro") === "sem_acesso";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) return setErro("E-mail ou senha incorretos.");
    router.replace("/vagas");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">Radar de Vagas Mainframe</h1>
        <p className="mb-4 text-sm text-slate-500">Entre com a conta criada no Supabase.</p>
        <form onSubmit={entrar} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="senha">Senha</label>
            <input id="senha" type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {semAcesso && !erro && <Alerta tipo="erro">Esta conta não tem acesso ao radar.</Alerta>}
          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
