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
  consent: boolean | null;
  doctor_role: string | null;     // Especialidade/Função
  clinic_size: string | null;     // Pequeno | Médio | Grande
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

/* ===================== Mini helpers ===================== */

const ROLES = ["Geriatra", "Dermatologista", "Ortopedista", "Outra"] as const;
const SIZES = ["Pequeno", "Médio", "Grande"] as const;

function parseDateISO(d: string | null | undefined) {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t);
}

function withinRange(dt: Date, from?: Date | null, to?: Date | null) {
  const ts = dt.getTime();
  if (from && ts < from.getTime()) return false;
  if (to && ts > to.getTime()) return false;
  return true;
}

function pct(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0;
}

type Dist = Array<{ label: string; count: number }>;
function makeDist<T extends string | null | undefined>(arr: T[], order: string[]): Dist {
  const map: Record<string, number> = {};
  order.forEach(o => (map[o] = 0));
  arr.forEach(v => {
    const k = v ?? "";
    if (order.includes(k)) map[k] += 1;
  });
  return order.map(label => ({ label, count: map[label] ?? 0 }));
}

/* ===================== Recharts ===================== */

import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

const PRIMARY = "#1976d2";
const LIGHT = "#e8f0fe";
const GRID = "#eef2f9";

/* KPI donut (anel) */
function KpiDonut({ title, valuePct }: { title: string; valuePct: number }) {
  const data = useMemo(() => [
    { name: "ok", value: Math.max(0, Math.min(100, valuePct)) },
    { name: "rest", value: Math.max(0, 100 - Math.max(0, Math.min(100, valuePct))) },
  ], [valuePct]);

  return (
    <div className="card">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="flex items-center gap-4 mt-2">
        <div className="h-[90px] w-[90px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} innerRadius={32} outerRadius={45} startAngle={90} endAngle={-270} dataKey="value">
                <Cell fill={PRIMARY} />
                <Cell fill={LIGHT} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-3xl font-extrabold text-[var(--brand-1)]">{valuePct}%</div>
      </div>
    </div>
  );
}

