"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import jsPDF, { jsPDFOptions } from "jspdf";
import autoTable from "jspdf-autotable";
import * as htmlToImage from "html-to-image";

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

/** Tenta carregar o logo como DataURL; se falhar, retorna null (PDF continua) */
async function safeLoadLogoDataURL(path: string): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("Logo não encontrado");
    const blob = await res.blob();

    const ratio = await new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const r = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        URL.revokeObjectURL(url);
        resolve(r);
      };
      img.onerror = reject;
      img.src = url;
    });

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });

    return { dataUrl, ratio };
  } catch {
    return null;
  }
}

/** Converte um nó para PNG com limites seguros; se falhar, retorna null */
async function safeNodeToPNG(el?: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    const rawW =
      el.scrollWidth || el.clientWidth || (el as HTMLElement).offsetWidth || 1200;
    const width = Math.min(Math.max(rawW, 800), 1600); // clamp para evitar OOM
    return await htmlToImage.toPng(el, {
      cacheBust: true,
      pixelRatio: 1.5, // menos custoso e estável
      width,
      style: { transform: "none" }, // evita zooms/anim
    });
  } catch {
    return null;
  }
}

/* ===================== Cabeçalho/Rodapé SÍNCRONOS ===================== */

function drawHeaderSync(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logo?: { dataUrl: string; ratio: number } | null
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

  // Logo (se disponível)
  let logoW = 0;
  const logoH = 36;
  const logoX = marginX + 16;
  const logoY = 14 + (headerH - logoH) / 2;
  if (logo) {
    logoW = Math.round(logoH * logo.ratio);
    doc.addImage(logo.dataUrl, "PNG", logoX, logoY, logoW, logoH);
  }

  // Título + data
  const textX = logo ? logoX + logoW + 12 : logoX;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(title, textX, logoY + 20);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, textX, logoY + 38);

  return 14 + headerH + 10;
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
  opts: { title: string; marginX: number; pageW: number; pageH: number; logo?: { dataUrl: string; ratio: number } | null }
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
      // 1) Tenta carregar o logo; se falhar, segue sem logo
      const logo = await safeLoadLogoDataURL(LOGO_SRC);

      // 2) PDF paisagem
      const options: jsPDFOptions = { unit: "pt", format: "a4", orientation: "landscape" };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const title = "Relatório da Pesquisa — Clínicas e Consultórios";

      /* ========= PÁG. 1 — KPIs ========= */
      let cursorY = drawHeaderSync(doc, pageW, marginX, title, logo);
      drawFooterSync(doc, pageW, pageH, marginX);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, cursorY + 4);
      cursorY += 14;

      const gap = 16;
      const cardW = (pageW - marginX * 2 - gap * 3) / 4;
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

      /* ========= PÁG. 2 — No-show ========= */
      cursorY = newPageSync(doc, { title, marginX, pageW, pageH, logo });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — No-show relevante", marginX, cursorY);
      cursorY += 10;

      const g1 = await safeNodeToPNG(chartRefs.noshowRef.current);
      const chartH = pageH - cursorY - 36;
      if (g1) {
        doc.addImage(g1, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        doc.text("Gráfico indisponível no momento.", marginX + 14, cursorY + 24);
      }
      drawFooterSync(doc, pageW, pageH, marginX);

      /* ========= PÁG. 3 — Glosas ========= */
      cursorY = newPageSync(doc, { title, marginX, pageW, pageH, logo });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — Glosas (recorrência / interesse)", marginX, cursorY);
      cursorY += 10;

      const g2 = await safeNodeToPNG(chartRefs.glosaRef.current);
      if (g2) {
        doc.addImage(g2, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        doc.text("Gráfico indisponível no momento.", marginX + 14, cursorY + 24);
      }
      drawFooterSync(doc, pageW, pageH, marginX);

      /* ========= PÁG. 4 — Receitas Digitais ========= */
      cursorY = newPageSync(doc, { title, marginX, pageW, pageH, logo });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Distribuição — Receitas Digitais (retrabalho / dificuldade / valor)", marginX, cursorY);
      cursorY += 10;

      const g3 = await safeNodeToPNG(chartRefs.rxRef.current);
      if (g3) {
        doc.addImage(g3, "PNG", marginX, cursorY, pageW - marginX * 2, chartH);
      } else {
        doc.setDrawColor(CARD_EDGE);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, cursorY, pageW - marginX * 2, chartH, 10, 10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        doc.text("Gráfico indisponível no momento.", marginX + 14, cursorY + 24);
      }
      drawFooterSync(doc, pageW, pageH, marginX);

      /* ========= PÁG. 5 — Resumo ========= */
      const tableTopMargin = 14 + 76 + 10 + 12; // header + respiro
      doc.addPage();
      try {
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
            const startY = drawHeaderSync(doc, pageW, marginX, title, logo);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            doc.text("Resumo consolidado por pergunta", marginX, startY + 2);
            drawFooterSync(doc, pageW, pageH, marginX);
          },
        });
      } catch {
        const startY = drawHeaderSync(doc, pageW, marginX, title, logo);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Resumo consolidado por pergunta", marginX, startY + 2);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(11);
        doc.text("Não foi possível renderizar a tabela de resumo.", marginX, startY + 24);
        drawFooterSync(doc, pageW, pageH, marginX);
      }

      /* ========= PÁGs. 6+ — Detalhes ========= */
      const firstRow = answers[0] || {};
      const detailCols = Object.keys(firstRow).map((k) => ({ header: k, dataKey: k }));
      if (detailCols.length) {
        doc.addPage();
        try {
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
              const startY = drawHeaderSync(doc, pageW, marginX, title, logo);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(INK);
              doc.setFontSize(14);
              doc.text("Respostas detalhadas (sem identificação sensível)", marginX, startY + 2);
              drawFooterSync(doc, pageW, pageH, marginX);
            },
          });
        } catch {
          const startY = drawHeaderSync(doc, pageW, marginX, title, logo);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(INK);
          doc.setFontSize(14);
          doc.text("Respostas detalhadas (sem identificação sensível)", marginX, startY + 2);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(INK_SOFT);
          doc.setFontSize(11);
          doc.text("Não foi possível renderizar a tabela de detalhes.", marginX, startY + 24);
          drawFooterSync(doc, pageW, pageH, marginX);
        }
      }

      // 3) Salvar
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
