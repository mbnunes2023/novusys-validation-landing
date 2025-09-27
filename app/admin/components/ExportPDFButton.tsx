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
  answers: Answer[];
  summaryRows?: Array<Record<string, number | string>>;
  chartRefs?: {
    noshowRef: React.RefObject<HTMLDivElement>;
    glosaRef: React.RefObject<HTMLDivElement>;
    rxRef: React.RefObject<HTMLDivElement>;
  };
};

/* ===================== Branding / Layout ===================== */

const BRAND_BLUE = "#1976d2";
const ACCENT = "#2575fc";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";

// Sinais de mercado (cores)
export const SIGNAL_COLORS = {
  strong: "#10b981",
  moderate: "#f59e0b",
  weak: "#94a3b8",
  inconclusive: "#3b82f6",
} as const;

type SignalKey = keyof typeof SIGNAL_COLORS;

// Limiar(es) configuráveis
export const THRESHOLDS = {
  strong: 60,
  moderate: 40,
  weak: 25,

  // guard-rails de amostra
  minSampleModerate: 8,
  minSampleStrong: 12,

  // overrides por tema (opcional)
  byTheme: {
    "no-show": { strong: 55, moderate: 35 },
    glosas: { strong: 60, moderate: 40 },
    receitas: { strong: 60, moderate: 40 },
  } as Partial<
    Record<"no-show" | "glosas" | "receitas", { strong: number; moderate: number }>
  >,
};

// Página 1: espaçamentos
const P1_LINE = 18;
const P1_GUTTER = 18;
const P1_CARD_PAD_X = 16;
const P1_CARD_PAD_Y = 16;

/* ===================== Utils ===================== */

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
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

/* ===================== Cabeçalho/Rodapé ===================== */

const TOP_GAP = 24;

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

  // card do header
  const headerH = 72;
  const cardX = marginX;
  const cardY = 14;
  const cardW = pageW - marginX * 2;

  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardY, cardW, headerH, 10, 10, "FD");

  // centralização vertical
  const centerY = cardY + headerH / 2;

  // bloco texto (esquerda)
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

  // logo (direita)
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
  opts: {
    title: string;
    marginX: number;
    pageW: number;
    pageH: number;
    logoDataUrl?: string | null;
  }
) {
  doc.addPage();
  const startY = drawHeader(
    doc,
    opts.pageW,
    opts.marginX,
    opts.title,
    opts.logoDataUrl
  );
  drawFooter(doc, opts.pageW, opts.pageH, opts.marginX);
  return startY;
}

/* ===================== Primitivos ===================== */

// Badge com texto centralizado verticalmente
function drawBadge(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  fill = "#000",
  padX = 8,
  padY = 6
) {
  const fs = doc.getFontSize();
  const h = Math.max(20, fs + padY * 2);
  const w = doc.getTextWidth(text) + padX * 2;

  doc.setFillColor(fill);
  doc.setDrawColor(fill);
  doc.roundedRect(x, y, w, h, 10, 10, "F");

  const yText = y + h / 2 + fs * 0.35; // centralização ótica
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#ffffff");
  doc.text(text, x + padX, yText);

  return { w, h };
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
    const chunks = doc.splitTextToSize(line, maxWidth - 16);
    doc.circle(x, y - 3, 1.8, "F");
    doc.text(chunks[0], x + 8, y);
    for (let i = 1; i < chunks.length; i++) {
      y += lineH;
      doc.text(chunks[i], x + 8, y);
    }
    y += lineH;
  });
  return y;
}

/* ===================== Sinal de Mercado ===================== */

function classifySignalWithThresholds(
  theme: "no-show" | "glosas" | "receitas",
  pct: number,
  n: number
): { key: SignalKey; label: string } {
  const t = THRESHOLDS.byTheme?.[theme];
  const STRONG = t?.strong ?? THRESHOLDS.strong;
  const MODERATE = t?.moderate ?? THRESHOLDS.moderate;
  const WEAK = THRESHOLDS.weak;

  let key: SignalKey =
    pct >= STRONG ? "strong" : pct >= MODERATE ? "moderate" : pct >= WEAK ? "weak" : "weak";

  if (n < THRESHOLDS.minSampleStrong && key === "strong") key = "moderate";
  if (n < THRESHOLDS.minSampleModerate && key === "moderate") key = "weak";
  if (n < 5) key = "inconclusive";

  const labelMap: Record<SignalKey, string> = {
    strong: "Forte",
    moderate: "Moderado",
    weak: "Fraco",
    inconclusive: "Inconclusivo",
  };
  return { key, label: labelMap[key] };
}

