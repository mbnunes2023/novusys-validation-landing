// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ExportPDFButton from "../components/ExportPDFButton";

// Recharts
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";

/* ============================ Tipos ============================ */

type Answer = {
  id: string;
  created_at: string; // ISO
  doctor_name: string | null;
  crm: string | null;
  contact: string | null;
  consent_contact: boolean | null;
  consent: boolean | null;

  clinic_size: "Pequeno" | "Médio" | "Grande" | null;
  doctor_role: "Geriatra" | "Dermatologista" | "Ortopedista" | "Outra" | null;

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

/* ============================ Utils ============================ */

const BRAND = "#1976d2";

function trunc(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoToDate(d: string) {
  // normaliza para data (sem hora) em local time
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function parseBRDate(s: string): Date | null {
  // dd/mm/aaaa
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s?.trim() ?? "");
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const yy = Number(m[3]);
  const d = new Date(yy, mm, dd);
  return isNaN(d.getTime()) ? null : d;
}

type Dist = Array<{ label: string; count: number }>;

function distribution(
  rows: Answer[],
  key: keyof Answer,
  options: string[]
): Dist {
  const map = new Map<string, number>();
  options.forEach((o) => map.set(o, 0));
  for (const a of rows) {
    const v = (a[key] as string) || "";
    if (map.has(v)) map.set(v, (map.get(v) || 0) + 1);
  }
  return options.map((o) => ({ label: o, count: map.get(o) || 0 }));
}

/* ========== Aux: renderizar somente após montar no cliente (evita crash do Recharts em SSR) ========== */
function NoSSR({ children, height = 180 }: { children: React.ReactNode; height?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div style={{ height }} />;
  return <>{children}</>;
}

/* ============================ Componentes base ============================ */

// KPI Donut
function KpiDonut({ title, valuePct }: { title: string; valuePct: number }) {
  const v = Math.max(0, Math.min(100, Math.round(valuePct)));
  const data = [
    { name: title, value: v },
    { name: "Restante", value: 100 - v },
  ];
  return (
    <div className="card">
      <div className="text-sm font-semibold text-slate-700 mb-1">{title}</div>
      <div className="relative h-[120px] w-full">
        <NoSSR height={120}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                innerRadius={42}
                outerRadius={56}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                <Cell fill={BRAND} />
                <Cell fill="#e8f0fe" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </NoSSR>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-3xl font-extrabold text-[var(--brand-1)]">{v}%</div>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: BRAND }} />
          {title}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#e8f0fe" }} />
          Restante
        </span>
      </div>
    </div>
  );
}

// Barras horizontais com eixos/ticks, rótulos e tooltip
function DistBar({ title, data }: { title: string; data: Dist }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartData = data.map((d) => ({
    name: d.label,
    value: d.count,
    pct: total ? Math.round((d.count / total) * 100) : 0,
  }));
  const max = Math.max(1, ...chartData.map((d) => d.value));
  const tickCount = Math.min(5, Math.max(3, max));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        <div className="text-xs text-slate-500">N={total}</div>
      </div>
      <div className="h-[180px]">
        <NoSSR>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
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
                width={140}
                tick={{ fontSize: 12, fill: "#334155" }}
                stroke="#cbd5e1"
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                formatter={(value: any, _n, e: any) => [`${value} (${e?.payload?.pct ?? 0}%)`, "Respostas"]}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="value" radius={[6, 6, 6, 6]} fill={BRAND}>
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number, _n: any, e: any) => `${v} (${e.payload.pct}%)`}
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

/* ============================ Página ============================ */

export default function AdminDashboard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const [sizes, setSizes] = useState<Set<Answer["clinic_size"]>>(new Set());
  const [roles, setRoles] = useState<Set<Answer["doctor_role"]>>(new Set());
  const [respondent, setRespondent] = useState<"Todos" | "Com contato" | "Sem contato">("Todos");

  // sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin");
    });
  }, [router]);

  // carregar dados
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

  // aplicar filtros
  const filtered = useMemo(() => {
    if (!answers.length) return [];

    let from: Date | null = null;
    let to: Date | null = null;

    if (range !== "all") {
      const now = trunc(new Date());
      to = now;
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      from = new Date(now);
      from.setDate(from.getDate() - (days - 1));
    }

    // intervalo custom (só se ambas válidas)
    const f = customFrom ? parseBRDate(customFrom) : null;
    const t = customTo ? parseBRDate(customTo) : null;
    if (f && t) {
      from = trunc(f);
      to = trunc(t);
    }

    const sizeActive = sizes.size > 0;
    const roleActive = roles.size > 0;

    return answers.filter((a) => {
      if (from && to) {
        const d = isoToDate(a.created_at);
        if (d < from || d > to) return false;
      }
      if (sizeActive && !sizes.has(a.clinic_size)) return false;
      if (roleActive && !roles.has(a.doctor_role)) return false;

      const hasContact = (a.consent_contact || a.consent) ? true : false;
      if (respondent === "Com contato" && !hasContact) return false;
      if (respondent === "Sem contato" && hasContact) return false;

      return true;
    });
  }, [answers, range, customFrom, customTo, sizes, roles, respondent]);

  // KPIs
  const kpi = useMemo(() => {
    const tot = filtered.length;
    const noshowYes = filtered.filter((a) => a.q_noshow_relevance === "Sim").length;
    const glosaYes = filtered.filter((a) => a.q_glosa_is_problem === "Sim").length;
    const rxYes = filtered.filter((a) => a.q_rx_rework === "Sim").length;
    return {
      total: tot,
      noshowYesPct: tot ? (noshowYes / tot) * 100 : 0,
      glosaRecorrentePct: tot ? (glosaYes / tot) * 100 : 0,
      rxReworkPct: tot ? (rxYes / tot) * 100 : 0,
    };
  }, [filtered]);

  // Distros
  const distNoshow = useMemo(
    () => ({
      relev: distribution(filtered, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]),
      sys: distribution(filtered, "q_noshow_has_system", ["Sim", "Não"]),
      impact: distribution(filtered, "q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]),
    }),
    [filtered]
  );

  const distGlosas = useMemo(
    () => ({
      rec: distribution(filtered, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]),
      chk: distribution(filtered, "q_glosa_interest", ["Sim", "Não", "Talvez"]),
      who: distribution(filtered, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]),
    }),
    [filtered]
  );

  const distRx = useMemo(
    () => ({
      rw: distribution(filtered, "q_rx_rework", ["Sim", "Não", "Raramente"]),
      dif: distribution(filtered, "q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]),
      val: distribution(filtered, "q_rx_tool_value", ["Sim", "Não", "Talvez"]),
    }),
    [filtered]
  );

  const resetFilters = () => {
    setRange("all");
    setCustomFrom("");
    setCustomTo("");
    setSizes(new Set());
    setRoles(new Set());
    setRespondent("Todos");
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="card">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportPDFButton
          kpi={kpi}
          summaryRows={[]}
          answers={filtered}
        />
      </div>

      {/* FILTROS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Período */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Período rápido</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "7d", label: "Últimos 7d" },
                { id: "30d", label: "Últimos 30d" },
                { id: "90d", label: "Últimos 90d" },
                { id: "all", label: "Tudo" },
              ].map((b: any) => (
                <button
                  key={b.id}
                  onClick={() => setRange(b.id)}
                  className={`px-4 py-2 rounded-full border ${range === b.id ? "bg-[var(--brand-1)] text-white border-[var(--brand-1)]" : "border-slate-300 text-slate-700 bg-white"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <div className="text-sm font-semibold text-slate-700 mb-2">Intervalo custom</div>
              <div className="flex items-center gap-2">
                <input
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  placeholder="dd/mm/aaaa"
                  className="input w-40"
                />
                <span className="text-slate-500">até</span>
                <input
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  placeholder="dd/mm/aaaa"
                  className="input w-40"
                />
              </div>
            </div>
          </div>

          {/* Dimensões */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Tamanho do consultório/clínica</div>
              <div className="flex flex-wrap gap-2">
                {(["Pequeno", "Médio", "Grande"] as const).map((opt) => {
                  const active = sizes.has(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const n = new Set(sizes);
                        active ? n.delete(opt) : n.add(opt);
                        setSizes(n);
                      }}
                      className={`px-4 py-2 rounded-full border ${active ? "bg-[var(--brand-1)] text-white border-[var(--brand-1)]" : "border-slate-300 text-slate-700 bg-white"}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Especialidade / Função</div>
              <div className="flex flex-wrap gap-2">
                {(["Geriatra", "Dermatologista", "Ortopedista", "Outra"] as const).map((opt) => {
                  const active = roles.has(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const n = new Set(roles);
                        active ? n.delete(opt) : n.add(opt);
                        setRoles(n);
                      }}
                      className={`px-4 py-2 rounded-full border ${active ? "bg-[var(--brand-1)] text-white border-[var(--brand-1)]" : "border-slate-300 text-slate-700 bg-white"}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">Respondente</div>
                <select
                  value={respondent}
                  onChange={(e) => setRespondent(e.target.value as any)}
                  className="input"
                >
                  <option>Todos</option>
                  <option>Com contato</option>
                  <option>Sem contato</option>
                </select>
              </div>

              <button onClick={resetFilters} className="px-4 py-2 rounded-xl border border-slate-300">
                Resetar filtros
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-lg font-bold text-slate-900">Total de respostas (após filtros)</div>
          <div className="mt-2 text-4xl font-extrabold text-slate-900">{kpi.total}</div>
        </div>
        <KpiDonut title="% no-show relevante" valuePct={kpi.noshowYesPct} />
        <KpiDonut title="% glosas recorrentes" valuePct={kpi.glosaRecorrentePct} />
        <KpiDonut title="% receitas geram retrabalho" valuePct={kpi.rxReworkPct} />
      </section>

      {/* NO-SHOW */}
      <section className="card">
        <h2 className="card-title mb-4">No-show</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <DistBar title="Relevância" data={distNoshow.relev} />
          <DistBar title="Possui sistema que resolve" data={distNoshow.sys} />
          <DistBar title="Impacto financeiro mensal" data={distNoshow.impact} />
        </div>
      </section>

      {/* GLOSAS */}
      <section className="card">
        <h2 className="card-title mb-4">Glosas</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <DistBar title="Glosas recorrentes" data={distGlosas.rec} />
          <DistBar title="Checagem antes do envio" data={distGlosas.chk} />
          <DistBar title="Quem sofre mais" data={distGlosas.who} />
        </div>
      </section>

      {/* RECEITAS DIGITAIS */}
      <section className="card">
        <h2 className="card-title mb-4">Receitas Digitais</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <DistBar title="Geram retrabalho" data={distRx.rw} />
          <DistBar title="Dificuldade dos pacientes" data={distRx.dif} />
          <DistBar title="Valor em ferramenta de apoio" data={distRx.val} />
        </div>
      </section>

      {/* LISTA DE RESPONDENTES */}
      <section className="card">
        <h2 className="card-title mb-4">Respondentes (dados para contato, quando autorizados)</h2>
        <div className="space-y-2">
          {filtered.map((a, i) => {
            const consented = a.consent_contact || a.consent;
            const name = (a.doctor_name || "").trim();
            const crm = (a.crm || "").trim();
            const contact = (a.contact || "").trim();
            const show =
              consented && (name.length > 0 || crm.length > 0 || contact.length > 0);

            return (
              <div key={a.id} className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-800">R-{String(i + 1).padStart(2, "0")}</div>
                  <div className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {show ? (
                    <>
                      {name && <span className="mr-3"><b>Nome:</b> {name}</span>}
                      {crm && <span className="mr-3"><b>CRM:</b> {crm}</span>}
                      {contact && <span className="mr-3"><b>Contato:</b> {contact}</span>}
                    </>
                  ) : (
                    <span className="text-slate-500">Sem autorização de contato ou dados não informados.</span>
                  )}
                </div>
              </div>
            );
          })}
          {!filtered.length && (
            <div className="text-sm text-slate-500">Nenhuma resposta neste conjunto de filtros.</div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================ Estilos utilitários ============================
.card { @apply rounded-2xl border border-slate-200 bg-white p-4; }
.card-title { @apply text-lg font-bold text-slate-900; }
.input { @apply px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-1)]; }
============================================================================= */
