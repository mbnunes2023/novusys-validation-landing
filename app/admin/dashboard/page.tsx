// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient"; // <- caminho correto
import ExportPDFButton from "../components/ExportPDFButton";

type Answer = {
  id: string;
  created_at: string;
  doctor_name: string | null;
  crm: string | null;
  contact: string | null;
  consent_contact: boolean | null;
  doctor_role: string | null;
  clinic_size: string | null;
  q_noshow_relevance: string | null;
  q_noshow_has_system: string | null;
  q_noshow_financial_impact: string | null;
  q_glosa_is_problem: string | null;
  q_glosa_interest: string | null;
  q_glosa_who_suffers: string | null;
  q_rx_rework: string | null;
  q_rx_elderly_difficulty: string | null;
  q_rx_tool_value: string | null;
  comments: string | null;
  consent: boolean | null;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // Refs dos gráficos (serão renderizados aqui e "fotografados" no PDF)
  const noshowRef = useRef<HTMLDivElement>(null);
  const glosaRef  = useRef<HTMLDivElement>(null);
  const rxRef     = useRef<HTMLDivElement>(null);

  // Verifica sessão; se não logado, volta para /admin
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin");
    });
  }, [router]);

  // Carrega respostas
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("validation_responses")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) setAnswers(data as Answer[]);
      setLoading(false);
    })();
  }, []);

  // KPIs rápidos
  const kpi = useMemo(() => {
    const total = answers.length;
    const noshowYes = answers.filter(a => a.q_noshow_relevance === "Sim").length;
    const glosaRec = answers.filter(a => a.q_glosa_is_problem === "Sim").length;
    const rxRework = answers.filter(a => a.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: total ? (noshowYes / total) * 100 : 0,
      glosaRecorrentePct: total ? (glosaRec / total) * 100 : 0,
      rxReworkPct: total ? (rxRework / total) * 100 : 0,
    };
  }, [answers]);

  // Resumo por pergunta (contagens)
  const summaryRows = useMemo(() => {
    const count = (arr: any[], field: keyof Answer) =>
      arr.reduce<Record<string, number>>((acc, r) => {
        const v = (r[field] as string) || "—";
        acc[v] = (acc[v] || 0) + 1;
        return acc;
      }, {});
    return [
      { pergunta: "No-show relevante?",           ...count(answers, "q_noshow_relevance") },
      { pergunta: "Sistema p/ no-show?",          ...count(answers, "q_noshow_has_system") },
      { pergunta: "Impacto financeiro",           ...count(answers, "q_noshow_financial_impact") },
      { pergunta: "Glosas recorrentes?",          ...count(answers, "q_glosa_is_problem") },
      { pergunta: "Checagem antes do envio",      ...count(answers, "q_glosa_interest") },
      { pergunta: "Quem sofre mais",              ...count(answers, "q_glosa_who_suffers") },
      { pergunta: "Receitas geram retrabalho?",   ...count(answers, "q_rx_rework") },
      { pergunta: "Pacientes têm dificuldade?",   ...count(answers, "q_rx_elderly_difficulty") },
      { pergunta: "Valor em ferramenta de apoio", ...count(answers, "q_rx_tool_value") },
    ];
  }, [answers]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="card">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportPDFButton
          kpi={kpi}
          summaryRows={summaryRows}
          answers={answers}
          chartRefs={{ noshowRef, glosaRef, rxRef }}
        />
      </div>

      {/* KPIs rápidos on-screen */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="card-title">Total de respostas</div>
          <div className="text-3xl font-extrabold mt-2">{kpi.total}</div>
        </div>
        <div className="card">
          <div className="card-title">% no-show relevante</div>
          <div className="text-3xl font-extrabold mt-2">{kpi.noshowYesPct.toFixed(0)}%</div>
        </div>
        <div className="card">
          <div className="card-title">% glosas recorrentes</div>
          <div className="text-3xl font-extrabold mt-2">{kpi.glosaRecorrentePct.toFixed(0)}%</div>
        </div>
      </section>

      {/* “Áreas” dos gráficos — os componentes de gráfico podem ser adicionados aqui */}
      <section className="card">
        <h2 className="card-title">No-show</h2>
        <div ref={noshowRef} className="mt-3">
          {/* Renderize aqui um BarChart/PieChart se quiser visual on-screen.
              Mesmo vazio, o PDF criará o placeholder. */}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Glosas</h2>
        <div ref={glosaRef} className="mt-3" />
      </section>

      <section className="card">
        <h2 className="card-title">Receitas Digitais</h2>
        <div ref={rxRef} className="mt-3" />
      </section>
    </div>
  );
}
