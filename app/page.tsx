"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type FormState = {
  doctor_name: string;
  crm: string;
  contact: string;
  consent_contact: boolean;

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
  const brand = {
    color: "#1976d2",
    gradient: "linear-gradient(135deg,#1976d2 0%,#6a11cb 50%,#2575fc 100%)",
  };

  /* ------------ Controle de exibição do formulário ------------ */
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#form") {
      setShowForm(true);
      setTimeout(
        () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50
      );
    }
  }, []);

  /* -------------------- Estado do formulário ------------------- */
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

  /* Mantido para uso futuro (não mostramos gráfico no obrigado) */
  const [stats, setStats] = useState<{ name: string; value: number }[]>([]);
  useEffect(() => {
    const fetchStats = async () => {
      const { data, error } = await supabase
        .from("validation_responses")
        .select("q_noshow_relevance");
      if (!error && data) {
        const counts = (data as any[]).reduce(
          (acc: Record<string, number>, row: any) => {
            const k = row.q_noshow_relevance || "—";
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
        const chart = Object.entries(counts).map(([name, value]) => ({
          name,
          value: Number(value),
        }));
        setStats(chart);
      }
    };
    if (submitted) fetchStats();
  }, [submitted]);

  /* <<< Removido: não escondemos mais o topo na tela de obrigado >>> */

  const canSubmit = useMemo(() => {
    return (
      form.q_noshow_relevance &&
      form.q_glosa_is_problem &&
      form.q_rx_rework &&
      form.consent
    );
  }, [form]);

  const onChange = (k: keyof FormState, v: any) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.from("validation_responses").insert([
        {
          doctor_name: form.doctor_name || null,
          crm: form.crm || null,
          contact: form.contact || null,
          consent_contact: !!form.consent_contact,

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

  const OptionButtons = ({
    field,
    options,
  }: {
    field: keyof FormState;
    options: string[];
  }) => (
    <div className="chips mt-2">
      {options.map((opt) => {
        const active = (form[field] as any) === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(field, opt)}
            className={`chip ${active ? "chip--active" : ""}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );

  /* ========= TELA DE AGRADECIMENTO — sem logo no card, título com gradiente ========= */
  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--page-bg)] flex items-center justify-center px-6 py-12">
        <div className="card w-full max-w-2xl text-center">
          {/* Sem logo aqui — usamos apenas o logo grande do topo */}
          <h1 className="text-3xl md:text-4xl font-extrabold mt-2">
            <span
              style={{
                background: brand.gradient,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Obrigado pela resposta!
            </span>
          </h1>

          <p className="mt-2 text-slate-600">
            Sua contribuição ajuda a priorizar um MVP útil para clínicas e consultórios.
          </p>

          <div className="mt-6 h-px bg-[linear-gradient(90deg,transparent,#e9edf7,transparent)]" />

          <p className="mt-6 text-xs text-slate-500">
            © {new Date().getFullYear()} <span className="font-medium">NovuSys</span> — Todos os direitos reservados.{" "}
            <a href="/privacy" className="underline">Política de privacidade</a>
          </p>
        </div>
      </div>
    );
  }

  /* ================= PÁGINA (HERO + FORM) ================= */
  return (
    <div className="min-h-screen">
      {/* HERO premium */}
      <section
        className="w-full"
        style={{ background: brand.gradient, color: "white" }}
      >
        <div className="max-w-4xl mx-auto px-6 py-10">
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight drop-shadow">
            Pesquisa para Clínicas e Consultórios
          </h1>
          <p className="mt-3 text-white/90 max-w-2xl">
            Leva 2–3 minutos. Queremos entender o que realmente importa no seu dia a dia para priorizar um MVP útil.
          </p>
          <div className="mt-5">
            <button
              className="btn btn-outline"
              style={{ background: "white" }}
              onClick={() => {
                setShowForm(true);
                setTimeout(() => {
                  formRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 30);
              }}
            >
              Começar agora
            </button>
          </div>
        </div>
      </section>

      {/* Formulário só aparece após clicar */}
      {showForm ? (
        <div ref={formRef} id="form" className="max-w-4xl mx-auto p-6 -mt-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Identificação (opcional) */}
            <section className="card">
              <div className="card-title">
                <span className="title-dot" />
                Identificação <span className="badge-soft">opcional</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Se desejar, informe seus dados para contato sobre pilotos/entrevistas.
              </p>
              <hr />
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-slate-600">Nome</label>
                  <input
                    className="ui-input mt-1"
                    placeholder="Ex.: Dra. Maria Silva"
                    value={form.doctor_name}
                    onChange={(e) => onChange("doctor_name", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">CRM</label>
                  <input
                    className="ui-input mt-1"
                    placeholder="Ex.: CRM 12345"
                    value={form.crm}
                    onChange={(e) => onChange("crm", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">
                    Contato (e-mail ou WhatsApp)
                  </label>
                  <input
                    className="ui-input mt-1"
                    placeholder="Ex.: (51) 9 9999-9999 ou nome@clinica.com"
                    value={form.contact}
                    onChange={(e) => onChange("contact", e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-[var(--edge)] bg-slate-50/70 p-3">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4"
                    checked={form.consent_contact}
                    onChange={(e) =>
                      onChange("consent_contact", e.target.checked)
                    }
                  />
                  <span>
                    Autorizo contato para falar sobre pilotos/entrevistas (opcional).
                  </span>
                </label>
              </div>
            </section>

            {/* Perfil (opcional) */}
            <section className="card">
              <div className="card-title">
                <span className="title-dot" />
                Perfil <span className="badge-soft">opcional</span>
              </div>
              <hr />
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-600">
                    Especialidade / Função
                  </label>
                  <select
                    className="ui-select mt-1"
                    value={form.doctor_role}
                    onChange={(e) => onChange("doctor_role", e.target.value)}
                  >
                    <option value="">Selecionar…</option>
                    <option>Clínico</option>
                    <option>Geriatra</option>
                    <option>Dermatologista</option>
                    <option>Ortopedista</option>
                    <option>Outra</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-600">
                    Tamanho do consultório/clínica
                  </label>
                  <select
                    className="ui-select mt-1"
                    value={form.clinic_size}
                    onChange={(e) => onChange("clinic_size", e.target.value)}
                  >
                    <option value="">Selecionar…</option>
                    <option>Pequeno</option>
                    <option>Médio</option>
                    <option>Grande</option>
                  </select>
                </div>
              </div>
            </section>

            {/* 1. No-show */}
            <section className="card">
              <div className="card-title">
                <span className="title-dot" />
                1) Faltas em Consultas (No-show)
              </div>
              <p className="text-slate-600 mt-1">
                Faltas sem aviso prejudicam agenda e faturamento — em muitos consultórios os lembretes são manuais.
              </p>
              <hr />
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium">
                    Essa questão é relevante?
                  </label>
                  <OptionButtons
                    field="q_noshow_relevance"
                    options={["Sim", "Não", "Parcialmente"]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Já usa um sistema que resolva bem?
                  </label>
                  <OptionButtons
                    field="q_noshow_has_system"
                    options={["Sim", "Não"]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Impacto financeiro mensal
                  </label>
                  <OptionButtons
                    field="q_noshow_financial_impact"
                    options={["Baixo impacto", "Médio impacto", "Alto impacto"]}
                  />
                </div>
              </div>
            </section>

            {/* 2. Glosas */}
            <section className="card">
              <div className="card-title">
                <span className="title-dot" />
                2) Glosas de Convênios (Faturamento)
              </div>
              <p className="text-slate-600 mt-1">
                Erros em guias TISS/TUSS geram glosas e atrasam o recebimento; conferência manual é trabalhosa.
              </p>
              <hr />
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium">
                    Glosas são recorrentes?
                  </label>
                  <OptionButtons
                    field="q_glosa_is_problem"
                    options={["Sim", "Não", "Às vezes"]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Interesse em checagem rápida antes do envio?
                  </label>
                  <OptionButtons
                    field="q_glosa_interest"
                    options={["Sim", "Não", "Talvez"]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Quem sofre mais com o problema?
                  </label>
                  <OptionButtons
                    field="q_glosa_who_suffers"
                    options={["Médico", "Administrativo", "Ambos"]}
                  />
                </div>
              </div>
            </section>

            {/* 3. Receitas Digitais */}
            <section className="card">
              <div className="card-title">
                <span className="title-dot" />
                3) Receitas Digitais e Telemedicina
              </div>
              <p className="text-slate-600 mt-1">
                Na prescrição eletrônica, há dúvidas sobre validação e envio correto ao paciente/farmácia, gerando retrabalho.
              </p>
              <hr />
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium">
                    Gerou retrabalho na clínica?
                  </label>
                  <OptionButtons
                    field="q_rx_rework"
                    options={["Sim", "Não", "Raramente"]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Pacientes têm dificuldade?
                  </label>
                  <OptionButtons
                    field="q_rx_elderly_difficulty"
                    options={["Sim", "Não", "Em parte"]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Vê valor em uma ferramenta de apoio?
                  </label>
                  <OptionButtons
                    field="q_rx_tool_value"
                    options={["Sim", "Não", "Talvez"]}
                  />
                </div>
              </div>
            </section>

            {/* Comentários + Consentimentos */}
            <section className="card">
              <div className="card-title">
                <span className="title-dot" />
                Comentários e consentimentos
              </div>
              <hr />
              <textarea
                className="ui-textarea mt-2"
                rows={4}
                placeholder="Se pudesse resolver apenas um problema agora, qual seria?"
                value={form.comments}
                onChange={(e) => onChange("comments", e.target.value)}
              />
              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4"
                    checked={form.consent}
                    onChange={(e) => onChange("consent", e.target.checked)}
                  />
                  <span>
                    Declaro que{" "}
                    <a href="/privacy" className="underline">
                      li e concordo com a Política de Privacidade
                    </a>{" "}
                    e <strong>autorizo o uso anônimo</strong> destas respostas
                    para fins de validação de produto.
                  </span>
                </label>
                <p className="text-xs text-slate-500">
                  Não solicitamos dados sensíveis de pacientes. Identificação é opcional.
                </p>
              </div>
            </section>

            {error && <div className="text-red-600 text-sm">{error}</div>}

            {/* Botão Enviar centralizado */}
            <div className="actions mt-6" style={{ justifyContent: "center", gap: 12 }}>
              <button
                disabled={!canSubmit || submitting}
                className="btn btn-primary"
                type="submit"
                style={{
                  backgroundImage: canSubmit ? brand.gradient : "none",
                  background: canSubmit ? undefined : "#9ca3af",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  opacity: canSubmit ? 1 : 0.85,
                }}
              >
                {submitting ? "Enviando…" : "Enviar respostas"}
              </button>
            </div>

            <footer className="mt-10 text-xs text-slate-500 text-center">
              © {new Date().getFullYear()} <span className="font-medium">NovuSys</span> — Todos os direitos reservados.
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
