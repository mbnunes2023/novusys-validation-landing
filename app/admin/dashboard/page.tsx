"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

// types conforme seu formulário
type Row = {
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

const BRAND = {
  color: "#1976d2",
  gradient: "linear-gradient(135deg,#1976d2 0%,#6a11cb 50%,#2575fc 100%)",
};
const PIE_COLORS = ["#1976d2", "#6a11cb", "#2575fc", "#0ea5e9", "#22c55e", "#f59e0b"];

export default function AdminDashboard() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filtros simples
  const [roleFilter, setRoleFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // protege rota
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin");
    });
  }, [router]);

  // carrega dados
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); setErr(null);
      try {
        const { data, error } = await supabase
          .from("validation_responses")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setRows((data ?? []) as Row[]);
      } catch (e: any) {
        setErr(e.message ?? "Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // aplica filtros
  const filtered = useMemo(() => {
    return rows.filter(r => {
      const okRole = roleFilter ? r.doctor_role === roleFilter : true;
      const okSize = sizeFilter ? r.clinic_size === sizeFilter : true;

      const date = r.created_at ? new Date(r.created_at) : null;
      const okFrom = from ? (date ? date >= new Date(from) : false) : true;
      const okTo = to ? (date ? date <= new Date(to + "T23:59:59") : false) : true;

      return okRole && okSize && okFrom && okTo;
    });
  }, [rows, roleFilter, sizeFilter, from, to]);

  // helpers de contagem
  const dist = (arr: any[], key: keyof Row) => {
    const m = new Map<string, number>();
    for (const r of arr) {
      const k = (r[key] ?? "—") as string;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  };

  // datasets p/ gráficos
  const noshowRelevance = dist(filtered, "q_noshow_relevance");
  const glosaProblem = dist(filtered, "q_glosa_is_problem");
  const rxRework = dist(filtered, "q_rx_rework");
  const clinicSize = dist(filtered, "clinic_size");
  const roleDist = dist(filtered, "doctor_role");

  // matriz simples: tamanho x no-show (heat map textual)
  const sizes = Array.from(new Set(filtered.map(r => r.clinic_size ?? "—")));
  const noshowOpts = Array.from(new Set(filtered.map(r => r.q_noshow_relevance ?? "—")));
  const crossTab = sizes.map(size => {
    const row: Record<string,string|number> = { size };
    noshowOpts.forEach(opt => {
      row[opt] = filtered.filter(r => (r.clinic_size ?? "—") === size && (r.q_noshow_relevance ?? "—") === opt).length;
    });
    return row;
  });

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/admin"); };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="card-title"><span className="title-dot" />Dashboard • Pesquisa</div>
        <div className="flex items-center gap-2">
          <a href="/" className="btn btn-outline">Ver landing</a>
          <button onClick={signOut} className="btn btn-primary">Sair</button>
        </div>
      </div>

      {/* Filtros */}
      <section className="card mb-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-slate-600">Especialidade/Função</label>
            <select className="ui-select mt-1" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
              <option value="">Todas</option>
              <option>Clínico</option><option>Geriatra</option>
              <option>Dermatologista</option><option>Ortopedista</option><option>Outra</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600">Tamanho da clínica</label>
            <select className="ui-select mt-1" value={sizeFilter} onChange={e=>setSizeFilter(e.target.value)}>
              <option value="">Todos</option>
              <option>Pequeno</option><option>Médio</option><option>Grande</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600">De</label>
            <input type="date" className="ui-input mt-1" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-600">Até</label>
            <input type="date" className="ui-input mt-1" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
        </div>
      </section>

      {/* KPIs rápidos */}
      <section className="grid md:grid-cols-4 gap-4 mb-6">
        {[
          { label:"Respostas", value: filtered.length },
          { label:"% No-show relevante (\"Sim\")", value: (() => {
              const base = filtered.length || 1;
              const yes = filtered.filter(r => r.q_noshow_relevance === "Sim").length;
              return ((yes/base)*100).toFixed(0) + "%";
            })()
          },
          { label:"% Glosas recorrentes", value: (() => {
              const base = filtered.length || 1;
              const yes = filtered.filter(r => r.q_glosa_is_problem === "Sim").length;
              return ((yes/base)*100).toFixed(0) + "%";
            })()
          },
          { label:"% Retrabalho em receitas", value: (() => {
              const base = filtered.length || 1;
              const yes = filtered.filter(r => r.q_rx_rework === "Sim").length;
              return ((yes/base)*100).toFixed(0) + "%";
            })()
          },
        ].map(k => (
          <div key={k.label} className="card">
            <div className="text-sm text-slate-500">{k.label}</div>
            <div className="text-2xl font-bold mt-1">{k.value}</div>
          </div>
        ))}
      </section>

      {/* Gráficos */}
      <section className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="font-semibold mb-2">No-show: relevância</div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart data={noshowRelevance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="value" fill={BRAND.color} radius={[8,8,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="font-semibold mb-2">Glosas recorrentes</div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={glosaProblem} dataKey="value" nameKey="name" outerRadius={90} label>
                  {glosaProblem.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip/><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="font-semibold mb-2">Retrabalho em receitas</div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart data={rxRework}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="value" fill="#6a11cb" radius={[8,8,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="font-semibold mb-2">Perfil: Tamanho da clínica</div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart data={clinicSize}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="value" fill="#2575fc" radius={[8,8,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card md:col-span-2">
          <div className="font-semibold mb-2">Perfil: Especialidade/Função</div>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart data={roleDist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/>
                <Bar dataKey="value" fill="#0ea5e9" radius={[8,8,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Cross-tab simples (heat textual) */}
      <section className="card mb-6">
        <div className="font-semibold mb-3">Matriz: Tamanho x No-show (contagem)</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 border-b">Tamanho</th>
                {noshowOpts.map(h => (
                  <th key={h} className="text-left p-2 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crossTab.map((r:any) => (
                <tr key={r.size}>
                  <td className="p-2 border-b font-medium">{r.size}</td>
                  {noshowOpts.map(h => (
                    <td key={h} className="p-2 border-b">{r[h] as number}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabela detalhada */}
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Respostas (detalhe)</div>
          <a
            className="btn btn-outline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCSV(filtered))}`}
            download={`respostas_${new Date().toISOString().slice(0,10)}.csv`}
          >
            Baixar CSV
          </a>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[900px] text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 border-b">Data</th>
                <th className="text-left p-2 border-b">Nome</th>
                <th className="text-left p-2 border-b">CRM</th>
                <th className="text-left p-2 border-b">Contato</th>
                <th className="text-left p-2 border-b">Perfil</th>
                <th className="text-left p-2 border-b">Tamanho</th>
                <th className="text-left p-2 border-b">No-show</th>
                <th className="text-left p-2 border-b">Glosas</th>
                <th className="text-left p-2 border-b">Receitas</th>
                <th className="text-left p-2 border-b">Comentários</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-3 text-slate-500" colSpan={10}>Carregando…</td></tr>
              ) : err ? (
                <tr><td className="p-3 text-red-600" colSpan={10}>{err}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="p-3 text-slate-500" colSpan={10}>Sem dados com os filtros atuais.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 border-b">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2 border-b">{r.doctor_name ?? "—"}</td>
                  <td className="p-2 border-b">{r.crm ?? "—"}</td>
                  <td className="p-2 border-b">{r.contact ?? "—"}</td>
                  <td className="p-2 border-b">{r.doctor_role ?? "—"}</td>
                  <td className="p-2 border-b">{r.clinic_size ?? "—"}</td>
                  <td className="p-2 border-b">
                    {(r.q_noshow_relevance ?? "—")} / {(r.q_noshow_has_system ?? "—")} / {(r.q_noshow_financial_impact ?? "—")}
                  </td>
                  <td className="p-2 border-b">
                    {(r.q_glosa_is_problem ?? "—")} / {(r.q_glosa_interest ?? "—")} / {(r.q_glosa_who_suffers ?? "—")}
                  </td>
                  <td className="p-2 border-b">
                    {(r.q_rx_rework ?? "—")} / {(r.q_rx_elderly_difficulty ?? "—")} / {(r.q_rx_tool_value ?? "—")}
                  </td>
                  <td className="p-2 border-b">{r.comments ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500 mt-6 text-center">
        * Este painel reflete o mesmo visual premium (cards, botões e gradiente) da landing.
      </p>
    </div>
  );
}

// util: gera CSV básico
function toCSV(data: Row[]) {
  const headers = [
    "created_at","doctor_name","crm","contact","doctor_role","clinic_size",
    "q_noshow_relevance","q_noshow_has_system","q_noshow_financial_impact",
    "q_glosa_is_problem","q_glosa_interest","q_glosa_who_suffers",
    "q_rx_rework","q_rx_elderly_difficulty","q_rx_tool_value","comments"
  ];
  const lines = [headers.join(",")];
  for (const r of data) {
    const row = headers.map(h => {
      const v = (r as any)[h] ?? "";
      const s = String(v).replaceAll('"','""');
      return `"${s}"`;
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}
