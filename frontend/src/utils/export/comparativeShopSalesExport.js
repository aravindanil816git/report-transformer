import { jsPDF } from "jspdf";

const cleanLabel = (text) => {
  if (!text) return "";
  let t = String(text).trim();
  if (t === "OVERALL TOTAL") return "TOTAL";
  if (t.endsWith(" Total")) {
    return t.substring(0, t.length - 6).trim();
  }
  return t;
};

const getColValue = (row, colIndex) => {
  switch (colIndex) {
    case 1: return row.opening;
    case 2: return row.receipt !== undefined ? row.receipt : row.inward;
    case 3: return row.sales !== undefined ? row.sales : row.outward;
    case 4: return row.closing;
    case 5: return row.difference;
    case 6: return row.perc;
    case 7: return row.closing_stock_at_sales_perc;
    case 8: return row.avg_sales_per_day;
    case 9: return row.last_month_avg;
    case 10: return row.avg_diff;
    default: return "";
  }
};

const formatColText = (val, colIndex, useWholeNumbers) => {
  if (val === null || val === undefined || val === "") return "-";
  const num = Number(val);
  if (isNaN(num)) return String(val);
  if (colIndex === 6 || colIndex === 7) {
    if (num === 0) return "-";
    const formatted = useWholeNumbers ? Math.round(num) : num.toFixed(2);
    return `${formatted}%`;
  }
  if (num === 0) return "-";
  return useWholeNumbers ? Math.round(num).toString() : num.toFixed(2);
};

const getSellThroughTier = (val, row) => {
  let numVal = val;
  if (typeof val === "string") {
    numVal = val.replace("%", "").trim();
  }
  const op = Number(row?.opening || 0);
  const rec = Number(row?.receipt !== undefined ? row.receipt : (row?.inward || 0));
  const sal = Number(row?.sales !== undefined ? row.sales : (row?.outward || 0));
  const cl = Number(row?.closing || 0);

  const parsed = (numVal !== null && numVal !== undefined && numVal !== "") ? Number(numVal) : NaN;
  const isNoActivity = (op === 0 && rec === 0 && sal === 0 && cl === 0) || isNaN(parsed);

  if (isNoActivity) {
    return {
      fill: "#ECEFF1",
      textDark: "#6B7280",
      textBright: "#B0BEC5"
    };
  }
  if (parsed >= 80) {
    return {
      fill: "#BBDEFB",
      textDark: "#1565C0",
      textBright: "#4FC3F7"
    };
  }
  if (parsed >= 60) {
    return {
      fill: "#DCEDC8",
      textDark: "#2E7D32",
      textBright: "#81C784"
    };
  }
  if (parsed >= 40) {
    return {
      fill: "#FFE0B2",
      textDark: "#E65100",
      textBright: "#FFB74D"
    };
  }
  return {
    fill: "#FFCDD2",
    textDark: "#C62828",
    textBright: "#E57373"
  };
};

const getHeaderUnbreakableWords = (colIndex, firstColHeader) => {
  if (colIndex === 0) {
    return String(firstColHeader).toUpperCase().split(/\s+/);
  }
  const map = {
    1: ["OPENING"],
    2: ["RECEIPT"],
    3: ["SALES"],
    4: ["CLOSING"],
    5: ["STOCK", "NET"],
    6: ["STOCK", "NET %"],
    7: ["SELL-", "THROUGH %"],
    8: ["CM"],
    9: ["LM"],
    10: ["TREND"]
  };
  return map[colIndex] || [];
};