function marketSignals(kpi: KPI) {
  const n = kpi.total || 0;

  const themes = [
    { theme: "no-show" as const, pct: kpi.noshowYesPct },
    { theme: "glosas" as const, pct: kpi.glosaRecorrentePct },
    { theme: "receitas" as const, pct: kpi.rxReworkPct },
  ].map((t) => {
    const cls = classifySignalWithThresholds(t.theme, t.pct, n);
    return {
      theme: t.theme,
      pct: t.pct,
      key: cls.key,
      label: cls.label,
      reason: n < 5 ? "Amostra muito pequena" : `${Math.round(t.pct)}% relatou problema`,
    };
  });

  const top = [...themes].sort((a, b) => b.pct - a.pct)[0];
  let overallKey: SignalKey = top.key;
  if (kpi.total < 5) overallKey = "inconclusive";

  const labelMap: Record<SignalKey, string> = {
    strong: "Forte",
    moderate: "Moderado",
    weak: "Fraco",
    inconclusive: "Inconclusivo",
  };

  return {
    themes,
    overall: { key: overallKey, label: labelMap[overallKey], color: SIGNAL_COLORS[overallKey] },
  };
}

type ActionTone = "direto" | "formal" | "vendedor";
const ACTION_TONE: ActionTone = "direto";

const ACTION_TEXTS: Record<
  ActionTone,
  {
    strong: (t: string) => string;
    moderate: (t: string) => string;
    weak: (t: string) => string;
    inconclusive: (t: string) => string;
  }
> = {
  direto: {
    strong: (t) => `${t}: rodar piloto pago por 4–6 semanas; buscar redução de 20–30%.`,
    moderate: (t) => `${t}: 5 entrevistas + protótipo simples; definir métrica e preço.`,
    weak: (t) => `${t}: monitorar; não priorizar agora.`,
    inconclusive: (t) => `${t}: coletar mais respostas antes de decidir.`,
  },
  formal: {
    strong: (t) =>
      `${t}: conduzir piloto remunerado (4–6 semanas) com meta de redução de 20–30%.`,
    moderate: (t) =>
      `${t}: realizar 5 entrevistas e prototipagem; definir métrica de sucesso e precificação.`,
    weak: (t) => `${t}: manter acompanhamento; sem prioridade no momento.`,
    inconclusive: (t) => `${t}: ampliar a amostra para suportar decisão.`,
  },
  vendedor: {
    strong: (t) => `${t}: provar valor em 30 dias — piloto pago e metas claras (20–30%).`,
    moderate: (t) => `${t}: falar com 5 clientes e mostrar um demo rápido; alinhar preço.`,
    weak: (t) => `${t}: deixar no radar; agir se o interesse crescer.`,
    inconclusive: (t) => `${t}: precisamos de mais respostas para fechar o diagnóstico.`,
  },
};

function actionBulletsFromSignals(sig: ReturnType<typeof marketSignals>): string[] {
  const name = (theme: string) =>
    theme === "no-show" ? "No-show" : theme === "glosas" ? "Glosas" : "Receitas";
  return sig.themes.map((t) => ACTION_TEXTS[ACTION_TONE][t.key](name(t.theme)));
}

/* ===================== KPI Cards / Distribuições ===================== */

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
  const toPct = (n: number) => (answered ? `${Math.round((n / answered) * 100)}%` : "0%`);

  const items = order.map((k) => ({ label: k, count: counts[k], pct: toPct(counts[k]) }));
  return { items, answered, unknownCount: unknown };
}

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

/* ===================== Consolidado por tema / Tabelas ===================== */

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
      {
        key: "q_noshow_financial_impact",
        label: "Impacto financeiro mensal",
        options: ["Baixo impacto", "Médio impacto", "Alto impacto"],
      },
    ],
  },
  glosas: {
    title: "Glosas de convênios (Faturamento)",
    questions: [
      { key: "q_glosa_is_problem", label: "Glosas recorrentes", options: ["Sim", "Não", "Às vezes"] },
      {
        key: "q_glosa_interest",
        label: "Interesse em checagem antes do envio",
        options: ["Sim", "Não", "Talvez"],
      },
      {
        key: "q_glosa_who_suffers",
        label: "Quem sofre mais",
        options: ["Médico", "Administrativo", "Ambos"],
      },
    ],
  },
  receitas: {
    title: "Receitas digitais e telemedicina",
    questions: [
      { key: "q_rx_rework", label: "Receitas geram retrabalho", options: ["Sim", "Não", "Raramente"] },
      {
        key: "q_rx_elderly_difficulty",
        label: "Pacientes têm dificuldade",
        options: ["Sim", "Não", "Em parte"],
      },
      {
        key: "q_rx_tool_value",
        label: "Valor em ferramenta de apoio",
        options: ["Sim", "Não", "Talvez"],
      },
    ],
  },
};

