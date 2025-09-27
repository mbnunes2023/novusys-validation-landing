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
  summaryRows?: Array<Record<string, number | string>>;
  answers: Answer[];
  chartRefs?: {
    noshowRef: React.RefObject<HTMLDivElement>;
    glosaRef: React.RefObject<HTMLDivElement>;
    rxRef: React.RefObject<HTMLDivElement>;
  };
};

/* ===================== Branding ===================== */

const BRAND_BLUE = "#1976d2";
const ACCENT = "#2575fc";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";

/* Severidade (cores acessíveis) */
const SEV_COLORS = {
  low: "#10b981",       // verde
  moderate: "#f59e0b",  // amarelo
  high: "#f97316",      // laranja
  critical: "#ef4444",  // vermelho
} as const;

type SevKey = keyof typeof SEV_COLORS;

/* ===================== Utils ===================== */

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

function usableHeight(startY: number, pageH: number, bottomPadding = 40) {
  return Math.max(0, pageH - bottomPadding - startY);
}
function centeredStartY(startY: number, pageH: number, blockH: number) {
  const avail = usableHeight(startY, pageH);
  const offset = Math.max(0, (avail - blockH) / 2);
  return startY + offset;
}

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

/* ===================== Cabeçalho/Rodapé (MANTIDOS) ===================== */

const TOP_GAP = 24;

function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  const headerH = 72;
  const cardX = marginX;
  const cardY = 14;
  const cardW = pageW - marginX * 2;

  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardY, cardW, headerH, 10, 10, "FD");

  const centerY = cardY + headerH / 2;
  const leftPad = 18;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  const titleH = 18;
  const dateH = 10;
  const lineGap = 6;
  const textBlockH = titleH + lineGap + dateH;
  const titleY = centerY - textBlockH / 2 + titleH * 0.75;

  doc.text(title, cardX + leftPad, titleY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, cardX + leftPad, titleY + lineGap + 10);

  if (logoDataUrl) {
    const targetW = 170;
    const targetH = 50;
    const padRight = 18;
    const imgX = cardX + cardW - padRight - targetW;
    const imgY = centerY - targetH / 2;
    try {
      doc.addImage(logoDataUrl, "PNG", imgX, imgY, targetW, targetH);
    } catch {}
  }

  return cardY + headerH + 12 + TOP_GAP;
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, marginX: number) {
  const left = "Relatório gerado automaticamente";
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

/* ===================== Elementos básicos ===================== */

function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  titleSize = 13
) {
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#ffffff");
  doc.roundedRect(x, y, w, h, 12, 12, "FD");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(titleSize);
  doc.text(title, x + 16, y + 22);

  return { innerX: x + 16, innerY: y + 22 };
}

function bulletLines(
  doc: jsPDF,
  lines: string[],
  x: number,
  startY: number,
  maxWidth: number,
  lineH = 16
) {
  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK);
  doc.setFontSize(11);
  let y = startY + 12;
  lines.forEach((line) => {
    const chunks = doc.splitTextToSize(line, maxWidth - 12);
    doc.circle(x + 0, y - 3, 1.8, "F");
    doc.text(chunks, x + 8, y);
    y += chunks.length * lineH;
  });
  return y;
}

