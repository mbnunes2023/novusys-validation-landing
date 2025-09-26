"use client";

import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as htmlToImage from "html-to-image";
import dayjs from "dayjs";

// ========= helpers =========

// carrega /logo.png como dataURL
async function loadLogoDataURL(path = "/logo.png"): Promise<string> {
  const res = await fetch(path);
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Converte o primeiro <svg> dentro de um contêiner (ex.: wrapper do Recharts) em PNG dataURL
async function svgContainerToPngDataURL(container: HTMLElement, scale = 2): Promise<string | null> {
  const svg = container.querySelector("svg");
  if (!svg) return null;

  const xml = new XMLSerializer().serializeToString(svg);
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
  const image64 = "data:image/svg+xml;base64," + svg64;

  // cria canvas e converte
  const img = new Image();
  img.src = image64;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = (img.width || svg.clientWidth) * scale;
  canvas.height = (img.height || svg.clientHeight) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png");
}

// ========= tipos esperados =========

type AnswerRow = {
  created_at: string;
  doctor_name: string | null;
  crm: string | null;
  contact: string | null;

  doctor_role: string | null;
  clinic_size: string | null;

  q_noshow_relevance: string | null;
  q_noshow_has_system: string | null;
  q_noshow_financial_impact: string | null;

  q_glosa_is_problem: string | null;
  q_glosa_interest: string | null;
  q_glosa_who_suffers: string | null;

  q_rx_rework: string | null;
  q_rx_elderly_difficulty: string | null;
  q_rx_tool_value: string | null;

  comments: string | null;
};

type KPI = {
  total: number;
  noshowYesPct: number;
  glosaRecorrentePct: number;
  rxReworkPct: number;
};

// ========= componente =========

export default function ExportPDFButton({
  kpi,
  summaryRows,           // linhas agregadas (ex.: [{pergunta:'No-show relevante?', Sim:10, Não:3, Parcialmente:2}, ...])
  answers,               // respostas (para tabela e comentários)
  chartRefs,             // { noshowRef: ref<HTMLDivElement>, glosaRef: ref<HTMLDivElement>, rxRef: ref<HTMLDivElement> }
}: {
  kpi: KPI;
  summaryRows: Array<{ pergunta: string; [key: string]: string | number }>;
  answers: AnswerRow[];
  chartRefs: {
    noshowRef?: React.RefObject<HTMLDivElement>;
    glosaRef?: React.RefObject<HTMLDivElement>;
    rxRef?: React.RefObject<HTMLDivElement>;
  };
}) {
  const [loading, setLoading] = useState(false);

  const brand = {
    primary: "#1976d2",
    gradient: "linear-gradient(135deg,#1976d2 0%,#6a11cb 50%,#2575fc 100%)",
  };

  async function handleExport() {
    try {
      setLoading(true);

      const doc = new jsPDF({
        orientation: "p",
        unit: "pt",
        format: "a4",
      });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 36; // 0.5"
      let y = margin;

      // === header com logo + tarja ===
      const logo = await loadLogoDataURL("/logo.png");
      const logoW = 110;
      const logoH = 110;

      // tarja em gradiente (simulado com retângulo azul claro + texto)
      doc.setFillColor(240, 245, 255);
      doc.rect(0, 0, pageW, 64, "F");

      // logo
      doc.addImage(logo, "PNG", margin, 16, logoW, logoH * (64 / logoH)); // caber na tarja

      // título
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(20);
      doc.text("Relatório da Pesquisa — Clínicas e Consultórios", margin + logoW + 14, 42);

      // subtítulo
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90);
      doc.text(`Gerado em ${dayjs().format("DD/MM/YYYY HH:mm")}`, margin + logoW + 14, 60);

      y = 88;

      // === KPIs ===
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(25);
      doc.text("Visão Geral", margin, y);
      y += 12;

      // cartões KPI
      const cardW = (pageW - margin * 2 - 24) / 3;
      const cardH = 64;

      const drawKpi = (x: number, title: string, value: string) => {
        doc.setDrawColor(225);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, cardW, cardH, 8, 8, "FD");
        doc.setFontSize(10);
        doc.setTextColor(105);
        doc.text(title, x + 12, y + 20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.setTextColor(20);
        doc.text(value, x + 12, y + 44);
        doc.setFont("helvetica", "normal");
      };

      drawKpi(margin, "Total de respostas", String(kpi.total));
      drawKpi(margin + cardW + 12, "% que consideram no-show relevante", `${kpi.noshowYesPct.toFixed(0)}%`);
      drawKpi(margin + (cardW + 12) * 2, "% que relatam glosas recorrentes", `${kpi.glosaRecorrentePct.toFixed(0)}%`);

      y += cardH + 24;

      // === gráficos (se existirem) ===
      const addChart = async (title: string, ref?: React.RefObject<HTMLDivElement>) => {
        if (!ref?.current) return;
        const dataUrl = await svgContainerToPngDataURL(ref.current, 2);
        if (!dataUrl) return;

        // título
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(25);
        doc.text(title, margin, y);

        // imagem
        const imgW = pageW - margin * 2;
        const imgH = (imgW * 9) / 25; // proporção wide
        y += 8;
        doc.addImage(dataUrl, "PNG", margin, y, imgW, imgH, undefined, "FAST");
        y += imgH + 18;

        // quebra de página se necessário
        if (y > doc.internal.pageSize.getHeight() - 140) {
          doc.addPage();
          y = margin;
        }
      };

      await addChart("Distribuição — No-show relevante", chartRefs.noshowRef);
      await addChart("Distribuição — Glosas (recorrência / interesse)", chartRefs.glosaRef);
      await addChart("Distribuição — Receitas digitais / Telemedicina", chartRefs.rxRef);

      // === tabela resumo ===
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(25);
      doc.text("Resumo por pergunta", margin, y);
      y += 6;

      autoTable(doc, {
        startY: y + 6,
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [25, 118, 210], textColor: 255 },
        bodyStyles: { fillColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 251, 255] },
        margin: { left: margin, right: margin },
        head: [
          Object.keys(summaryRows[0] || { pergunta: "", Sim: "", Não: "", Parcialmente: "" }),
        ],
        body: summaryRows.map((row) => Object.values(row)),
      });

      y = (doc as any).lastAutoTable?.finalY || y + 24;

      // === comentários (amostra) ===
      const comments = answers
        .map((r) => r.comments?.trim())
        .filter(Boolean) as string[];

      if (comments.length) {
        if (y > doc.internal.pageSize.getHeight() - 160) {
          doc.addPage();
          y = margin;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(25);
        doc.text("Amostra de comentários (sem dados sensíveis)", margin, y);

        const sample = comments.slice(0, 15).map((c, i) => ({ idx: i + 1, c }));

        autoTable(doc, {
          startY: y + 8,
          styles: { fontSize: 9, cellPadding: 6 },
          headStyles: { fillColor: [25, 118, 210], textColor: 255 },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: 28, halign: "right" },
            1: { cellWidth: pageW - margin * 2 - 28 },
          },
          head: [["#", "Comentário"]],
          body: sample.map((s) => [String(s.idx), s.c]),
        });

        y = (doc as any).lastAutoTable?.finalY || y + 24;
      }

      // === rodapé ===
      const footerY = doc.internal.pageSize.getHeight() - 22;
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        `© ${new Date().getFullYear()} NovuSys — Todos os direitos reservados.`,
        margin,
        footerY
      );

      doc.save(`Relatorio-Pesquisa-${dayjs().format("YYYYMMDD-HHmm")}.pdf`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="btn btn-primary"
      style={{ backgroundImage: loading ? "none" : undefined }}
    >
      {loading ? "Gerando PDF…" : "Exportar PDF"}
    </button>
  );
}
