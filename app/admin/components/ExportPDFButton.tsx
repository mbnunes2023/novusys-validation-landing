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

/* Utilidades */
function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

async function nodeToPNG(el?: HTMLElement | null, width = 1200): Promise<string | null> {
  if (!el) return null;
  try {
    return await htmlToImage.toPng(el, { cacheBust: true, pixelRatio: 2, width });
  } catch {
    return null;
  }
}

/** Carrega o logo como dataURL (mais estável que Image()/CORS) */
async function fetchAsDataURL(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function ExportPDFButton({ kpi, summaryRows, answers, chartRefs }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      // A4 paisagem
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const M = 40; // margem
      const CONTENT_W = pageW - M * 2;
      const FOOTER_H = 22;

      let y = M;

      const addFooter = () => {
        const year = new Date().getFullYear();
        const footer = `© ${year} NovuSys — Relatório gerado automaticamente`;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(INK_SOFT);
        const w = doc.getTextWidth(footer);
        doc.text(footer, pageW - M - w, pageH - 10);
      };

      const drawHeader = async () => {
        // barra
        doc.setFillColor(BRAND_BLUE);
        doc.rect(0, 0, pageW, 6, "F");

        const headerH = 80;
        doc.setFillColor("#ffffff");
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(M, 16, CONTENT_W, headerH, 10, 10, "FD");

        const logoData = await fetchAsDataURL(LOGO_SRC);
        const baseX = M + 16;
        const baseY = 16;

        try {
          if (logoData) {
            const logoH = 36;
            const logoW = 36 * 2.7; // proporção aproximada do seu logo
            const logoX = baseX;
            const logoY = baseY + (headerH - logoH) / 2;
            doc.addImage(logoData, "PNG", logoX, logoY, logoW, logoH);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(22);
            doc.text(
              "Relatório da Pesquisa — Clínicas e Consultórios",
              logoX + logoW + 14,
              logoY + 22
            );
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK_SOFT);
            doc.setFontSize(11);
            doc.text(`Gerado em ${formatNow()}`, logoX + logoW + 14, logoY + 42);
          } else {
            // fallback sem imagem
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(22);
            doc.text(
              "Relatório da Pesquisa — Clínicas e Consultórios",
              baseX,
              baseY + 46
            );
            doc.setFont("helvetica", "normal");
            doc.setTextColor(INK_SOFT);
            doc.setFontSize(11);
            doc.text(`Gerado em ${formatNow()}`, baseX, baseY + 66);
          }
        } catch {
          // nunca abortar o PDF por causa do logo
        }

        y = 16 + headerH + 16;
      };

      // Quebra assíncrona aguardada SEMPRE antes de desenhar bloco
      const ensure = async (h: number) => {
        if (y + h > pageH - M - FOOTER_H) {
          addFooter();
          doc.addPage();
          y = M;
          await drawHeader();
        }
      };

      const sectionTitle = async (t: string) => {
        await ensure(24);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text(t, M, y + 14);
        y += 22;
      };

      const drawKPI = async () => {
        const H = 86;
        const GAP = 16;
        const cardW = (CONTENT_W - GAP * 2) / 3;

        const card = (x: number, title: string, value: string) => {
          doc.setDrawColor(CARD_EDGE);
          doc.setFillColor("#ffffff");
          doc.roundedRect(x, y, cardW, H, 10, 10, "FD");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(INK);
          doc.text(title, x + 14, y + 24);
          doc.setTextColor(BRAND_BLUE);
          doc.setFontSize(30);
          doc.text(value, x + 14, y + 58);
        };

        await ensure(H);
        const X1 = M;
        const X2 = M + cardW + GAP;
        const X3 = M + (cardW + GAP) * 2;

        card(X1, "Total de respostas", String(kpi.total));
        card(X2, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
        card(X3, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);

        y += H + 10;

        await ensure(H);
        doc.setDrawColor(CARD_EDGE);
        doc.setFillColor("#ffffff");
        doc.roundedRect(M, y, cardW, H, 10, 10, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(INK);
        doc.text("% receitas geram retrabalho", M + 14, y + 24);
        doc.setTextColor(BRAND_BLUE);
        doc.setFontSize(30);
        doc.text(`${kpi.rxReworkPct.toFixed(0)}%`, M + 14, y + 58);

        y += H + 18;
      };

      const drawChartBlock = async (
        title: string,
        dataUrl: string | null,
        preferredH = 200
      ) => {
        await sectionTitle(title);
        await ensure(preferredH + 10);

        try {
          if (dataUrl) {
            doc.addImage(dataUrl, "PNG", M, y, CONTENT_W, preferredH);
          } else {
            doc.setDrawColor(CARD_EDGE);
            doc.setLineWidth(1);
            doc.roundedRect(M, y, CONTENT_W, preferredH, 10, 10);
          }
        } catch {
          // fallback: só a moldura
          doc.setDrawColor(CARD_EDGE);
          doc.setLineWidth(1);
          doc.roundedRect(M, y, CONTENT_W, preferredH, 10, 10);
        }
        y += preferredH + 20;
      };

      /* ===== Geração ===== */
      await drawHeader();
      await drawKPI();

      const g1 = await nodeToPNG(chartRefs.noshowRef.current, 1400);
      await drawChartBlock("Distribuição — No-show relevante", g1);

      const g2 = await nodeToPNG(chartRefs.glosaRef.current, 1400);
      await drawChartBlock("Distribuição — Glosas (recorrência / interesse)", g2);

      const g3 = await nodeToPNG(chartRefs.rxRef.current, 1400);
      await drawChartBlock(
        "Distribuição — Receitas Digitais (retrabalho / dificuldade / valor)",
        g3
      );

      // Resumo
      await ensure(60);
      await sectionTitle("Resumo consolidado por pergunta");

      const summaryColumns = [
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

      try {
        autoTable(doc as any, {
          startY: y + 6,
          margin: { left: M, right: M },
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
          columns: summaryColumns,
          theme: "grid",
          pageBreak: "avoid",
          didDrawPage: () => {
            doc.setFillColor(BRAND_BLUE);
            doc.rect(0, 0, pageW, 6, "F");
            const year = new Date().getFullYear();
            const footer = `© ${year} NovuSys — Relatório gerado automaticamente`;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(INK_SOFT);
            const w = doc.getTextWidth(footer);
            doc.text(footer, pageW - M - w, pageH - 10);
          },
        });
      } catch {
        await ensure(24);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        doc.text("Resumo indisponível.", M, y + 14);
        y += 24;
      }

      // Detalhes
      addFooter();
      doc.addPage();
      y = M;
      await drawHeader();
      await sectionTitle("Respostas detalhadas (sem identificação sensível)");

      const firstRow = answers[0] || {};
      const detailCols =
        Object.keys(firstRow).length > 0
          ? Object.keys(firstRow).map((k) => ({ header: k, dataKey: k }))
          : [{ header: "Total", dataKey: "total" }];

      const detailBody = answers.length ? answers : [{ total: 0 }];

      try {
        autoTable(doc as any, {
          startY: y + 6,
          margin: { left: M, right: M },
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
          body: detailBody,
          columns: detailCols,
          theme: "grid",
          pageBreak: "auto",
          didDrawPage: () => {
            doc.setFillColor(BRAND_BLUE);
            doc.rect(0, 0, pageW, 6, "F");
            const year = new Date().getFullYear();
            const footer = `© ${year} NovuSys — Relatório gerado automaticamente`;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(INK_SOFT);
            const w = doc.getTextWidth(footer);
            doc.text(footer, pageW - M - w, pageH - 10);
          },
        });
      } catch {
        await ensure(24);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        doc.text("Detalhes indisponíveis.", M, y + 14);
        y += 24;
      }

      // salvar
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
