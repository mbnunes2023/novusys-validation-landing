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
const BRAND_2 = "#2575fc";
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
  // YYYY-MM-DD (sem TZ) para agrupar por dia
  const d = new Date(s);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ===================== Micro-Componentes (SVG) ===================== */

// Sparkline simples (linha)
function Sparkline({ values, width = 120, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) {
    return <svg width={width} height={height} />;
  }
  const max = Math.max(...values, 1);
  const stepX = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const area = `M0,${height} L${points.join(" ")} L${width},${height} Z`;
  const line = `M${points.join(" L")}`;
  return (
    <svg width={width} height={height}>
      <path d={area} fill="rgba(25,118,210,0.10)" />
      <path d={line} stroke={BRAND_1} strokeWidth="2" fill="none" />
    </svg>
  );
}

// Donut chart (uma fatia principal + fundo)
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

// Barras horizontais (distribuição)
function BarRow({
  label,
  count,
  pct,
  maxPct,
}: {
  label: string;
  count: number;
  pct: number;
  maxPct: number;
}) {
  const widthPct = maxPct ? Math.max(2, Math.round((pct / maxPct) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-slate-500 min-w-[180px]">{label} — {count} ({pct}%)</div>
      <div className="flex-1 h-3 rounded-full bg-slate-100 ring-1 ring-slate-200/70 overflow-hidden">
        <div
          className="h-3 rounded-full"
          style={{ width: `${widthPct}%`, background: BRAND_1 }}
        />
      </div>
    </div>
  );
}

/* ===================== Página ===================== */

export default function AdminDashboard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // refs (mantidos para compatibilidade; não usados na geração de gráficos)
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
        .order("created_at", { ascending: true }); // ordem crescente para sparkline

      if (!error && data) setAnswers(data as Answer[]);
      setLoading(false);
    })();
  }, []);

  /* ===== KPI ===== */
  const kpi = useMemo(() => {
    const total = answers.length;
    const noshowYes = answers.filter((a) => a.q_noshow_relevance === "Sim").length;
    const glosaRec  = answers.filter((a) => a.q_glosa_is_problem === "Sim").length;
    const rxRework  = answers.filter((a) => a.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: total ? (noshowYes / total) * 100 : 0,
      glosaRecorrentePct: total ? (glosaRec / total) * 100 : 0,
      rxReworkPct: total ? (rxRework / total) * 100 : 0,
    };
  }, [answers]);

  /* ===== Sparkline (submissões/dia) ===== */
  const dailySeries = useMemo(() => {
    const map = new Map<string, number>();
    answers.forEach((a) => {
      const key = toDateKey(a.created_at);
      map.set(key, (map.get(key) || 0) + 1);
    });
    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => map.get(k) || 0);
  }, [answers]);

  /* ===== Distribuições por tema ===== */
  function dist(field: keyof Answer, options: string[]) {
    const total = answers.length;
    const counts: Record<string, number> = {};
    options.forEach((o) => (counts[o] = 0));
    answers.forEach((a) => {
      const v = (a[field] || "") as string;
      if (options.includes(v)) counts[v] += 1;
    });
    const rows = options.map((o) => ({ label: o, count: counts[o], pct: pct(counts[o], total) }));
    const maxPct = Math.max(...rows.map((r) => r.pct), 1);
    return { rows, maxPct, total };
  }

  const noshow = {
    relevance: dist("q_noshow_relevance", ["Sim", "Não", "Parcialmente"]),
    system: dist("q_noshow_has_system", ["Sim", "Não"]),
    impact: dist("q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]),
  };

  const glosas = {
    rec: dist("q_glosa_is_problem", ["Sim", "Não", "Às vezes"]),
    check: dist("q_glosa_interest", ["Sim", "Não", "Talvez"]),
    who: dist("q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]),
  };

  const receitas = {
    rework: dist("q_rx_rework", ["Sim", "Não", "Raramente"]),
    diff: dist("q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]),
    value: dist("q_rx_tool_value", ["Sim", "Não", "Talvez"]),
  };

  /* ===== Resumo tabela (para PDF) ===== */
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

  /* ===== Comentários & Identificação ===== */
  const comments = useMemo(
    () =>
      answers
        .map((a, i) => ({
          code: `R-${String(i + 1).padStart(2, "0")}`,
          text: (a.comments || "").toString().trim(),
        }))
        .filter((c) => c.text.length),
    [answers]
  );

  const idRows = useMemo(
    () =>
      answers
        .filter((a) => a.consent_contact === true || a.consent === true)
        .map((a, i) => ({
          resp: `R-${String(i + 1).padStart(2, "0")}`,
          nome: (a.doctor_name || "").toString().trim() || "—",
          crm: (a.crm || "").toString().trim() || "—",
          contato: (a.contact || "").toString().trim() || "—",
        }))
        .filter((r) => r.nome !== "—" || r.crm !== "—" || r.contato !== "—"),
    [answers]
  );

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="card">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <ExportPDFButton
          kpi={kpi}
          summaryRows={summaryRows}
          answers={answers}
          chartRefs={{ noshowRef, glosaRef, rxRef }}
        />
      </div>

      {/* ===== KPIs ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Total de respostas</div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-4xl font-black text-slate-900">{fmt(kpi.total)}</div>
            <div className="opacity-90">
              <Sparkline values={dailySeries} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">% no-show relevante</div>
          <div className="mt-2 flex items-center justify-between">
            <Donut value={kpi.noshowYesPct} />
            <div className="text-3xl font-extrabold" style={{ color: BRAND_1 }}>
              {Math.round(kpi.noshowYesPct)}%
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">% glosas recorrentes</div>
          <div className="mt-2 flex items-center justify-between">
            <Donut value={kpi.glosaRecorrentePct} />
            <div className="text-3xl font-extrabold" style={{ color: BRAND_1 }}>
              {Math.round(kpi.glosaRecorrentePct)}%
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">% receitas geram retrabalho</div>
          <div className="mt-2 flex items-center justify-between">
            <Donut value={kpi.rxReworkPct} />
            <div className="text-3xl font-extrabold" style={{ color: BRAND_1 }}>
              {Math.round(kpi.rxReworkPct)}%
            </div>
          </div>
        </div>
      </section>

      {/* ===== Seções analíticas ===== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* No-show */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">No-show</div>
          <p className="text-sm text-slate-500 mt-1">Impacto em agenda e faturamento — lembretes manuais em muitos consultórios.</p>
          <div className="mt-5 space-y-5" ref={noshowRef}>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Relevância</div>
              {noshow.relevance.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={noshow.relevance.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Possui sistema que resolve</div>
              {noshow.system.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={noshow.system.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Impacto financeiro mensal</div>
              {noshow.impact.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={noshow.impact.maxPct} />
              ))}
            </div>
          </div>
        </div>

        {/* Glosas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">Glosas</div>
          <p className="text-sm text-slate-500 mt-1">Erros em guias TISS/TUSS geram glosas e atrasam recebimento; conferência manual é trabalhosa.</p>
          <div className="mt-5 space-y-5" ref={glosaRef}>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Glosas recorrentes</div>
              {glosas.rec.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={glosas.rec.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Interesse em checagem antes do envio</div>
              {glosas.check.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={glosas.check.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Quem sofre mais</div>
              {glosas.who.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={glosas.who.maxPct} />
              ))}
            </div>
          </div>
        </div>

        {/* Receitas Digitais */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">Receitas Digitais</div>
          <p className="text-sm text-slate-500 mt-1">Dúvidas sobre validação / envio correto ao paciente e à farmácia geram retrabalho.</p>
          <div className="mt-5 space-y-5" ref={rxRef}>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Receitas geram retrabalho</div>
              {receitas.rework.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={receitas.rework.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Pacientes têm dificuldade</div>
              {receitas.diff.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={receitas.diff.maxPct} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Valor em ferramenta de apoio</div>
              {receitas.value.rows.filter(r=>r.count>0).map((r) => (
                <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} maxPct={receitas.value.maxPct} />
              ))}
            </div>
          </div>
        </div>

        {/* Cards de Comentários e Identificação */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">Comentários (texto livre)</div>
          {comments.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">Sem comentários até o momento.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {comments.map((c) => (
                <li key={c.code} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-500">{c.code}</span>
                  <p className="text-slate-800 mt-1">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

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
                  {idRows.map((r) => (
                    <tr key={r.resp} className="border-t border-slate-200">
                      <td className="py-2 pr-4">{r.resp}</td>
                      <td className="py-2 pr-4">{r.nome}</td>
                      <td className="py-2 pr-4">{r.crm}</td>
                      <td className="py-2 pr-4">{r.contato}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* rodapé suave */}
      <div className="h-2" />
    </div>
  );
}