/* Bar compacta */
function DistBar({
  title, data,
}: { title: string; data: Dist }) {
  const chartData = data.map(d => ({ name: d.label, value: d.count }));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-700 mb-2">{title}</div>
      <div className="h-[160px]">
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" hide />
            <YAxis type="category" width={120} dataKey="name" />
            <Tooltip cursor={{ fill: "#f8fafc" }} />
            <Bar dataKey="value" radius={[6, 6, 6, 6]} fill={PRIMARY} />
          </BarChart>
        </ResponsiveContainer>
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
  const [quick, setQuick] = useState<"7" | "30" | "90" | "all">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const [sizeSel, setSizeSel] = useState<string[]>([]);        // Pequeno/Médio/Grande
  const [roleSel, setRoleSel] = useState<string[]>([]);        // Especialidade
  const [respSel, setRespSel] = useState<string>("Todos");     // R-xx

  // Refs (opcional, p/ PDF)
  const noshowRef = useRef<HTMLDivElement>(null);
  const glosaRef  = useRef<HTMLDivElement>(null);
  const rxRef     = useRef<HTMLDivElement>(null);

  // Autenticação
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin");
    });
  }, [router]);

  // Carregar dados
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

  // Datas rápidas
  const quickRange = useMemo(() => {
    if (quick === "all") return { from: null as Date | null, to: null as Date | null };
    const to = new Date();
    const from = new Date();
    const days = quick === "7" ? 7 : quick === "30" ? 30 : 90;
    from.setDate(to.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [quick]);

  // Respostas filtradas
  const filtered = useMemo(() => {
    const customFrom = from ? new Date(from.split("/").reverse().join("-")) : null;
    const customTo   = to   ? new Date(to.split("/").reverse().join("-"))   : null;
    const useFrom = customFrom ?? quickRange.from;
    const useTo   = customTo   ?? quickRange.to;

    let base = answers.filter(a => {
      const dt = parseDateISO(a.created_at);
      return dt ? withinRange(dt, useFrom, useTo) : true;
    });

    if (sizeSel.length) {
      base = base.filter(a => a.clinic_size && sizeSel.includes(a.clinic_size));
    }
    if (roleSel.length) {
      base = base.filter(a => a.doctor_role && roleSel.includes(a.doctor_role));
    }
    if (respSel !== "Todos") {
      const idx = Number(respSel.replace("R-", "")) - 1;
      if (idx >= 0 && idx < base.length) base = [base[idx]];
      else base = [];
    }
    return base;
  }, [answers, from, to, quickRange, sizeSel, roleSel, respSel]);

  // KPIs
  const kpi = useMemo(() => {
    const total = filtered.length;
    const noshowYes = filtered.filter(a => a.q_noshow_relevance === "Sim").length;
    const glosaRec  = filtered.filter(a => a.q_glosa_is_problem === "Sim").length;
    const rxRework  = filtered.filter(a => a.q_rx_rework === "Sim").length;
    return {
      total,
      noshowYesPct: pct(noshowYes, total),
      glosaRecorrentePct: pct(glosaRec, total),
      rxReworkPct: pct(rxRework, total),
    };
  }, [filtered]);

  // Distribuições
  const distNoShowRelev   = makeDist(filtered.map(a => a.q_noshow_relevance), ["Sim", "Parcialmente", "Não"]);
  const distNoShowSys     = makeDist(filtered.map(a => a.q_noshow_has_system), ["Sim", "Não"]);
  const distNoShowImpact  = makeDist(filtered.map(a => a.q_noshow_financial_impact), ["Baixo impacto", "Médio impacto", "Alto impacto"]);

  const distGlosaRec      = makeDist(filtered.map(a => a.q_glosa_is_problem), ["Sim", "Às vezes", "Não"]);
  const distGlosaInterest = makeDist(filtered.map(a => a.q_glosa_interest), ["Sim", "Talvez", "Não"]);
  const distGlosaWho      = makeDist(filtered.map(a => a.q_glosa_who_suffers), ["Administrativo", "Médico", "Ambos"]);

  const distRxRework      = makeDist(filtered.map(a => a.q_rx_rework), ["Sim", "Raramente", "Não"]);
  const distRxDiff        = makeDist(filtered.map(a => a.q_rx_elderly_difficulty), ["Sim", "Em parte", "Não"]);
  const distRxValue       = makeDist(filtered.map(a => a.q_rx_tool_value), ["Sim", "Talvez", "Não"]);

  // Lista de respondentes (após filtros, para o dropdown)
  const respondentOptions = useMemo(() => {
    return ["Todos", ...filtered.map((_, i) => `R-${String(i + 1).padStart(2, "0")}`)];
  }, [filtered]);

  function resetFilters() {
    setQuick("all");
    setFrom("");
    setTo("");
    setSizeSel([]);
    setRoleSel([]);
    setRespSel("Todos");
  }

  // ====== Identificação / Leads (com consentimento) ======
  type Lead = {
    code: string;
    name: string;
    crm: string;
    contact: string;
    role: string;
    size: string;
    date: string;
  };

  const leads: Lead[] = useMemo(() => {
    return filtered
      .map((a, i) => ({ a, i }))
      .filter(x => x.a.consent_contact === true || x.a.consent === true)
      .map(({ a, i }) => ({
        code: `R-${String(i + 1).padStart(2, "0")}`,
        name: (a.doctor_name || "").trim(),
        crm: (a.crm || "").trim(),
        contact: (a.contact || "").trim(),
        role: a.doctor_role || "",
        size: a.clinic_size || "",
        date: parseDateISO(a.created_at)?.toLocaleString("pt-BR") || "",
      }))
      .filter(l => l.name || l.crm || l.contact);
  }, [filtered]);

  function contactHref(c: string) {
    const s = c.trim();
    if (!s) return "#";
    if (s.includes("@")) return `mailto:${s}`;
    const digits = s.replace(/\D/g, "");
    if (digits.length >= 10) return `https://wa.me/${digits}`;
    return "#";
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }
  function exportCSV(rows: Lead[]) {
    const header = ["Codigo","Nome","CRM","Contato","Funcao","Tamanho","Data"];
    const body = rows.map(r => [r.code, r.name, r.crm, r.contact, r.role, r.size, r.date]);
    const csv = [header, ...body].map(line => line.map(v => `"${(v || "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_identificados.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
          kpi={{
            total: kpi.total,
            noshowYesPct: kpi.noshowYesPct,
            glosaRecorrentePct: kpi.glosaRecorrentePct,
            rxReworkPct: kpi.rxReworkPct,
          }}
          summaryRows={[]}
          answers={filtered}
          chartRefs={{ noshowRef, glosaRef, rxRef }}
        />
      </div>

      {/* ===================== FILTROS ===================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Esquerda: períodos */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Período rápido</div>
            <div className="flex flex-wrap gap-2">
              {[
                { k: "7", label: "Últimos 7d" },
                { k: "30", label: "Últimos 30d" },
                { k: "90", label: "Últimos 90d" },
                { k: "all", label: "Tudo" },
              ].map(opt => (
                <button
                  key={opt.k}
                  onClick={() => { setQuick(opt.k as any); setFrom(""); setTo(""); }}
                  className={`px-4 py-2 rounded-full border ${quick === opt.k ? "border-[var(--brand-1)] bg-[var(--brand-1)]/10 text-[var(--brand-1)]" : "border-slate-300 text-slate-700"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="text-sm font-semibold text-slate-700 mt-4 mb-2">Intervalo custom</div>
            <div className="flex items-center gap-2">
              <input
                value={from}
                onChange={e => { setFrom(e.target.value); setQuick("all"); }}
                placeholder="dd/mm/aaaa"
                className="input"
              />
              <span className="text-slate-500">até</span>
              <input
                value={to}
                onChange={e => { setTo(e.target.value); setQuick("all"); }}
                placeholder="dd/mm/aaaa"
                className="input"
              />
            </div>
          </div>

          {/* Direita: tamanho/role/respondente */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Tamanho do consultório/clínica</div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(sz => {
                  const active = sizeSel.includes(sz);
                  return (
                    <button
                      key={sz}
                      onClick={() => setSizeSel(prev => active ? prev.filter(s => s !== sz) : [...prev, sz])}
                      className={`px-4 py-2 rounded-full border ${active ? "border-[var(--brand-1)] bg-[var(--brand-1)]/10 text-[var(--brand-1)]" : "border-slate-300 text-slate-700"}`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-700 mb-2">Especialidade / Função</div>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(r => {
                  const active = roleSel.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => setRoleSel(prev => active ? prev.filter(s => s !== r) : [...prev, r])}
                      className={`px-4 py-2 rounded-full border ${active ? "border-[var(--brand-1)] bg-[var(--brand-1)]/10 text-[var(--brand-1)]" : "border-slate-300 text-slate-700"}`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Respondente</span>
                <select
                  className="input"
                  value={respSel}
                  onChange={(e) => setRespSel(e.target.value)}
                >
                  {respondentOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <button onClick={resetFilters} className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50">
                Resetar filtros
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== KPIs ===================== */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm font-semibold text-slate-700">Total de respostas (após filtros)</div>
          <div className="mt-3 text-4xl font-extrabold text-slate-900">{kpi.total}</div>
        </div>
        <KpiDonut title="% no-show relevante" valuePct={kpi.noshowYesPct} />
        <KpiDonut title="% glosas recorrentes" valuePct={kpi.glosaRecorrentePct} />
        <KpiDonut title="% receitas geram retrabalho" valuePct={kpi.rxReworkPct} />
      </section>

      {/* ===================== Grupos de gráficos ===================== */}
      <section className="card" ref={noshowRef}>
        <h2 className="card-title">No-show</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
          <DistBar title="Relevância" data={distNoShowRelev} />
          <DistBar title="Possui sistema que resolve" data={distNoShowSys} />
          <DistBar title="Impacto financeiro mensal" data={distNoShowImpact} />
        </div>
      </section>

      <section className="card" ref={glosaRef}>
        <h2 className="card-title">Glosas</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
          <DistBar title="Glosas recorrentes" data={distGlosaRec} />
          <DistBar title="Interesse em checagem antes do envio" data={distGlosaInterest} />
          <DistBar title="Quem sofre mais" data={distGlosaWho} />
        </div>
      </section>

      <section className="card" ref={rxRef}>
        <h2 className="card-title">Receitas Digitais</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
          <DistBar title="Geram retrabalho" data={distRxRework} />
          <DistBar title="Dificuldade dos pacientes" data={distRxDiff} />
          <DistBar title="Valor em ferramenta de apoio" data={distRxValue} />
        </div>
      </section>

      {/* ===================== Identificação / Leads ===================== */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Identificação (somente com consentimento)</h2>
          <div className="flex gap-2">
            <button
              onClick={() => exportCSV(leads)}
              className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="text-slate-500 mt-2">Nenhum contato identificado nos filtros atuais.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Resp.</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">CRM</th>
                  <th className="py-2 pr-4">Contato</th>
                  <th className="py-2 pr-4">Função</th>
                  <th className="py-2 pr-4">Tamanho</th>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.code} className="border-t border-slate-200">
                    <td className="py-2 pr-4 font-semibold text-slate-700">{l.code}</td>
                    <td className="py-2 pr-4">{l.name || "—"}</td>
                    <td className="py-2 pr-4">{l.crm || "—"}</td>
                    <td className="py-2 pr-4">
                      {l.contact ? (
                        <a href={contactHref(l.contact)} target="_blank" rel="noreferrer" className="text-[var(--brand-1)] underline">
                          {l.contact}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-4">{l.role || "—"}</td>
                    <td className="py-2 pr-4">{l.size || "—"}</td>
                    <td className="py-2 pr-4">{l.date}</td>
                    <td className="py-2 pr-2">
                      {l.contact && (
                        <button
                          onClick={() => copy(l.contact)}
                          className="px-2 py-1 rounded border border-slate-300 text-xs hover:bg-slate-50"
                          title="Copiar contato"
                        >
                          Copiar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ===== util classes (Tailwind) =====
.card{ @apply rounded-2xl border border-slate-200 bg-white p-4 shadow-sm; }
.card-title{ @apply text-lg font-bold text-slate-900; }
.input{ @apply px-3 py-2 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-[var(--brand-1)] focus:border-[var(--brand-1)]; }
*/