// helper: distribui larguras para ocupar 100% do tableW
function spreadColumnWidths(totalW: number, ratios: number[]) {
  const sum = ratios.reduce((s, r) => s + r, 0);
  const widths = ratios.map((r) => Math.floor((r / sum) * totalW));
  // ajuste do arredondamento
  const diff = totalW - widths.reduce((s, w) => s + w, 0);
  if (diff !== 0) widths[widths.length - 1] += diff;
  return widths;
}

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

  // largura total alinhada ao cabeçalho
  const tableW = pageW - marginX * 2;
  // proporções entre as colunas [pergunta, opcao, qtde, pct]
  const [wPerg, wOpc, wQtde, wPct] = spreadColumnWidths(tableW, [3.5, 3, 0.8, 1.2]);

  autoTable(doc as any, {
    startY: topY,
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: INK,
      cellPadding: 6,
      lineColor: CARD_EDGE,
    },
    headStyles: { fillColor: [25, 118, 210], textColor: "#ffffff", fontStyle: "bold" },
    body: rows.length ? rows : [{ pergunta: "—", opcao: "—", qtde: 0, pct: "0%" }],
    columns: [
      { header: section.title, dataKey: "pergunta" },
      { header: "Opção", dataKey: "opcao" },
      { header: "Qtde", dataKey: "qtde" },
      { header: "% (entre respondentes)", dataKey: "pct" },
    ],
    columnStyles: {
      pergunta: { cellWidth: wPerg, overflow: "linebreak" },
      opcao: { cellWidth: wOpc, overflow: "linebreak" },
      qtde: { cellWidth: wQtde, halign: "right" },
      pct: { cellWidth: wPct, halign: "right" },
    },
    tableWidth: tableW,
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

/* ===================== Respostas detalhadas (cards) ===================== */

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
  // Layout adaptativo: 4 colunas quando houver muitas respostas
  const COLS = answers.length >= 8 ? 4 : 2;
  const gap = answers.length >= 8 ? 14 : 18;
  const colW = (pageW - marginX * 2 - gap * (COLS - 1)) / COLS;

  // Ritmo vertical com mais respiro
  const LINE_H = 17;
  const PILL_GAP_X = 8;
  const SECTION_TITLE_GAP = 6;
  const BETWEEN_SECTIONS = 12;
  const MIN_CARD_H = answers.length >= 8 ? 180 : 220;
  const CARD_BOTTOM_PAD = 12;

  let startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(14);
  doc.text("Respostas detalhadas (cartões)", marginX, startY + 2);
  let y = startY + 16;

  answers.forEach((a, idx) => {
    const col = idx % COLS;
    const x = marginX + col * (colW + gap);

    // Comentário e altura calculada
    const commentRaw = (a.comments || "").toString().trim();
    const comment = commentRaw ? commentRaw : "";
    const commentLines = comment ? doc.splitTextToSize(comment, colW - 24) : [];
    const commentH = commentLines.length ? commentLines.length * LINE_H + 4 : 0;

    const baseH =
      24 + // título
      10 + // possível identificação
      (SECTION_TITLE_GAP + 22) + // No-show
      BETWEEN_SECTIONS +
      (SECTION_TITLE_GAP + 22) + // Glosas
      BETWEEN_SECTIONS +
      (SECTION_TITLE_GAP + 22) + // Receitas
      (comment ? 14 + commentH : 0) +
      CARD_BOTTOM_PAD;

    let cardH = Math.max(baseH, MIN_CARD_H);

    // quebra de página
    if (y + cardH > pageH - 60) {
      y = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl }) + 16;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Respostas detalhadas (cartões)", marginX, y - 12);
    }

    // cartão
    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#ffffff");
    doc.roundedRect(x, y, colW, cardH, 12, 12, "FD");

    const code = `R-${String(idx + 1).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(11.5);
    doc.text(`Resposta ${code}`, x + 14, y + 20);

    // identificação (consentimento)
    let rowY = y + 34;
    const consent = !!(a.consent_contact || a.consent);
    if (consent) {
      const idLine = [safeText(a.doctor_name), safeText(a.crm), safeText(a.contact)]
        .filter((t) => t && t !== "Não informado")
        .join(" • ");
      if (idLine) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(9.5);
        doc.text(idLine, x + 14, rowY, { maxWidth: colW - 28 });
        rowY += 12;
      }
    }

    // No-show
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(10.5);
    doc.text("No-show", x + 14, rowY);
    rowY += SECTION_TITLE_GAP;

    let px = x + 14;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_relevance)).width + PILL_GAP_X;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_has_system)).width + PILL_GAP_X;
    drawPill(doc, px, rowY, safeText(a.q_noshow_financial_impact));
    rowY += 22 + BETWEEN
