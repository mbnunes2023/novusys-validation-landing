// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ExportPDFButton from "../components/ExportPDFButton";
import { supabase } from "@/lib/supabaseClient";

/* ======================== Tipos ======================== */

type Answer = {
  id: string;
  created_at: string;              // ISO do Supabase
  doctor_name: string | null;
  crm: string | null;
  contact: string | null;
  consent_contact: boolean | null;
  consent: boolean | null;

  // filtros
  doctor_role: string | null;      // Geriatra | Dermatologista | Ortopedista | Outra
  clinic_size: string | null;      // Pequeno | Médio | Grande

  // perguntas
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

type KPI = {
  total: number;
  noshowYesPct: number;
  glosaRecorrentePct: number;
  rxReworkPct: number;
};

/* ======================== Constantes UI ======================== */

const ROLES = ["Geriatra", "Dermatologista", "Ortopedista", "Outra"] as const;
const CLINIC_SIZES = ["Pequeno", "Médio", "Grande"] as const;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function parseBRDate(input: string | null) {
  // dd/mm/aaaa -> Date | null
  if (!input) return null;
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(dt.getTime()) ? null : dt;
}

/* ======================== Botões "Pill" ======================== */

function Pill({
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
      className={`px-4 py-2 rounded-full border transition ${
        active
          ? "bg-blue-50 border-blue-400 text-blue-700"
          : "bg-white border-slate-300 text-slate-700 hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

/* ======================== Página ======================== */

export default function AdminDashboard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [quick, setQuick] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [fromStr, setFromStr] = useState<string>(""); // dd/mm/aaaa
  const [toStr, setToStr] = useState<string>("");

  const [roleSel, setRoleSel] = useState<string[]>([]);        // multi
  const [sizeSel, setSizeSel] = useState<string[]>([]);        // multi

  // sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin"); // volta ao login se não autenticado
    });
  }, [router]);

  // carrega dados
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

  // datas efetivas para filtro
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    if (quick !== "all") {
      const days = quick === "7d" ? 7 : quick === "30d" ? 30 : 90;
      const from = new Date(now);
      from.setDate(from.getDate() - (days - 1)); // inclui hoje
      return { fromDate: startOfDay(from), toDate: endOfDay(now) };
    }
    const from = parseBRDate(fromStr);
    const to = parseBRDate(toStr);
    return {
      fromDate: from ? startOfDay(from) : null,
      toDate: to ? endOfDay(to) : null,
    };
  }, [quick, fromStr, toStr]);

  // aplica filtros
  const filtered = useMemo(() => {
    return answers.filter((a) => {
      // data
      if (fromDate || toDate) {
        const d = new Date(a.created_at);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      // role
      if (roleSel.length > 0) {
        const v = (a.doctor_role || "").trim();
        if (!roleSel.includes(v)) return false;
      }
      // tamanho
      if (sizeSel.length > 0) {
        const v = (a.clinic_size || "").trim();
        if (!sizeSel.includes(v)) return false;
      }
      return true;
    });
  }, [answers, fromDate, toDate, roleSel, sizeSel]);

  // KPIs sobre filtrado
  const kpi: KPI = useMemo(() => {
    const total = filtered.length;
    const noshowYes = filtered.filter((r) => r.q_noshow_relevance === "Sim").length;
    const glosaYes = filtered.filter((r) => r.q_glosa_is_problem === "Sim").length;
    const rxYes = filtered.filter((r) => r.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: total ? (noshowYes / total) * 100 : 0,
      glosaRecorrentePct: total ? (glosaYes / total) * 100 : 0,
      rxReworkPct: total ? (rxYes / total) * 100 : 0,
    };
  }, [filtered]);

  // reset
  const resetFilters = () => {
    setQuick("all");
    setFromStr("");
    setToStr("");
    setRoleSel([]);
    setSizeSel([]);
  };

  // helpers de seleção (toggle)
  const toggleMany = (arr: string[], setArr: (v: string[]) => void, value: string) => {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-slate-700">Carregando…</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <ExportPDFButton
          kpi={kpi}
          summaryRows={[]}     // compatibilidade
          answers={filtered}   // <<< exporta exatamente o que está filtrado
        />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Período Rápido + Custom */}
          <div className="lg:col-span-2">
            <div className="text-sm font-semibold text-slate-700 mb-2">Período rápido</div>
            <div className="flex flex-wrap gap-2">
              <Pill active={quick === "7d"} onClick={() => setQuick("7d")}>Últimos 7d</Pill>
              <Pill active={quick === "30d"} onClick={() => setQuick("30d")}>Últimos 30d</Pill>
              <Pill active={quick === "90d"} onClick={() => setQuick("90d")}>Últimos 90d</Pill>
              <Pill active={quick === "all"} onClick={() => setQuick("all")}>Tudo</Pill>
            </div>

            <div className="mt-4 text-sm font-semibold text-slate-700 mb-2">Intervalo custom</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                value={fromStr}
                onChange={(e) => { setFromStr(e.target.value); setQuick("all"); }}
                className="w-40 rounded-lg border border-slate-300 px-3 py-2"
              />
              <span className="text-slate-500">até</span>
              <input
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                value={toStr}
                onChange={(e) => { setToStr(e.target.value); setQuick("all"); }}
                className="w-40 rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          {/* Dimensões de filtro (alinha com o formulário) */}
          <div className="lg:col-span-1">
            <div className="text-sm font-semibold text-slate-700 mb-2">Tamanho do consultório/clínica</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {CLINIC_SIZES.map((s) => (
                <Pill
                  key={s}
                  active={sizeSel.includes(s)}
                  onClick={() => toggleMany(sizeSel, setSizeSel, s)}
                >
                  {s}
                </Pill>
              ))}
            </div>

            <div className="text-sm font-semibold text-slate-700 mb-2">Especialidade / Função</div>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <Pill
                  key={r}
                  active={roleSel.includes(r)}
                  onClick={() => toggleMany(roleSel, setRoleSel, r)}
                >
                  {r}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Resetar filtros
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900">Total de respostas (após filtros)</div>
          <div className="mt-3 text-4xl font-extrabold text-slate-900">{kpi.total}</div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900">% no-show relevante</div>
          <div className="mt-3 text-4xl font-extrabold text-blue-600">{kpi.noshowYesPct.toFixed(0)}%</div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900">% glosas recorrentes</div>
          <div className="mt-3 text-4xl font-extrabold text-blue-600">{kpi.glosaRecorrentePct.toFixed(0)}%</div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-slate-900">% receitas geram retrabalho</div>
          <div className="mt-3 text-4xl font-extrabold text-blue-600">{kpi.rxReworkPct.toFixed(0)}%</div>
        </div>
      </section>

      {/* Slots para gráficos/áreas (se quiser adicionar) */}
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-slate-900">No-show</h2>
        <p className="text-slate-500 mt-2">
          Insira aqui gráficos (ex.: Recharts) usando <code>filtered</code> como fonte de dados.
        </p>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-slate-900">Glosas</h2>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-slate-900">Receitas Digitais</h2>
      </section>
    </div>
  );
}
