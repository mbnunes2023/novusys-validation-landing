"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import jsPDF, { jsPDFOptions } from "jspdf";
import autoTable from "jspdf-autotable";
import * as htmlToImage from "html-to-image";

/* ===================== Tipos esperados no Dashboard ===================== */

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
  chartRefs: {
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
const LOGO_SRC = "/logo.png";

/* ===================== Utilitários ===================== */

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** Carrega imagem mantendo proporção (evita logo achatado) */
function loadImage(src: string): Promise<{ img: HTMLImageElement; ratio: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({
        img,
        ratio: (img.naturalWidth || 1) / (img.naturalHeight || 1),
      });
    img.onerror = reject;
    img.src = src;
  });
}

/** Converte nó (gráfico) para PNG; se falhar, retorna null */
async function nodeToPNG(el?: HTMLElement | null, width = 1400): Promise<string | null> {
  if (!el) return null;
  try {
    return await htmlToImage.toPng(el, {
      cacheBust: true,
      pixelRatio: 2,
      width,
    });
  } catch {
    return null;
  }
}

/* ===================== Desenho de header/rodapé ===================== */

/**
 * Desenha cabeçalho padrão e retorna o Y (baseline) para iniciar o conteúdo
 * + também desenha a faixa superior de acento.
 */
async function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title = "Relatório da Pesquisa — Clínicas e Consultórios"
): Promise<number> {
  // faixa fina
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  // card do cabeçalho
  const headerH = 76;
  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(marginX, 14, pageW - marginX * 2, headerH, 10, 10, "FD");

  // logo
  const { img: logo, ratio } = await loadImage(LOGO_SRC);
  const logoH = 36;
  const logoW = Math.round(logoH * ratio);
  const logoX = marginX + 16;
  const logoY = 14 + (headerH - logoH) / 2;
  doc.addImage(logo, "PNG", logoX, logoY, logoW, logoH);

  // textos
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(title, logoX + logoW + 12, logoY + 20);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, logoX + logoW + 12, logoY + 38);

  return 14 + headerH + 10; // y para começar conteúdo
}

/** Rodapé padrão com número de página */
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

/** Helper para “abrir” uma nova página com header + footer e retornar o y inicial. */
async function newPage(doc: jsPDF, opts: { title?: string; marginX: number; pageW: number; pageH: number }) {
  doc.addPage();
  const startY = await drawHeader(doc, opts.pageW, opts.marginX, opts.title);
  drawFooter(doc, opts.pageW, opts.pageH, opts.marginX);
  return startY;
}

/** Card KPI bonitão */
function drawKpiCard(doc: jsPDF, x: number, y: number, w: number, h: number, title: string, value: string) {
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

/* ===================== Componente (botão) ===================== */

export default function ExportPDFButton({ kpi, summaryRows, answers, chartRefs }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      /* ---------- Documento em modo PAISAGEM (landscape) ---------- */
      const options: jsPDFOptions = { unit: "pt", format: "a4", orientation: "landscape" };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;

      /* ===================== PÁGINA 1 — RESUMO (só KPIs) ===================== */
      let cursorY = await drawHeader(doc, pageW, marginX);
      drawFooter(doc, pageW, pageH, marginX);

      // Título da seção
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, cursorY + 4);
      cursorY += 14;

      // 3 cartões de KPI lado a lado
      const gap = 16;
      const cardW = (pageW - marginX * 2 - gap * 2) / 3;
      const cardH = 78;

      drawKpiCard(doc, marginX, cursorY, cardW, cardH, "Total de respostas", `${kpi.total}`);
      drawKpiCard(
        doc,
        marginX + cardW + gap,
        cursorY,
        cardW,
        cardH,
        "% no-show relevante",
        `${kpi.noshowYesPct.toFixed(0)}%`
      );
      drawKpiCard(
        doc,
        marginX + 2 * (cardW + gap),
        cursorY,
        cardW,
        cardH,
        "% glosas recorrentes",
        `${kpi.glosaRecorrentePct.toFixed(0)}%`
      );
      cursorY += cardH + 22;

      drawKpiCard(
        doc,
        marginX + 2 * (cardW + gap), // reaproveita o espaço do 3º card da primeira linha
        cursorY,
        cardW,
        cardH,
        "% receitas geram retrabalho",
        `${kpi.rxReworkPct.toFixed(0)}%`
      );

      /* ===================== PÁGINA 2 — NO-SHOW ===================== */
      cursorY = await newPage(doc, { title: "Relatório da Pesquisa — Clínicas e Consultórios", marginX, pageW, pageH });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — No-show relevante", marginX, cursorY);
      cursorY += 10;

      const g1 = await nodeToPNG(chartRefs.noshowRef.current, 1600);
      const chartH = pageH - cursorY - 36; // altura que respeita margem e rodapé
      if (g1) {
        doc.addImage(g1, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
      }
      drawFooter(doc, pageW, pageH, marginX);

      /* ===================== PÁGINA 3 — GLOSAS ===================== */
      cursorY = await newPage(doc, { title: "Relatório da Pesquisa — Clínicas e Consultórios", marginX, pageW, pageH });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — Glosas (recorrência / interesse)", marginX, cursorY);
      cursorY += 10;

      const g2 = await nodeToPNG(chartRefs.glosaRef.current, 1600);
      if (g2) {
        doc.addImage(g2, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
      }
      drawFooter(doc, pageW, pageH, marginX);

      /* ===================== PÁGINA 4 — RECEITAS DIGITAIS ===================== */
      cursorY = await newPage(doc, { title: "Relatório da Pesquisa — Clínicas e Consultórios", marginX, pageW, pageH });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — Receitas Digitais (retrabalho / dificuldade / valor)", marginX, cursorY);
      cursorY += 10;

      const g3 = await nodeToPNG(chartRefs.rxRef.current, 1600);
      if (g3) {
        doc.addImage(g3, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
      }
      drawFooter(doc, pageW, pageH, marginX);

      /* ===================== PÁGINA 5 — TABELA RESUMO ===================== */
      // Para tabelas que ocupam muitas páginas, usamos didDrawPage para redesenhar header/footer.
      // A margem top precisa reservar o header.
      const tableTopMargin = 14 + 76 + 10 + 12; // mesmo cálculo do drawHeader + respiro
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
        didDrawPage: (data) => {
          // Cabeçalho + título da seção
          (async () => {
            const startY = await drawHeader(doc, pageW, marginX, "Relatório da Pesquisa — Clínicas e Consultórios");
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Resumo consolidado por pergunta", marginX, startY + 2);
            drawFooter(doc, pageW, pageH, marginX);
          })();
        },
      });

      /* ===================== PÁGINAS 6+ — DETALHES ===================== */
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
            (async () => {
              const startY = await drawHeader(doc, pageW, marginX, "Relatório da Pesquisa — Clínicas e Consultórios");
              doc.setFont("helvetica", "bold");
              doc.setTextColor(INK);
              doc.setFontSize(14);
              doc.text("Respostas detalhadas (sem identificação sensível)", marginX, startY + 2);
              drawFooter(doc, pageW, pageH, marginX);
            })();
          },
        });
      }

      /* ===================== Salvar ===================== */
      const pad = (n: number) => String(n).padStart(2, "0");
      const d = new Date();
      const filename = `Relatorio-Pesquisa-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
        d.getHours()
      )}${pad(d.getMinutes())}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error(e);
      alert("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [kpi, summaryRows, answers, chartRefs]);

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
