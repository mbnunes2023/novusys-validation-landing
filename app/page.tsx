"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type FormState = {
  doctor_role: string;
  clinic_size: string;
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
  consent: boolean;
};

export default function Page() {
  const brand = { name: "NovuSys", tagline: "Transformamos códigos em resultados", color: "#1976d2" };

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
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
    return form.q_noshow_relevance && form.q_glosa_is_problem && form.q_rx_rework && form.consent;
  }, [form]);

  const onChange = (k: keyof FormState, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.from("validation_responses").insert([
        {
          doctor_role: form.doctor_role || null,
          clinic_size: form.clinic_size || null,
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
          consent: form.consent,
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
            className="px-3 py-2 rounded-xl border"
            style={{ background: active ? brand.color : "white", color: active ? "white" : "inherit", borderColor: "#e5e7eb" }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );

  if (submitted) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto p-6">
          <header className="mb-8">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="NovuSys" className="w-12 h-12 rounded-xl" />
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm">
                  <span className="text-xs">MVP • Pesquisa de Validação</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mt-2">Validação de Dores em Clínicas Médicas</h1>
                <p className="text-gray-600">
                  {brand.name} — {brand.tagline}
                </p>
              </div>
            </div>
            <p className="text-gray-600 mt-3">
              Obrigado! Suas respostas ajudam a direcionar o desenvolvimento de uma solução simples e útil para clínicas.
            </p>
          </header>

          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-2">Visão rápida das respostas (beta)</h2>
            <p className="text-gray-600 mb-4">
              Distribuição das respostas para a pergunta: <span className="font-medium">“No-show é relevante?”</span>
            </p>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="flex gap-3">
            <a href="/" className="px-4 py-2 rounded-2xl border">
              Enviar outra resposta
            </a>
            <a href="#" className="px-4 py-2 rounded-2xl bg-black text-white">
              Ver protótipo (em breve)
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <header className="mb-8">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="NovuSys" className="w-12 h-12 rounded-xl" />
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm">
                <span className="text-xs">MVP • Pesquisa de Validação</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mt-2">Validação de Dores em Clínicas Médicas</h1>
              <p className="text-gray-600">
                {brand.name} — {brand.tagline}
              </p>
            </div>
          </div>
          <p className="text-gray-600 mt-3">
            Queremos entender, de forma rápida, quais dores realmente importam no seu dia a dia. Marque as opções que melhor representam sua realidade.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-white rounded-2xl p-5 shadow-sm border">
            <h2 className="text-lg font-semibold">Perfil (opcional)</h2>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Especialidade / Função</label>
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
                <label className="text-sm text-gray-600">Tamanho do consultório/clinica</label>
                <select className="mt-1 w-full border rounded-xl p-2" value={form.clinic_size} onChange={(e) => onChange("clinic_size", e.target.value)}>
                  <option value="">Selecionar…</option>
                  <option>Pequeno</option>
                  <option>Médio</option>
                  <option>Grande</option>
                </select>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl p-5 shadow-sm border">
            <h2 className="text-lg font-semibold">1) Faltas em Consultas (No-show)</h2>
            <p className="text-gray-600 mt-1">Pacientes faltam sem avisar, prejudicando agenda e faturamento. Em muitos consultórios, os lembretes são manuais e descentralizados.</p>

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

          <section className="bg-white rounded-2xl p-5 shadow-sm border">
            <h2 className="text-lg font-semibold">2) Glosas de Convênios (Faturamento)</h2>
            <p className="text-gray-600 mt-1">Erros em guias TISS/TUSS geram glosas e atrasam o recebimento. Conferência manual é trabalhosa, especialmente em clínicas menores.</p>
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

          <section className="bg-white rounded-2xl p-5 shadow-sm border">
            <h2 className="text-lg font-semibold">3) Receitas Digitais e Telemedicina</h2>
            <p className="text-gray-600 mt-1">Com a prescrição eletrônica, surgem dúvidas sobre validação e envio correto ao paciente/farmácia, gerando retrabalho.</p>
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

          <section className="bg-white rounded-2xl p-5 shadow-sm border">
            <h2 className="text-lg font-semibold">Comentários adicionais</h2>
            <textarea
              className="mt-2 w-full border rounded-xl p-3"
              rows={4}
              placeholder="Se pudesse resolver apenas um problema agora, qual seria?"
              value={form.comments}
              onChange={(e) => onChange("comments", e.target.value)}
            />
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="w-4 h-4" checked={form.consent} onChange={(e) => onChange("consent", e.target.checked)} />
              Autorizo o uso anônimo destas respostas para fins de validação de produto. (Sem dados pessoais)
            </label>
          </section>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex gap-3">
            <button
              disabled={!canSubmit || submitting}
              className="px-5 py-3 rounded-2xl text-white"
              style={{ background: canSubmit ? brand.color : "#9ca3af", cursor: canSubmit ? "pointer" : "not-allowed" }}
            >
              {submitting ? "Enviando…" : "Enviar respostas (2–3 min)"}
            </button>
            <a href="#" className="px-5 py-3 rounded-2xl border">
              Ver política de privacidade
            </a>
          </div>
        </form>

        <footer className="mt-10 text-xs text-gray-500">
          MVP • {new Date().getFullYear()} • Feito com Next.js + Supabase
        </footer>
      </div>
    </div>
  );
}
