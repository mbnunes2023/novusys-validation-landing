"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import type React from "react"; // <- para os tipos de RefObject
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

// <-- ADIÇÃO: chartRefs fica opcional e é ignorado no código
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

/* ===================== Paleta / branding ===================== */

const BRAND_BLUE = "#1976d2";
const BRAND_GRAD_LEFT = "#1976d2";
const BRAND_GRAD_RIGHT = "#2575fc";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";

/* ===================== Utilitários ===================== */

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

/** devolve a altura útil entre topo do conteúdo e rodapé */
function usableHeight(startY: number, pageH: number, bottomPadding = 40) {
  return Math.max(0, pageH - bottomPadding - startY);
}

/** centraliza verticalmente um bloco de altura `blockH` dentro do espaço útil */
function centeredStartY(startY: number, pageH: number, blockH: number) {
  const avail = usableHeight(startY, pageH);
  const offset = Math.max(0, (avail - blockH) / 2);
  return startY + offset;
}

/* ===================== Cabeçalho/Rodapé ===================== */

function drawHeader(doc: jsPDF, pageW: number, marginX: number, title: string) {
  // Faixa superior
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  // Card do header
  const headerH = 70;
  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(marginX, 14, pageW - marginX * 2, headerH, 10, 10, "FD");

  // “Logo” tipográfico
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND_BLUE);
  doc.setFontSize(22);
  doc.text("NovuSys", marginX + 18, 14 + 26);

  // Título + data
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(title, marginX + 18, 14 + 26 + 24);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, marginX + 18, 14 + 26 + 24 + 16);

  return 14 + headerH + 12; // y de início do conteúdo
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, marginX: number) {
  const year = new Date().getFullYear();
  const left = `© ${year} NovuSys — Relatório gerado automaticamente`;
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
  opts: { title: string; marginX: number; pageW: number; pageH: number }
) {
  doc.addPage();
  const startY = drawHeader(doc, opts.pageW, opts.marginX, opts.title);
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
  value: string
) {
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#ffffff");
  doc.roundedRect(x, y, w, h, 10, 10, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(title, x + 14, y + 22);

  doc.setTextColor(BRAND_BLUE);
  doc.setFontSize(30);
  doc.text(value, x + 14, y + 56);
}

/* ===================== Micro-charts de barras ===================== */

type DistItem = { label: string; count: number; pct: string };

const ROW_H = 20;
const ROW_GAP = 6;

/** mede a altura de um bloco de barras dado o nº de linhas */
function measureBarBlock(lines: number) {
  return 8 + lines * (ROW_H + ROW_GAP); // título(8) + linhas
}

function drawBarBlock(
  doc: jsPDF,
  title: string,
  items: DistItem[],
  x: number,
  y: number,
  width: number
) {
  // título
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(13);
  doc.text(title, x, y);
  y += 8;

  const labelW = width * 0.35;
  const barW = width * 0.65;
  const maxPct = Math.max(...items.map((i) => parseInt(i.pct) || 0), 1);

  items.forEach((it, idx) => {
    const rowY = y + idx * (ROW_H + ROW_GAP);

    // label
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK_SOFT);
    doc.setFontSize(11);
    const label = `${it.label} — ${it.count} (${it.pct})`;
    doc.text(label, x, rowY + 13);

    // trilho
    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#fff");
    doc.roundedRect(x + labelW, rowY, barW, ROW_H, 6, 6, "FD");

    // barra
    const pct = parseInt(it.pct) || 0;
    const w = (pct / maxPct) * (barW - 10);
    doc.setFillColor(BRAND_BLUE);
    doc.roundedRect(x + labelW + 2, rowY + 2, Math.max(w, 2), ROW_H - 4, 5, 5, "F");
  });

  return y + items.length * (ROW_H + ROW_GAP);
}

/* ===================== Cálculos de distribuição ===================== */

