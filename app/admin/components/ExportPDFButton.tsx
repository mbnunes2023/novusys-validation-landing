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

/** Converte um nó (gráfico) para PNG */
async function nodeToPNG(el?: HTMLElement | null, width = 1300): Promise<string | null> {
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
      // === A4 LANDSCAPE ===
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();  // ~ 842 pt
      const pageH = doc.internal.pageSize.getHeight(); // ~ 595 pt
      const marginX = 40;
      let cursorY = 0;

      // Faixa superior fina (marca)
      doc.setFillColor(BRAND_BLUE);
      doc.rect(0, 0, pageW, 8, "F");

      // Cabeçalho (ocupando largura quase total)
      const headerH = 90;
      doc.setFillColor("#ffffff");
      doc.setDrawColor(CARD_EDGE);
      doc.setLineWidth(1);
      doc.roundedRect(marginX, 20, pageW - marginX * 2, headerH, 12, 12, "FD");

      // Logo proporcional à esquerda
      const { img: logo, ratio } = await loadImage(LOGO_SRC);
      const logoH = 52; // altura fixa “bonita”
      const logoW = Math.round(logoH * ratio);
      const logoX = marginX + 16;
      const logoY = 20 + (headerH - logoH) / 2;
      doc.addImage(logo, "PNG", logoX, logoY, logoW, logoH);

      // Título e data à direita do logo
      const titleX = logoX + logoW + 16;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(24);
      doc.text("Relatório da Pesquisa — Clínicas e Consultórios", titleX, logoY + 24);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(11);
      doc.text(`Gerado em ${formatNow()}`, titleX, logoY + 44);

      cursorY = 20 + headerH + 18;

      // =================== KPIs (4 cartões) ===================
      // 4 colunas em paisagem cabem bem com um gap consistente
      const kpiCols = 4;
      const kpiGap = 14;
      const kpiCardW = (pageW - marginX * 2 - kpiGap * (kpiCols - 1)) / kpiCols;
      const kpiCardH = 92;

      const drawKpiCard = (x: number, title: string, value: string) => {
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
      drawKpiCard(x, "Total de respostas", `${kpi.total}`);
      x += kpiCardW + kpiGap;

      drawKpiCard(x, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      x += kpiCardW + kpiGap;

      drawKpiCard(x, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);
      x += kpiCardW + kpiGap;

      drawKpiCard(x, "% receitas geram retrabalho", `${kpi.rxReworkPct.toFixed(0)}%`);

      cursorY += kpiCardH + 24;

      // =================== GRÁFICOS ===================
      // Cada gráfico com título + imagem/placeholder
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

      // =================== TABELA RESUMO ===================
      if (cursorY > pageH - 200) {
        doc.addPage(); // ainda em landscape
        cursorY = marginX;
      }

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

      // =================== DETALHES (nova página) ===================
      doc.addPage("a4", "landscape");
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
