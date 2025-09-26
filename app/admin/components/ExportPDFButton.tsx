"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
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

  // “Logo” tipográfico (estável, sem imagem externa)
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

function drawBarBlock(
  doc: jsPDF,
  title: string,
  items: DistItem[],
  x: number,
  y: number,
  width: number
) {
  // título da seção
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(13);
  doc.text(title, x, y);
  y += 8;

  // container
  const rowH = 20;
  const labelW = width * 0.35;
  const barW = width * 0.65;
  const maxPct = Math.max(...items.map((i) => parseInt(i.pct) || 0), 1);

  items.forEach((it, idx) => {
    const rowY = y + idx * (rowH + 6);

    // label
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK_SOFT);
    doc.setFontSize(11);
    const label = `${it.label} — ${it.count} (${it.pct})`;
    doc.text(label, x, rowY + 13);

    // barra
    const pct = parseInt(it.pct) || 0;
    const w = (pct / maxPct) * (barW - 10);

    // trilho
    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#fff");
    doc.roundedRect(x + labelW, rowY, barW, rowH, 6, 6, "FD");

    // barra preenchida
    doc.setFillColor(BRAND_BLUE);
    doc.roundedRect(x + labelW + 2, rowY + 2, Math.max(w, 2), rowH - 4, 5, 5, "F");
  });

  return y + items.length * (rowH + 6);
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

export default function ExportPDFButton({ kpi, summaryRows, answers }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      // PDF paisagem, sem conversão de DOM (100% estável)
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

      /* ========= PÁG. 1 — KPIs ========= */
      let y = drawHeader(doc, pageW, marginX, title);
      drawFooter(doc, pageW, pageH, marginX);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, y + 4);
      y += 14;

      const gap = 16;
      const cardW = (pageW - marginX * 2 - gap * 3) / 4;
      const cardH = 78;

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
      y = newPage(doc, { title, marginX, pageW, pageH });

      const colW = (pageW - marginX * 2 - 24) / 2;
      const startX = marginX;
      let colY = y;

      colY = drawBarBlock(
        doc,
        "Relevância",
        dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]),
        startX,
        colY,
        colW
      );
      colY += 18;
      colY = drawBarBlock(
        doc,
        "Possui sistema que resolve",
        dist(answers, "q_noshow_has_system", ["Sim", "Não"]),
        startX,
        colY,
        colW
      );

      // segunda coluna
      let col2Y = y;
      const col2X = startX + colW + 24;
      col2Y = drawBarBlock(
        doc,
        "Impacto financeiro mensal",
        dist(answers, "q_noshow_financial_impact", [
          "Baixo impacto",
          "Médio impacto",
          "Alto impacto",
        ]),
        col2X,
        col2Y,
        colW
      );

      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 3 — Glosas ========= */
      y = newPage(doc, { title, marginX, pageW, pageH });

      let g1Y = y;
      g1Y = drawBarBlock(
        doc,
        "Glosas recorrentes",
        dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]),
        startX,
        g1Y,
        colW
      );
      g1Y += 18;
      g1Y = drawBarBlock(
        doc,
        "Interesse em checagem antes do envio",
        dist(answers, "q_glosa_interest", ["Sim", "Não", "Talvez"]),
        startX,
        g1Y,
        colW
      );

      let g2Y = y;
      g2Y = drawBarBlock(
        doc,
        "Quem sofre mais",
        dist(answers, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]),
        col2X,
        g2Y,
        colW
      );

      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 4 — Receitas Digitais ========= */
      y = newPage(doc, { title, marginX, pageW, pageH });

      let r1Y = y;
      r1Y = drawBarBlock(
        doc,
        "Receitas geram retrabalho",
        dist(answers, "q_rx_rework", ["Sim", "Não", "Raramente"]),
        startX,
        r1Y,
        colW
      );
      r1Y += 18;
      r1Y = drawBarBlock(
        doc,
        "Pacientes têm dificuldade",
        dist(answers, "q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]),
        startX,
        r1Y,
        colW
      );

      let r2Y = y;
      r2Y = drawBarBlock(
        doc,
        "Valor em ferramenta de apoio",
        dist(answers, "q_rx_tool_value", ["Sim", "Não", "Talvez"]),
        col2X,
        r2Y,
        colW
      );

      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 5 — Resumo ========= */
      const tableTopMargin = 14 + 70 + 12 + 14; // header + respiro
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
          const startY = drawHeader(doc, pageW, marginX, title);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(14);
          doc.text("Resumo consolidado por pergunta", marginX, startY + 2);
          drawFooter(doc, pageW, pageH, marginX);
        },
      });

      /* ========= PÁGs. 6+ — Detalhes ========= */
      const firstRow = answers[0] || {};
      const detailCols = Object.keys(firstRow).map((k) => ({ header: k, dataKey: k }));
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
            const startY = drawHeader(doc, pageW, marginX, title);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Respostas detalhadas (sem identificação sensível)", marginX, startY + 2);
            drawFooter(doc, pageW, pageH, marginX);
          },
        });
      }

      // Salvar
      const pad = (n: number) => String(n).padStart(2, "0");
      const d = new Date();
      const filename = `Relatorio-Pesquisa-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
        d.getDate()
      )}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [kpi, summaryRows, answers]);

  return (
    <button
      className="btn btn-primary"
      type="button"
      onClick={onExport}
      disabled={loading}
      style={{
        backgroundImage: `linear-gradient(135deg, ${BRAND_GRAD_LEFT}, ${BRAND_GRAD_RIGHT})`,
      }}
    >
      {loading ? "Gerando..." : "Exportar PDF"}
    </button>
  );
}
