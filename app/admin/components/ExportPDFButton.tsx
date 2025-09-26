"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import type React from "react";
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

/* ===================== Branding & UI ===================== */

const BRAND_BLUE = "#1976d2";
const ACCENT = "#2575fc";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";

/* ===================== Utils ===================== */

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

function usableHeight(startY: number, pageH: number, bottomPadding = 40) {
  return Math.max(0, pageH - bottomPadding - startY);
}
function centeredStartY(startY: number, pageH: number, blockH: number) {
  const avail = usableHeight(startY, pageH);
  const offset = Math.max(0, (avail - blockH) / 2);
  return startY + offset;
}

// /public/logo.png -> DataURL
async function fetchAsDataURL(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ===================== Cabeçalho/Rodapé ===================== */

const TOP_GAP = 24; // respiro após header

function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  // faixa superior
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  // card do header
  const headerH = 72;
  const cardX = marginX;
  const cardY = 14;
  const cardW = pageW - marginX * 2;

  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardY, cardW, headerH, 10, 10, "FD");

  // centralização vertical
  const centerY = cardY + headerH / 2;

  // bloco texto (esquerda)
  const leftPad = 18;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(18);
  const titleH = 18;
  const dateH = 10;
  const lineGap = 6;
  const textBlockH = titleH + lineGap + dateH;
  const titleY = centerY - textBlockH / 2 + titleH * 0.75;

  doc.text(title, cardX + leftPad, titleY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  doc.setFontSize(10);
  doc.text(`Gerado em ${formatNow()}`, cardX + leftPad, titleY + lineGap + 10);

  // logo (direita)
  if (logoDataUrl) {
    const targetW = 160;
    const targetH = 48;
    const padRight = 18;
    const imgX = cardX + cardW - padRight - targetW;
    const imgY = centerY - targetH / 2;
    try {
      doc.addImage(logoDataUrl, "PNG", imgX, imgY, targetW, targetH);
    } catch {
      // ignora
    }
  }

  return cardY + headerH + 12 + TOP_GAP;
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, marginX: number) {
  const left = `Relatório gerado automaticamente`;
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
  opts: { title: string; marginX: number; pageW: number; pageH: number; logoDataUrl?: string | null }
) {
  doc.addPage();
  const startY = drawHeader(doc, opts.pageW, opts.marginX, opts.title, opts.logoDataUrl);
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
  value: string,
  accent = BRAND_BLUE
) {
  doc.setDrawColor(CARD_EDGE);
  doc.setFillColor("#ffffff");
  doc.roundedRect(x, y, w, h, 12, 12, "FD");
  doc.setFillColor(accent);
  doc.roundedRect(x, y, w, 6, 12, 12, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(title, x + 16, y + 26);

  doc.setTextColor(accent);
  doc.setFontSize(30);
  doc.text(value, x + 16, y + 58);
}

/* ===================== Micro-charts helpers ===================== */

type DistItem = { label: string; count: number; pct: string };
const ROW_H = 20;
const ROW_GAP = 6;

function measureBarBlock(lines: number) {
  return 8 + lines * (ROW_H + ROW_GAP);
}

// distribuição (entre respondentes respondentes, ignora vazios)
function dist(
  answers: Answer[],
  field: keyof Answer,
  order: string[]
): { items: DistItem[]; answered: number; unknownCount: number } {
  const counts: Record<string, number> = {};
  order.forEach((k) => (counts[k] = 0));
  let unknown = 0;

  answers.forEach((a) => {
    const v = (a[field] as string) ?? "";
    if (!v || !order.includes(v)) unknown += 1;
    else counts[v] += 1;
  });

  const answered = Object.values(counts).reduce((s, n) => s + n, 0);
  const toPct = (n: number) => (answered ? `${Math.round((n / answered) * 100)}%` : "0%");

  const items = order.map((k) => ({ label: k, count: counts[k], pct: toPct(counts[k]) }));
  return { items, answered, unknownCount: unknown };
}

function drawBarBlock(
  doc: jsPDF,
  title: string,
  items: DistItem[],
  x: number,
  y: number,
  width: number
) {
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(13);
  doc.text(title, x, y);
  y += 8;

  const labelW = width * 0.4;
  const barW = width * 0.6;
  const maxPct = Math.max(...items.map((i) => parseInt(i.pct) || 0), 1);

  const filtered = items.filter((it) => it.count > 0);
  filtered.forEach((it, idx) => {
    const rowY = y + idx * (ROW_H + ROW_GAP);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK_SOFT);
    doc.setFontSize(11);
    const label = `${it.label} — ${it.count} (${it.pct})`;
    doc.text(label, x, rowY + 13);

    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#fff");
    doc.roundedRect(x + labelW, rowY, barW, ROW_H, 6, 6, "FD");

    const pct = parseInt(it.pct) || 0;
    const w = (pct / maxPct) * (barW - 10);
    doc.setFillColor(BRAND_BLUE);
    doc.roundedRect(x + labelW + 2, rowY + 2, Math.max(w, 2), ROW_H - 4, 5, 5, "F");
  });

  return y + filtered.length * (ROW_H + ROW_GAP);
}

