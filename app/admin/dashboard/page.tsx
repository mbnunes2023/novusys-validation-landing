"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import ExportPDFButton from "../components/ExportPDFButton";

/* ===================== Tipos ===================== */
type Answer = {
  id: string;
  created_at: string;
  doctor_name: string | null;
  crm: string | null;
  contact: string | null;
  consent_contact: boolean | null;
  consent: boolean | null;

  doctor_role: string | null;         // “Geriatra”, “Dermatologista”, “Ortopedista”, “Outra”
  clinic_size: string | null;         // “Pequeno”, “Médio”, “Grande”

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

/* ===================== UI helpers ===================== */
const BRAND = "#1976d2";

function NoSSR({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <>{children}</>;
}

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full border text-sm transition ${
        active
          ? "bg-blue-50 border-blue-300 text-blue-700"
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/* ===================== Recharts: barra horizontal com índices ===================== */
function DistBar({
  title,
  data,
}: {
  title: string;
  data: Array<{ label: string; count: number }>;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartData = data.map((d) => {
    const pct = total ? Math.round((d.count / total) * 100) : 0;
    return {
      name: d.label,
      value: d.count,
      pct,
      rightLabel: `${d.count} (${pct}%)`,
    };
  });

  const max = Math.max(1, ...chartData.map((d) => d.value));
  const tickCount = Math.min(6, Math.max(3, max)); // índices no eixo X

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        <div className="text-xs text-slate-500">N={total}</div>
      </div>
      <div className="h-[190px]">
        <NoSSR>
          <ResponsiveContainer>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
            >
              <CartesianGrid stroke="#eef2f9" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, max]}
                tickCount={tickCount}
                tick={{ fontSize: 11, fill: "#64748b" }}
                stroke="#cbd5e1"
              />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fontSize: 12, fill: "#334155" }}
                stroke="#cbd5e1"
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                formatter={(v: any) => [String(v), "Respostas"]}
                labelFormatter={(l) => String(l)}
              />
              <Bar dataKey="value" radius={[6, 6, 6, 6]} fill={BRAND}>
                <LabelList
                  dataKey="rightLabel"
                  position="right"
                  style={{ fontSize: 11, fill: "#334155" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </NoSSR>
      </div>
    </div>
  );
}

/* ===================== Página ===================== */
export default function AdminDashboard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin");
    });
  }, [router]);

  // load respostas
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

  /* ===== Filtros ===== */
  const [quick, setQuick] = useState<"7" | "30" | "90" | "all">("all");
  const [dStart, setDStart] = useState<string>("");
  const [dEnd, setDEnd] = useState<string>("");

  const sizeOptions = ["Pequeno", "Médio", "Grande"] as const;
  const [sizes, setSizes] = useState<string[]>([]);

  const roleOptions = ["Geriatra", "Dermatologista", "Ortopedista", "Outra"] as const;
  const [roles, setRoles] = useState<string[]>([]);

  const [respondent, setRespondent] = useState<string>("all"); // "all" | "R-01"...

  function toggle<T extends string>(arr: T[], v: T, setter: (x: T[]) => void) {
    if (arr.includes(v)) setter(arr.filter((x) => x !== v));
    else setter([...arr, v]);
  }

  function resetFilters() {
    setQuick("all");
    setDStart("");
    setDEnd("");
    setSizes([]);
    setRoles([]);
    setRespondent("all");
  }

  // lista de respondentes p/ combobox
  const respondentOptions = useMemo(() => {
    return answers.map((_, i) => `R-${String(i + 1).padStart(2, "0")}`);
  }, [answers]);

  // aplica filtros
  const filtered = useMemo(() => {
    let start: Date | null = null;
    let end: Date | null = null;

    const today = new Date();
    if (quick !== "all") {
      const days = quick === "7" ? 7 : quick === "30" ? 30 : 90;
      end = today;
      start = new Date(today);
      start.setDate(today.getDate() - days);
    }
    if (dStart) start = new Date(dStart.split("/").reverse().join("-")); // dd/mm/aaaa -> aaaa-mm-dd
    if (dEnd) end = new Date(dEnd.split("/").reverse().join("-"));

    return answers.filter((a, idx) => {
      // período
      if (start || end) {
        const d = new Date(a.created_at);
        if (start && d < new Date(start.setHours(0, 0, 0, 0))) return false;
        if (end && d > new Date(end.setHours(23, 59, 59, 999))) return false;
      }
      // clinic size
      if (sizes.length && (!a.clinic_size || !sizes.includes(a.clinic_size))) return false;
      // role
      if (roles.length && (!a.doctor_role || !roles.includes(a.doctor_role))) return false;
      // respondent
      if (respondent !== "all") {
        const code = `R-${String(idx + 1).padStart(2, "0")}`;
        if (code !== respondent) return false;
      }
      return true;
    });
  }, [answers, quick, dStart, dEnd, sizes, roles, respondent]);

  /* ===== KPIs ===== */
  const kpi = useMemo(() => {
    const total = filtered.length;
    const noshowYes = filtered.filter((a) => a.q_noshow_relevance === "Sim").length;
    const glosaRec = filtered.filter((a) => a.q_glosa_is_problem === "Sim").length;
    const rxRework = filtered.filter((a) => a.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: total ? (noshowYes / total) * 100 : 0,
      glosaRecorrentePct: total ? (glosaRec / total) * 100 : 0,
      rxReworkPct: total ? (rxRework / total) * 100 : 0,
    };
  }, [filtered]);

  /* ===== Dados p/ gráficos ===== */
  function dist(
    field: keyof Answer,
    order: string[]
  ): Array<{ label: string; count: number }> {
    const counts: Record<string, number> = {};
    order.forEach((o) => (counts[o] = 0));
    filtered.forEach((a) => {
      const v = (a[field] as string) ?? "";
      if (order.includes(v)) counts[v] += 1;
    });
    return order.map((o) => ({ label: o, count: counts[o] || 0 }));
  }

  const gNoshowRelev = dist("q_noshow_relevance", ["Sim", "Não", "Parcialmente"]);
  const gNoshowSystem = dist("q_noshow_has_system", ["Sim", "Não"]);
  const gNoshowImpact = dist("q_noshow_financial_impact", [
    "Baixo impacto",
    "Médio impacto",
    "Alto impacto",
  ]);

  const gGlosaRec = dist("q_glosa_is_problem", ["Sim", "Não", "Às vezes"]);
  const gGlosaInt = dist("q_glosa_interest", ["Sim", "Não", "Talvez"]);
  const gGlosaWho = dist("q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]);

  const gRxRework = dist("q_rx_rework", ["Sim", "Não", "Raramente"]);
  const gRxDiff = dist("q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]);
  const gRxVal = dist("q_rx_tool_value", ["Sim", "Não", "Talvez"]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-xl border p-6 bg-white">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      {/* topo */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportPDFButton
          kpi={kpi}
          summaryRows={[]}
          answers={filtered}   // usa o dataset filtrado
        />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-700">Período rápido</div>
            <div className="flex flex-wrap gap-3">
              <Chip active={quick === "7"} onClick={() => setQuick("7")}>
                Últimos 7d
              </Chip>
              <Chip active={quick === "30"} onClick={() => setQuick("30")}>
                Últimos 30d
              </Chip>
              <Chip active={quick === "90"} onClick={() => setQuick("90")}>
                Últimos 90d
              </Chip>
              <Chip active={quick === "all"} onClick={() => setQuick("all")}>
                Tudo
              </Chip>
            </div>

            <div className="text-sm font-semibold text-slate-700 mt-4">Intervalo custom</div>
            <div className="flex items-center gap-3">
              <input
                value={dStart}
                onChange={(e) => setDStart(e.target.value)}
                placeholder="dd/mm/aaaa"
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="text-slate-500">até</span>
              <input
                value={dEnd}
                onChange={(e) => setDEnd(e.target.value)}
                placeholder="dd/mm/aaaa"
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-700">Tamanho do consultório/clínica</div>
            <div className="flex flex-wrap gap-3">
              {sizeOptions.map((s) => (
                <Chip
                  key={s}
                  active={sizes.includes(s)}
                  onClick={() => toggle(sizes, s, setSizes)}
                >
                  {s}
                </Chip>
              ))}
            </div>

            <div className="text-sm font-semibold text-slate-700 mt-4">Especialidade / Função</div>
            <div className="flex flex-wrap gap-3">
              {roleOptions.map((r) => (
                <Chip key={r} active={roles.includes(r)} onClick={() => toggle(roles, r, setRoles)}>
                  {r}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Respondente</span>
            <select
              value={respondent}
              onChange={(e) => setRespondent(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              {respondentOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Resetar filtros
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-700">Total de respostas (após filtros)</div>
          <div className="mt-3 text-4xl font-extrabold text-slate-900">{kpi.total}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-700">% no-show relevante</div>
          <div className="mt-3 text-4xl font-extrabold text-[var(--brand-1,#1976d2)]">
            {kpi.noshowYesPct.toFixed(0)}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-700">% glosas recorrentes</div>
          <div className="mt-3 text-4xl font-extrabold text-[var(--brand-1,#1976d2)]">
            {kpi.glosaRecorrentePct.toFixed(0)}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-700">% receitas geram retrabalho</div>
          <div className="mt-3 text-4xl font-extrabold text-[var(--brand-1,#1976d2)]">
            {kpi.rxReworkPct.toFixed(0)}%
          </div>
        </div>
      </section>

      {/* Seções com gráficos */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-800">No-show</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DistBar title="Relevância" data={gNoshowRelev} />
          <DistBar title="Possui sistema que resolve" data={gNoshowSystem} />
          <DistBar title="Impacto financeiro mensal" data={gNoshowImpact} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-800">Glosas</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DistBar title="Glosas recorrentes" data={gGlosaRec} />
          <DistBar title="Interesse em checagem antes do envio" data={gGlosaInt} />
          <DistBar title="Quem sofre mais" data={gGlosaWho} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-800">Receitas Digitais</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DistBar title="Receitas geram retrabalho" data={gRxRework} />
          <DistBar title="Pacientes têm dificuldade" data={gRxDiff} />
          <DistBar title="Valor em ferramenta de apoio" data={gRxVal} />
        </div>
      </section>
    </div>
  );
}
