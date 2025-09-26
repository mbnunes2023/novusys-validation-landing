"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient"; // ajuste o caminho se necessário

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/admin/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Falha no login.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center px-6">
      <div className="card w-full max-w-md">
        <h1 className="card-title mb-2">
          <span className="title-dot" />
          Acesso do Administrador
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Entre com seu e-mail e senha de administrador.
        </p>

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
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={submitting}
            style={{
              backgroundImage:
                "linear-gradient(135deg, #1976d2 0%, #6a11cb 50%, #2575fc 100%)",
            }}
          >
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

