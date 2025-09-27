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

  doctor_role: string | null; // “Geriatra”, “Dermatologista”, “Ortopedista”, “Outra”
  clinic_size: string | null; // “Pequeno”, “Médio”, “Grande”

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

/* ===================== Confiança + Plano de Ação ===================== */
function getConfidenceAndPlan(N: number) {
  if (N < 10) {
    return {
      level: "Amostra pequena",
      color: "bg-orange-50 text-orange-700 border-orange-200",
      bullets: [
        "Ampliar a coleta: divulgar pesquisa para alcançar ≥ 30 respostas.",
        "Focar em ICP (tamanho e especialidade) com maior propensão a dor.",
        "Conduzir 3–5 entrevistas qualitativas para validar hipóteses.",
      ],
    };
  }
  if (N < 30) {
    return {
      level: "Amostra moderada",
      color: "bg-amber-50 text-amber-700 border-amber-200",
      bullets: [
        "Iniciar protótipos/pilotos em 1–2 clínicas dispostas.",
        "Medir baseline (no-show, glosa, tempo de receita) por 2 semanas.",
        "Aprimorar questionário para capturar intensidade/valor monetário.",
      ],
    };
  }
  return {
    level: "Amostra robusta",
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      bullets: [
        "Priorizar tema líder e iniciar MVP com metas de ROI claras.",
        "Planejar integrações com sistemas da clínica (agenda, faturamento).",
        "Definir pricing piloto e contrato de valor (SaaS/assinatura).",
      ],
  };
}

/* ===================== Helpers para espelhar o PDF (chips/cards) ===================== */

const tone = (text: string) => {
  const v = text.toLowerCase();
  if (v.includes("não informado") || v === "—")
    return { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200" };
  if (v === "não") return { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200" };
  if (v === "sim") return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" };
  if (["às vezes", "parcialmente", "em parte", "raramente", "talvez"].includes(v))
    return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" };
  return { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200" };
};

const Pill = ({ label }: { label: string }) => {
  const t = tone(label || "Não informado");
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ${t.bg} ${t.text} ${t.ring}`}
      style={{ lineHeight: 1.2 }}
    >
      {label}
    </span>
  );
};

const safe = (v: any) =>
  v == null || v === "" ? "Não informado" : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v);

function DetailedCard({ a, index }: { a: Answer; index: number }) {
  const code = `R-${String(index + 1).padStart(2, "0")}`;
  const consent = !!(a.consent_contact || a.consent);
  const idLine = [safe(a.doctor_name), safe(a.crm), safe(a.contact)]
    .filter((t) => t && t !== "Não informado")
    .join(" • ");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 min-h-[280px] flex flex-col">
      <div className="text-sm font-bold text-slate-900">Resposta {code}</div>
      {consent && idLine && (
        <div className="mt-1 text-xs text-slate-500 break-words">{idLine}</div>
      )}

      <div className="mt-3 space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-700">No-show</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill label={safe(a.q_noshow_relevance)} />
            <Pill label={safe(a.q_noshow_has_system)} />
            <Pill label={safe(a.q_noshow_financial_impact)} />
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-700">Glosas</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill label={safe(a.q_glosa_is_problem)} />
            <Pill label={safe(a.q_glosa_interest)} />
            <Pill label={safe(a.q_glosa_who_suffers)} />
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-700">Receitas digitais</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill label={safe(a.q_rx_rework)} />
            <Pill label={safe(a.q_rx_elderly_difficulty)} />
            <Pill label={safe(a.q_rx_tool_value)} />
          </div>
        </div>
      </div>

      {a.comments && a.comments.trim().length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-700">Comentário (resumo)</div>
          <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap break-words">
            {a.comments}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentsList({ list }: { list: Array<{ code: string; text: string }> }) {
  if (!list.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold text-slate-800">Comentários (texto livre)</h3>
      <div className="mt-3 space-y-2">
        {list.map((c) => (
          <div key={c.code} className="text-sm text-slate-800">
            <span className="font-semibold">{c.code}</span> — {c.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function IdentificationTable({
  rows,
}: {
  rows: Array<{ code: string; nome: string; crm: string; contato: string }>;
}) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold text-slate-800">
        Identificação (somente com autorização de contato)
      </h3>
      <p className="text-sm text-slate-500 mt-1">
        Os dados aparecem apenas quando o respondente marcou o consentimento.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="text-left text-slate-600">
            <tr>
              <th className="py-2 pr-4">Resp.</th>
              <th className="py-2 pr-4">Nome</th>
              <th className="py-2 pr-4">CRM</th>
              <th className="py-2 pr-4">Contato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="py-2 pr-4">{r.code}</td>
                <td className="py-2 pr-4">{r.nome || "—"}</td>
                <td className="py-2 pr-4">{r.crm || "—"}</td>
                <td className="py-2 pr-4 break-words">{r.contato || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  /* ===== Confiança + Plano de ação (derivado de N) ===== */
  const plan = useMemo(() => getConfidenceAndPlan(kpi.total), [kpi.total]);

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

  /* ===== Dados adicionais para espelhar PDF ===== */
  const comments = useMemo(
    () =>
      filtered
        .map((a, i) => ({
          code: `R-${String(i + 1).padStart(2, "0")}`,
          text: (a.comments || "").toString().trim(),
        }))
        .filter((c) => c.text.length > 0),
    [filtered]
  );

  const idRows = useMemo(
    () =>
      filtered
        .filter((a) => a.consent_contact === true || a.consent === true)
        .map((a, i) => ({
          code: `R-${String(i + 1).padStart(2, "0")}`,
          nome: (a.doctor_name || "").trim(),
          crm: (a.crm || "").trim(),
          contato: (a.contact || "").trim(),
        }))
        .filter((r) => r.nome || r.crm || r.contato),
    [filtered]
  );

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
          answers={filtered} // usa o dataset filtrado
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

      {/* Confiança da amostra + Plano de ação */}
      <section className={`rounded-2xl border p-5 ${plan.color}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Confiança da amostra</div>
            <div className="text-2xl font-extrabold mt-1">{plan.level}</div>
            <div className="text-sm mt-1 opacity-80">N = {kpi.total}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">Plano de ação recomendado</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {plan.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
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

      {/* ====== NOVO: Respostas detalhadas (cartões) ====== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Respostas detalhadas (cartões)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {filtered.map((a, i) => (
            <DetailedCard key={a.id ?? i} a={a} index={i} />
          ))}
        </div>
      </section>

      {/* ====== NOVO: Comentários ====== */}
      <CommentsList list={comments} />

      {/* ====== NOVO: Identificação (com consentimento) ====== */}
      <IdentificationTable rows={idRows} />
    </div>
  );
}
