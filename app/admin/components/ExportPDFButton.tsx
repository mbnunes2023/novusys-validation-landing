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
  // mantido por compatibilidade, mas não utilizado
  summaryRows?: Array<Record<string, number | string>>;
  answers: Answer[];
  chartRefs?: {
    noshowRef: React.RefObject<HTMLDivElement>;
    glosaRef: React.RefObject<HTMLDivElement>;
    rxRef: React.RefObject<HTMLDivElement>;
  };
};

/* ===================== Branding ===================== */

const BRAND = "#1976d2";
const BRAND_2 = "#2575fc";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";

/* ===================== Utils ===================== */

// jsPDF usa WinAnsi por padrão — sanitizamos para evitar �
function sanitize(input: any): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  return s
    // aspas “ ”
    .replace(/\u201C|\u201D/g, '"')
    // apóstrofo ’
    .replace(/\u2019/g, "'")
    // travessões – —
    .replace(/\u2013|\u2014/g, "-")
    // bullet •
    .replace(/\u2022/g, "*")
    // NBSP etc.
    .replace(/\u00A0/g, " ");
}

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function usableHeight(startY: number, pageH: number, bottomPadding = 40) {
  return Math.max(0, pageH - bottomPadding - startY);
}

const TOP_GAP = 24;

/* ===================== Cabeçalho/Rodapé ===================== */

function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  // faixa superior
  doc.setFillColor(BRAND);
  doc.rect(0, 0, pageW, 6, "F");

  // card
  const headerH = 72;
  const cardX = marginX;
  const cardY = 14;
  const cardW = pageW - marginX * 2;

  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardY, cardW, headerH, 10, 10, "FD");

  const centerY = cardY + headerH / 2;

  // texto (esquerda)
  const leftPad = 18;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  const titleH = 18;
  const dateH = 10;
  const lineGap = 6;
  const textBlockH = titleH + lineGap + dateH;
  const titleY = centerY - textBlockH / 2 + titleH * 0.75;

  doc.text(sanitize(title), cardX + leftPad, titleY);

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
    } catch {
      /* ignore */
    }
  }

  return cardY + headerH + 12 + TOP_GAP;
}

function drawFooter(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  marginX: number
) {
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

/* ===================== KPI Cards ===================== */

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  accent = BRAND
) {
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#ffffff");
  doc.roundedRect(x, y, w, h, 12, 12, "FD");
  doc.setFillColor(accent);
  doc.roundedRect(x, y, w, 6, 12, 12, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(sanitize(title), x + 16, y + 26);

  doc.setTextColor(accent);
  doc.setFontSize(30);
  doc.text(sanitize(value), x + 16, y + 58);
}

/* ===================== Distribuições (compacto c/ eixo) ===================== */

type DistItem = { label: string; count: number; pct: string };
const CROW_H = 14;
const CROW_GAP = 4;

function measureBarBlockCompact(lines: number) {
  // Título + linhas + área dos ticks
  return 7 + lines * (CROW_H + CROW_GAP) + 12;
}

function drawTicks(
  doc: jsPDF,
  x: number,
  yBottom: number,
  width: number,
  color = INK_SOFT
) {
  // 0 / 50 / 100
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(color);
  const marks = [
    { t: "0%", x: x },
    { t: "50%", x: x + width * 0.5 - 8 },
    { t: "100%", x: x + width - 20 },
  ];
  marks.forEach((m) => doc.text(m.t, m.x, yBottom));
}

function drawBarBlockCompact(
  doc: jsPDF,
  title: string,
  items: DistItem[],
  x: number,
  y: number,
  width: number
) {
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(12);
  doc.text(sanitize(title), x, y);
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
    const label = `${sanitize(it.label)} — ${it.count} (${it.pct})`;
    doc.text(label, x, rowY + 10, { maxWidth: labelW - 4 });

    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#fff");
    doc.roundedRect(x + labelW, rowY, barW, CROW_H, 5, 5, "FD");

    const pct = parseInt(it.pct) || 0;
    const w = (pct / maxPct) * (barW - 8);
    doc.setFillColor(BRAND);
    doc.roundedRect(
      x + labelW + 2,
      rowY + 2,
      Math.max(w, 2),
      CROW_H - 4,
      4,
      4,
      "F"
    );
  });

  // ticks na base do bloco
  const lastRowBottom =
    y + (nonEmpty.length > 0 ? (nonEmpty.length - 1) * (CROW_H + CROW_GAP) : 0) + CROW_H + 6;
  drawTicks(doc, x + labelW, lastRowBottom, barW);
  return lastRowBottom;
}

