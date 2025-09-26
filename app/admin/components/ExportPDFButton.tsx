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

/** Carrega imagem com fallback (não deixa o PDF quebrar) */
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

/** Captura com timeout + fallback para evitar travas de html-to-image */
async function tryCapture(el?: HTMLElement | null, timeoutMs = 1200): Promise<string | null> {
  if (!el) return null;
  const rect = el.getBoundingClientRect?.();
  const width = Math.max(Math.round(rect?.width || 1200), 600);

  const task = htmlToImage
    .toPng(el, { cacheBust: true, pixelRatio: 2, width })
    .then((dataUrl) => dataUrl)
    .catch(() => null);

  const timeout = new Promise<string | null>((resolve) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeout]);
  } catch {
    return null;
  }
}

/** Data/hora pt-BR */
function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

export default function ExportPDFButton({ kpi, summaryRows, answers, chartRefs }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      // A4 paisagem
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

      // Logo proporcional (ignora se falhar)
      const logoInfo = await safeLoadImage(LOGO_SRC);
      let titleX = marginX + 16;
      const titleY = 20 + headerH / 2;

      if (logoInfo) {
        const logoH = 52;
        const logoW = Math.round(logoH * logoInfo.ratio);
        const logoX = marginX + 16;
        const logoY = 20 + (headerH - logoH) / 2;
        try {
          doc.addImage(logoInfo.img, "PNG", logoX, logoY, logoW, logoH);
          titleX = logoX + logoW + 16;
        } catch {
          // segue sem logo
        }
      }

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(24);
      doc.text("Relatório da Pesquisa — Clínicas e Consultórios", titleX, titleY - 6);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK_SOFT);
      doc.setFontSize(11);
      doc.text(`Gerado em ${formatNow()}`, titleX, titleY + 16);

      cursorY = 20 + headerH + 18;

      // KPIs (4 cartões)
      const cols = 4;
      const gap = 14;
      const cardW = (pageW - marginX * 2 - gap * (cols - 1)) / cols;
      const cardH = 92;

      const drawKpi = (x: number, title: string, value: string) => {
        doc.setDrawColor(CARD_EDGE);
        doc.setFillColor("#ffffff");
        doc.roundedRect(x, cursorY, cardW, cardH, 12, 12, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(INK);
        doc.text(title, x + 14, cursorY + 22, { maxWidth: cardW - 28 });

        doc.setTextColor(BRAND_BLUE);
        doc.setFontSize(30);
        doc.text(value, x + 14, cursorY + 62);
      };

      let x = marginX;
      drawKpi(x, "Total de respostas", String(kpi.total));
      x += cardW + gap;
      drawKpi(x, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      x += cardW + gap;
      drawKpi(x, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);
      x += cardW + gap;
      drawKpi(x, "% receitas geram retrabalho", `${kpi.rxReworkPct.toFixed(0)}%`);

      cursorY += cardH + 24;

      // Gráficos com fallback
      const chartH = 200;
      const drawChart = async (title: string, el?: HTMLElement | null) => {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text(title, marginX, cursorY);
        cursorY += 12;

        let ok = false;
        try {
          const dataUrl = await tryCapture(el);
          if (dataUrl) {
            doc.addImage(dataUrl, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
            ok = true;
          }
        } catch {
          ok = false;
        }
        if (!ok) {
          // placeholder se falhar a captura
          doc.setDrawColor(CARD_EDGE);
          doc.setLineWidth(1);
          doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
        }
        cursorY += chartH + 22;
      };

      await drawChart("Distribuição — No-show relevante", chartRefs.noshowRef.current);
      await drawChart("Distribuição — Glosas (recorrência / interesse)", chartRefs.glosaRef.current);
      await drawChart("Distribuição — Receitas Digitais (retrabalho / dificuldade / valor)", chartRefs.rxRef.current);

      // Quebra antes do resumo se necessário
      if (cursorY > pageH - 200) {
        doc.addPage(); // mantém landscape
        cursorY = marginX;
      }

      // Resumo consolidado
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Resumo consolidado por pergunta", marginX, cursorY);
      cursorY += 10;

      const safeSummary = Array.isArray(summaryRows) ? summaryRows : [];
      const colKeys = Array.from(
        new Set(
          safeSummary.flatMap((r) => (r ? Object.keys(r).filter((k) => k !== "pergunta") : []))
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
              total: Object.entries(r || {})
                .filter(([k]) => k !== "pergunta")
                .reduce((acc, [, v]) => acc + (Number(v) || 0), 0),
            }));

      try {
        autoTable(doc as any, {
          startY: cursorY + 8,
          styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 6, lineColor: CARD_EDGE },
          headStyles: { fillColor: [25, 118, 210], textColor: "#ffffff", fontStyle: "bold" },
          alternateRowStyles: { fillColor: "#fbfdff" },
          body: safeSummaryBody,
          columns,
          margin: { left: marginX, right: marginX },
          theme: "grid",
        });
      } catch {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(12);
        doc.text("Não foi possível montar o resumo.", marginX, cursorY + 24);
      }

      // Detalhes (apenas se houver dados)
      if (answers && answers.length > 0) {
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Respostas detalhadas (sem identificação sensível)", marginX, marginX);

        const firstRow = answers[0] || {};
        const detailCols = Object.keys(firstRow).map((k) => ({ header: k, dataKey: k }));

        if (detailCols.length > 0) {
          try {
            autoTable(doc as any, {
              startY: marginX + 10,
              styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: 5, lineColor: CARD_EDGE },
              headStyles: { fillColor: [37, 117, 252], textColor: "#ffffff", fontStyle: "bold" },
              body: answers,
              columns: detailCols,
              margin: { left: marginX, right: marginX },
              theme: "grid",
            });
          } catch {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK_SOFT);
            doc.setFontSize(12);
            doc.text("Não foi possível montar a tabela de detalhes.", marginX, marginX + 24);
          }
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
      console.error("[PDF] Erro inesperado:", e);
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
      style={{ backgroundImage: `linear-gradient(135deg, ${BRAND_GRAD_LEFT}, ${BRAND_GRAD_RIGHT})` }}
    >
      {loading ? "Gerando..." : "Exportar PDF"}
    </button>
  );
}
