"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import type React from "react";
import jsPDF, { jsPDFOptions } from "jspdf";
import autoTable from "jspdf-autotable";

/* ===================== Tipos ===================== */

type KPI = {
  total: number;
  noshowYesPct: number;
  glosaRecorrentePct: number;
  rxReworkPct: number;
};
type Answer = Record<string, any>;

type Props = {
  kpi: KPI;
  summaryRows: Array<Record<string, number | string>>;
  answers: Answer[];
  chartRefs?: {
    noshowRef: React.RefObject<HTMLDivElement>;
    glosaRef: React.RefObject<HTMLDivElement>;
    rxRef: React.RefObject<HTMLDivElement>;
  };
};

/* ===================== Branding & UI ===================== */

const BRAND_BLUE = "#1976d2";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";
const ACCENT = "#2575fc";

/* ===================== Utils ===================== */

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function percent(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function usableHeight(startY: number, pageH: number, bottomPadding = 40) {
  return Math.max(0, pageH - bottomPadding - startY);
}
function centeredStartY(startY: number, pageH: number, blockH: number) {
  const avail = usableHeight(startY, pageH);
  const offset = Math.max(0, (avail - blockH) / 2);
  return startY + offset;
}

// Carrega /logo.png e retorna base64 (DataURL). Falhou? null.
async function fetchAsDataURL(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ===================== Cabeçalho/Rodapé ===================== */

function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  // faixa superior
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  // card
  const headerH = 70;
  const cardX = marginX;
  const cardY = 14;
  const cardW = pageW - marginX * 2;

  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardY, cardW, headerH, 10, 10, "FD");

  // bloco título + data (esquerda)
  const leftPad = 18;
  const titleY = cardY + 26 + 20; // levemente mais alto
  const DATE_GAP = 22; // mais espaço até a data

  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(title, cardX + leftPad, titleY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, cardX + leftPad, titleY + DATE_GAP);

  // logo (direita)
  if (logoDataUrl) {
    const targetW = 160;
    const targetH = 48;
    const padRight = 18;
    const padTop = 10;
    const imgX = cardX + cardW - padRight - targetW;
    const imgY = cardY + padTop;
    try {
      doc.addImage(logoDataUrl, "PNG", imgX, imgY, targetW, targetH);
    } catch {}
  }

  return cardY + headerH + 12; // início do conteúdo
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, marginX: number) {
  const left = `Relatório gerado automaticamente`;
  const right = `p. ${doc.getCurrentPageInfo().pageNumber}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);
  doc.text(left, marginX, pageH - 14);
  const rightW = doc.getTextWidth(right);
  doc.text(right, pageW - marginX - rightW, pageH - 14);
}

function newPage(
  doc: jsPDF,
  opts: { title: string; marginX: number; pageW: number; pageH: number; logoDataUrl?: string | null }
) {
  doc.addPage();
  const startY = drawHeader(doc, opts.pageW, opts.marginX, opts.title, opts.logoDataUrl);
  drawFooter(doc, opts.pageW, opts.pageH, opts.marginX);
  return startY;
}

/* ===================== Cards KPI ===================== */

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  accent = BRAND_BLUE
) {
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#ffffff");
  doc.roundedRect(x, y, w, h, 12, 12, "FD");

  // top accent
  doc.setFillColor(accent);
  doc.roundedRect(x, y, w, 6, 12, 12, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(title, x + 16, y + 26);

  doc.setTextColor(accent);
  doc.setFontSize(30);
  doc.text(value, x + 16, y + 58);
}

/* ===================== Micro-charts ===================== */

type DistItem = { label: string; count: number; pct: string };
const ROW_H = 20;
const ROW_GAP = 6;

function measureBarBlock(lines: number) {
  return 8 + lines * (ROW_H + ROW_GAP);
}

function drawBarBlock(
  doc: jsPDF,
  title: string,
  items: DistItem[],
  x: number,
  y: number,
  width: number
) {
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(13);
  doc.text(title, x, y);
  y += 8;

  const labelW = width * 0.40; // mais espaço para label
  const barW = width * 0.60;
  const maxPct = Math.max(...items.map((i) => parseInt(i.pct) || 0), 1);

  items.forEach((it, idx) => {
    const rowY = y + idx * (ROW_H + ROW_GAP);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK_SOFT);
    doc.setFontSize(11);
    const label = `${it.label} — ${it.count} (${it.pct})`;
    doc.text(label, x, rowY + 13);

    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#fff");
    doc.roundedRect(x + labelW, rowY, barW, ROW_H, 6, 6, "FD");

    const pct = parseInt(it.pct) || 0;
    const w = (pct / maxPct) * (barW - 10);
    doc.setFillColor(BRAND_BLUE);
    doc.roundedRect(x + labelW + 2, rowY + 2, Math.max(w, 2), ROW_H - 4, 5, 5, "F");
  });

  return y + items.length * (ROW_H + ROW_GAP);
}

/* ===================== Distribuições & Insights ===================== */

function dist(answers: Answer[], field: keyof Answer, order: string[]): DistItem[] {
  const total = answers.length;
  const counts: Record<string, number> = {};
  order.forEach((k) => (counts[k] = 0));
  answers.forEach((a) => {
    const v = (a[field] as string) || "—";
    if (!(v in counts)) counts[v] = 0;
    counts[v] += 1;
  });
  return Object.keys(counts).map((k) => ({
    label: k,
    count: counts[k],
    pct: percent(counts[k], total),
  }));
}

// Gera 3–5 frases de insight em linguagem executiva.
function generateInsights(kpi: KPI, answers: Answer[]) {
  const insights: string[] = [];

  // 1) No-show
  const relev = dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]);
  const yesPct = parseInt(relev.find((r) => r.label === "Sim")?.pct || "0");
  if (yesPct >= 50) {
    insights.push(`O no-show é percebido como relevante por ${yesPct}% dos respondentes, reforçando a necessidade de uma abordagem ativa de mitigação.`);
  }

  // 2) Glosas
  const glosaRec = dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]);
  const glosaYes = parseInt(glosaRec.find((r) => r.label === "Sim")?.pct || "0");
  if (glosaYes >= 40) {
    insights.push(`Glosas recorrentes afetam o dia a dia: ${glosaYes}% indicam ocorrência, o que abre espaço para prevenção pré-envio.`);
  }

  // 3) Retrabalho em receitas
  const rx = dist(answers, "q_rx_rework", ["Sim", "Não", "Raramente"]);
  const rxYes = parseInt(rx.find((r) => r.label === "Sim")?.pct || "0");
  if (rxYes >= 30) {
    insights.push(`Receitas digitais ainda geram retrabalho (${rxYes}%), sugerindo oportunidade em ferramentas de apoio e padronização.`);
  }

  // 4) KPI macro
  insights.push(
    `O estudo consolida ${kpi.total} respostas; estimativas de impacto mostram ${kpi.noshowYesPct.toFixed(
      0
    )}% de no-show relevante, ${kpi.glosaRecorrentePct.toFixed(
      0
    )}% de glosas recorrentes e ${kpi.rxReworkPct.toFixed(
      0
    )}% de retrabalho em receitas.`
  );

  // 5) Call-to-action
  insights.push(
    `Recomendação: priorizar pilotos rápidos em no-show e glosas (checagem pré-envio), acompanhados de um fluxo assistido para receitas.`
  );

  return insights.slice(0, 5);
}

/* ===================== Tabela “Detalhes” com curadoria ===================== */

const SENSITIVE_KEYS = new Set([
  "id",
  "created_at",
  "doctor_name",
  "crm",
  "contact",
  "consent",
  "consent_contact",
  "doctor_role",
  "clinic_size",
]);

const HEADER_MAP: Record<string, string> = {
  q_noshow_relevance: "No-show relevante?",
  q_noshow_has_system: "Sistema p/ no-show?",
  q_noshow_financial_impact: "Impacto financeiro",
  q_glosa_is_problem: "Glosas recorrentes?",
  q_glosa_interest: "Checagem antes do envio",
  q_glosa_who_suffers: "Quem sofre mais",
  q_rx_rework: "Receitas geram retrabalho?",
  q_rx_elderly_difficulty: "Pacientes têm dificuldade?",
  q_rx_tool_value: "Valor em ferramenta de apoio",
  comments: "Observações",
};

/* ===================== Componente ===================== */

export default function ExportPDFButton({ kpi, summaryRows, answers }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      const logoDataUrl = await fetchAsDataURL("/logo.png");

      const options: jsPDFOptions = { unit: "pt", format: "a4", orientation: "landscape" };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const title = "Relatório da Pesquisa — Clínicas e Consultórios";

      /* ========= CAPA ========= */
      doc.setFillColor(BRAND_BLUE);
      doc.rect(0, 0, pageW, 6, "F");

      const coverX = marginX;
      const coverY = 80;
      const coverW = pageW - marginX * 2;

      // logo grande
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, "PNG", coverX + coverW - 260, coverY - 20, 220, 66);
        } catch {}
      }

      // título & subtítulo
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(26);
      doc.text("Relatório da Pesquisa", coverX, coverY + 20);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(14);
      doc.text("Clínicas e Consultórios — Sumário Executivo", coverX, coverY + 46);

      // data
      doc.setFontSize(10);
      doc.text(`Gerado em ${formatNow()}`, coverX, coverY + 66);

      // caixa de destaque
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(coverX, coverY + 86, coverW, 110, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Resumo Executivo — Principais insights", coverX + 18, coverY + 110);

      const insights = generateInsights(kpi, answers);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);
      let iy = coverY + 130;
      insights.forEach((line) => {
        doc.circle(coverX + 18, iy - 3, 2, "F");
        doc.text(line, coverX + 28, iy, { maxWidth: coverW - 56 });
        iy += 20;
      });

      drawFooter(doc, pageW, pageH, marginX);

      /* ========= SUMÁRIO (TOC) ========= */
      doc.addPage();
      const tocStartY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(16);
      doc.text("Sumário", marginX, tocStartY + 6);

      const tocItems = [
        "Visão Geral (KPIs)",
        "No-show",
        "Glosas",
        "Receitas Digitais",
        "Resumo consolidado",
        "Respostas detalhadas",
      ];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(INK_SOFT);
      tocItems.forEach((label, i) => {
        doc.text(`${i + 1}. ${label}`, marginX, tocStartY + 30 + i * 18);
      });
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. KPIs ========= */
      let startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      const gap = 16;
      const cardW = (pageW - marginX * 2 - gap * 3) / 4;
      const cardH = 82;

      let y = centeredStartY(startY, pageH, 14 + cardH);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, y + 2);
      y += 14;

      drawKpiCard(doc, marginX + 0 * (cardW + gap), y, cardW, cardH, "Total de respostas", `${kpi.total}`, ACCENT);
      drawKpiCard(doc, marginX + 1 * (cardW + gap), y, cardW, cardH, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      drawKpiCard(doc, marginX + 2 * (cardW + gap), y, cardW, cardH, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);
      drawKpiCard(doc, marginX + 3 * (cardW + gap), y, cardW, cardH, "% receitas geram retrabalho", `${kpi.rxReworkPct.toFixed(0)}%`);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. No-show ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const noShowRelev = dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]);
      const noShowSys = dist(answers, "q_noshow_has_system", ["Sim", "Não"]);
      const noShowImpact = dist(answers, "q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]);

      const leftH = measureBarBlock(noShowRelev.length) + 18 + measureBarBlock(noShowSys.length);
      const rightH = measureBarBlock(noShowImpact.length);
      const gridH = Math.max(leftH, rightH);

      y = centeredStartY(startY, pageH, gridH);
      const colGap = 24;
      const colW = (pageW - marginX * 2 - colGap) / 2;
      const col1X = marginX;
      const col2X = marginX + colW + colGap;

      let col1Y = y;
      col1Y = drawBarBlock(doc, "Relevância", noShowRelev, col1X, col1Y, colW);
      col1Y += 18;
      col1Y = drawBarBlock(doc, "Possui sistema que resolve", noShowSys, col1X, col1Y, colW);

      let col2Y = y;
      col2Y = drawBarBlock(doc, "Impacto financeiro mensal", noShowImpact, col2X, col2Y, colW);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. Glosas ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const glosaRec = dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]);
      const glosaInterest = dist(answers, "q_glosa_interest", ["Sim", "Não", "Talvez"]);
      const glosaWho = dist(answers, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]);

      const gLeftH = measureBarBlock(glosaRec.length) + 18 + measureBarBlock(glosaInterest.length);
      const gRightH = measureBarBlock(glosaWho.length);
      const gGridH = Math.max(gLeftH, gRightH);

      y = centeredStartY(startY, pageH, gGridH);

      let col1Y_glosa = y;
      col1Y_glosa = drawBarBlock(doc, "Glosas recorrentes", glosaRec, col1X, col1Y_glosa, colW);
      col1Y_glosa += 18;
      col1Y_glosa = drawBarBlock(doc, "Interesse em checagem antes do envio", glosaInterest, col1X, col1Y_glosa, colW);

      let col2Y_glosa = y;
      col2Y_glosa = drawBarBlock(doc, "Quem sofre mais", glosaWho, col2X, col2Y_glosa, colW);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. Receitas Digitais ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const rxRework = dist(answers, "q_rx_rework", ["Sim", "Não", "Raramente"]);
      const rxDiff = dist(answers, "q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]);
      const rxValue = dist(answers, "q_rx_tool_value", ["Sim", "Não", "Talvez"]);

      const rLeftH = measureBarBlock(rxRework.length) + 18 + measureBarBlock(rxDiff.length);
      const rRightH = measureBarBlock(rxValue.length);
      const rGridH = Math.max(rLeftH, rRightH);

      y = centeredStartY(startY, pageH, rGridH);

      let col1Y_rx = y;
      col1Y_rx = drawBarBlock(doc, "Receitas geram retrabalho", rxRework, col1X, col1Y_rx, colW);
      col1Y_rx += 18;
      col1Y_rx = drawBarBlock(doc, "Pacientes têm dificuldade", rxDiff, col1X, col1Y_rx, colW);

      let col2Y_rx = y;
      col2Y_rx = drawBarBlock(doc, "Valor em ferramenta de apoio", rxValue, col2X, col2Y_rx, colW);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. Resumo consolidado (tabela) ========= */
      const HEADER_GAP = 28;
      const tableTopMargin = 14 + 70 + 12 + HEADER_GAP;

      doc.addPage();
      autoTable(doc as any, {
        styles: {
          font: "helvetica",
          fontSize: 10,
          textColor: INK,
          cellPadding: 6,
          lineColor: CARD_EDGE,
        },
        headStyles: { fillColor: [25, 118, 210], textColor: "#ffffff", fontStyle: "bold" },
        alternateRowStyles: { fillColor: "#fbfdff" },
        body: summaryRows,
        columns: [
          { header: "Pergunta", dataKey: "pergunta" },
          ...Object.keys(
            summaryRows.reduce((acc, r) => {
              Object.keys(r).forEach((k) => {
                if (k !== "pergunta") acc[k] = true;
              });
              return acc;
            }, {} as Record<string, boolean>)
          ).map((k) => ({ header: k, dataKey: k })),
        ],
        margin: { left: marginX, right: marginX, top: tableTopMargin, bottom: 26 },
        theme: "grid",
        didDrawPage: () => {
          const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(14);
          doc.text("Resumo consolidado por pergunta", marginX, sY + HEADER_GAP - 10);
          drawFooter(doc, pageW, pageH, marginX);
        },
      });

      /* ========= PÁG. Respostas detalhadas (curadas) ========= */
      const allKeys = answers && answers.length ? Array.from(new Set(answers.flatMap(a => Object.keys(a ?? {})))) : [];
      const questionKeys = allKeys.filter(k => k.startsWith("q_") && !SENSITIVE_KEYS.has(k));
      if (allKeys.includes("comments") && !SENSITIVE_KEYS.has("comments")) questionKeys.push("comments");

      const detailCols = questionKeys.map((k) => ({ header: HEADER_MAP[k] ?? k, dataKey: k }));
      const detailBody = answers.map((a) => {
        const row: Record<string, any> = {};
        questionKeys.forEach((k) => {
          let v = (a as any)[k];
          if (typeof v === "boolean") v = v ? "Sim" : "Não";
          if (v == null || v === "") v = "—";
          row[k] = v;
        });
        return row;
      });

      const colStyles: Record<string, any> = {};
      questionKeys.forEach((k) => {
        colStyles[k] = {
          cellWidth: k === "comments" ? 220 : 120,
          overflow: "linebreak",
        };
      });

      if (detailCols.length) {
        doc.addPage();
        autoTable(doc as any, {
          styles: {
            font: "helvetica",
            fontSize: 10,
            textColor: INK,
            cellPadding: 5,
            lineColor: CARD_EDGE,
          },
          headStyles: { fillColor: [37, 117, 252], textColor: "#ffffff", fontStyle: "bold" },
          body: detailBody,
          columns: detailCols,
          columnStyles: colStyles,
          tableWidth: pageW - marginX * 2,
          margin: { left: marginX, right: marginX, top: tableTopMargin, bottom: 26 },
          theme: "grid",
          rowPageBreak: "auto",
          didDrawPage: () => {
            const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Respostas detalhadas (sem identificação sensível)", marginX, sY + HEADER_GAP - 10);
            drawFooter(doc, pageW, pageH, marginX);
          },
        });
      }

      // salvar
      const fileName = `Relatorio_Pesquisa_${new Intl.DateTimeFormat("pt-BR").format(new Date())}.pdf`;
      doc.save(fileName);
    } finally {
      setLoading(false);
    }
  }, [answers, kpi, summaryRows]);

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex items-center rounded-xl px-4 py-2 font-medium text-white disabled:opacity-60"
      style={{
        background: "linear-gradient(90deg, #1976d2, #2575fc)",
        boxShadow: "0 6px 16px rgba(25,118,210,.25)",
      }}
    >
      {loading ? "Gerando PDF..." : "Exportar PDF (apresentação)"}
    </button>
  );
}