/* ===================== Tabelas curadas ===================== */

const SENSITIVE_KEYS = new Set([
  "id",
  "created_at",
  "doctor_name",
  "crm",
  "contact",
  "consent",
  "consent_contact",
  "doctor_role",
  "clinic_size",
]);

const HEADER_MAP: Record<string, string> = {
  q_noshow_relevance: "No-show relevante?",
  q_noshow_has_system: "Sistema p/ no-show?",
  q_noshow_financial_impact: "Impacto financeiro",
  q_glosa_is_problem: "Glosas recorrentes?",
  q_glosa_interest: "Checagem antes do envio",
  q_glosa_who_suffers: "Quem sofre mais",
  q_rx_rework: "Receitas geram retrabalho?",
  q_rx_elderly_difficulty: "Pacientes têm dificuldade?",
  q_rx_tool_value: "Valor em ferramenta de apoio",
  comments: "Observações",
};

const QUESTIONS: Array<{ key: keyof Answer; label: string; options: string[] }> = [
  { key: "q_noshow_relevance", label: "No-show relevante?", options: ["Sim", "Não", "Parcialmente"] },
  { key: "q_noshow_has_system", label: "Sistema p/ no-show?", options: ["Sim", "Não"] },
  { key: "q_noshow_financial_impact", label: "Impacto financeiro", options: ["Baixo impacto", "Médio impacto", "Alto impacto"] },
  { key: "q_glosa_is_problem", label: "Glosas recorrentes?", options: ["Sim", "Não", "Às vezes"] },
  { key: "q_glosa_interest", label: "Checagem antes do envio", options: ["Sim", "Não", "Talvez"] },
  { key: "q_glosa_who_suffers", label: "Quem sofre mais", options: ["Médico", "Administrativo", "Ambos"] },
  { key: "q_rx_rework", label: "Receitas geram retrabalho?", options: ["Sim", "Não", "Raramente"] },
  { key: "q_rx_elderly_difficulty", label: "Pacientes têm dificuldade?", options: ["Sim", "Não", "Em parte"] },
  { key: "q_rx_tool_value", label: "Valor em ferramenta de apoio", options: ["Sim", "Não", "Talvez"] },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ===================== Componente ===================== */

export default function ExportPDFButton({ kpi, answers, summaryRows }: Props) {
  const [loading, setLoading] = useState(false);

  const onExport = useCallback(async () => {
    setLoading(true);
    try {
      const logoDataUrl = await fetchAsDataURL("/logo.png");

      const options: jsPDFOptions = { unit: "pt", format: "a4", orientation: "landscape" };
      const doc = new jsPDF(options);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const title = "Relatório da Pesquisa — Clínicas e Consultórios";

      /* ========= PÁGINA 1: Sumário + Resumo Executivo ========= */
      let startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      drawFooter(doc, pageW, pageH, marginX);

      const CARD_W = pageW - marginX * 2;
      const PAD_X = 18;
      const TITLE_GAP = 26;
      const LINE = 18;

      const tocItems = [
        "Visão Geral (KPIs)",
        "No-show",
        "Glosas",
        "Receitas Digitais",
        "Resumo consolidado",
        "Respostas detalhadas",
      ];

      const summaryTitleH = 16;
      const summaryListH = tocItems.length * LINE;
      const summaryPadBottom = 20;
      const summaryCardH = TITLE_GAP + summaryTitleH + 8 + summaryListH + summaryPadBottom;

      if (startY + summaryCardH > pageH - 60) {
        startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      }

      let y = startY;
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, y, CARD_W, summaryCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(16);
      doc.text("Sumário", marginX + PAD_X, y + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK); // preto conforme pedido
      doc.setFontSize(12);

      let listY = y + TITLE_GAP + summaryTitleH + 8;
      tocItems.forEach((label, i) => {
        doc.text(`${i + 1}. ${label}`, marginX + PAD_X, listY, {
          maxWidth: CARD_W - PAD_X * 2,
        });
        listY += LINE;
      });

      // Resumo executivo
      const bullets = [
        `Amostra (após filtros): ${kpi.total} respostas.`,
        `Sinais de impacto: No-show ${kpi.noshowYesPct.toFixed(0)}%, Glosas ${kpi.glosaRecorrentePct.toFixed(
          0
        )}%, Retrabalho em receitas ${kpi.rxReworkPct.toFixed(0)}%.`,
        `Recomendação: piloto focado em no-show e glosas, com fluxo assistido para receitas digitais.`,
      ];

      const reTitleH = 14;
      const bulletsH = bullets.length * LINE;
      const rePadBottom = 24;
      const reCardH = TITLE_GAP + reTitleH + 8 + bulletsH + rePadBottom;

      const gapBetweenCards = 20;
      let reTop = y + summaryCardH + gapBetweenCards;

      if (reTop + reCardH > pageH - 60) {
        reTop = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      }

      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(marginX, reTop, CARD_W, reCardH, 12, 12, "FD");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Resumo Executivo — Principais insights", marginX + PAD_X, reTop + TITLE_GAP);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(12);

      let by = reTop + TITLE_GAP + reTitleH + 8;
      const maxW = CARD_W - PAD_X * 2;
      bullets.forEach((line) => {
        doc.circle(marginX + PAD_X, by - 3, 2, "F");
        doc.text(line, marginX + PAD_X + 10, by, { maxWidth: maxW - 10 });
        by += LINE;
      });

      /* ========= PÁGINA 2: KPIs ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });
      const gap = 16;
      const kpiCardW = (pageW - marginX * 2 - gap * 3) / 4;
      const kpiCardH = 82;

      let kpiY = centeredStartY(startY, pageH, 14 + kpiCardH);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Visão Geral", marginX, kpiY + 2);
      kpiY += 14;

      drawKpiCard(doc, marginX + 0 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "Total de respostas", `${kpi.total}`, ACCENT);
      drawKpiCard(doc, marginX + 1 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "% no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      drawKpiCard(doc, marginX + 2 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "% glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);
      drawKpiCard(doc, marginX + 3 * (kpiCardW + gap), kpiY, kpiCardW, kpiCardH, "% receitas geram retrabalho", `${kpi.rxReworkPct.toFixed(0)}%`);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 3 — No-show ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const nsRelev = dist(answers, "q_noshow_relevance", ["Sim", "Não", "Parcialmente"]);
      const nsSys = dist(answers, "q_noshow_has_system", ["Sim", "Não"]);
      const nsImpact = dist(answers, "q_noshow_financial_impact", ["Baixo impacto", "Médio impacto", "Alto impacto"]);

      const leftH = measureBarBlock(nsRelev.items.length) + 18 + measureBarBlock(nsSys.items.length);
      const rightH = measureBarBlock(nsImpact.items.length);
      const gridH = Math.max(leftH, rightH);

      let nsY = centeredStartY(startY, pageH, gridH);
      const colGap = 24;
      const colW = (pageW - marginX * 2 - colGap) / 2;
      const col1X = marginX;
      const col2X = marginX + colW + colGap;

      let col1Y = nsY;
      col1Y = drawBarBlock(doc, "Relevância", nsRelev.items, col1X, col1Y, colW);
      col1Y += 18;
      col1Y = drawBarBlock(doc, "Possui sistema que resolve", nsSys.items, col1X, col1Y, colW);

      let col2Y = nsY;
      col2Y = drawBarBlock(doc, "Impacto financeiro mensal", nsImpact.items, col2X, col2Y, colW);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 4 — Glosas ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const gRec = dist(answers, "q_glosa_is_problem", ["Sim", "Não", "Às vezes"]);
      const gInt = dist(answers, "q_glosa_interest", ["Sim", "Não", "Talvez"]);
      const gWho = dist(answers, "q_glosa_who_suffers", ["Médico", "Administrativo", "Ambos"]);

      const gLeftH = measureBarBlock(gRec.items.length) + 18 + measureBarBlock(gInt.items.length);
      const gRightH = measureBarBlock(gWho.items.length);
      const gGridH = Math.max(gLeftH, gRightH);

      let gY = centeredStartY(startY, pageH, gGridH);

      let col1Yg = gY;
      col1Yg = drawBarBlock(doc, "Glosas recorrentes", gRec.items, col1X, col1Yg, colW);
      col1Yg += 18;
      col1Yg = drawBarBlock(doc, "Interesse em checagem antes do envio", gInt.items, col1X, col1Yg, colW);

      let col2Yg = gY;
      col2Yg = drawBarBlock(doc, "Quem sofre mais", gWho.items, col2X, col2Yg, colW);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 5 — Receitas Digitais ========= */
      startY = newPage(doc, { title, marginX, pageW, pageH, logoDataUrl });

      const rxRw = dist(answers, "q_rx_rework", ["Sim", "Não", "Raramente"]);
      const rxDif = dist(answers, "q_rx_elderly_difficulty", ["Sim", "Não", "Em parte"]);
      const rxVal = dist(answers, "q_rx_tool_value", ["Sim", "Não", "Talvez"]);

      const rLeftH = measureBarBlock(rxRw.items.length) + 18 + measureBarBlock(rxDif.items.length);
      const rRightH = measureBarBlock(rxVal.items.length);
      const rGridH = Math.max(rLeftH, rRightH);

      let rY = centeredStartY(startY, pageH, rGridH);
      let col1Yr = rY;
      col1Yr = drawBarBlock(doc, "Receitas geram retrabalho", rxRw.items, col1X, col1Yr, colW);
      col1Yr += 18;
      col1Yr = drawBarBlock(doc, "Pacientes têm dificuldade", rxDif.items, col1X, col1Yr, colW);

      let col2Yr = rY;
      col2Yr = drawBarBlock(doc, "Valor em ferramenta de apoio", rxVal.items, col2X, col2Yr, colW);
      drawFooter(doc, pageW, pageH, marginX);

      /* ========= PÁG. 6 — Resumo consolidado ========= */
      const HEADER_GAP = 28;
      const tableTopMargin = 14 + 72 + 12 + HEADER_GAP + TOP_GAP;

      doc.addPage();
      const drawSectionHeader = () => {
        const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(INK);
        doc.setFontSize(14);
        doc.text("Resumo consolidado por pergunta", marginX, sY + HEADER_GAP - 10);
        drawFooter(doc, pageW, pageH, marginX);
      };
      drawSectionHeader();

      let nextStartY = tableTopMargin;

      for (const q of QUESTIONS) {
        const { items, answered, unknownCount } = dist(answers, q.key, q.options);
        const body = items.filter((it) => it.count > 0).map((it) => ({ opcao: it.label, qtde: it.count, pct: it.pct }));
        if (answered === 0 && unknownCount === 0) continue;

        if (nextStartY > pageH - 200) {
          doc.addPage();
          drawSectionHeader();
          nextStartY = tableTopMargin;
        }

        autoTable(doc as any, {
          startY: nextStartY,
          styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: 6, lineColor: CARD_EDGE },
          headStyles: { fillColor: [25, 118, 210], textColor: "#ffffff", fontStyle: "bold" },
          body: body.length ? body : [{ opcao: "—", qtde: 0, pct: "0%" }],
          columns: [
            { header: q.label, dataKey: "opcao" },
            { header: "Qtde", dataKey: "qtde" },
            { header: "% (entre respondentes)", dataKey: "pct" },
          ],
          columnStyles: {
            opcao: { cellWidth: 300, overflow: "linebreak" },
            qtde: { cellWidth: 60, halign: "right" },
            pct:  { cellWidth: 160, halign: "right" },
          },
          tableWidth: pageW - marginX * 2,
          margin: { left: marginX, right: marginX, top: tableTopMargin, bottom: 26 },
          theme: "grid",
          rowPageBreak: "auto",
          foot: [[`Não respondido: ${unknownCount} (${((unknownCount / answers.length) * 100 || 0).toFixed(0)}% do total)`, "", ""]],
          footStyles: { fontSize: 9, textColor: INK_SOFT },
          didDrawPage: () => drawSectionHeader(),
        });

        nextStartY = (doc as any).lastAutoTable.finalY + 28;
      }

      /* ========= PÁGs. 7+ — Respostas detalhadas (curadas em partes) ========= */
      const allKeys = answers.length ? Array.from(new Set(answers.flatMap((a) => Object.keys(a ?? {})))) : [];
      const questionKeys = allKeys.filter((k) => k.startsWith("q_") && !SENSITIVE_KEYS.has(k));
      const includeComments = allKeys.includes("comments") && !SENSITIVE_KEYS.has("comments");

      const groups = chunk(questionKeys, 6);
      if (includeComments && groups.length) groups[groups.length - 1].push("comments");
      else if (includeComments) groups.push(["comments"]);

      const detailTitle = "Respostas detalhadas (sem identificação sensível)";
      for (let gi = 0; gi < groups.length; gi++) {
        const cols = groups[gi];
        const detailCols = cols.map((k) => ({ header: HEADER_MAP[k] ?? k, dataKey: k }));
        const detailBody = answers.map((a) => {
          const row: Record<string, any> = {};
          cols.forEach((k) => {
            let v = (a as any)[k];
            if (typeof v === "boolean") v = v ? "Sim" : "Não";
            if (v == null || v === "") v = "—";
            row[k] = v;
          });
          return row;
        });

        const colStyles: Record<string, any> = {};
        cols.forEach((k) => {
          colStyles[k] = { cellWidth: k === "comments" ? 260 : 120, overflow: "linebreak" };
        });

        doc.addPage();
        autoTable(doc as any, {
          styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: 5, lineColor: CARD_EDGE },
          headStyles: { fillColor: [37, 117, 252], textColor: "#ffffff", fontStyle: "bold", valign: "middle" },
          body: detailBody,
          columns: detailCols,
          columnStyles: colStyles,
          tableWidth: pageW - marginX * 2,
          margin: { left: marginX, right: marginX, top: 14 + 72 + 12 + 28 + TOP_GAP, bottom: 26 },
          theme: "grid",
          rowPageBreak: "auto",
          didDrawPage: () => {
            const sY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(INK);
            doc.setFontSize(14);
            const suffix = groups.length > 1 ? ` — parte ${gi + 1}/${groups.length}` : "";
            doc.text(detailTitle + suffix, marginX, sY + 28 - 10);
            drawFooter(doc, pageW, pageH, marginX);
          },
        });
      }

      // salvar
      const fileName = `Relatorio_Pesquisa_${new Intl.DateTimeFormat("pt-BR").format(new Date())}.pdf`;
      doc.save(fileName);
    } finally {
      setLoading(false);
    }
  }, [answers, kpi, summaryRows]);

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex items-center rounded-xl px-4 py-2 font-medium text-white disabled:opacity-60"
      style={{
        background: "linear-gradient(90deg, #1976d2, #2575fc)",
        boxShadow: "0 6px 16px rgba(25,118,210,.25)",
      }}
    >
      {loading ? "Gerando PDF..." : "Exportar PDF (apresentação)"}
    </button>
  );
}
