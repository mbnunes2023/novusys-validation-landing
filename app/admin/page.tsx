"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // se já estiver logado, manda pro dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/admin/dashboard");
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/admin/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Falha no login.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] max-w-md mx-auto px-6 py-10">
      <section className="card">
        <div className="card-title"><span className="title-dot" />Acesso do administrador</div>
        <hr />
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm text-slate-600">E-mail</label>
            <input
              type="email"
              className="ui-input mt-1"
              placeholder="admin@novusys.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-600">Senha</label>
            <input
              type="password"
              className="ui-input mt-1"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex items-center justify-between">
            <button
              disabled={submitting}
              className="btn btn-primary"
              type="submit"
            >
              {submitting ? "Entrando…" : "Entrar"}
            </button>
            <a href="/" className="btn btn-outline">Voltar</a>
          </div>
        </form>
      </section>
    </div>
  );
}