/* ===================== Agregadores ===================== */

function dist(
  answers: Answer[],
  field: keyof Answer,
  order: string[]
): { items: DistItem[]; answered: number; unknownCount: number } {
  const counts: Record<string, number> = {};
  order.forEach((k) => (counts[k] = 0));
  let unknown = 0;

  answers.forEach((a) => {
    const v = sanitize(a[field] as string);
    if (!v || !order.includes(v)) unknown += 1;
    else counts[v] += 1;
  });

  const answered = Object.values(counts).reduce((s, n) => s + n, 0);
  const toPct = (n: number) =>
    answered ? `${Math.round((n / answered) * 100)}%` : "0%";

  const items = order.map((k) => ({
    label: k,
    count: counts[k],
    pct: toPct(counts[k]),
  }));
  return { items, answered, unknownCount: unknown };
}

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

/* ===================== Detalhadas (cards) ===================== */

function drawPill(doc: jsPDF, x: number, y: number, text: string) {
  const t = sanitize(text) || "Não informado";
  const padX = 6;
  const h = 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const w = doc.getTextWidth(t) + padX * 2;
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#f6f9ff");
  doc.roundedRect(x, y, w, h, 9, 9, "FD");
  doc.setTextColor(BRAND);
  doc.text(t, x + padX, y + 12);
  return { width: w, height: h };
}