export const exportComparativeShopSalesPdf = ({
  title,
  periodLabel,
  data,
  filename = "comparative_shopsales.pdf",
  useWholeNumbers = false,
  firstColHeader = "BOND",
  loadingLastMonth = false
}) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [595.276, 841.890]
  });

  const PAD = 4.0;
  let fontSize = 11.0;
  let colWidths = [];

  // Font-scaling loop
  while (fontSize > 4.0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    colWidths = [];

    for (let c = 0; c < 11; c++) {
      let maxValWidth = 0;

      data.forEach((row) => {
        const isOverallTotal = row.isTotal || row.isOverallTotal || String(row[firstColHeader] || row.warehouse || "").toLowerCase().includes("overall");
        const isClusterTotal = row.isClusterTotal && !isOverallTotal;

        doc.setFont("helvetica", (isClusterTotal || isOverallTotal) ? "bold" : "normal");

        let valStr = "";
        if (c === 0) {
          valStr = cleanLabel(row.shop_code ? row.shop_name : (row.bond || row.warehouse));
        } else {
          const val = getColValue(row, c);
          if (c === 10) {
            const num = Number(val);
            if (val !== null && val !== undefined && val !== "" && !isNaN(num) && num !== 0) {
              const formattedDiff = Math.abs(num).toFixed(useWholeNumbers ? 0 : 2);
              const signedText = (num > 0 ? "+" : "-") + formattedDiff;
              const textW = doc.getTextWidth(signedText);
              const triW = 0.52 * fontSize;
              const gapW = 0.30 * fontSize;
              maxValWidth = Math.max(maxValWidth, textW + triW + gapW);
              return;
            }
          }
          valStr = formatColText(val, c, useWholeNumbers);
        }

        const w = doc.getTextWidth(valStr);
        maxValWidth = Math.max(maxValWidth, w);
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);

      const words = getHeaderUnbreakableWords(c, firstColHeader);
      let maxWordWidth = 0;
      words.forEach(word => {
        maxWordWidth = Math.max(maxWordWidth, doc.getTextWidth(word));
      });

      const maxContentWidth = Math.max(maxValWidth, maxWordWidth);
      const padSpace = (c === 0) ? (3 * PAD) : (2 * PAD);
      colWidths[c] = maxContentWidth + padSpace;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const bannerWidth = doc.getTextWidth("AVERAGE SALES / DAY") + 2 * PAD;
    const avgGroupWidth = colWidths[8] + colWidths[9] + colWidths[10];
    if (avgGroupWidth < bannerWidth) {
      const diff = bannerWidth - avgGroupWidth;
      colWidths[8] += diff / 3;
      colWidths[9] += diff / 3;
      colWidths[10] += diff / 3;
    }

    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    if (totalWidth > 595.276) {
      fontSize -= 0.25;
    } else {
      const leftover = 595.276 - totalWidth;
      for (let c = 0; c < 11; c++) {
        colWidths[c] = colWidths[c] + leftover * (colWidths[c] / totalWidth);
      }
      break;
    }
  }

  // Calculate cell X boundaries
  const colX = [0];
  for (let c = 0; c < 11; c++) {
    colX.push(colX[c] + colWidths[c]);
  }

  const rowsPerPage = 19;
  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage([595.276, 841.890], "portrait");
    }

    // 1. Navy masthead
    doc.setFillColor(11, 41, 79); // #0B294F
    doc.rect(0, 0, 595.276, 46.0, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 189, 49); // #FFBD31 (Gold)
    doc.text("K.S DISTILLERY", 595.276 / 2, 29.0, { align: "center" });

    // 2. Gold band
    doc.setFillColor(255, 189, 49); // #FFBD31
    doc.rect(0, 46.0, 595.276, 34.0, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(11, 41, 79); // #0B294F (Navy)
    doc.text(title.toUpperCase(), 3 * PAD, 67.0, { align: "left" });
    const cleanPeriod = (periodLabel || "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
    doc.text(cleanPeriod, 595.276 - 3 * PAD, 67.0, { align: "right" });

    // 3. Header rows
    // Row 1 background (Navy)
    doc.setFillColor(11, 41, 79);
    doc.rect(0, 80.0, 595.276, 30.0, "F");

    // Row 2 background (Navy)
    doc.setFillColor(11, 41, 79);
    doc.rect(0, 110.0, 595.276, 32.0, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);

    // Render header texts
    // Cols 0 to 7 span both rows (centered vertically around y = 111.0)
    const headers = [
      firstColHeader.toUpperCase(),
      "OPENING",
      "RECEIPT",
      "SALES",
      "CLOSING",
      "STOCK\nNET",
      "STOCK\nNET %",
      "SELL-\nTHROUGH %"
    ];

    headers.forEach((hdr, c) => {
      doc.setTextColor(255, 255, 255);
      const align = c === 0 ? "left" : "center";
      const x = c === 0 ? colX[c] + 3 * PAD : colX[c] + colWidths[c] / 2;
      doc.text(hdr, x, 111.0, { align, baseline: "middle" });
    });

    // AVERAGE SALES / DAY banner
    doc.setTextColor(255, 189, 49); // Gold
    const avgX = (colX[8] + colX[11]) / 2;
    doc.text("AVERAGE SALES / DAY", avgX, 95.0, { align: "center", baseline: "middle" });

    // subheaders under the group banner
    doc.setTextColor(255, 255, 255);
    doc.text("CM", colX[8] + colWidths[8] / 2, 126.0, { align: "center", baseline: "middle" });
    doc.text("LM", colX[9] + colWidths[9] / 2, 126.0, { align: "center", baseline: "middle" });
    doc.text("TREND", colX[10] + colWidths[10] / 2, 126.0, { align: "center", baseline: "middle" });

    // Gold Header grid rules
    doc.setDrawColor(255, 189, 49); // GOLD

    // Outer edge rules (top at 80.0, bottom at 142.0), inset by half of width (2.2)
    doc.setLineWidth(2.2);
    doc.line(0, 80.0 + 1.1, 595.276, 80.0 + 1.1); // top edge
    doc.line(0, 142.0 - 1.1, 595.276, 142.0 - 1.1); // bottom edge

    // Column separators inside the header (width 1.6)
    doc.setLineWidth(1.6);
    for (let c = 1; c < 11; c++) {
      const x = colX[c];
      if (c === 8) {
        // Separator at left edge of AVERAGE SALES / DAY must run full height (80.0 to 142.0)
        doc.line(x, 80.0, x, 142.0);
      } else if (c === 9 || c === 10) {
        // Internal group separators run only the sub-label row height (110.0 to 142.0)
        doc.line(x, 110.0, x, 142.0);
      } else {
        // Other separators run full height
        doc.line(x, 80.0, x, 142.0);
      }
    }

    // Horizontal line under AVERAGE SALES / DAY banner (width 1.6, spans col 8 to 11)
    doc.line(colX[8], 110.0, colX[11], 110.0);

    // 4. Body rows
    const pageRows = data.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);
    const rowHeight = 35.68;
    const startY = 142.0;

    pageRows.forEach((row, localRIdx) => {
      const globalRIdx = pageIdx * rowsPerPage + localRIdx;
      const y = startY + localRIdx * rowHeight;

      const isOverallTotal = row.isTotal || row.isOverallTotal || String(row[firstColHeader] || row.warehouse || "").toLowerCase().includes("overall");
      const isClusterTotal = row.isClusterTotal && !isOverallTotal;
      const isTotalRow = isClusterTotal || isOverallTotal;

      // Determine row background color
      let rowBg = "#FFFFFF";
      if (isOverallTotal) {
        rowBg = "#FFBD31"; // GOLD
      } else if (isClusterTotal) {
        rowBg = "#0B294F"; // NAVY
      } else {
        rowBg = (globalRIdx % 2 === 0) ? "#F5F7FC" : "#FFFFFF"; // ZEBRA or white
      }

      // Draw cell backgrounds
      for (let c = 0; c < 11; c++) {
        let cellBg = rowBg;
        if (!isTotalRow && c === 7) {
          const val = getColValue(row, 7);
          const tier = getSellThroughTier(val, row);
          cellBg = tier.fill;
        }

        doc.setFillColor(cellBg);
        doc.rect(colX[c], y, colWidths[c], rowHeight, "F");
      }

      // Draw values
      doc.setFontSize(fontSize);

      for (let c = 0; c < 11; c++) {
        const val = getColValue(row, c);

        if (isOverallTotal) {
          doc.setTextColor(11, 41, 79); // Navy text on gold row
          doc.setFont("helvetica", "bold");
        } else if (isClusterTotal) {
          doc.setTextColor(255, 189, 49); // Gold text on navy row
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(15, 25, 45); // INK soft
          doc.setFont("helvetica", "normal");
        }

        const baselineY = y + rowHeight / 2;

        if (c === 0) {
          const label = cleanLabel(row.shop_code ? row.shop_name : (row.bond || row.warehouse));
          doc.text(label, colX[c] + 3 * PAD, baselineY, { align: "left", baseline: "middle" });
        } else if (c === 7) {
          // Sell-through percentage: color driven by tier
          doc.setFont("helvetica", "bold");
          const tier = getSellThroughTier(val, row);
          let textColor = tier.textDark;
          if (isClusterTotal) {
            textColor = tier.textBright;
          }
          doc.setTextColor(textColor);
          const text = formatColText(val, c, useWholeNumbers);
          doc.text(text, colX[c] + colWidths[c] / 2, baselineY, { align: "center", baseline: "middle" });
        } else if (c === 10) {
          // Trend column
          const num = Number(val);
          if (val === null || val === undefined || val === "" || isNaN(num) || num === 0) {
            // Draw regular dash
            const text = formatColText(val, c, useWholeNumbers);
            doc.text(text, colX[c] + colWidths[c] / 2, baselineY, { align: "center", baseline: "middle" });
          } else {
            // Trend arrow + value centered as a unit
            const formattedDiff = Math.abs(num).toFixed(useWholeNumbers ? 0 : 2);
            const signedText = (num > 0 ? "+" : "-") + formattedDiff;

            const textW = doc.getTextWidth(signedText);
            const triW = 0.52 * fontSize;
            const gapW = 0.30 * fontSize;
            const totalW = textW + triW + gapW;

            const cellCenter = colX[c] + colWidths[c] / 2;
            const startX = cellCenter - totalW / 2;
            const triX = startX + triW / 2;

            // Trend color selection
            let trendColor = "#3F8600";
            if (isOverallTotal) {
              trendColor = num > 0 ? "#3F8600" : "#CF1322";
            } else if (isClusterTotal) {
              trendColor = num > 0 ? "#90EE90" : "#FFB6C1";
            } else {
              trendColor = num > 0 ? "#3F8600" : "#CF1322";
            }

            doc.setFillColor(trendColor);
            doc.setDrawColor(trendColor);

            // Draw triangle
            const size = triW;
            const triY = baselineY; // center vertically
            if (num > 0) {
              doc.triangle(triX, triY - size / 2, triX - size / 2, triY + size / 2, triX + size / 2, triY + size / 2, "FD");
            } else {
              doc.triangle(triX, triY + size / 2, triX - size / 2, triY - size / 2, triX + size / 2, triY - size / 2, "FD");
            }

            // Draw text
            doc.setFont("helvetica", "bold");
            doc.setTextColor(trendColor);
            doc.text(signedText, startX + triW + gapW, baselineY, { align: "left", baseline: "middle" });
          }
        } else {
          // General column value
          const text = formatColText(val, c, useWholeNumbers);
          doc.text(text, colX[c] + colWidths[c] / 2, baselineY, { align: "center", baseline: "middle" });
        }
      }

      // Framing rules top/bottom for cluster bands and total row
      if (isTotalRow) {
        const frameColor = isOverallTotal ? "#0B294F" : "#FFBD31"; // Navy rules on Total row, Gold rules on Cluster bands
        doc.setDrawColor(frameColor);
        doc.setLineWidth(1.6);
        doc.line(0, y, 595.276, y);
        doc.line(0, y + rowHeight, 595.276, y + rowHeight);
      }
    });
  }

  doc.save(filename);
};
