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

/** Carrega imagem de forma compatível com o build do Vercel */
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

/** Converte um nó (gráfico) para PNG */
async function nodeToPNG(el?: HTMLElement | null, width = 1000): Promise<string | null> {
  if (!el) return null;
  try {
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
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      let cursorY = 0;

      // Faixa superior
      doc.setFillColor(BRAND_BLUE);
      doc.rect(0, 0, pageW, 8, "F");

      // Cabeçalho com logo proporcional
      const headerH = 84;
      doc.setFillColor("#ffffff");
      doc.setDrawColor(CARD_EDGE);
      doc.setLineWidth(1);
      doc.roundedRect(marginX, 20, pageW - marginX * 2, headerH, 10, 10, "FD");

      const { img: logo, ratio } = await loadImage(LOGO_SRC);
      const logoH = 40;
      const logoW = Math.round(logoH * ratio);
      const logoX = marginX + 16;
      const logoY = 20 + (headerH - logoH) / 2;
      doc.addImage(logo, "PNG", logoX, logoY, logoW, logoH);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(20);
      doc.text("Relatório da Pesquisa — Clínicas e Consultórios", logoX + logoW + 14, logoY + 22);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(11);
      doc.text(`Gerado em ${formatNow()}`, logoX + logoW + 14, logoY + 42);

      cursorY = 20 + headerH + 18;

      // KPIs
      const kpiCardW = (pageW - marginX * 2 - 16 * 2) / 3;
      const kpiCardH = 78;
      const kpiStartX = marginX;
      const kpiGap = 16;

      const drawKpiCard = (x: number, title: string, value: string) => {
        doc.setDrawColor(CARD_EDGE);
        doc.setFillColor("#ffffff");
        doc.roundedRect(x, cursorY, kpiCardW, kpiCardH, 10, 10, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(INK);
        doc.text(title, x + 14, cursorY + 22);

        doc.setTextColor(BRAND_BLUE);
        doc.setFontSize(28);
        doc.text(value, x + 14, cursorY + 56);
      };

      drawKpiCard(kpiStartX, "Total de respostas", `${kpi.total}`);
      drawKpiCard(kpiStartX + kpiCardW + kpiGap, "% que consideram no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      drawKpiCard(
        kpiStartX + 2 * (kpiCardW + kpiGap),
        "% que relatam glosas recorrentes",
        `${kpi.glosaRecorrentePct.toFixed(0)}%`
      );

      cursorY += kpiCardH + 22;

      // Gráfico 1
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — No-show relevante", marginX, cursorY);
      cursorY += 12;

      const g1 = await nodeToPNG(chartRefs.noshowRef.current);
      const chartH = 220;
      if (g1) {
        doc.addImage(g1, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        // placeholder com borda sólida (sem setLineDash)
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
      }
      cursorY += chartH + 26;

      // Gráfico 2
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — Glosas (recorrência / interesse)", marginX, cursorY);
      cursorY += 12;

      const g2 = await nodeToPNG(chartRefs.glosaRef.current);
      if (g2) {
        doc.addImage(g2, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
      }
      cursorY += chartH + 26;

      // quebra antes da tabela
      if (cursorY > pageH - 180) {
        doc.addPage();
        cursorY = marginX;
      }

      // Tabela resumo
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Resumo consolidado por pergunta", marginX, cursorY);
      cursorY += 10;

      const columns = [
        { header: "Pergunta", dataKey: "pergunta" },
        ...Object.keys(
          summaryRows.reduce((acc, r) => {
            Object.keys(r).forEach((k) => {
              if (k !== "pergunta") acc[k] = true;
            });
            return acc;
          }, {} as Record<string, boolean>)
        ).map((k) => ({ header: k, dataKey: k })),
      ];

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
        body: summaryRows,
        columns,
        margin: { left: marginX, right: marginX },
        theme: "grid",
      });

      // Detalhes
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Respostas detalhadas (sem identificação sensível)", marginX, marginX);

      const firstRow = answers[0] || {};
      const detailCols = Object.keys(firstRow).map((k) => ({ header: k, dataKey: k }));

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