function safeText(v: any): string {
  const s = sanitize(v);
  return s || "Não informado";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ===================== Componente ===================== */

export default function ExportPDFButton({ kpi, answers }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      // carrega logo do /public
      const logoDataUrl = await (async (path: string) => {
        try {
          const res = await fetch(path);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      })("/logo.png");

      const options: jsPDFOptions = {
        unit: "pt",
        format: "a4",
        orientation: "landscape",
      };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const title = "Relatorio da Pesquisa - Clinicas e Consultorios"; // ASCII only

      /* ========= PÁGINA 1: Sumário + Resumo + Plano ========= */
      let startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      drawFooter(doc, pageW, pageH, marginX);

      const CARD_W = pageW - marginX * 2;
      const PAD_X = 18;
      const TITLE_GAP = 26;
      const LINE = 18;

      // Sumário
      const tocItems = [
        "Visao Geral (KPIs + graficos por tema)",
        "Respostas detalhadas",
        "Comentarios",
        "Identificacao (opcional)",
      ];
      const summaryTitleH = 16;
      const summaryListH = tocItems.length * LINE;
      const summaryPadBottom = 20;
      const summaryCardH =
        TITLE_GAP + summaryTitleH + 8 + summaryListH + summaryPadBottom;

      // Card Sumário
      let y = startY;
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, y, CARD_W, summaryCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(16);
      doc.text("Sumario", marginX + PAD_X, y + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);

      let listY = y + TITLE_GAP + summaryTitleH + 8;
      tocItems.forEach((label, i) => {
        doc.text(`${i + 1}. ${label}`, marginX + PAD_X, listY, {
          maxWidth: CARD_W - PAD_X * 2,
        });
        listY += LINE;
      });

      // Card Resumo Executivo + Plano de Ação (lado a lado)
      const gapBetweenCards = 20;
      const reTop = y + summaryCardH + gapBetweenCards;
      const cardH = 168;
      const colW = (CARD_W - gapBetweenCards) / 2;

      // Resumo
      doc.roundedRect(marginX, reTop, colW, cardH, 12, 12, "FD");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text(
        "Resumo Executivo - Principais insights",
        marginX + PAD_X,
        reTop + TITLE_GAP
      );

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);

      let by = reTop + TITLE_GAP + 18;
      const resumeLines = [
        `Amostra: ${kpi.total} respostas.`,
        `Sinais de impacto: No-show ${kpi.noshowYesPct.toFixed(
          0
        )}%, Glosas ${kpi.glosaRecorrentePct.toFixed(
          0
        )}%, Retrabalho em receitas ${kpi.rxReworkPct.toFixed(0)}%.`,
        `Recomendacao: piloto focado em no-show e glosas, com fluxo assistido para receitas digitais.`,
      ];
      const maxW = colW - PAD_X * 2;
      resumeLines.forEach((line) => {
        const lines = doc.splitTextToSize(sanitize(line), maxW);
        lines.forEach((ln) => {
          doc.circle(marginX + PAD_X - 4, by - 3, 2, "F");
          doc.text(ln, marginX + PAD_X + 6, by);
          by += LINE;
        });
      });

      // Plano de ação
      const paX = marginX + colW + gapBetweenCards;
      doc.roundedRect(paX, reTop, colW, cardH, 12, 12, "FD");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Plano de Acao (30-45 dias)", paX + PAD_X, reTop + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);
      let py = reTop + TITLE_GAP + 18;

      const planBullets = [
        "No-show: lembretes automáticos e confirmacao por WhatsApp/SMS; overbooking leve.",
        "Glosas: checagem TISS/TUSS antes do envio + checklist minimo na recepcao.",
        "Receitas digitais: fluxo assistido para emissao/validacao e envio ao paciente/farmacia.",
        "Metas 30-45 dias: reduzir no-show 20-30%, glosas 30-50%, retrabalho 40%.",
      ];
      planBullets.forEach((b) => {
        const lines = doc.splitTextToSize(sanitize(b), maxW);
        lines.forEach((ln) => {
          doc.circle(paX + PAD_X - 4, py - 3, 2, "F");
          doc.text(ln, paX + PAD_X + 6, py);
          py += LINE;
        });
      });

      /* ========= PÁGINA 2: KPIs + grade 3x3 ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const gap = 16;
      const kpiCardW =
        (pageW - marginX * 2 - gap * 3) / 4;
      const kpiCardH = 82;

      let kpiY = startY;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visao Geral", marginX, kpiY + 2);
      kpiY += 14;

      drawKpiCard(
        doc,
        marginX + 0 * (kpiCardW + gap),
        kpiY,
        kpiCardW,
        kpiCardH,
        "Total de respostas",
        `${kpi.total}`,
        BRAND_2
      );
      drawKpiCard(
        doc,
        marginX + 1 * (kpiCardW + gap),
        kpiY,
        kpiCardW,
        kpiCardH,
        "% no-show relevante",
        `${kpi.noshowYesPct.toFixed(0)}%`
      );
      drawKpiCard(
        doc,
        marginX + 2 * (kpiCardW + gap),
        kpiY,
        kpiCardW,
        kpiCardH,
        "% glosas recorrentes",
        `${kpi.glosaRecorrentePct.toFixed(0)}%`
      );
      drawKpiCard(
        doc,
        marginX + 3 * (kpiCardW + gap),
        kpiY,
        kpiCardW,
        kpiCardH,
        "% receitas geram retrabalho",
        `${kpi.rxReworkPct.toFixed(0)}%`
      );

      let gridTop = kpiY + kpiCardH + 24;

      // distros
      const nsRelev = dist(answers, "q_noshow_relevance", [
        "Sim",
        "Nao",
        "Parcialmente",
      ]).items.map((i) => ({ ...i, label: i.label.replace("Não", "Nao") }));
      const nsSys = dist(answers, "q_noshow_has_system", ["Sim", "Nao"]).items;
      const nsImpact = dist(
        answers,
        "q_noshow_financial_impact",
        ["Baixo impacto", "Medio impacto", "Alto impacto"].map((s) =>
          s.replace("Médio", "Medio")
        )
      ).items;

      const gRec = dist(answers, "q_glosa_is_problem", [
        "Sim",
        "Nao",
        "As vezes",
      ]).items;
      const gInt = dist(answers, "q_glosa_interest", [
        "Sim",
        "Nao",
        "Talvez",
      ]).items;
      const gWho = dist(answers, "q_glosa_who_suffers", [
        "Medico",
        "Administrativo",
        "Ambos",
      ]).items;

      const rxRw = dist(answers, "q_rx_rework", [
        "Sim",
        "Nao",
        "Raramente",
      ]).items;
      const rxDif = dist(answers, "q_rx_elderly_difficulty", [
        "Sim",
        "Nao",
        "Em parte",
      ]).items;
      const rxVal = dist(answers, "q_rx_tool_value", [
        "Sim",
        "Nao",
        "Talvez",
      ]).items;

      const blocks: Array<{ title: string; items: DistItem[] }> = [
        { title: "No-show - Relevancia", items: nsRelev },
        { title: "No-show - Sistema que resolve", items: nsSys },
        { title: "No-show - Impacto financeiro mensal", items: nsImpact },
        { title: "Glosas - Recorrencia", items: gRec },
        { title: "Glosas - Checagem antes do envio", items: gInt },
        { title: "Glosas - Quem sofre mais", items: gWho },
        { title: "Receitas - Geram retrabalho", items: rxRw },
        { title: "Receitas - Dificuldade dos pacientes", items: rxDif },
        { title: "Receitas - Valor em ferramenta", items: rxVal },
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
          doc.text("Visao Geral - Distribuicoes", marginX, startY + 2);
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

      /* ========= RESPOSTAS DETALHADAS ========= */
      if (answers.length <= 20) {
        // cards 2 colunas
        let yCards = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Respostas detalhadas (cartoes)", marginX, yCards + 2);
        yCards += 14;

        const gapC = 18;
        const colW = (pageW - marginX * 2 - gapC) / 2;
        let y = yCards;

        answers.forEach((a, idx) => {
          const col = idx % 2;
          const x = marginX + col * (colW + gapC);

          // comentario resumido
          const comment = sanitize(a.comments);
          const commentLines = comment
            ? doc.splitTextToSize(comment, colW - 24)
            : [];
          const commentH = commentLines.length ? commentLines.length * 16 + 6 : 0;

          let cardH =
            24 + 8 + 3 * 28 + (comment ? 18 : 0) + commentH + 18;

          if (y + cardH > pageH - 60) {
            y = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl }) + 14;
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Respostas detalhadas (cartoes)", marginX, y - 12);
          }

          doc.setDrawColor(CARD_EDGE);
          doc.setFillColor("#ffffff");
          doc.roundedRect(x, y, colW, cardH, 12, 12, "FD");

          const code = `R-${String(idx + 1).padStart(2, "0")}`;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(12);
          doc.text(`Resposta ${code}`, x + 14, y + 22);

          // identificação (se consentida)
          const consent = !!(a.consent_contact || a.consent);
          if (consent) {
            const idLine = [a.doctor_name, a.crm, a.contact]
              .map(safeText)
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

          // No-show
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(11);
          doc.text("No-show", x + 14, rowY);
          rowY += 4;
          let px = x + 14;
          px += drawPill(doc, px, rowY, a.q_noshow_relevance).width + 8;
          px += drawPill(doc, px, rowY, a.q_noshow_has_system).width + 8;
          drawPill(doc, px, rowY, a.q_noshow_financial_impact);
          rowY += 28;

          // Glosas
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(11);
          doc.text("Glosas", x + 14, rowY);
          rowY += 4;
          px = x + 14;
          px += drawPill(doc, px, rowY, a.q_glosa_is_problem).width + 8;
          px += drawPill(doc, px, rowY, a.q_glosa_interest).width + 8;
          drawPill(doc, px, rowY, a.q_glosa_who_suffers);
          rowY += 28;

          // Receitas
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(11);
          doc.text("Receitas digitais", x + 14, rowY);
          rowY += 4;
          px = x + 14;
          px += drawPill(doc, px, rowY, a.q_rx_rework).width + 8;
          px += drawPill(doc, px, rowY, a.q_rx_elderly_difficulty).width + 8;
          drawPill(doc, px, rowY, a.q_rx_tool_value);
          rowY += 28;

          if (commentLines.length) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(11);
            doc.text("Comentario (resumo)", x + 14, rowY);
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
      } else {
        // fallback: tabelas por tema
        const makeRows = (
          keys: [keyof Answer, keyof Answer, keyof Answer]
        ) =>
          answers.map((a, i) => ({
            resp: `R-${String(i + 1).padStart(2, "0")}`,
            a: safeText(a[keys[0]]),
            b: safeText(a[keys[1]]),
            c: safeText(a[keys[2]]),
          }));

        const sections: Array<{
          title: string;
          rows: Array<Record<string, string>>;
          heads: [string, string, string];
        }> = [
          {
            title: "No-show (linha = respondente)",
            rows: makeRows([
              "q_noshow_relevance",
              "q_noshow_has_system",
              "q_noshow_financial_impact",
            ]),
            heads: ["Relevancia", "Sistema", "Impacto"],
          },
          {
            title: "Glosas (linha = respondente)",
            rows: makeRows([
              "q_glosa_is_problem",
              "q_glosa_interest",
              "q_glosa_who_suffers",
            ]),
            heads: ["Recorrencia", "Checagem", "Quem sofre"],
          },
          {
            title: "Receitas digitais (linha = respondente)",
            rows: makeRows([
              "q_rx_rework",
              "q_rx_elderly_difficulty",
              "q_rx_tool_value",
            ]),
            heads: ["Retrabalho", "Dificuldade", "Valor ferramenta"],
          },
        ];

        const headerGap = 28;
        const topY = 14 + 72 + 12 + headerGap + TOP_GAP;

        sections.forEach((sec, idx) => {
          autoTable(doc as any, {
            startY:
              idx === 0 ? newPage(doc, { title, marginX, pageW, pageH, logoDataUrl }) - 6 : (doc as any).lastAutoTable.finalY + 26,
            styles: {
              font: "helvetica",
              fontSize: 10,
              textColor: INK,
              cellPadding: 6,
              lineColor: CARD_EDGE,
            },
            headStyles: {
              fillColor: [37, 117, 252],
              textColor: "#ffffff",
              fontStyle: "bold",
            },
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
          });
        });
      }

      /* ========= COMENTÁRIOS ========= */
      const comments = answers
        .map((a, i) => ({
          code: `R-${String(i + 1).padStart(2, "0")}`,
          text: sanitize(a.comments),
        }))
        .filter((c) => c.text.length > 0);

      if (comments.length) {
        const sY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text(
          "Comentarios (texto livre) - referencia por codigo da resposta",
          marginX,
          sY + 2
        );

        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK);
        doc.setFontSize(12);

        let yC = sY + 24;
        const lineH = 18;
        const mw = pageW - marginX * 2 - 20;

        comments.forEach((c) => {
          const bullet = `${c.code} - ${c.text}`;
          const lines = doc.splitTextToSize(bullet, mw);
          if (yC + lines.length * lineH > pageH - 60) {
            const sY2 = newPage(doc, {
              title,
              marginX,
              pageW,
              pageH,
              logoDataUrl,
            });
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Comentarios (continuacao)", marginX, sY2 + 2);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK);
            doc.setFontSize(12);
            yC = sY2 + 24;
          }
          doc.text(lines, marginX + 10, yC);
          yC += lines.length * lineH + 8;
        });
      }

      /* ========= IDENTIFICAÇÃO (somente consentidas) ========= */
      const idRows = answers
        .filter((a) => a.consent_contact === true || a.consent === true)
        .map((a, i) => ({
          resp: `R-${String(i + 1).padStart(2, "0")}`,
          nome: sanitize(a.doctor_name) || "—",
          crm: sanitize(a.crm) || "—",
          contato: sanitize(a.contact) || "—",
        }))
        .filter((r) => r.nome !== "—" || r.crm !== "—" || r.contato !== "—");

      if (idRows.length) {
        const sY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
        autoTable(doc as any, {
          startY: sY + 12,
          styles: {
            font: "helvetica",
            fontSize: 10,
            textColor: INK,
            cellPadding: 6,
            lineColor: CARD_EDGE,
          },
          headStyles: {
            fillColor: [25, 118, 210],
            textColor: "#ffffff",
            fontStyle: "bold",
          },
          body: idRows,
          columns: [
            { header: "Resp.", dataKey: "resp" },
            { header: "Nome", dataKey: "nome" },
            { header: "CRM", dataKey: "crm" },
            { header: "Contato (e-mail / WhatsApp)", dataKey: "contato" },
          ],
          tableWidth: pageW - marginX * 2,
          margin: { left: marginX, right: marginX, top: sY + 12, bottom: 26 },
          theme: "grid",
          rowPageBreak: "auto",
          didDrawPage: () => {
            const headY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text(
              "Identificacao (somente com autorizacao de contato)",
              marginX,
              headY - TOP_GAP + 6
            );
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK_SOFT);
            doc.setFontSize(11);
            doc.text(
              "Os dados abaixo aparecem apenas quando o respondente marcou o consentimento.",
              marginX,
              headY - TOP_GAP + 24
            );
            drawFooter(doc, pageW, pageH, marginX);
          },
        });
      }

      // salvar
      const fileName = `Relatorio_Pesquisa_${new Intl.DateTimeFormat("pt-BR").format(
        new Date()
      )}.pdf`;
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
      {loading ? "Gerando PDF..." : "Exportar PDF (apresentacao)"}
    </button>
  );
}
