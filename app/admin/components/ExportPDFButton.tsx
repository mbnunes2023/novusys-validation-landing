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

function spreadColumnWidths(totalW: number, ratios: number[]) {
  const sum = ratios.reduce((s, r) => s + r, 0);
  const widths = ratios.map((r) => Math.floor((r / sum) * totalW));
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
    const counts: Record<string, number> = Object.fromEntries(q.options.map((o) => [o, 0]));
    let unknown = 0;
    answers.forEach((a) => {
      const v = (a[q.key] as string) ?? "";
      if (!v || !q.options.includes(v)) unknown += 1; else counts[v] += 1;
    });
    const answered = Object.values(counts).reduce((s, n) => s + n, 0);
    const toPct = (n: number) => (answered ? `${Math.round((n / answered) * 100)}%` : "0%");
    answeredAll += answered;
    notAnsweredAll += unknown;
    q.options
      .map((label) => ({ label, count: counts[label], pct: toPct(counts[label]) }))
      .filter((it) => it.count > 0)
      .sort((a, b) => b.count - a.count)
      .forEach((it) => rows.push({ pergunta: q.label, opcao: it.label, qtde: it.count, pct: it.pct }));
  });

  const HEADER_GAP = 28;
  const topY = 14 + 72 + 12 + HEADER_GAP + TOP_GAP;

  const tableW = pageW - marginX * 2;
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

/* ===================== Respostas detalhadas (CARTÕES REORGANIZADOS) ===================== */