function dist(
  answers: Answer[],
  field: keyof Answer,
  order: string[]
): DistItem[] {
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

/* ===================== Botão ===================== */

export default function ExportPDFButton({
  kpi,
  summaryRows,
  answers,
  chartRefs, // <- mantido apenas para compatibilidade; não é usado
}: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      const options: jsPDFOptions = {
        unit: "pt",
        format: "a4",
        orientation: "landscape",
      };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const title = "Relatório da Pesquisa — Clínicas e Consultórios";

      /* ========= PÁG. 1 — KPIs (centralizados) ========= */
      let startY = drawHeader(doc, pageW, marginX, title);
      drawFooter(doc, pageW, pageH, marginX);

      const gap = 16;
      const cardW = (pageW - marginX * 2 - gap * 3) / 4;
      const cardH = 78;

      const titleH = 14;
      const blockH = titleH + cardH;
      let y = centeredStartY(startY, pageH, blockH);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, y + 4);
      y += titleH;

      drawKpiCard(doc, marginX + 0 * (cardW + gap), y, cardW, cardH, "Total de respostas", `${kpi.total}`);
      drawKpiCard(
        doc,
        marginX + 1 * (cardW + gap),
        y,
        cardW,
        cardH,
        "% no-show relevante",
        `${kpi.noshowYesPct.toFixed(0)}%`
      );
      drawKpiCard(
        doc,
        marginX + 2 * (cardW + gap),
        y,
        cardW,
        cardH,
        "% glosas recorrentes",
        `${kpi.glosaRecorrentePct.toFixed(0)}%`
      );
      drawKpiCard(
        doc,
        marginX + 3 * (cardW + gap),
        y,
        cardW,
        cardH,
        "% receitas geram retrabalho",
        `${kpi.rxReworkPct.toFixed(0)}%`
      );

      /* ========= PÁG. 2 — No-show ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH });

      const noShowRelev = dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]);
      const noShowSys = dist(answers, "q_noshow_has_system", ["Sim", "Não"]);
      const noShowImpact = dist(answers, "q_noshow_financial_impact", [
        "Baixo impacto",
        "Médio impacto",
        "Alto impacto",
      ]);

      const leftH =
        measureBarBlock(noShowRelev.length) + 18 + measureBarBlock(noShowSys.length);
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

      /* ========= PÁG. 3 — Glosas ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH });

      const glosaRec = dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]);
      const glosaInterest = dist(answers, "q_glosa_interest", ["Sim", "Não", "Talvez"]);
      const glosaWho = dist(answers, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]);

      const gLeftH =
        measureBarBlock(glosaRec.length) + 18 + measureBarBlock(glosaInterest.length);
      const gRightH = measureBarBlock(glosaWho.length);
      const gGridH = Math.max(gLeftH, gRightH);

      y = centeredStartY(startY, pageH, gGridH);

      let col1Y_glosa = y;
      col1Y_glosa = drawBarBlock(doc, "Glosas recorrentes", glosaRec, col1X, col1Y_glosa, colW);
      col1Y_glosa += 18;
      col1Y_glosa = drawBarBlock(
        doc,
        "Interesse em checagem antes do envio",
        glosaInterest,
        col1X,
        col1Y_glosa,
        colW
      );

      let col2Y_glosa = y;
      col2Y_glosa = drawBarBlock(doc, "Quem sofre mais", glosaWho, col2X, col2Y_glosa, colW);

      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 4 — Receitas Digitais ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH });

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

      /* ========= PÁG. 5 — Resumo ========= */
      // Espaço extra entre o cabeçalho e o título "Resumo..." (px)
      const HEADER_GAP = 28; // aumente/diminua se quiser mais/menos espaço
      // 14 (offset) + 70 (altura do header card) + 12 (respiro) + HEADER_GAP
      const tableTopMargin = 14 + 70 + 12 + HEADER_GAP;

      // --- ADIÇÃO: colunas dos detalhes, derivadas das chaves de `answers`
      const detailCols =
        answers && answers.length
          ? Array.from(new Set(answers.flatMap((a) => Object.keys(a ?? {})))).map(
              (k) => ({ header: k, dataKey: k })
            )
          : [];

      doc.addPage();
      autoTable(doc as any, {
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
          const sY = drawHeader(doc, pageW, marginX, title);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(14);
          // empurra o título para baixo usando o mesmo HEADER_GAP
          doc.text("Resumo consolidado por pergunta", marginX, sY + HEADER_GAP - 10);
          drawFooter(doc, pageW, pageH, marginX);
        },
      });

      /* ========= PÁGs. 6+ — Detalhes ========= */
      if (detailCols.length) {
        doc.addPage();
        autoTable(doc as any, {
          styles: {
            font: "helvetica",
            fontSize: 9,
            textColor: INK,
            cellPadding: 5,
            lineColor: CARD_EDGE,
          },
          headStyles: {
            fillColor: [37, 117, 252],
            textColor: "#ffffff",
            fontStyle: "bold",
          },
          body: answers,
          columns: detailCols,
          margin: { left: marginX, right: marginX, top: tableTopMargin, bottom: 26 },
          theme: "grid",
          didDrawPage: () => {
            const sY = drawHeader(doc, pageW, marginX, title);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text(
              "Respostas detalhadas (sem identificação sensível)",
              marginX,
              sY + HEADER_GAP - 10
            );
            drawFooter(doc, pageW, pageH, marginX);
          },
        });
      }
    } finally {
      setLoading(false);
    }
  }, [answers, kpi, summaryRows]);

  return null;
}
