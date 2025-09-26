"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as htmlToImage from "html-to-image";

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

const BRAND_BLUE = "#1976d2";
const BRAND_GRAD_LEFT = "#1976d2";
const BRAND_GRAD_RIGHT = "#2575fc";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";
const LOGO_SRC = "/logo.png";

/** Carrega imagem mantendo proporção — se falhar, retorna null */
async function safeLoadImage(src: string): Promise<{ img: HTMLImageElement; ratio: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = src;
    });
    const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    return { img, ratio };
  } catch {
    return null;
  }
}

/** Converte um nó (gráfico) para PNG com largura do elemento (fallback p/ 1200) */
async function nodeToPNG(el?: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    const rect = el.getBoundingClientRect?.();
    const width = Math.max( Math.round(rect?.width || 1200), 600 );
    const dataUrl = await htmlToImage.toPng(el, {
      cacheBust: true,
      pixelRatio: 2,
      width,
    });
    return dataUrl;
  } catch {
    return null;
  }
}

/** Data/hora pt-BR sem libs externas */
function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default function ExportPDFButton({ kpi, summaryRows, answers, chartRefs }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      // A4 LANDSCAPE
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 40;
      let cursorY = 0;

      // Faixa superior
      doc.setFillColor(BRAND_BLUE);
      doc.rect(0, 0, pageW, 8, "F");

      // Cabeçalho
      const headerH = 90;
      doc.setFillColor("#ffffff");
      doc.setDrawColor(CARD_EDGE);
      doc.setLineWidth(1);
      doc.roundedRect(marginX, 20, pageW - marginX * 2, headerH, 12, 12, "FD");

      // Logo (com fallback)
      const logoInfo = await safeLoadImage(LOGO_SRC);
      let titleX = marginX + 16;
      const titleYBase = 20 + headerH / 2;

      if (logoInfo) {
        const logoH = 52;
        const logoW = Math.round(logoH * logoInfo.ratio);
        const logoX = marginX + 16;
        const logoY = 20 + (headerH - logoH) / 2;
        doc.addImage(logoInfo.img, "PNG", logoX, logoY, logoW, logoH);
        titleX = logoX + logoW + 16;
      }

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(24);
      doc.text("Relatório da Pesquisa — Clínicas e Consultórios", titleX, titleYBase - 6);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(11);
      doc.text(`Gerado em ${formatNow()}`, titleX, titleYBase + 16);

      cursorY = 20 + headerH + 18;

      // KPIs — 4 colunas
      const kpiCols = 4;
      const kpiGap = 14;
      const kpiCardW = (pageW - marginX * 2 - kpiGap * (kpiCols - 1)) / kpiCols;
      const kpiCardH = 92;

      const drawKpi = (x: number, title: string, value: string) => {
        doc.setDrawColor(CARD_EDGE);
        doc.setFillColor("#ffffff");
        doc.roundedRect(x, cursorY, kpiCardW, kpiCardH, 12, 12, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(INK);
        doc.text(title, x + 14, cursorY + 22, { maxWidth: kpiCardW - 28 });

        doc.setTextColor(BRAND_BLUE);
        doc.setFontSize(30);
        doc.text(value, x + 14, cursorY + 62);
      };

      let x = marginX;
      drawKpi(x, "Total de respostas", `${kpi.total}`);
      x += kpiCardW + kpiGap;
      drawKpi(x, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      x += kpiCardW + kpiGap;
      drawKpi(x, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);
      x += kpiCardW + kpiGap;
      drawKpi(x, "% receitas geram retrabalho", `${kpi.rxReworkPct.toFixed(0)}%`);

      cursorY += kpiCardH + 24;

      // Gráficos
      const chartH = 200;

      const drawChart = async (title: string, el?: HTMLElement | null) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text(title, marginX, cursorY);
        cursorY += 12;

        const dataUrl = await nodeToPNG(el);
        if (dataUrl) {
          doc.addImage(dataUrl, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
        } else {
          doc.setDrawColor(CARD_EDGE);
          doc.setLineWidth(1);
          doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
        }
        cursorY += chartH + 22;
      };

      await drawChart("Distribuição — No-show relevante", chartRefs.noshowRef.current);
      await drawChart("Distribuição — Glosas (recorrência / interesse)", chartRefs.glosaRef.current);
      await drawChart("Distribuição — Receitas Digitais (retrabalho / dificuldade / valor)", chartRefs.rxRef.current);

      // Resumo — quebra de página se necessário
      if (cursorY > pageH - 200) {
        doc.addPage(); // mantém landscape atual
        cursorY = marginX;
      }

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Resumo consolidado por pergunta", marginX, cursorY);
      cursorY += 10;

      const safeSummary = Array.isArray(summaryRows) ? summaryRows : [];
      const colKeys = Array.from(
        new Set(
          safeSummary.flatMap((r) =>
            Object.keys(r).filter((k) => k !== "pergunta")
          )
        )
      );
      const columns =
        colKeys.length > 0
          ? [{ header: "Pergunta", dataKey: "pergunta" }, ...colKeys.map((k) => ({ header: k, dataKey: k }))]
          : [{ header: "Pergunta", dataKey: "pergunta" }, { header: "Total", dataKey: "total" }];

      const safeSummaryBody =
        colKeys.length > 0
          ? safeSummary
          : safeSummary.map((r) => ({
              pergunta: r.pergunta,
              total: Object.entries(r)
                .filter(([k]) => k !== "pergunta")
                .reduce((acc, [, v]) => acc + (Number(v) || 0), 0),
            }));

      autoTable(doc as any, {
        startY: cursorY + 8,
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
        body: safeSummaryBody,
        columns,
        margin: { left: marginX, right: marginX },
        theme: "grid",
      });

      // Detalhes (só se houver ao menos 1 resposta)
      if (answers && answers.length > 0) {
        doc.addPage(); // landscape
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Respostas detalhadas (sem identificação sensível)", marginX, marginX);

        const firstRow = answers[0];
        const detailCols = Object.keys(firstRow || {}).map((k) => ({ header: k, dataKey: k }));

        if (detailCols.length > 0) {
          autoTable(doc as any, {
            startY: marginX + 10,
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
            margin: { left: marginX, right: marginX },
            theme: "grid",
          });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(INK_SOFT);
          doc.setFontSize(12);
          doc.text("Não há colunas para exibir.", marginX, marginX + 24);
        }
      }

      // Rodapé
      const year = new Date().getFullYear();
      const footer = `© ${year} NovuSys — Relatório gerado automaticamente`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(INK_SOFT);
      const footerW = doc.getTextWidth(footer);
      doc.text(footer, pageW - marginX - footerW, pageH - 16);

      // Nome do arquivo
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