function drawBadge(doc: jsPDF, text: string, x: number, y: number, fill = "#000") {
  const padX = 8;
  const h = 20;
  const w = doc.getTextWidth(text) + padX * 2;
  doc.setFillColor(fill);
  doc.setDrawColor(fill);
  doc.roundedRect(x, y, w, h, 10, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#ffffff");
  doc.text(text, x + padX, y + 13);
  return { w, h };
}

/* ===================== KPI Cards / Distribuições ===================== */

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

type DistItem = { label: string; count: number; pct: string };

const CROW_H = 14;
const CROW_GAP = 4;

function measureBarBlockCompact(lines: number) {
  return 7 + lines * (CROW_H + CROW_GAP) + 2;
}

function dist(
  answers: Answer[],
  field: keyof Answer,
  order: string[]
): { items: DistItem[]; answered: number; unknownCount: number } {
  const counts: Record<string, number> = {};
  order.forEach((k) => (counts[k] = 0));
  let unknown = 0;

  answers.forEach((a) => {
    const v = (a[field] as string) ?? "";
    if (!v || !order.includes(v)) unknown += 1;
    else counts[v] += 1;
  });

  const answered = Object.values(counts).reduce((s, n) => s + n, 0);
  const toPct = (n: number) => (answered ? `${Math.round((n / answered) * 100)}%` : "0%");

  const items = order.map((k) => ({ label: k, count: counts[k], pct: toPct(counts[k]) }));
  return { items, answered, unknownCount: unknown };
}

function drawBarBlockCompact(
  doc: jsPDF,
  title: string,
  items: { label: string; count: number; pct: string }[],
  x: number,
  y: number,
  width: number
) {
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(12);
  doc.text(title, x, y);
  y += 7;

  const labelW = width * 0.5;
  const barW = width * 0.5;
  const nonEmpty = items.filter((i) => i.count > 0);
  const maxPct = Math.max(...nonEmpty.map((i) => parseInt(i.pct) || 0), 1);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);

  nonEmpty.forEach((it, idx) => {
    const rowY = y + idx * (CROW_H + CROW_GAP);
    const label = `${it.label} — ${it.count} (${it.pct})`;
    doc.text(label, x, rowY + 10, { maxWidth: labelW - 4 });

    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#fff");
    doc.roundedRect(x + labelW, rowY, barW, CROW_H, 5, 5, "FD");

    const pct = parseInt(it.pct) || 0;
    const w = (pct / maxPct) * (barW - 8);
    doc.setFillColor(BRAND_BLUE);
    doc.roundedRect(x + labelW + 2, rowY + 2, Math.max(w, 2), CROW_H - 4, 4, 4, "F");
  });

  return y + nonEmpty.length * (CROW_H + CROW_GAP);
}

/* ===================== Severidade (nível e cor) ===================== */

function computeSeverity(kpi: KPI): { key: SevKey; label: string; color: string; driver: string } {
  const worstVal = Math.max(kpi.noshowYesPct, kpi.glosaRecorrentePct, kpi.rxReworkPct);
  let key: SevKey = "low";
  if (worstVal >= 80) key = "critical";
  else if (worstVal >= 60) key = "high";
  else if (worstVal >= 35) key = "moderate";
  else key = "low";

  const labelMap: Record<SevKey, string> = {
    low: "Baixo",
    moderate: "Moderado",
    high: "Alto",
    critical: "Crítico",
  };

  // qual indicador puxou para cima
  const driver =
    worstVal === kpi.noshowYesPct
      ? `no-show ${kpi.noshowYesPct.toFixed(0)}%`
      : worstVal === kpi.glosaRecorrentePct
      ? `glosas ${kpi.glosaRecorrentePct.toFixed(0)}%`
      : `retrabalho em receitas ${kpi.rxReworkPct.toFixed(0)}%`;

  return { key, label: labelMap[key], color: SEV_COLORS[key], driver };
}

/* ===================== Consolidado por tema / Detalhes (iguais ao anterior) ===================== */

type SectionKey = "noshow" | "glosas" | "receitas";
const SECTIONS: Record<
  SectionKey,
  { title: string; questions: Array<{ key: keyof Answer; label: string; options: string[] }> }
> = {
  noshow: {
    title: "No-show (Faltas em consultas)",
    questions: [
      { key: "q_noshow_relevance", label: "Relevância", options: ["Sim", "Não", "Parcialmente"] },
      { key: "q_noshow_has_system", label: "Possui sistema que resolve", options: ["Sim", "Não"] },
      { key: "q_noshow_financial_impact", label: "Impacto financeiro mensal", options: ["Baixo impacto", "Médio impacto", "Alto impacto"] },
    ],
  },
  glosas: {
    title: "Glosas de convênios (Faturamento)",
    questions: [
      { key: "q_glosa_is_problem", label: "Glosas recorrentes", options: ["Sim", "Não", "Às vezes"] },
      { key: "q_glosa_interest", label: "Interesse em checagem antes do envio", options: ["Sim", "Não", "Talvez"] },
      { key: "q_glosa_who_suffers", label: "Quem sofre mais", options: ["Médico", "Administrativo", "Ambos"] },
    ],
  },
  receitas: {
    title: "Receitas digitais e telemedicina",
    questions: [
      { key: "q_rx_rework", label: "Receitas geram retrabalho", options: ["Sim", "Não", "Raramente"] },
      { key: "q_rx_elderly_difficulty", label: "Pacientes têm dificuldade", options: ["Sim", "Não", "Em parte"] },
      { key: "q_rx_tool_value", label: "Valor em ferramenta de apoio", options: ["Sim", "Não", "Talvez"] },
    ],
  },
};

