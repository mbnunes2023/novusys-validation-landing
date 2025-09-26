// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

/* ===================== Helpers / Cores ===================== */

const BRAND_1 = "#1976d2";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const EDGE = "#e9edf7";

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 100) : 0;
}
function fmt(n: number) {
  return Intl.NumberFormat("pt-BR").format(n);
}
function toDateKey(s: string) {
  const d = new Date(s);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function codeFromIndex(i: number) {
  return `R-${String(i + 1).padStart(2, "0")}`;
}
function isWithin(dateISO: string, from?: string | null, to?: string | null) {
  const t = new Date(dateISO).getTime();
  if (from) {
    const f = new Date(from).getTime();
    if (t < f) return false;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (t > end.getTime()) return false;
  }
  return true;
}

/* ===================== Micro-Componentes (SVG) ===================== */

function Sparkline({ values, width = 120, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return <svg width={width} height={height} />;
  const max = Math.max(...values, 1);
  const stepX = width / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const area = `M0,${height} L${pts.join(" ")} L${width},${height} Z`;
  const line = `M${pts.join(" L")}`;
  return (
    <svg width={width} height={height}>
      <path d={area} fill="rgba(25,118,210,0.10)" />
      <path d={line} stroke={BRAND_1} strokeWidth="2" fill="none" />
    </svg>
  );
}

function Donut({
  value,
  total = 100,
  size = 110,
  stroke = 12,
  color = BRAND_1,
}: {
  value: number;
  total?: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctValue = Math.max(0, Math.min(100, total ? (value / total) * 100 : 0));
  const dash = (pctValue / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={EDGE} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontWeight={800} fill={color} fontSize="18">
        {Math.round(pctValue)}%
      </text>
    </svg>
  );
}

function BarRow({
  label,
  count,
  pctValue,
  maxPct,
}: {
  label: string;
  count: number;
  pctValue: number;
  maxPct: number;
}) {
  const widthPct = maxPct ? Math.max(2, Math.round((pctValue / maxPct) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-slate-500 min-w-[180px]">{label} — {count} ({pctValue}%)</div>
      <div className="flex-1 h-3 rounded-full bg-slate-100 ring-1 ring-slate-200/70 overflow-hidden">
        <div className="h-3 rounded-full" style={{ width: `${widthPct}%`, background: BRAND_1 }} />
      </div>
    </div>
  );
}

/* ===================== Página ===================== */

export default function AdminDashboard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [quickRange, setQuickRange] = useState<"" | "7D" | "30D" | "90D">("");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null); // R-XX

  // refs (compatível com ExportPDFButton)
  const noshowRef = useRef<HTMLDivElement>(null);
  const glosaRef = useRef<HTMLDivElement>(null);
  const rxRef = useRef<HTMLDivElement>(null);

  // Sessão
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin");
    });
  }, [router]);

  // Carrega dados
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("validation_responses")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data) setAnswers(data as Answer[]);
      setLoading(false);
    })();
  }, []);

  // Opções dinâmicas
  const clinicSizes = useMemo(() => {
    return Array.from(new Set(answers.map(a => (a.clinic_size || "").trim()).filter(Boolean)));
  }, [answers]);
  const roles = useMemo(() => {
    return Array.from(new Set(answers.map(a => (a.doctor_role || "").trim()).filter(Boolean)));
  }, [answers]);

  // Atualiza período rápido
  useEffect(() => {
    if (!quickRange) return;
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const days = quickRange === "7D" ? 7 : quickRange === "30D" ? 30 : 90;
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    setFromDate(from.toISOString().slice(0, 10));
    setToDate(to);
  }, [quickRange]);

  // Dataset filtrado (multi-filtros + respondente)
  const filtered = useMemo(() => {
    let arr = answers;
    // período
    arr = arr.filter(a => isWithin(a.created_at, fromDate, toDate));
    // size
    if (sizeFilter.length) {
      arr = arr.filter(a => sizeFilter.includes((a.clinic_size || "").trim()));
    }
    // role
    if (roleFilter.length) {
      arr = arr.filter(a => roleFilter.includes((a.doctor_role || "").trim()));
    }
    // respondente
    if (selectedCode) {
      const idx = parseInt(selectedCode.replace("R-", ""), 10) - 1;
      if (idx >= 0 && idx < answers.length) arr = [answers[idx]];
    }
    return arr;
  }, [answers, fromDate, toDate, sizeFilter, roleFilter, selectedCode]);

  /* ===== KPI ===== */
  const kpi = useMemo(() => {
    const total = filtered.length;
    const noshowYes = filtered.filter((a) => a.q_noshow_relevance === "Sim").length;
    const glosaRec  = filtered.filter((a) => a.q_glosa_is_problem === "Sim").length;
    const rxRework  = filtered.filter((a) => a.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: total ? (noshowYes / total) * 100 : 0,
      glosaRecorrentePct: total ? (glosaRec / total) * 100 : 0,
      rxReworkPct: total ? (rxRework / total) * 100 : 0,
    };
  }, [filtered]);

  /* ===== Sparkline (com filtros) ===== */
  const dailySeries = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((a) => {
      const key = toDateKey(a.created_at);
      map.set(key, (map.get(key) || 0) + 1);
    });
    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => map.get(k) || 0);
  }, [filtered]);

  /* ===== Distribuições ===== */
  function dist(field: keyof Answer, options: string[]) {
    const total = filtered.length;
    const counts: Record<string, number> = {};
    options.forEach((o) => (counts[o] = 0));
    filtered.forEach((a) => {
      const v = (a[field] || "") as string;
      if (options.includes(v)) counts[v] += 1;
    });
    const rows = options.map((o) => ({ label: o, count: counts[o], pctValue: pct(counts[o], total) }));
    const maxPct = Math.max(...rows.map((r) => r.pctValue), 1);
    return { rows, maxPct, total };
  }

  const noshow = {
    relevance: dist("q_noshow_relevance", ["Sim", "Não", "Parcialmente"]),
    system:    dist("q_noshow_has_system", ["Sim", "Não"]),
    impact:    dist("q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]),
  };
  const glosas = {
    rec:   dist("q_glosa_is_problem", ["Sim", "Não", "Às vezes"]),
    check: dist("q_glosa_interest", ["Sim", "Não", "Talvez"]),
    who:   dist("q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]),
  };
  const receitas = {
    rework: dist("q_rx_rework", ["Sim", "Não", "Raramente"]),
    diff:   dist("q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]),
    value:  dist("q_rx_tool_value", ["Sim", "Não", "Talvez"]),
  };

  /* ===== Resumo para PDF (mantém TODOS os dados) ===== */
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

  /* ===== Comentários & Identificação (base completa) ===== */
  const comments = useMemo(
    () =>
      answers
        .map((a, i) => ({ code: codeFromIndex(i), text: (a.comments || "").toString().trim() }))
        .filter((c) => c.text.length),
    [answers]
  );

  const idRows = useMemo(
    () =>
      answers
        .filter((a) => a.consent_contact === true || a.consent === true)
        .map((a, i) => ({
          code: codeFromIndex(i),
          nome: (a.doctor_name || "").toString().trim() || "—",
          crm: (a.crm || "").toString().trim() || "—",
          contato: (a.contact || "").toString().trim() || "—",
        }))
        .filter((r) => r.nome !== "—" || r.crm !== "—" || r.contato !== "—"),
    [answers]
  );

  /* ===== UI Helpers ===== */
  function toggleIn(setter: (v: string[]) => void, arr: string[], value: string) {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  }
  function resetFilters() {
    setQuickRange("");
    setFromDate(null);
    setToDate(null);
    setSizeFilter([]);
    setRoleFilter([]);
    setSelectedCode(null);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="card">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Header com Export PDF */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportPDFButton
          kpi={{
            total: answers.length,
            noshowYesPct: answers.length ? (answers.filter(a => a.q_noshow_relevance === "Sim").length / answers.length) * 100 : 0,
            glosaRecorrentePct: answers.length ? (answers.filter(a => a.q_glosa_is_problem === "Sim").length / answers.length) * 100 : 0,
            rxReworkPct: answers.length ? (answers.filter(a => a.q_rx_rework === "Sim").length / answers.length) * 100 : 0,
          }}
          summaryRows={summaryRows}
          answers={answers}
          chartRefs={{ noshowRef, glosaRef, rxRef }}
        />
      </div>

      {/* ===== Filtros Premium ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
          {/* Bloco 1: Período rápido */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Período rápido</div>
            <div className="flex gap-2">
              {[
                { k: "7D", label: "Últimos 7d" },
                { k: "30D", label: "Últimos 30d" },
                { k: "90D", label: "Últimos 90d" },
                { k: "", label: "Tudo" },
              ].map((b) => (
                <button
                  key={b.k}
                  className={`rounded-full px-3 py-1 text-sm border ${
                    quickRange === (b.k as any)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => setQuickRange(b.k as any)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bloco 2: Intervalo custom */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Intervalo custom</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                value={fromDate || ""}
                onChange={(e) => { setFromDate(e.target.value || null); setQuickRange(""); }}
              />
              <span className="text-slate-400">até</span>
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                value={toDate || ""}
                onChange={(e) => { setToDate(e.target.value || null); setQuickRange(""); }}
              />
            </div>
          </div>

          {/* Bloco 3: Tamanho da clínica (chips multi) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Tamanho da clínica</div>
            <div className="flex flex-wrap gap-2 max-w-[520px]">
              {clinicSizes.length === 0 && <span className="text-sm text-slate-400">—</span>}
              {clinicSizes.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleIn(setSizeFilter, sizeFilter, s)}
                  className={`rounded-full px-3 py-1 text-sm border ${
                    sizeFilter.includes(s)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Bloco 4: Cargo (chips multi) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Cargo</div>
            <div className="flex flex-wrap gap-2 max-w-[420px]">
              {roles.length === 0 && <span className="text-sm text-slate-400">—</span>}
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => toggleIn(setRoleFilter, roleFilter, r)}
                  className={`rounded-full px-3 py-1 text-sm border ${
                    roleFilter.includes(r)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Bloco 5: Respondente R-XX */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Respondente</div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm"
                value={selectedCode || ""}
                onChange={(e) => setSelectedCode(e.target.value || null)}
              >
                <option value="">Todos</option>
                {answers.map((_, i) => (
                  <option key={i} value={codeFromIndex(i)}>
                    {codeFromIndex(i)}
                  </option>
                ))}
              </select>
              {selectedCode && (
                <button
                  onClick={() => setSelectedCode(null)}
                  className="rounded-full bg-slate-100 text-slate-700 text-xs px-3 py-1"
                >
                  limpar
                </button>
              )}
            </div>
          </div>

          {/* Reset */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-transparent select-none">.</div>
            <button
              onClick={resetFilters}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              title="Limpar todos os filtros"
            >
              Resetar filtros
            </button>
          </div>
        </div>
      </div>

      {/* ===== KPIs ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Total de respostas (após filtros)</div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-4xl font-black text-slate-900">{fmt(kpi.total)}</div>
            <div className="opacity-90"><Sparkline values={dailySeries} /></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">% no-show relevante</div>
          <div className="mt-2 flex items-center justify-between">
            <Donut value={kpi.noshowYesPct} />
            <div className="text-3xl font-extrabold" style={{ color: BRAND_1 }}>{Math.round(kpi.noshowYesPct)}%</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">% glosas recorrentes</div>
          <div className="mt-2 flex items-center justify-between">
            <Donut value={kpi.glosaRecorrentePct} />
            <div className="text-3xl font-extrabold" style={{ color: BRAND_1 }}>{Math.round(kpi.glosaRecorrentePct)}%</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">% receitas geram retrabalho</div>
          <div className="mt-2 flex items-center justify-between">
            <Donut value={kpi.rxReworkPct} />
            <div className="text-3xl font-extrabold" style={{ color: BRAND_1 }}>{Math.round(kpi.rxReworkPct)}%</div>
          </div>
        </div>
      </section>

      {/* ===== Seções analíticas ===== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* No-show */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" ref={noshowRef}>
          <div className="text-lg font-bold">No-show</div>
          <p className="text-sm text-slate-500 mt-1">Impacto em agenda e faturamento — lembretes manuais em muitos consultórios.</p>
          <div className="mt-5 space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Relevância</div>
              {noshow.relevance.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={noshow.relevance.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Possui sistema que resolve</div>
              {noshow.system.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={noshow.system.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Impacto financeiro mensal</div>
              {noshow.impact.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={noshow.impact.maxPct} />
              ))}
            </div>
          </div>
        </div>

        {/* Glosas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" ref={glosaRef}>
          <div className="text-lg font-bold">Glosas</div>
          <p className="text-sm text-slate-500 mt-1">Erros em guias TISS/TUSS geram glosas e atrasam recebimento.</p>
          <div className="mt-5 space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Glosas recorrentes</div>
              {glosas.rec.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={glosas.rec.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Interesse em checagem antes do envio</div>
              {glosas.check.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={glosas.check.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Quem sofre mais</div>
              {glosas.who.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={glosas.who.maxPct} />
              ))}
            </div>
          </div>
        </div>

        {/* Receitas Digitais */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" ref={rxRef}>
          <div className="text-lg font-bold">Receitas Digitais</div>
          <p className="text-sm text-slate-500 mt-1">Dúvidas de validação/ envio correto geram retrabalho.</p>
          <div className="mt-5 space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Receitas geram retrabalho</div>
              {receitas.rework.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={receitas.rework.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Pacientes têm dificuldade</div>
              {receitas.diff.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={receitas.diff.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Valor em ferramenta de apoio</div>
              {receitas.value.rows.filter(r=>r.count>0 || filtered.length===1).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pctValue={r.pctValue} maxPct={receitas.value.maxPct} />
              ))}
            </div>
          </div>
        </div>

        {/* Comentários (clicável para filtrar por R-XX) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">Comentários (texto livre)</div>
          {comments.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">Sem comentários até o momento.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {comments.map((c) => {
                const active = selectedCode === c.code;
                return (
                  <li
                    key={c.code}
                    onClick={() => setSelectedCode(active ? null : c.code)}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      active
                        ? "border-[var(--brand-1)] bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-500">{c.code}</div>
                    <p className="text-slate-800 mt-1">{c.text}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Identificação (clicável para filtrar) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">Identificação (com consentimento)</div>
          {idRows.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">Nenhum contato autorizado no momento.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4">Resp.</th>
                    <th className="py-2 pr-4">Nome</th>
                    <th className="py-2 pr-4">CRM</th>
                    <th className="py-2 pr-4">Contato</th>
                  </tr>
                </thead>
                <tbody>
                  {idRows.map((r) => {
                    const active = selectedCode === r.code;
                    return (
                      <tr
                        key={r.code}
                        onClick={() => setSelectedCode(active ? null : r.code)}
                        className={`border-t transition cursor-pointer ${
                          active ? "border-[var(--brand-1)] bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-2 pr-4">{r.code}</td>
                        <td className="py-2 pr-4">{r.nome}</td>
                        <td className="py-2 pr-4">{r.crm}</td>
                        <td className="py-2 pr-4">{r.contato}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div className="h-2" />
    </div>
  );
}
