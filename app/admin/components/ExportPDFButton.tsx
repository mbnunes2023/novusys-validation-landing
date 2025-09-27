"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from "react";
import type React from "react";
import jsPDF, { jsPDFOptions } from "jspdf";

/* ===================== Tipos ===================== */

type Answer = Record<string, any>;

type Props = {
  answers: Answer[];
};

/* ===================== Branding / Layout ===================== */

const BRAND_BLUE = "#1976d2";
const INK = "#0f172a";
const INK_SOFT = "#64748b";
const CARD_EDGE = "#e9edf7";

/* ===================== Utils ===================== */

function formatNow(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

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

const TOP_GAP = 24;

function drawHeader(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, pageW, 6, "F");

  const headerH = 72;
  const cardX = marginX;
  const cardY = 14;
  const cardW = pageW - marginX * 2;

  doc.setFillColor("#ffffff");
  doc.setDrawColor(CARD_EDGE);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardY, cardW, headerH, 10, 10, "FD");

  const centerY = cardY + headerH / 2;
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

  if (logoDataUrl) {
    const targetW = 170;
    const targetH = 50;
    const padRight = 18;
    const imgX = cardX + cardW - padRight - targetW;
    const imgY = centerY - targetH / 2;
    try {
      doc.addImage(logoDataUrl, "PNG", imgX, imgY, targetW, targetH);
    } catch {}
  }

  return cardY + headerH + 12 + TOP_GAP;
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, marginX: number) {
  const left = "Relatório gerado automaticamente";
  const right = `p. ${doc.getCurrentPageInfo().pageNumber}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);
  doc.text(left, marginX, pageH - 14);
  const rightW = doc.getTextWidth(right);
  doc.text(right, pageW - marginX - rightW, pageH - 14);
}

/* ===================== Helpers dos cartões ===================== */

function safeText(v: any): string {
  if (v == null || v === "") return "Não informado";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
}

function pillTone(text: string) {
  const v = text.toLowerCase();
  if (v.includes("não informado") || v === "—")
    return { fill: "#F1F5F9", stroke: "#E2E8F0", text: "#475569" };
  if (v === "não")
    return { fill: "#FEF2F2", stroke: "#FECACA", text: "#B91C1C" };
  if (v === "sim")
    return { fill: "#ECFDF5", stroke: "#BBF7D0", text: "#047857" };
  if (["às vezes", "parcialmente", "em parte", "raramente", "talvez"].includes(v))
    return { fill: "#FFFBEB", stroke: "#FDE68A", text: "#B45309" };
  return { fill: "#F6F9FF", stroke: "#E0E7FF", text: BRAND_BLUE };
}

function drawPill(doc: jsPDF, x: number, y: number, text: string) {
  const padX = 7;
  const tone = pillTone(text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const w = doc.getTextWidth(text) + padX * 2;
  const h = 20;
  doc.setDrawColor(tone.stroke as any);
  doc.setFillColor(tone.fill as any);
  doc.roundedRect(x, y, w, h, 9, 9, "FD");
  doc.setTextColor(tone.text as any);
  doc.text(text, x + padX, y + 13);
  return { width: w, height: h };
}

function renderDetailedAsCards(
  doc: jsPDF,
  answers: Answer[],
  pageW: number,
  pageH: number,
  marginX: number,
  title: string,
  logoDataUrl?: string | null
) {
  const COLS = answers.length >= 8 ? 4 : 2;
  const GAP_X = answers.length >= 8 ? 14 : 20;
  const colW = (pageW - marginX * 2 - GAP_X * (COLS - 1)) / COLS;

  const MIN_CARD_H = 300;
  const TITLE_TO_ID = 12;
  const SECTION_TITLE_GAP = 10;
  const BETWEEN_SECTIONS = 14;
  const BETWEEN_ROWS = 12;

  let startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
  drawFooter(doc, pageW, pageH, marginX);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  doc.setFontSize(14);
  doc.text("Respostas detalhadas (cartões)", marginX, startY + 2);
  let y = startY + 16;

  answers.forEach((a, idx) => {
    const col = idx % COLS;
    const x = marginX + col * (colW + GAP_X);

    const commentRaw = (a.comments || "").toString().trim();
    const comment = commentRaw ? commentRaw : "";
    const lineH = 16;
    const commentLines = comment ? doc.splitTextToSize(comment, colW - 24) : [];
    const commentH = commentLines.length ? commentLines.length * lineH + 6 : 0;

    let estH = 22 + TITLE_TO_ID +
      12 + SECTION_TITLE_GAP + 22 + BETWEEN_SECTIONS +
      12 + SECTION_TITLE_GAP + 22 + BETWEEN_SECTIONS +
      12 + SECTION_TITLE_GAP + 22 +
      (comment ? BETWEEN_ROWS + 14 + commentH : 0) + 16;

    let cardH = Math.max(MIN_CARD_H, estH);

    if (y + cardH > pageH - 60) {
      doc.addPage();
      startY = drawHeader(doc, pageW, marginX, title, logoDataUrl);
      drawFooter(doc, pageW, pageH, marginX);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(14);
      doc.text("Respostas detalhadas (cartões)", marginX, startY + 2);
      y = startY + 16;
    }

    doc.setDrawColor(CARD_EDGE);
    doc.setFillColor("#ffffff");
    doc.roundedRect(x, y, colW, cardH, 12, 12, "FD");

    const code = `R-${String(idx + 1).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(12);
    doc.text(`Resposta ${code}`, x + 12, y + 20);

    const consent = !!(a.consent_contact || a.consent);
    let cursorY = y + 20 + TITLE_TO_ID;
    if (consent) {
      const idLine = [safeText(a.doctor_name), safeText(a.crm), safeText(a.contact)]
        .filter((t) => t && t !== "Não informado").join(" • ");
      if (idLine) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(INK_SOFT);
        doc.setFontSize(9.8);
        doc.text(idLine, x + 12, cursorY, { maxWidth: colW - 24 });
        cursorY += 14;
      }
    }

    // No-show
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.setFontSize(11);
    doc.text("No-show", x + 12, cursorY + 12);
    let rowY = cursorY + 12 + SECTION_TITLE_GAP;
    let px = x + 12;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_relevance)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_noshow_has_system)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_noshow_financial_impact));
    cursorY = rowY + 22 + BETWEEN_SECTIONS;

    // Glosas
    doc.text("Glosas", x + 12, cursorY);
    rowY = cursorY + SECTION_TITLE_GAP;
    px = x + 12;
    px += drawPill(doc, px, rowY, safeText(a.q_glosa_is_problem)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_glosa_interest)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_glosa_who_suffers));
    cursorY = rowY + 22 + BETWEEN_SECTIONS;

    // Receitas digitais
    doc.text("Receitas digitais", x + 12, cursorY);
    rowY = cursorY + SECTION_TITLE_GAP;
    px = x + 12;
    px += drawPill(doc, px, rowY, safeText(a.q_rx_rework)).width + 8;
    px += drawPill(doc, px, rowY, safeText(a.q_rx_elderly_difficulty)).width + 8;
    drawPill(doc, px, rowY, safeText(a.q_rx_tool_value));
    cursorY = rowY + 22;

    if (commentLines.length) {
      cursorY += BETWEEN_ROWS;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK);
      doc.setFontSize(11);
      doc.text("Comentário (resumo)", x + 12, cursorY + 12);
      cursorY += 16;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(INK);
      doc.setFontSize(10.5);
      doc.text(commentLines, x + 12, cursorY);
      cursorY += commentH;
    }

    const usedH = cursorY + 16 - y;
    if (usedH > cardH) {
      cardH = usedH;
      doc.setDrawColor(CARD_EDGE);
      doc.setFillColor("#ffffff");
      doc.roundedRect(x, y, colW, cardH, 12, 12);
    }

    if (col === (COLS - 1)) y += cardH + 14;
  });
}

/* ===================== Componente ===================== */

export default function ExportPDFButton_CARDS_ONLY({ answers }: Props) {
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

      renderDetailedAsCards(doc, answers, pageW, pageH, marginX, title, logoDataUrl);

      doc.save("relatorio_pesquisa_cartoes.pdf");
    } finally {
      setLoading(false);
    }
  }, [answers]);

  return (
    <button
      onClick={onExport}
      disabled={loading}
      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? "Gerando..." : "Exportar PDF (só cartões)"}
    </button>
  );
}