function renderSectionTable(
  doc: jsPDF,
  section: (typeof SECTIONS)[SectionKey],
  answers: Answer[],
  pageW: number,
  pageH: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  type Row = { pergunta: string; opcao: string; qtde: number; pct: string };
  const rows: Row[] = [];
  let answeredAll = 0;
  let notAnsweredAll = 0;

  section.questions.forEach((q) => {
    const { items, answered, unknownCount } = dist(answers, q.key, q.options);
    answeredAll += answered;
    notAnsweredAll += unknownCount;

    items
      .filter((it) => it.count > 0)
      .sort((a, b) => b.count - a.count)
      .forEach((it) => {
        rows.push({ pergunta: q.label, opcao: it.label, qtde: it.count, pct: it.pct });
      });
  });

  const HEADER_GAP = 28;
  const topY = 14 + 72 + 12 + HEADER_GAP + TOP_GAP;

  autoTable(doc as any, {
    startY: topY,
    styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 6, lineColor: CARD_EDGE },
    headStyles: { fillColor: [25, 118, 210], textColor: "#ffffff", fontStyle: "bold" },
    body: rows.length ? rows : [{ pergunta: "—", opcao: "—", qtde: 0, pct: "0%" }],
    columns: [
      { header: section.title, dataKey: "pergunta" },
      { header: "Opção", dataKey: "opcao" },
      { header: "Qtde", dataKey: "qtde" },
      { header: "% (entre respondentes)", dataKey: "pct" },
    ],
    columnStyles: {
      pergunta: { cellWidth: 260, overflow: "linebreak" },
      opcao: { cellWidth: 220, overflow: "linebreak" },
      qtde: { cellWidth: 60, halign: "right" },
      pct: { cellWidth: 160, halign: "right" },
    },
    tableWidth: pageW - marginX * 2,
    margin: { left: marginX, right: marginX, top: topY, bottom: 26 },
    theme: "grid",
    rowPageBreak: "auto",
    didDrawPage: () => {
      const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      const sampleTxt = `Respondido: ${answeredAll} • Não respondido: ${notAnsweredAll}`;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(11);
      doc.text(sampleTxt, marginX, sY + HEADER_GAP - 12);
      drawFooter(doc, pageW, pageH, marginX);
    },
  });

  return (doc as any).lastAutoTable.finalY;
}

/* ===== Respostas detalhadas (cards / tabelas) ===== */

function drawPill(doc: jsPDF, x: number, y: number, text: string) {
  const padX = 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const w = doc.getTextWidth(text) + padX * 2;
  const h = 18;
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#f6f9ff");
  doc.roundedRect(x, y, w, h, 9, 9, "FD");
  doc.setTextColor(BRAND_BLUE);
  doc.text(text, x + padX, y + 12);
  return { width: w, height: h };
}

