"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import ExportPDFButton from "../components/ExportPDFButton";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ===== Tipos ===== */
type AnswerRow = {
  id: string;
  created_at: string;

  doctor_name: string | null;
  crm: string | null;
  contact: string | null;

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
};

/* Paleta/brand para gráficos */
const BRAND = {
  bar: "#1976d2",
  barAlt: "#6a11cb",
  gradient: "linear-gradient(135deg,#1976d2 0%,#6a11cb 50%,#2575fc 100%)",
};
const PIE_COLORS = ["#1976d2", "#6a11cb", "#2575fc", "#60a5fa", "#93c5fd"];

/* ===== Página ===== */
export default function AdminDashboard() {
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // refs para capturar imagens dos gráficos no PDF
  const noshowRef = useRef<HTMLDivElement>(null);
  const glosaRef = useRef<HTMLDivElement>(null);
  const rxRef = useRef<HTMLDivElement>(null);

  /* ==== Fetch Supabase ==== */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("validation_responses")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (mounted) setAnswers((data || []) as AnswerRow[]);
      } catch (e: any) {
        setErr(e.message || "Falha ao carregar respostas.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ==== Helpers para agregação ==== */
  const countByField = (arr: AnswerRow[], field: keyof AnswerRow) =>
    arr.reduce<Record<string, number>>((acc, r) => {
      const v = (r[field] as string) || "—";
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});

  const toChartArray = (obj: Record<string, number>) =>
    Object.entries(obj).map(([name, value]) => ({ name, value }));

  /* ==== KPIs ==== */
  const kpi = useMemo(() => {
    const total = answers.length;
    const noshowYes = answers.filter((a) => a.q_noshow_relevance === "Sim").length;
    const glosaRec = answers.filter((a) => a.q_glosa_is_problem === "Sim").length;
    const rxRework = answers.filter((a) => a.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: total ? (noshowYes / total) * 100 : 0,
      glosaRecorrentePct: total ? (glosaRec / total) * 100 : 0,
      rxReworkPct: total ? (rxRework / total) * 100 : 0,
    };
  }, [answers]);

  /* ==== Tabela-resumo (para PDF) ==== */
  const summaryRows = useMemo(() => {
    return [
      { pergunta: "No-show relevante?", ...countByField(answers, "q_noshow_relevance") },
      { pergunta: "Tem sistema para no-show?", ...countByField(answers, "q_noshow_has_system") },
      { pergunta: "Impacto financeiro", ...countByField(answers, "q_noshow_financial_impact") },
      { pergunta: "Glosas recorrentes?", ...countByField(answers, "q_glosa_is_problem") },
      { pergunta: "Checagem antes do envio", ...countByField(answers, "q_glosa_interest") },
      { pergunta: "Quem sofre mais", ...countByField(answers, "q_glosa_who_suffers") },
      { pergunta: "Receitas geram retrabalho?", ...countByField(answers, "q_rx_rework") },
      { pergunta: "Pacientes têm dificuldade?", ...countByField(answers, "q_rx_elderly_difficulty") },
      { pergunta: "Valor em ferramenta de apoio", ...countByField(answers, "q_rx_tool_value") },
    ];
  }, [answers]);

  /* ==== Dados dos gráficos ==== */
  const chartNoshow = useMemo(
    () => toChartArray(countByField(answers, "q_noshow_relevance")),
    [answers]
  );
  const chartGlosa = useMemo(
    () => toChartArray(countByField(answers, "q_glosa_is_problem")),
    [answers]
  );
  const chartRx = useMemo(
    () => toChartArray(countByField(answers, "q_rx_rework")),
    [answers]
  );

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

      {/* KPIs cards */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-slate-500 text-sm">Total de respostas</div>
          <div className="text-3xl font-extrabold mt-1">{kpi.total}</div>
        </div>
        <div className="card">
          <div className="text-slate-500 text-sm">% consideram no-show relevante</div>
          <div className="text-3xl font-extrabold mt-1">
            {kpi.noshowYesPct.toFixed(0)}%
          </div>
        </div>
        <div className="card">
          <div className="text-slate-500 text-sm">% relatam glosas recorrentes</div>
          <div className="text-3xl font-extrabold mt-1">
            {kpi.glosaRecorrentePct.toFixed(0)}%
          </div>
        </div>
      </section>

      {err && <div className="text-red-600">{err}</div>}
      {loading && <div>Carregando dados…</div>}

      {/* ===== No-show ===== */}
      <section className="card">
        <h2 className="card-title">No-show</h2>
        <p className="text-slate-600 mb-3">
          Distribuição das respostas para “No-show é relevante?”.
        </p>

        <div ref={noshowRef}>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartNoshow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={BRAND.bar} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ===== Glosas ===== */}
      <section className="card">
        <h2 className="card-title">Glosas</h2>
        <p className="text-slate-600 mb-3">
          Percentual de recorrência de glosas (Sim/Não/Às vezes).
        </p>

        <div ref={glosaRef}>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartGlosa}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {chartGlosa.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ===== Receitas Digitais ===== */}
      <section className="card">
        <h2 className="card-title">Receitas Digitais</h2>
        <p className="text-slate-600 mb-3">
          Distribuição das respostas para “Receitas digitais geram retrabalho?”.
        </p>

        <div ref={rxRef}>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartRx}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={BRAND.barAlt} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Lista compacta das últimas respostas (amostra) */}
      <section className="card">
        <h2 className="card-title">Últimas respostas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Nome</th>
                <th className="py-2 pr-4">No-show</th>
                <th className="py-2 pr-4">Glosas</th>
                <th className="py-2 pr-4">Receitas digitais</th>
                <th className="py-2">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {answers.slice(0, 25).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-4">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2 pr-4">{r.doctor_name || "—"}</td>
                  <td className="py-2 pr-4">{r.q_noshow_relevance || "—"}</td>
                  <td className="py-2 pr-4">{r.q_glosa_is_problem || "—"}</td>
                  <td className="py-2 pr-4">{r.q_rx_rework || "—"}</td>
                  <td className="py-2">{r.comments || "—"}</td>
                </tr>
              ))}
              {!answers.length && !loading && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={6}>
                    Nenhuma resposta encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
