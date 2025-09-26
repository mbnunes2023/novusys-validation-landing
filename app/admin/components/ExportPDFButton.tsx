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
  summaryRows: Array<Record<string, number | string>>; // compatibilidade
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

// /public/logo.png -> DataURL
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

const TOP_GAP = 24; // respiro após header

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

  // logo (direita), centralizado verticalmente
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

/* ===================== KPI Cards ===================== */

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

/* ===================== Micro-charts ===================== */

type DistItem = { label: string; count: number; pct: string };

const ROW_H = 20;
const ROW_GAP = 6;

function measureBarBlock(lines: number) {
  return 8 + lines * (ROW_H + ROW_GAP);
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

/* ======== Compacto (3×3 da página 2) ======== */
const CROW_H = 14;
const CROW_GAP = 4;

function measureBarBlockCompact(lines: number) {
  return 7 + lines * (CROW_H + CROW_GAP) + 2;
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

  const labelW = width * 0.44;
  const barW = width * 0.56;
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

/* ===================== Tabelas/Mapas ===================== */

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ===================== Consolidado por tema ===================== */

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

/* ===================== Respostas detalhadas — Premium ===================== */

/** desenha um "pill" com texto dentro */
function drawPill(doc: jsPDF, x: number, y: number, text: string) {
  const padX = 6;
  const padY = 4;
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

/** Cards 2-col para ≤ 20 respostas */
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

    // medir comentário (resumo)
    const commentRaw = (a.comments || "").toString().trim();
    const comment = commentRaw ? commentRaw : "";
    const commentLines = comment ? doc.splitTextToSize(comment, colW - 24) : [];
    const commentH = commentLines.length ? commentLines.length * lineH + 6 : 0;

    // altura básica do card
    const baseH = 24 /*title*/ + 8 /*id line*/ + 3 * 28 /*3 blocos pills*/ + (comment ? 18 : 0) + commentH + 18;
    let cardH = baseH;

    // quebra de página?
    if (y + cardH > pageH - 60) {
      y = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl }) + 14;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Respostas detalhadas (cartões)", marginX, y - 12);
    }

    // card
    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#ffffff");
    doc.roundedRect(x, y, colW, cardH, 12, 12, "FD");

    // cabeçalho
    const code = `R-${String(idx + 1).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(12);
    doc.text(`Resposta ${code}`, x + 14, y + 22);

    // identificação (se consentida)
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

    // blocos
    let rowY = y + (consent ? 50 : 42);

    // No-show
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

    // Glosas
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

    // Receitas
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

    // Comentário (resumo)
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

    // rodapé do card
    rowY += 12;
    const usedH = rowY - y;
    if (usedH + 10 > cardH) {
      cardH = usedH + 10;
    }

    if (col === 1) y += cardH + 12;
  });
}

/** Tabelas por tema para > 20 respostas */
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

  const buildRows = (keys: [keyof Answer, keyof Answer, keyof Answer]): Row[] => {
    return answers.map((a, i) => ({
      resp: `R-${String(i + 1).padStart(2, "0")}`,
      a: safeText(a[keys[0]]),
      b: safeText(a[keys[1]]),
      c: safeText(a[keys[2]]),
    }));
  };

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

/* ===================== NOVO: Confiança + Plano (somente adição) ===================== */
function getConfidencePlan(total: number): { label: string; bullets: string[] } {
  if (total < 10) {
    return {
      label: "Amostra pequena",
      bullets: [
        "Ampliar a coleta para ≥ 30 respostas antes de grandes decisões.",
        "Focar divulgação no ICP (tamanho e especialidade mais relevantes).",
        "Realizar 3–5 entrevistas qualitativas para validar hipóteses.",
      ],
    };
  }
  if (total < 30) {
    return {
      label: "Amostra moderada",
      bullets: [
        "Iniciar protótipos/pilotos controlados em 1–2 clínicas.",
        "Medir baseline por 2 semanas (no-show, glosa, tempo de receita).",
        "Aprimorar coleta para mensurar valor monetário das dores.",
      ],
    };
  }
  return {
    label: "Amostra robusta",
    bullets: [
        "Priorizar tema líder e iniciar MVP com metas de ROI.",
        "Planejar integrações com agenda/faturamento e piloto pago.",
        "Definir pricing e contrato de valor (SaaS).",
    ],
  };
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

      /* ========= PÁGINA 1: Sumário + Resumo Executivo ========= */
      let startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      drawFooter(doc, pageW, pageH, marginX);

      const CARD_W = pageW - marginX * 2;
      const PAD_X = 18;
      const TITLE_GAP = 26;
      const LINE = 18;

      // SUMÁRIO (preto)
      const tocItems = [
        "Visão Geral (KPIs + distribuições)",
        "Consolidado por tema",
        "Respostas detalhadas",
        "Comentários",
        "Identificação (opcional)",
        "Plano de ação recomendado", // <— adicionado ao sumário
      ];
      const summaryTitleH = 16;
      const summaryListH = tocItems.length * LINE;
      const summaryPadBottom = 20;
      const summaryCardH = TITLE_GAP + summaryTitleH + 8 + summaryListH + summaryPadBottom;

      if (startY + summaryCardH > pageH - 60) {
        startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      }

      let y = startY;
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, y, CARD_W, summaryCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(16);
      doc.text("Sumário", marginX + PAD_X, y + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);

      let listY = y + TITLE_GAP + summaryTitleH + 8;
      tocItems.forEach((label, i) => {
        doc.text(`${i + 1}. ${label}`, marginX + PAD_X, listY, { maxWidth: CARD_W - PAD_X * 2 });
        listY += LINE;
      });

      // RESUMO EXECUTIVO
      const bullets = [
        `Amostra consolidada: ${kpi.total} respostas.`,
        `Sinais de impacto: No-show ${kpi.noshowYesPct.toFixed(0)}%, Glosas ${kpi.glosaRecorrentePct.toFixed(
          0
        )}%, Retrabalho em receitas ${kpi.rxReworkPct.toFixed(0)}%.`,
        "Recomendação: piloto focado em no-show e glosas, com fluxo assistido para receitas digitais.",
      ];

      const reTitleH = 14;
      const bulletsH = bullets.length * LINE;
      const rePadBottom = 24;
      const reCardH = TITLE_GAP + reTitleH + 8 + bulletsH + rePadBottom;

      const gapBetweenCards = 20;
      let reTop = y + summaryCardH + gapBetweenCards;

      if (reTop + reCardH > pageH - 60) {
        reTop = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      }

      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, reTop, CARD_W, reCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Resumo Executivo — Principais insights", marginX + PAD_X, reTop + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);

      let by = reTop + TITLE_GAP + reTitleH + 8;
      const maxW = CARD_W - PAD_X * 2;
      bullets.forEach((line) => {
        doc.circle(marginX + PAD_X, by - 3, 2, "F");
        doc.text(line, marginX + PAD_X + 10, by, { maxWidth: maxW - 10 });
        by += LINE;
      });

      /* ========= (NOVO) CARTÃO: Plano de ação recomendado (ainda na página 1) ========= */
      const plan = getConfidencePlan(kpi.total);
      const planTitleH = 14;
      const planBulletsH = plan.bullets.length * LINE;
      const planPadBottom = 24;
      const planCardH = TITLE_GAP + planTitleH + 8 + planBulletsH + planPadBottom;

      let planTop = reTop + reCardH + gapBetweenCards;
      if (planTop + planCardH > pageH - 60) {
        planTop = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      }

      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, planTop, CARD_W, planCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text(`Plano de ação recomendado — ${plan.label}`, marginX + PAD_X, planTop + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);

      let py = planTop + TITLE_GAP + planTitleH + 8;
      plan.bullets.forEach((line) => {
        doc.circle(marginX + PAD_X, py - 3, 2, "F");
        doc.text(line, marginX + PAD_X + 10, py, { maxWidth: maxW - 10 });
        py += LINE;
      });

      /* ========= PÁGINA 2: Visão Geral (KPIs + grade 3×3 compacta) ========= */
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

      const nsRelev  = dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]).items;
      const nsSys    = dist(answers, "q_noshow_has_system", ["Sim", "Não"]).items;
      const nsImpact = dist(answers, "q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]).items;

      const gRec = dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]).items;
      const gInt = dist(answers, "q_glosa_interest", ["Sim", "Não", "Talvez"]).items;
      const gWho = dist(answers, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]).items;

      const rxRw  = dist(answers, "q_rx_rework", ["Sim", "Não", "Raramente"]).items;
      const rxDif = dist(answers, "q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]).items;
      const rxVal = dist(answers, "q_rx_tool_value", ["Sim", "Não", "Talvez"]).items;

      const blocks: Array<{ title: string; items: DistItem[] }> = [
        { title: "No-show — Relevância",                 items: nsRelev },
        { title: "No-show — Sistema que resolve",        items: nsSys },
        { title: "No-show — Impacto financeiro mensal",  items: nsImpact },
        { title: "Glosas — Recorrência",                 items: gRec },
        { title: "Glosas — Checagem antes do envio",     items: gInt },
        { title: "Glosas — Quem sofre mais",             items: gWho },
        { title: "Receitas — Geram retrabalho",          items: rxRw },
        { title: "Receitas — Dificuldade dos pacientes", items: rxDif },
        { title: "Receitas — Valor em ferramenta",       items: rxVal },
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

      /* ========= RESPOSTAS DETALHADAS — modo adaptativo ========= */
      if (answers.length <= 20) {
        renderDetailedAsCards(doc, answers, pageW, pageH, marginX, title, logoDataUrl);
      } else {
        renderDetailedAsTables(doc, answers, pageW, pageH, marginX, title, logoDataUrl);
      }

      /* ========= COMENTÁRIOS ========= */
      const comments: Array<{ code: string; text: string }> = answers
        .map((a, i) => ({
          code: `R-${String(i + 1).padStart(2, "0")}`,
          text: (a.comments || "").toString().trim(),
        }))
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

      /* ========= IDENTIFICAÇÃO (se autorizado) ========= */
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
        const headerGap = 28;
        const topY = 14 + 72 + 12 + headerGap + TOP_GAP;

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
            const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Identificação (somente com autorização de contato)", marginX, sY + 18);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK_SOFT);
            doc.setFontSize(11);
            doc.text("Os dados abaixo aparecem apenas quando o respondente marcou o consentimento.", marginX, sY + 36);
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
