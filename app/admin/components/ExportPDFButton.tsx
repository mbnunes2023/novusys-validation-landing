"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import jsPDF, { jsPDFOptions } from "jspdf";
import autoTable from "jspdf-autotable";
import * as htmlToImage from "html-to-image";

/* ===================== Tipos (iguais ao dashboard) ===================== */

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

/** Pré-carrega o logo UMA vez (sincronismo nos headers) */
function loadLogo(src: string): Promise<{ img: HTMLImageElement; ratio: number }> {
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
async function nodeToPNG(el?: HTMLElement | null, width = 1600): Promise<string | null> {
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

/* ===================== Cabeçalho/Rodapé 100% SÍNCRONOS ===================== */

function drawHeaderSync(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logo: { img: HTMLImageElement; ratio: number }
): number {
  // Faixa superior
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  // Card do header
  const headerH = 76;
  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(marginX, 14, pageW - marginX * 2, headerH, 10, 10, "FD");

  // Logo proporcional (sem achatado)
  const logoH = 36;
  const logoW = Math.round(logoH * logo.ratio);
  const logoX = marginX + 16;
  const logoY = 14 + (headerH - logoH) / 2;
  // Usa a imagem já carregada (sem await)
  doc.addImage(logo.img, "PNG", logoX, logoY, logoW, logoH);

  // Título + data
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(title, logoX + logoW + 12, logoY + 20);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, logoX + logoW + 12, logoY + 38);

  return 14 + headerH + 10; // y para começar o conteúdo
}

function drawFooterSync(doc: jsPDF, pageW: number, pageH: number, marginX: number) {
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

function newPageSync(
  doc: jsPDF,
  opts: { title: string; marginX: number; pageW: number; pageH: number; logo: { img: HTMLImageElement; ratio: number } }
) {
  doc.addPage();
  const startY = drawHeaderSync(doc, opts.pageW, opts.marginX, opts.title, opts.logo);
  drawFooterSync(doc, opts.pageW, opts.pageH, opts.marginX);
  return startY;
}

/** Card KPI */
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

/* ===================== Botão ===================== */

export default function ExportPDFButton({ kpi, summaryRows, answers, chartRefs }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      // Pré-carrega o logo uma única vez (evita await em didDrawPage)
      const logo = await loadLogo(LOGO_SRC);

      // PDF PAISAGEM
      const options: jsPDFOptions = { unit: "pt", format: "a4", orientation: "landscape" };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const reportTitle = "Relatório da Pesquisa — Clínicas e Consultórios";

      /* ========= PÁG. 1: RESUMO (apenas KPIs) ========= */
      let cursorY = drawHeaderSync(doc, pageW, marginX, reportTitle, logo);
      drawFooterSync(doc, pageW, pageH, marginX);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, cursorY + 4);
      cursorY += 14;

      const gap = 16;
      const cardW = (pageW - marginX * 2 - gap * 3) / 4; // 4 KPIs em uma linha
      const cardH = 78;

      drawKpiCard(doc, marginX + 0 * (cardW + gap), cursorY, cardW, cardH, "Total de respostas", `${kpi.total}`);
      drawKpiCard(
        doc,
        marginX + 1 * (cardW + gap),
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
      drawKpiCard(
        doc,
        marginX + 3 * (cardW + gap),
        cursorY,
        cardW,
        cardH,
        "% receitas geram retrabalho",
        `${kpi.rxReworkPct.toFixed(0)}%`
      );

      /* ========= PÁG. 2: NO-SHOW ========= */
      cursorY = newPageSync(doc, { title: reportTitle, marginX, pageW, pageH, logo });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — No-show relevante", marginX, cursorY);
      cursorY += 10;

      const g1 = await nodeToPNG(chartRefs.noshowRef.current, 1600);
      const chartH = pageH - cursorY - 36;
      if (g1) {
        doc.addImage(g1, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
      }
      drawFooterSync(doc, pageW, pageH, marginX);

      /* ========= PÁG. 3: GLOSAS ========= */
      cursorY = newPageSync(doc, { title: reportTitle, marginX, pageW, pageH, logo });

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
      drawFooterSync(doc, pageW, pageH, marginX);

      /* ========= PÁG. 4: RECEITAS DIGITAIS ========= */
      cursorY = newPageSync(doc, { title: reportTitle, marginX, pageW, pageH, logo });

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
      drawFooterSync(doc, pageW, pageH, marginX);

      /* ========= PÁG. 5: TABELA RESUMO ========= */
      const tableTopMargin = 14 + 76 + 10 + 12; // espaço do header + respiro
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
          // 100% síncrono
          const startY = drawHeaderSync(doc, pageW, marginX, reportTitle, logo);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(14);
          doc.text("Resumo consolidado por pergunta", marginX, startY + 2);
          drawFooterSync(doc, pageW, pageH, marginX);
        },
      });

      /* ========= PÁGs. 6+: DETALHES ========= */
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
            const startY = drawHeaderSync(doc, pageW, marginX, reportTitle, logo);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Respostas detalhadas (sem identificação sensível)", marginX, startY + 2);
            drawFooterSync(doc, pageW, pageH, marginX);
          },
        });
      }

      // Salvar
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
