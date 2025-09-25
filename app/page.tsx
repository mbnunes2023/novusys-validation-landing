"use client";

import { useEffect, useMemo, useState } from "react";
// use caminho relativo (sem alias "@") para evitar erro na Vercel
import { supabase } from "../lib/supabaseClient";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type FormState = {
  // Identificação opcional
  doctor_name: string;
  crm: string;
  contact: string; // e-mail ou WhatsApp
  consent_contact: boolean;

  // Perfil opcional
  doctor_role: string;
  clinic_size: string;

  // Perguntas
  q_noshow_relevance: string;
  q_noshow_has_system: string;
  q_noshow_financial_impact: string;

  q_glosa_is_problem: string;
  q_glosa_interest: string;
  q_glosa_who_suffers: string;

  q_rx_rework: string;
  q_rx_elderly_difficulty: string;
  q_rx_tool_value: string;

  comments: string;

  // LGPD (obrigatório)
  consent: boolean; // "Li e concordo com a Política e autorizo uso anônimo"
};

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    doctor_name: "",
    crm: "",
    contact: "",
    consent_contact: false,

    doctor_role: "",
    clinic_size: "",

    q_noshow_relevance: "",
    q_noshow_has_system: "",
    q_noshow_financial_impact: "",

    q_glosa_is_problem: "",
    q_glosa_interest: "",
    q_glosa_who_suffers: "",

    q_rx_rework: "",
    q_rx_elderly_difficulty: "",
    q_rx_tool_value: "",

    comments: "",
    consent: false,
  });

  const [stats, setStats] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    // Estatística simples para o gráfico
    const fetchStats = async () => {
      const { data, error } = await supabase.from("validation_responses").select("q_noshow_relevance");
      if (!error && data) {
        const counts = (data as any[]).reduce((acc: Record<string, number>, row: any) => {
          const k = row.q_noshow_relevance || "—";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const chart = Object.entries(counts).map(([name, value]) => ({ name, value: Number(value) }));
        setStats(chart);
      }
    };
    fetchStats();
  }, [submitted]);

  const canSubmit = useMemo(() => {
    // Regras mínimas: 3 perguntas + consentimento LGPD
    return form.q_noshow_relevance && form.q_glosa_is_problem && form.q_rx_rework && form.consent;
  }, [form]);

  const onChange = (k: keyof FormState, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.from("validation_responses").insert([
        {
          // Identificação opcional
          doctor_name: form.doctor_name || null,
          crm: form.crm || null,
          contact: form.contact || null,
          consent_contact: !!form.consent_contact,

          // Perfil
          doctor_role: form.doctor_role || null,
          clinic_size: form.clinic_size || null,

          // Perguntas
          q_noshow_relevance: form.q_noshow_relevance || null,
          q_noshow_has_system: form.q_noshow_has_system || null,
          q_noshow_financial_impact: form.q_noshow_financial_impact || null,

          q_glosa_is_problem: form.q_glosa_is_problem || null,
          q_glosa_interest: form.q_glosa_interest || null,
          q_glosa_who_suffers: form.q_glosa_who_suffers || null,

          q_rx_rework: form.q_rx_rework || null,
          q_rx_elderly_difficulty: form.q_rx_elderly_difficulty || null,
          q_rx_tool_value: form.q_rx_tool_value || null,

          comments: form.comments || null,

          // LGPD
          consent: !!form.consent,
        },
      ]);
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Falha ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const OptionButtons = ({ field, options }: { field: keyof FormState; options: string[] }) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = (form[field] as any) === opt;
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(field, opt)}
            className="px-3 py-2 rounded-xl border transition shadow-sm"
            style={{
              background: active ? brand.gradient : "white",
              color: active ? "white" : "inherit",
              borderColor: active ? "transparent" : "#e5e7eb",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto p-6">
          <header className="mb-8">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="NovuSys" className="w-12 h-12 rounded-xl" />
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm">
                  <span className="text-xs">MVP • Pesquisa de Validação</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mt-2">Obrigado pela resposta!</h1>
                <p className="text-slate-600">{brand.name} — {brand.tagline}</p>
              </div>
            </div>
          </header>

          <section className="mb-10 bg-white rounded-2xl p-6 border shadow-sm">
            <h2 className="text-xl font-semibold mb-2">Visão rápida das respostas (beta)</h2>
            <p className="text-slate-600 mb-4">Distribuição das respostas para a pergunta: <span className="font-medium">“No-show é relevante?”</span></p>
            <div className="w-full h-72 rounded-xl border p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill={brand.color} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="flex gap-3">
            <a href="/" className="px-5 py-3 rounded-2xl border">Enviar outra resposta</a>
            <a href="/privacy" className="px-5 py-3 rounded-2xl" style={{ background: brand.gradient, color: "white" }}>
              Política de privacidade
            </a>
          </div>

          <footer className="mt-10 text-xs text-slate-500">
            {brand.name} • {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* HERO premium */}
      <section
        className="w-full"
        style={{
          background: brand.gradient,
          color: "white",
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="mb-3 text-sm opacity-90">
            {brand.name} — {brand.tagline}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight drop-shadow">
            Validação de Dores em Clínicas Médicas
          </h1>
          <p className="mt-3 text-white/90 max-w-2xl">
            Pesquisa rápida (2–3 min) para entender o que realmente importa no seu dia a dia.
          </p>
          <div className="mt-5">
            <a href="#form" className="px-5 py-3 rounded-2xl font-medium shadow" style={{ background: "white", color: "#0f172a" }}>
              Começar agora
            </a>
          </div>
        </div>
      </section>

      {/* FORM */}
      <div id="form" className="max-w-4xl mx-auto p-6 -mt-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Card Identificação (opcional) */}
          <section className="bg-white rounded-2xl p-6 border shadow-sm">
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm">
                <span className="text-xs">Identificação (opcional)</span>
              </div>
              <p className="text-slate-600 mt-2 text-sm">
                Se desejar, informe seus dados para que possamos entrar em contato sobre pilotos/entrevistas.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-slate-600">Nome</label>
                <input className="mt-1 w-full border rounded-xl p-2" placeholder="Ex.: Dra. Maria Silva"
                       value={form.doctor_name} onChange={(e) => onChange("doctor_name", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-slate-600">CRM</label>
                <input className="mt-1 w-full border rounded-xl p-2" placeholder="Ex.: CRM 12345"
                       value={form.crm} onChange={(e) => onChange("crm", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Contato (e-mail ou WhatsApp)</label>
                <input className="mt-1 w-full border rounded-xl p-2" placeholder="Ex.: (51) 9 9999-9999 ou nome@clinica.com"
                       value={form.contact} onChange={(e) => onChange("contact", e.target.value)} />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="w-4 h-4" checked={form.consent_contact} onChange={(e) => onChange("consent_contact", e.target.checked)} />
              Autorizo contato para falar sobre pilotos/entrevistas (opcional).
            </label>
          </section>

          {/* Perfil (opcional) */}
          <section className="bg-white rounded-2xl p-6 border shadow-sm">
            <h2 className="text-lg font-semibold">Perfil (opcional)</h2>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-600">Especialidade / Função</label>
                <select className="mt-1 w-full border rounded-xl p-2" value={form.doctor_role} onChange={(e) => onChange("doctor_role", e.target.value)}>
                  <option value="">Selecionar…</option>
                  <option>Clínico</option>
                  <option>Geriatra</option>
                  <option>Dermatologista</option>
                  <option>Ortopedista</option>
                  <option>Outra</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600">Tamanho do consultório/clínica</label>
                <select className="mt-1 w-full border rounded-xl p-2" value={form.clinic_size} onChange={(e) => onChange("clinic_size", e.target.value)}>
                  <option value="">Selecionar…</option>
                  <option>Pequeno</option>
                  <option>Médio</option>
                  <option>Grande</option>
                </select>
              </div>
            </div>
          </section>

          {/* 1. No-show */}
          <section className="bg-white rounded-2xl p-6 border shadow-sm">
            <h2 className="text-lg font-semibold">1) Faltas em Consultas (No-show)</h2>
            <p className="text-slate-600 mt-1">Pacientes faltam sem avisar, prejudicando agenda e faturamento. Em muitos consultórios, os lembretes são manuais e descentralizados.</p>
            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-sm font-medium">Essa dor é relevante na sua prática?</label>
                <OptionButtons field="q_noshow_relevance" options={["Sim", "Não", "Parcialmente"]} />
              </div>
              <div>
                <label className="text-sm font-medium">Você já usa algum sistema que resolve bem esse problema?</label>
                <OptionButtons field="q_noshow_has_system" options={["Sim", "Não"]} />
              </div>
              <div>
                <label className="text-sm font-medium">Qual o impacto financeiro mensal?</label>
                <OptionButtons field="q_noshow_financial_impact" options={["Baixo impacto", "Médio impacto", "Alto impacto"]} />
              </div>
            </div>
          </section>

          {/* 2. Glosas */}
          <section className="bg-white rounded-2xl p-6 border shadow-sm">
            <h2 className="text-lg font-semibold">2) Glosas de Convênios (Faturamento)</h2>
            <p className="text-slate-600 mt-1">Erros em guias TISS/TUSS geram glosas e atrasam o recebimento. Conferência manual é trabalhosa, especialmente em clínicas menores.</p>
            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-sm font-medium">Glosas são um problema recorrente?</label>
                <OptionButtons field="q_glosa_is_problem" options={["Sim", "Não", "Às vezes"]} />
              </div>
              <div>
                <label className="text-sm font-medium">Interesse em uma checagem rápida antes do envio?</label>
                <OptionButtons field="q_glosa_interest" options={["Sim", "Não", "Talvez"]} />
              </div>
              <div>
                <label className="text-sm font-medium">Quem sofre mais com o problema?</label>
                <OptionButtons field="q_glosa_who_suffers" options={["Médico", "Administrativo", "Ambos"]} />
              </div>
            </div>
          </section>

          {/* 3. Receitas Digitais */}
          <section className="bg-white rounded-2xl p-6 border shadow-sm">
            <h2 className="text-lg font-semibold">3) Receitas Digitais e Telemedicina</h2>
            <p className="text-slate-600 mt-1">Com a prescrição eletrônica, surgem dúvidas sobre validação e envio correto ao paciente/farmácia, gerando retrabalho.</p>
            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-sm font-medium">Isso já gerou retrabalho em sua clínica?</label>
                <OptionButtons field="q_rx_rework" options={["Sim", "Não", "Raramente"]} />
              </div>
              <div>
                <label className="text-sm font-medium">Pacientes têm dificuldade nesse processo?</label>
                <OptionButtons field="q_rx_elderly_difficulty" options={["Sim", "Não", "Em parte"]} />
              </div>
              <div>
                <label className="text-sm font-medium">Vê valor em uma ferramenta que auxilie nesse fluxo?</label>
                <OptionButtons field="q_rx_tool_value" options={["Sim", "Não", "Talvez"]} />
              </div>
            </div>
          </section>

          {/* Comentários + Consentimentos */}
          <section className="bg-white rounded-2xl p-6 border shadow-sm">
            <h2 className="text-lg font-semibold">Comentários e consentimentos</h2>
            <textarea
              className="mt-3 w-full border rounded-xl p-3"
              rows={4}
              placeholder="Se pudesse resolver apenas um problema agora, qual seria?"
              value={form.comments}
              onChange={(e) => onChange("comments", e.target.value)}
            />
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 w-4 h-4" checked={form.consent} onChange={(e) => onChange("consent", e.target.checked)} />
                <span>
                  Declaro que <a href="/privacy" className="underline">li e concordo com a Política de Privacidade</a> e{" "}
                  <strong>autorizo o uso anônimo</strong> destas respostas para fins de validação de produto.
                </span>
              </label>
              <p className="text-xs text-slate-500">Não solicitamos dados sensíveis de pacientes. Identificação é opcional.</p>
            </div>
          </section>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex flex-wrap gap-3">
            <button
              disabled={!canSubmit || submitting}
              className="px-5 py-3 rounded-2xl text-white font-medium shadow-md transition"
              style={{ background: canSubmit ? brand.gradient : "#9ca3af", cursor: canSubmit ? "pointer" : "not-allowed" }}
            >
              {submitting ? "Enviando…" : "Enviar respostas (2–3 min)"}
            </button>
            <a href="/privacy" className="px-5 py-3 rounded-2xl border">Ver política de privacidade</a>
          </div>

          <footer className="mt-10 text-xs text-slate-500 text-center">
            MVP • {new Date().getFullYear()} • Feito com Next.js + Supabase • {brand.name}
          </footer>
        </form>
      </div>
    </div>
  );
}