function safeText(v: any): string {
  if (v == null || v === "") return "Não informado";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

// ---- Cores semânticas por valor (chips) ----
function pillTone(text: string) {
  const v = text.toLowerCase();
  if (v.includes("não informado") || v === "—")
    return { fill: "#F1F5F9", stroke: "#E2E8F0", text: "#475569" }; // cinza
  if (v === "não")
    return { fill: "#FEF2F2", stroke: "#FECACA", text: "#B91C1C" }; // vermelho claro
  if (v === "sim")
    return { fill: "#ECFDF5", stroke: "#BBF7D0", text: "#047857" }; // verde claro
  if (["às vezes", "parcialmente", "em parte", "raramente", "talvez"].includes(v))
    return { fill: "#FFFBEB", stroke: "#FDE68A", text: "#B45309" }; // âmbar
  return { fill: "#F6F9FF", stroke: "#E0E7FF", text: BRAND_BLUE }; // padrão azul
}

function drawPill(doc: jsPDF, x: number, y: number, text: string) {
  const padX = 7;
  const tone = pillTone(text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const w = doc.getTextWidth(text) + padX * 2;
  const h = 20; // +2px para respirar melhor

  doc.setDrawColor(tone.stroke as any);
  doc.setFillColor(tone.fill as any);
  doc.roundedRect(x, y, w, h, 9, 9, "FD");

  doc.setTextColor(tone.text as any);
  doc.text(text, x + padX, y + 13);
  return { width: w, height: h };
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
  // Layout
  const COLS = answers.length >= 8 ? 4 : 2;
  const GAP_X = answers.length >= 8 ? 14 : 20;   // espaço entre colunas
  const colW = (pageW - marginX * 2 - GAP_X * (COLS - 1)) / COLS;

  // Respiro vertical
  const MIN_CARD_H = 300;         // mais alto p/ não "amontoar"
  const TITLE_TO_ID = 12;         // distância do título para identificação
  const SECTION_TITLE_GAP = 10;   // espaço do título de seção para chips
  const BETWEEN_SECTIONS = 14;    // espaço entre blocos (No-show/Glosas/Rx)
  const BETWEEN_ROWS = 12;        // espaço antes do comentário

  let startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(14);
  doc.text("Respostas detalhadas (cartões)", marginX, startY + 2);
  let y = startY + 16;

  answers.forEach((a, idx) => {
    const col = idx % COLS;
    const x = marginX + col * (colW + GAP_X);

    // Pré-cálculo do comentário para estimar altura
    const commentRaw = (a.comments || "").toString().trim();
    const comment = commentRaw ? commentRaw : "";
    const lineH = 16;
    const commentLines = comment ? doc.splitTextToSize(comment, colW - 24) : [];
    const commentH = commentLines.length ? commentLines.length * lineH + 6 : 0;

    // altura base dos blocos (3 seções + título + identificação opcional)
    let estH = 22 /* título */ + TITLE_TO_ID +
               // No-show
               12 + SECTION_TITLE_GAP + 22 + BETWEEN_SECTIONS +
               // Glosas
               12 + SECTION_TITLE_GAP + 22 + BETWEEN_SECTIONS +
               // Receitas
               12 + SECTION_TITLE_GAP + 22 +
               (comment ? BETWEEN_ROWS + 14 + commentH : 0) + 16;

    let cardH = Math.max(MIN_CARD_H, estH);

    // quebra de página se necessário
    if (y + cardH > pageH - 60) {
      y = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl }) + 16;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Respostas detalhadas (cartões)", marginX, y - 12);
    }

    // Card
    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#ffffff");
    doc.roundedRect(x, y, colW, cardH, 12, 12, "FD");

    // Cabeçalho
    const code = `R-${String(idx + 1).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(12);
    doc.text(`Resposta ${code}`, x + 12, y + 20);

    const consent = !!(a.consent_contact || a.consent);
    let cursorY = y + 20 + TITLE_TO_ID;
    if (consent) {
      const idLine = [safeText(a.doctor_name), safeText(a.crm), safeText(a.contact)]
        .filter((t) => t && t !== "Não informado").join(" • ");
      if (idLine) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(9.8);
        doc.text(idLine, x + 12, cursorY, { maxWidth: colW - 24 });
        cursorY += 14;
      }
    }

    // --------- Seção: No-show ---------
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(11);
    doc.text("No-show", x + 12, cursorY + 12);
    let rowY = cursorY + 12 + SECTION_TITLE_GAP;
    let px = x + 12;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_relevance)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_has_system)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_noshow_financial_impact));
    cursorY = rowY + 22 + BETWEEN_SECTIONS;

    // --------- Seção: Glosas ---------
    doc.text("Glosas", x + 12, cursorY);
    rowY = cursorY + SECTION_TITLE_GAP;
    px = x + 12;
    px += drawPill(doc, px, rowY, safeText(a.q_glosa_is_problem)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_glosa_interest)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_glosa_who_suffers));
    cursorY = rowY + 22 + BETWEEN_SECTIONS;

    // --------- Seção: Receitas digitais ---------
    doc.text("Receitas digitais", x + 12, cursorY);
    rowY = cursorY + SECTION_TITLE_GAP;
    px = x + 12;
    px += drawPill(doc, px, rowY, safeText(a.q_rx_rework)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_rx_elderly_difficulty)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_rx_tool_value));
    cursorY = rowY + 22;

    // Comentário (opcional)
    if (commentLines.length) {
      cursorY += BETWEEN_ROWS;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(11);
      doc.text("Comentário (resumo)", x + 12, cursorY + 12);
      cursorY += 16;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(10.5);
      doc.text(commentLines, x + 12, cursorY);
      cursorY += commentH;
    }

    // Ajuste real de altura se estourou
    const usedH = cursorY + 16 - y;
    if (usedH > cardH) {
      cardH = usedH;
      // redesenha borda do card com altura nova
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(x, y, colW, cardH, 12, 12);
    }

    // Próxima linha quando completar a linha de colunas
    if (col === COLS - 1) y += cardH + 14;
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

      /* ========= PÁGINA 1 ========= */
      let startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      drawFooter(doc, pageW, pageH, marginX);

      // --- Banner: Sinal de Mercado + Próximos Passos ---
      const sig = marketSignals(kpi);
      const bullets = sig.themes.map((t) => {
        const name = t.theme === "no-show" ? "No-show" : t.theme === "glosas" ? "Glosas" : "Receitas";
        // texto resumido
        return `${name}: ${Math.round(t.pct)}% — ${t.label}`;
      });

      const CARD_W = pageW - marginX * 2;
      const bannerTop = startY + 14;

      const padX = P1_CARD_PAD_X;
      const bannerPadTop = P1_CARD_PAD_Y + 12;
      const bannerPadBottom = P1_CARD_PAD_Y;
      const titleH = 16;
      const subtitleGap = 12;
      const dividerGap = 12;

      const bulletsH = bullets.length * P1_LINE + 6;

      const bannerH =
        bannerPadTop + titleH + subtitleGap + 1 + 10 + bulletsH + bannerPadBottom;

      // card
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, bannerTop, CARD_W, bannerH, 12, 12, "FD");

      // faixa do veredito
      doc.setFillColor(sig.overall.color);
      doc.roundedRect(marginX, bannerTop, CARD_W, 8, 12, 12, "F");

      // título + badge
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(13);
      const titleY = bannerTop + bannerPadTop;
      doc.text("Sinal de Mercado + Próximos Passos", marginX + padX, titleY);

      const verdict = `Veredito geral: ${sig.overall.label}`;
      const badgeX = marginX + CARD_W - padX - (doc.getTextWidth(verdict) + 16);
      const badgeY = titleY - 13; // centraliza com a linha do título
      drawBadge(doc, verdict, badgeX, badgeY, sig.overall.color);

      // lista simples
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      let yThemes = titleY + titleH + subtitleGap;
      bullets.forEach((line) => {
        doc.text(line, marginX + padX, yThemes);
        yThemes += P1_LINE;
      });

      /* ========= PÁGINA 2 ========= */
      renderDetailedAsCards(doc, answers, pageW, pageH, marginX, title, logoDataUrl);

      // (Opcional) Tabelas por tema—se quiser reativar, descomente a linha abaixo
      // renderDetailedAsTables(doc, answers, pageW, pageH, marginX, title, logoDataUrl);

      doc.save("relatorio_pesquisa.pdf");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [kpi, answers]);

  return (
    <button
      onClick={onExport}
      disabled={loading}
      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? "Gerando..." : "Exportar PDF"}
    </button>
  );
}