function safeText(v: any): string {
  if (v == null || v === "") return "Não informado";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

function renderDetailedAsCards(
  doc: jsPDF,
  answers: Answer[],
  pageW: number,
  pageH: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  const gap = 18;
  const colW = (pageW - marginX * 2 - gap) / 2;
  let startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(14);
  doc.text("Respostas detalhadas (cartões)", marginX, startY + 2);
  let y = startY + 14;

  const lineH = 16;

  answers.forEach((a, idx) => {
    const col = idx % 2;
    const x = marginX + col * (colW + gap);

    const commentRaw = (a.comments || "").toString().trim();
    const comment = commentRaw ? commentRaw : "";
    const commentLines = comment ? doc.splitTextToSize(comment, colW - 24) : [];
    const commentH = commentLines.length ? commentLines.length * lineH + 6 : 0;

    const baseH =
      24 + 8 + 3 * 28 + (comment ? 18 : 0) + commentH + 18;
    let cardH = baseH;

    if (y + cardH > pageH - 60) {
      y = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl }) + 14;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Respostas detalhadas (cartões)", marginX, y - 12);
    }

    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#ffffff");
    doc.roundedRect(x, y, colW, cardH, 12, 12, "FD");

    const code = `R-${String(idx + 1).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(12);
    doc.text(`Resposta ${code}`, x + 14, y + 22);

    const consent = !!(a.consent_contact || a.consent);
    if (consent) {
      const idLine = [safeText(a.doctor_name), safeText(a.crm), safeText(a.contact)]
        .filter((t) => t && t !== "Não informado")
        .join(" • ");
      if (idLine) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(10);
        doc.text(idLine, x + 14, y + 38, { maxWidth: colW - 28 });
      }
    }

    let rowY = y + (consent ? 50 : 42);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(11);
    doc.text("No-show", x + 14, rowY);
    rowY += 4;
    let px = x + 14;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_relevance)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_has_system)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_noshow_financial_impact));
    rowY += 28;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(11);
    doc.text("Glosas", x + 14, rowY);
    rowY += 4;
    px = x + 14;
    px += drawPill(doc, px, rowY, safeText(a.q_glosa_is_problem)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_glosa_interest)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_glosa_who_suffers));
    rowY += 28;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(11);
    doc.text("Receitas digitais", x + 14, rowY);
    rowY += 4;
    px = x + 14;
    px += drawPill(doc, px, rowY, safeText(a.q_rx_rework)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_rx_elderly_difficulty)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_rx_tool_value));
    rowY += 28;

    if (commentLines.length) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(11);
      doc.text("Comentário (resumo)", x + 14, rowY);
      rowY += 16;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(11);
      doc.text(commentLines, x + 14, rowY);
      rowY += commentH;
    }

    rowY += 12;
    const usedH = rowY - y;
    if (usedH + 10 > cardH) cardH = usedH + 10;

    if (col === 1) y += cardH + 12;
  });
}

function renderDetailedAsTables(
  doc: jsPDF,
  answers: Answer[],
  pageW: number,
  pageH: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  type Row = { resp: string; a: string; b: string; c: string };

  const buildRows = (keys: [keyof Answer, keyof Answer, keyof Answer]): Row[] =>
    answers.map((a, i) => ({
      resp: `R-${String(i + 1).padStart(2, "0")}`,
      a: safeText(a[keys[0]]),
      b: safeText(a[keys[1]]),
      c: safeText(a[keys[2]]),
    }));

  const sections: Array<{ title: string; rows: Row[]; heads: [string, string, string] }> = [
    {
      title: "No-show (linha = respondente)",
      rows: buildRows(["q_noshow_relevance", "q_noshow_has_system", "q_noshow_financial_impact"]),
      heads: ["Relevância", "Sistema", "Impacto"],
    },
    {
      title: "Glosas (linha = respondente)",
      rows: buildRows(["q_glosa_is_problem", "q_glosa_interest", "q_glosa_who_suffers"]),
      heads: ["Recorrência", "Checagem", "Quem sofre"],
    },
    {
      title: "Receitas digitais (linha = respondente)",
      rows: buildRows(["q_rx_rework", "q_rx_elderly_difficulty", "q_rx_tool_value"]),
      heads: ["Retrabalho", "Dificuldade", "Valor na ferramenta"],
    },
  ];

  const headerGap = 28;
  const topY = 14 + 72 + 12 + headerGap + TOP_GAP;

  sections.forEach((sec, idx) => {
    autoTable(doc as any, {
      startY: idx === 0 ? topY : (doc as any).lastAutoTable.finalY + 26,
      styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 6, lineColor: CARD_EDGE },
      headStyles: { fillColor: [37, 117, 252], textColor: "#ffffff", fontStyle: "bold" },
      body: sec.rows,
      columns: [
        { header: sec.title, dataKey: "resp" },
        { header: sec.heads[0], dataKey: "a" },
        { header: sec.heads[1], dataKey: "b" },
        { header: sec.heads[2], dataKey: "c" },
      ],
      columnStyles: {
        resp: { cellWidth: 90 },
        a: { cellWidth: 220, overflow: "linebreak" },
        b: { cellWidth: 220, overflow: "linebreak" },
        c: { cellWidth: 240, overflow: "linebreak" },
      },
      tableWidth: pageW - marginX * 2,
      margin: { left: marginX, right: marginX, top: topY, bottom: 26 },
      theme: "grid",
      rowPageBreak: "auto",
      didDrawPage: () => {
        const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Respostas detalhadas (tabelas por tema)", marginX, sY + 18);
        drawFooter(doc, pageW, pageH, marginX);
      },
    });
  });
}

/* ===================== Componente ===================== */

export default function ExportPDFButton({ kpi, answers }: Props) {
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

      /* ========= PÁGINA 1: Banner de Plano de Ação (cor por severidade) + Sumário/Resumo ========= */
      let startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      drawFooter(doc, pageW, pageH, marginX);

      const sev = computeSeverity(kpi);
      const actionBullets: string[] = [];
      if (kpi.noshowYesPct >= 50) {
        actionBullets.push("No-show: lembretes automáticos + confirmação (D-7 e D-1) e lista ativa de recuperação.");
      }
      if (kpi.glosaRecorrentePct >= 40) {
        actionBullets.push("Glosas: checklist TISS/TUSS e conferência pré-envio; padrão de auditoria com amostragem semanal.");
      }
      if (kpi.rxReworkPct >= 40) {
        actionBullets.push("Receitas digitais: padronizar modelo e fluxo assistido (envio paciente/farmácia) com validação automática.");
      }
      if (!actionBullets.length) {
        actionBullets.push("Manter monitoramento e ampliar base de respondentes (amostra pequena).");
      }

      const CARD_W = pageW - marginX * 2;
      const GUTTER = 16;
      const LINE = 16;

      // === Banner Plano de Ação (logo abaixo do header, com respiro) ===
      const bannerTop = startY + 12; // mais próximo do cabeçalho, porém não grudado
      const bannerPad = 16;
      const bannerTitle = "Plano de Ação sugerido (MVP)";

      // medir altura do conteúdo
      const tmpY = 0; // apenas para cálculo
      const bulletsH = actionBullets.length * LINE + 6;
      const bannerH = 22 /*title*/ + 10 /*badge espaço*/ + bulletsH + bannerPad * 2;

      // card base
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, bannerTop, CARD_W, bannerH, 12, 12, "FD");

      // faixa colorida no topo (cor do nível)
      doc.setFillColor(sev.color);
      doc.roundedRect(marginX, bannerTop, CARD_W, 8, 12, 12, "F");

      // título
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(13);
      doc.text(bannerTitle, marginX + bannerPad, bannerTop + 22);

      // badge de nível no canto direito
      const badgeText = `Nível de atenção: ${sev.label}`;
      const badge = drawBadge(
        doc,
        badgeText,
        marginX + CARD_W - bannerPad - (doc.getTextWidth(badgeText) + 16),
        bannerTop + 12,
        sev.color
      );

      // subtítulo discreto (driver do nível)
      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(10);
      const sub = `Pior indicador: ${sev.driver}`;
      doc.text(sub, marginX + bannerPad, bannerTop + 22 + 14);

      // bullets
      bulletLines(doc, actionBullets, marginX + bannerPad, bannerTop + 22 + 14, CARD_W - bannerPad * 2, LINE);

      // === Linha de baixo: Sumário (esq) + Resumo (dir) ===
      const rowTop = bannerTop + bannerH + 16;
      const colW = (CARD_W - GUTTER) / 2;

      // SUMÁRIO
      const tocItems = [
        "Visão Geral (KPIs + gráficos por tema)",
        "Respostas detalhadas",
        "Comentários",
        "Identificação (opcional)",
      ];
      const sumTitle = "Sumário";
      const sumCardH = 22 + 12 + tocItems.length * LINE + 16;

      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, rowTop, colW, sumCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(13);
      doc.text(sumTitle, marginX + 16, rowTop + 22);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(11);
      let listY = rowTop + 22 + 12;
      tocItems.forEach((label, i) => {
        doc.circle(marginX + 16, listY - 3, 1.8, "F");
        doc.text(`${i + 1}. ${label}`, marginX + 16 + 8, listY, { maxWidth: colW - 32 });
        listY += LINE;
      });

      // RESUMO EXECUTIVO
      const resumoBullets = [
        `Amostra consolidada: ${kpi.total} respostas.`,
        `Sinais de impacto: No-show ${kpi.noshowYesPct.toFixed(0)}%, Glosas ${kpi.glosaRecorrentePct.toFixed(0)}%, Retrabalho em receitas ${kpi.rxReworkPct.toFixed(0)}%.`,
        "Recomendação: piloto focado em no-show e glosas, com fluxo assistido para receitas digitais.",
      ];
      const resumoH = 22 + 12 + resumoBullets.length * LINE + 16;
      const resumoX = marginX + colW + GUTTER;

      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(resumoX, rowTop, colW, resumoH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(13);
      doc.text("Resumo Executivo — Principais insights", resumoX + 16, rowTop + 22);

      bulletLines(doc, resumoBullets, resumoX + 16, rowTop + 22, colW - 32, LINE);

      /* ========= PÁGINA 2: Visão Geral (KPIs + grade 3×3) ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const gap = 16;
      const kpiCardW = (pageW - marginX * 2 - gap * 3) / 4;
      const kpiCardH = 82;

      let kpiY = startY;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, kpiY + 2);
      kpiY += 14;

      drawKpiCard(doc, marginX + 0 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "Total de respostas", `${kpi.total}`, ACCENT);
      drawKpiCard(doc, marginX + 1 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      drawKpiCard(doc, marginX + 2 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);
      drawKpiCard(doc, marginX + 3 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "% receitas geram retrabalho", `${kpi.rxReworkPct.toFixed(0)}%`);

      let gridTop = kpiY + kpiCardH + 24;

      const nsRelev = dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]).items;
      const nsSys = dist(answers, "q_noshow_has_system", ["Sim", "Não"]).items;
      const nsImpact = dist(answers, "q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]).items;

      const gRec = dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]).items;
      const gInt = dist(answers, "q_glosa_interest", ["Sim", "Não", "Talvez"]).items;
      const gWho = dist(answers, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]).items;

      const rxRw = dist(answers, "q_rx_rework", ["Sim", "Não", "Raramente"]).items;
      const rxDif = dist(answers, "q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]).items;
      const rxVal = dist(answers, "q_rx_tool_value", ["Sim", "Não", "Talvez"]).items;

      const blocks: Array<{ title: string; items: DistItem[] }> = [
        { title: "No-show — Relevância", items: nsRelev },
        { title: "No-show — Sistema que resolve", items: nsSys },
        { title: "No-show — Impacto financeiro mensal", items: nsImpact },
        { title: "Glosas — Recorrência", items: gRec },
        { title: "Glosas — Checagem antes do envio", items: gInt },
        { title: "Glosas — Quem sofre mais", items: gWho },
        { title: "Receitas — Geram retrabalho", items: rxRw },
        { title: "Receitas — Dificuldade dos pacientes", items: rxDif },
        { title: "Receitas — Valor em ferramenta", items: rxVal },
      ];

      const COLS = 3;
      const COL_GAP = 18;
      const COL_W = (pageW - marginX * 2 - COL_GAP * (COLS - 1)) / COLS;

      let x = marginX;
      let yCompact = gridTop;

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const h = measureBarBlockCompact(b.items.length);

        if (yCompact + h > pageH - 60) {
          startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(14);
          doc.text("Visão Geral — Distribuições compactas", marginX, startY + 2);
          yCompact = startY + 14;
          x = marginX;
        }

        drawBarBlockCompact(doc, b.title, b.items, x, yCompact, COL_W);

        const col = i % COLS;
        if (col === COLS - 1) {
          x = marginX;
          yCompact += Math.max(h, 74);
        } else {
          x += COL_W + COL_GAP;
        }
      }

      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁGINAS 3–5: Consolidado por TEMA ========= */
      for (const key of ["noshow", "glosas", "receitas"] as SectionKey[]) {
        doc.addPage();
        renderSectionTable(doc, SECTIONS[key], answers, pageW, pageH, marginX, title, logoDataUrl);
      }

      /* ========= RESPOSTAS DETALHADAS ========= */
      if (answers.length <= 20) {
        renderDetailedAsCards(doc, answers, pageW, pageH, marginX, title, logoDataUrl);
      } else {
        renderDetailedAsTables(doc, answers, pageW, pageH, marginX, title, logoDataUrl);
      }

      /* ========= COMENTÁRIOS ========= */
      const comments: Array<{ code: string; text: string }> = answers
        .map((a, i) => ({ code: `R-${String(i + 1).padStart(2, "0")}`, text: (a.comments || "").toString().trim() }))
        .filter((c) => c.text.length > 0);

      if (comments.length) {
        doc.addPage();
        const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Comentários (texto livre) — referência por código da resposta", marginX, sY + 18);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK);
        doc.setFontSize(12);

        let yC = sY + 40;
        const maxW = pageW - marginX * 2 - 20;
        const lineH = 18;

        comments.forEach((c) => {
          const bullet = `${c.code} — ${c.text}`;
          const lines = doc.splitTextToSize(bullet, maxW);
          if (yC + lines.length * lineH > pageH - 60) {
            drawFooter(doc, pageW, pageH, marginX);
            doc.addPage();
            const sY2 = drawHeader(doc, pageW, marginX, title, logoDataUrl);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Comentários (continuação)", marginX, sY2 + 18);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK);
            doc.setFontSize(12);
            yC = sY2 + 40;
          }
          doc.text(lines, marginX + 10, yC);
          yC += lines.length * lineH + 8;
        });

        drawFooter(doc, pageW, pageH, marginX);
      }

      /* ========= IDENTIFICAÇÃO ========= */
      const idRows = answers
        .filter((a) => a.consent_contact === true || a.consent === true)
        .map((a, i) => ({
          resp: `R-${String(i + 1).padStart(2, "0")}`,
          nome: (a.doctor_name || "").toString().trim() || "—",
          crm: (a.crm || "").toString().trim() || "—",
          contato: (a.contact || "").toString().trim() || "—",
        }))
        .filter((r) => r.nome !== "—" || r.crm !== "—" || r.contato !== "—");

      if (idRows.length) {
        doc.addPage();
        const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Identificação (somente com autorização de contato)", marginX, sY + 18);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        const infoY = sY + 36;
        doc.text("Os dados abaixo aparecem apenas quando o respondente marcou o consentimento.", marginX, infoY);

        const topY = infoY + 28;

        autoTable(doc as any, {
          startY: topY,
          styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 6, lineColor: CARD_EDGE },
          headStyles: { fillColor: [25, 118, 210], textColor: "#ffffff", fontStyle: "bold" },
          body: idRows,
          columns: [
            { header: "Resp.", dataKey: "resp" },
            { header: "Nome", dataKey: "nome" },
            { header: "CRM", dataKey: "crm" },
            { header: "Contato (e-mail / WhatsApp)", dataKey: "contato" },
          ],
          tableWidth: pageW - marginX * 2,
          margin: { left: marginX, right: marginX, top: topY, bottom: 26 },
          theme: "grid",
          rowPageBreak: "auto",
          didDrawPage: () => {
            drawHeader(doc, pageW, marginX, title, logoDataUrl);
            drawFooter(doc, pageW, pageH, marginX);
          },
        });
      }

      const fileName = `Relatorio_Pesquisa_${new Intl.DateTimeFormat("pt-BR").format(new Date())}.pdf`;
      doc.save(fileName);
    } finally {
      setLoading(false);
    }
  }, [answers, kpi]);

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
