import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import dayjs from "dayjs";

export const exportShopSalesExcel = async (data, metadata = {}, filename = "shop_sales_daily.xlsx", sheetName = "Shop Sales Daily") => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  const navyColor = "0B294F";       // Deep Navy #0B294F
  const goldColor = "FFBD31";       // Gold #FFBD31
  const brandHeaderBg = "0B294F";   // Navy background for Brand headers
  const brandHeaderFg = "FFFFFF";   // White text for Brand headers
  const zebraBg = "F5F7FC";         // Light zebra fill
  const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

  // Set initial row heights
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 24;

  const reportTitle = (metadata.Title || "SHOP SALES CUMULATIVE").toUpperCase();
  const periodStr = (metadata.Period || "").replace(/^COMBINED PERIOD\s*:\s*/i, "").replace(/^Report Period:\s*/i, "").trim();

  // Row 1: K.S DISTILLERY Header Banner
  ws.mergeCells("A1:E1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "K.S DISTILLERY";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Row 2: Subtitle Banner (Report Name on Left, Period on Right)
  ws.mergeCells("A2:C2");
  ws.mergeCells("D2:E2");

  const subtitleReportCell = ws.getCell("A2");
  subtitleReportCell.value = reportTitle;
  subtitleReportCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitleReportCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitleReportCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  const subtitlePeriodCell = ws.getCell("D2");
  subtitlePeriodCell.value = periodStr;
  subtitlePeriodCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitlePeriodCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitlePeriodCell.alignment = { horizontal: "right", vertical: "middle" };

  for (let c = 1; c <= 5; c++) {
    const cell = ws.getCell(2, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  }

  const shopNameStr = (metadata.Shop || metadata.Warehouse || "").replace(/^\d{6}-/, "").toUpperCase();
  const bondNameStr = (metadata.Bond || "").replace(/\s+BOND$/i, "").replace(/^WH-/i, "").toUpperCase();

  // Row 3: Shop Name Banner (Shop Name on left, Bond Name on right)
  ws.mergeCells("A3:C3");
  ws.mergeCells("D3:E3");

  const shopCell = ws.getCell("A3");
  shopCell.value = shopNameStr;
  shopCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: navyColor } };
  shopCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: goldColor } };
  shopCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  const bondCell = ws.getCell("D3");
  bondCell.value = bondNameStr;
  bondCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: navyColor } };
  bondCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  bondCell.alignment = { horizontal: "right", vertical: "middle" };

  for (let c = 1; c <= 5; c++) {
    const cell = ws.getCell(3, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: goldColor } };
  }

  // Row 4: Table Column Headers (BRAND/PACK | OPENING | RECEIPT | SALES | CLOSING)
  const headers = ["BRAND/PACK", "OPENING", "RECEIPT", "SALES", "CLOSING"];
  headers.forEach((h, idx) => {
    const cell = ws.getCell(4, idx + 1);
    cell.value = h;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: idx === 0 ? "left" : "right", vertical: "middle" };
  });

  let totalOpening = 0, totalReceipt = 0, totalSales = 0, totalClosing = 0;
  let rIdx = 5;

  data.forEach((row) => {
    const rawLabel = String(row["Row Labels"] || row["brand"] || row["label"] || "");
    const label = rawLabel.trim();

    // Skip empty trailing/spacer rows
    if (!rawLabel && row["Opening"] === undefined && row["opening"] === undefined) {
      return;
    }

    const op = Number(row["Opening"] ?? row["opening"] ?? 0);
    const rec = Number(row["Receipt"] ?? row["receipt"] ?? row["inward"] ?? 0);
    const sal = Number(row["Sales"] ?? row["sales"] ?? row["outward"] ?? 0);
    const clo = Number(row["Closing"] ?? row["closing"] ?? 0);

    const isPackRow = rawLabel.startsWith("  ") || Boolean(row["pack"]);
    const isShopTotalRow = Boolean(row.isShopTotal) || label.toUpperCase().includes("TOTAL");
    const isBrandTotalRow = !isShopTotalRow && label.toUpperCase().endsWith("TOTAL");
    const isBrandHeader = !isPackRow && !isShopTotalRow && !isBrandTotalRow && (row["Opening"] === undefined || row["Opening"] === "" || row["opening"] === undefined || row["opening"] === "");
    const isShopHeader = !isPackRow && !isShopTotalRow && !isBrandTotalRow && !isBrandHeader && Boolean(row.isShopHeader);

    ws.getRow(rIdx).height = 20;

    const cellL = ws.getCell(rIdx, 1);
    cellL.value = rawLabel;
    cellL.alignment = { horizontal: "left", vertical: "middle" };

    const valCols = [op, rec, sal, clo];
    valCols.forEach((val, cIdx) => {
      const cellV = ws.getCell(rIdx, cIdx + 2);
      if (isBrandHeader) {
        cellV.value = "";
      } else {
        cellV.value = val;
        cellV.numFmt = "0.00";
      }
      cellV.alignment = { horizontal: "right", vertical: "middle" };
    });

    if (isShopTotalRow) {
      cellL.value = rawLabel;
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
        cell.border = {
          top: { style: "medium", color: { argb: goldColor } },
          bottom: { style: "medium", color: { argb: goldColor } },
          left: borderStyle,
          right: borderStyle
        };
      }
    } else if (isBrandTotalRow) {
      cellL.value = "TOTAL";
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      }
    } else if (isBrandHeader) {
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: brandHeaderFg } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandHeaderBg } };
      }
    } else {
      // Leaf pack row only
      const isZebra = rIdx % 2 === 0;
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "333333" } };
        if (isZebra) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebraBg } };
        }
      }
      totalOpening += op;
      totalReceipt += rec;
      totalSales += sal;
      totalClosing += clo;
    }

    rIdx++;
  });

  // Ensure bottom TOTAL row exists if not already included in data
  const hasBottomTotal = data.some(r => (r["Row Labels"] || "").toUpperCase().includes("TOTAL") || r.isShopTotal);
  if (!hasBottomTotal) {
    ws.getRow(rIdx).height = 22;
    const shopDisplayName = shopNameStr ? `TOTAL - ${shopNameStr}` : "TOTAL";
    ws.getCell(rIdx, 1).value = shopDisplayName;
    ws.getCell(rIdx, 2).value = totalOpening;
    ws.getCell(rIdx, 3).value = totalReceipt;
    ws.getCell(rIdx, 4).value = totalSales;
    ws.getCell(rIdx, 5).value = totalClosing;

    for (let c = 1; c <= 5; c++) {
      const cell = ws.getCell(rIdx, c);
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cell.alignment = { horizontal: c === 1 ? "left" : "right", vertical: "middle" };
      cell.border = {
        top: { style: "medium", color: { argb: goldColor } },
        bottom: { style: "medium", color: { argb: goldColor } },
        left: borderStyle,
        right: borderStyle
      };
      if (c >= 2) cell.numFmt = "0.00";
    }
    rIdx++;
  }

  // Column widths
  ws.getColumn("A").width = 42;
  ws.getColumn("B").width = 16;
  ws.getColumn("C").width = 16;
  ws.getColumn("D").width = 16;
  ws.getColumn("E").width = 16;

  // Apply default grid borders only where missing
  for (let r = 1; r < rIdx; r++) {
    for (let c = 1; c <= 5; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.border) {
        cell.border = {
          top: borderStyle,
          left: borderStyle,
          bottom: borderStyle,
          right: borderStyle
        };
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};

export const exportShopSalesDailyBondPdf = (data = [], metadata = {}, filename = "SHOP SALES DAILY - AUG 1-19 (SPEC APPLIED).pdf") => {
  try {
    // 1. Determine Date Range
    let startDate = metadata.startDate || metadata.start_date || metadata.date1;
    let endDate = metadata.endDate || metadata.end_date || metadata.date2;

    if (!startDate || !endDate) {
      if (metadata.dateRange && Array.isArray(metadata.dateRange) && metadata.dateRange.length === 2) {
        startDate = metadata.dateRange[0];
        endDate = metadata.dateRange[1];
      } else if (metadata.Period) {
        const match = String(metadata.Period).match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/g);
        if (match && match.length >= 2) {
          startDate = match[0];
          endDate = match[1];
        }
      }
    }

    const days = getDaysList(startDate, endDate);

    // 2. Define Clusters & Bonds (§15.2)
    const CLUSTERS = [
      {
        id: 1,
        name: "CLUSTER 1",
        bonds: ["ALAPPUZHA", "ATTINGAL", "KOLLAM", "KOTTARAKARA", "NEDUMANGAD", "PATHANAMTHITTA"]
      },
      {
        id: 2,
        name: "CLUSTER 2",
        bonds: ["ALUVA", "KOTTAYAM", "THODUPUZHA", "THRISSUR", "TRIPUNITHURA"]
      },
      {
        id: 3,
        name: "CLUSTER 3",
        bonds: ["KANNUR", "KOZHIKODE", "PALAKKAD", "PERINTHALMANNA"]
      }
    ];

    // 3. Build Row Structure and Compute Values (§15.1)
    const allBondRows = [];
    const clusterBlocks = [];

    CLUSTERS.forEach(cluster => {
      const sortedBonds = [...cluster.bonds].sort((a, b) => a.localeCompare(b));
      const blockBondRows = sortedBonds.map(bondName => {
        const matchedRow = findBondRow(data, bondName);
        const values = days.map(d => getDayValue(matchedRow, d));
        const totalValue = values.reduce((sum, v) => sum + v, 0);
        const rowObj = {
          type: "bond",
          label: bondName,
          values,
          totalValue
        };
        allBondRows.push(rowObj);
        return rowObj;
      });

      const clusterValues = days.map((d, dIdx) => {
        return blockBondRows.reduce((sum, r) => sum + (r.values[dIdx] || 0), 0);
      });
      const clusterTotalValue = clusterValues.reduce((sum, v) => sum + v, 0);

      const clusterRowObj = {
        type: "cluster",
        clusterId: cluster.id,
        label: cluster.name,
        values: clusterValues,
        totalValue: clusterTotalValue
      };

      clusterBlocks.push({
        clusterId: cluster.id,
        bondRows: blockBondRows,
        clusterRow: clusterRowObj
      });
    });

    // Grand Total (§15.1) — bond rows only, never cluster rows!
    const grandTotalValues = days.map((d, dIdx) => {
      return allBondRows.reduce((sum, r) => sum + (r.values[dIdx] || 0), 0);
    });
    const grandTotalTotalValue = grandTotalValues.reduce((sum, v) => sum + v, 0);

    const grandTotalRowObj = {
      type: "grand_total",
      label: "Grand Total",
      values: grandTotalValues,
      totalValue: grandTotalTotalValue
    };

    // Assert in code (§15.1)
    days.forEach((d, dIdx) => {
      const sumClusterDay = clusterBlocks.reduce((sum, b) => sum + (b.clusterRow.values[dIdx] || 0), 0);
      if (Math.abs((grandTotalValues[dIdx] || 0) - sumClusterDay) > 0.0001) {
        console.warn(`[Grand Total Mismatch Day ${d.dayNumStr}]: GT=${grandTotalValues[dIdx]}, SumClusters=${sumClusterDay}`);
      }
    });

    // Construct flat list of body rows (§2.1 Row Order)
    const bodyRows = [];
    clusterBlocks.forEach(block => {
      block.bondRows.forEach((r, idx) => {
        bodyRows.push({ ...r, blockIndex: block.clusterId, isFirstInBlock: idx === 0 });
      });
      bodyRows.push(block.clusterRow);
    });
    bodyRows.push(grandTotalRowObj);

    // 4. Create Temporary jsPDF document for measuring fonts
    const doc = new jsPDF({ unit: "pt", format: [1000, 1000] });

    const getTextWidth = (text, isBold, size) => {
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setFontSize(size);
      return doc.getStringUnitWidth(String(text || "")) * size;
    };

    // 5. Calculate Column Widths (§4)
    const labelColWidth = (allBondRows.length > 0 
      ? Math.max(...allBondRows.map(r => getTextWidth(r.label, false, 11))) 
      : 100) + 18;

    const dayColWidths = days.map((d, dIdx) => {
      const w1 = getTextWidth(d.weekdayStr, true, 10);
      const w2 = getTextWidth(d.dayNumStr, true, 10);
      const w3 = allBondRows.length > 0 
        ? Math.max(...allBondRows.map(r => getTextWidth((r.values[dIdx] || 0).toFixed(2), false, 11))) 
        : 21.406;
      const w4 = clusterBlocks.length > 0 
        ? Math.max(...clusterBlocks.map(b => getTextWidth((b.clusterRow.values[dIdx] || 0).toFixed(2), true, 11))) 
        : 21.406;
      const w5 = getTextWidth((grandTotalRowObj.values[dIdx] || 0).toFixed(2), true, 11);
      return Math.max(w1, w2, w3, w4, w5) + 10;
    });

    const wTotalHeader = getTextWidth("TOTAL", true, 10);
    const maxBodyTotalWidth = bodyRows.length > 0 
      ? Math.max(...bodyRows.map(r => getTextWidth((r.totalValue || 0).toFixed(2), true, 11))) 
      : 33.638;
    const totalColWidth = Math.max(wTotalHeader, maxBodyTotalWidth) + 10;

    // Compute Column X Offsets
    const colX = [0];
    colX.push(labelColWidth);
    let accX = labelColWidth;
    dayColWidths.forEach(w => {
      accX += w;
      colX.push(accX);
    });

    const pageWidth = accX + totalColWidth;
    const bodyRowCount = bodyRows.length;
    const pageHeight = 45.4 + 26 + 54 + 30 * bodyRowCount;

    // 6. Instantiate Main jsPDF with auto-fit page dimensions (§3)
    const pdf = new jsPDF({
      unit: "pt",
      format: [pageWidth, pageHeight],
      orientation: pageWidth > pageHeight ? "landscape" : "portrait"
    });

    const getWidth = (str, isBold, size) => {
      pdf.setFont("helvetica", isBold ? "bold" : "normal");
      pdf.setFontSize(size);
      return pdf.getStringUnitWidth(String(str || "")) * size;
    };

    // Color Tokens (§5.2) - Matched to exact reference image
    const NAVY = [11, 44, 82];          // #0B2C52 Dark Navy
    const GOLD = [250, 175, 25];        // #FAAF19 Vibrant Gold
    const ROW_TINT = [245, 247, 252];   // #F5F7FC
    const ROW_WHITE = [255, 255, 255];  // #FFFFFF
    const TEXT_VALUE = [15, 25, 45];     // #0F192D
    const TEXT_LABEL = [40, 40, 40];     // #282828
    const TEXT_ZERO = [200, 205, 215];   // #C8CDD7
    const TEXT_ZERO_GOLD = [145, 123, 63]; // #917B3F
    const GRID = [199, 199, 199];        // #C7C7C7

    // --- Painter's Order (§7.0) ---

    // 1. Brand Band (height 45.4)
    pdf.setFillColor(...NAVY);
    pdf.rect(0, 0, pageWidth, 45.4, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(...GOLD);
    const brandText = "K.S DISTILLERY";
    const wBrand = getWidth(brandText, true, 18);
    pdf.text(brandText, (pageWidth - wBrand) / 2, (45.4 + 18 * 0.7) / 2);

    // 2. Title Band (height 26, top Y = 45.4)
    pdf.setFillColor(...GOLD);
    pdf.rect(0, 45.4, pageWidth, 26, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(...NAVY);
    const pdfReportTitle = (metadata.Title || "SHOP SALES DAILY").toUpperCase();
    pdf.text(pdfReportTitle, 12, 45.4 + (26 + 13 * 0.7) / 2);

    const startD = days.length > 0 ? days[0].date : dayjs("2026-08-01");
    const endD = days.length > 0 ? days[days.length - 1].date : dayjs("2026-08-19");
    const periodStr = `${startD.format("D MMMM YYYY")} - ${endD.format("D MMMM YYYY")}`;
    const wPeriod = getWidth(periodStr, true, 13);
    pdf.text(periodStr, pageWidth - 12 - wPeriod, 45.4 + (26 + 13 * 0.7) / 2);

    // 3. Table Header (height 54 total, top Y = 71.4)
    pdf.setFillColor(...NAVY);
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(1.4);

    // Label Header Cell (spans full 54)
    pdf.rect(0, 71.4, labelColWidth, 54, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...GOLD);
    const wBondH = getWidth("BOND", true, 10);
    pdf.text("BOND", (labelColWidth - wBondH) / 2, 71.4 + (54 + 10 * 0.7) / 2);

    // Day Header Cells (Weekday tier y=71.4 h=30, Date tier y=101.4 h=24)
    days.forEach((d, dIdx) => {
      const x = colX[dIdx + 1];
      const w = dayColWidths[dIdx];

      // Weekday cell
      pdf.setFillColor(...NAVY);
      pdf.setDrawColor(...GOLD);
      pdf.setLineWidth(1.4);
      pdf.rect(x, 71.4, w, 30, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...GOLD);
      const wWk = getWidth(d.weekdayStr, true, 10);
      pdf.text(d.weekdayStr, x + (w - wWk) / 2, 71.4 + (30 + 10 * 0.7) / 2);

      // Date cell
      pdf.setFillColor(...NAVY);
      pdf.setDrawColor(...GOLD);
      pdf.setLineWidth(1.4);
      pdf.rect(x, 101.4, w, 24, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...GOLD);
      const wDt = getWidth(d.dayNumStr, true, 10);
      pdf.text(d.dayNumStr, x + (w - wDt) / 2, 101.4 + (24 + 10 * 0.7) / 2);
    });

    // TOTAL Header Cell (spans full 54)
    const totalX = colX[colX.length - 1];
    pdf.setFillColor(...NAVY);
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(1.4);
    pdf.rect(totalX, 71.4, totalColWidth, 54, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...GOLD);
    const wTotH = getWidth("TOTAL", true, 10);
    pdf.text("TOTAL", totalX + (totalColWidth - wTotH) / 2, 71.4 + (54 + 10 * 0.7) / 2);

    // 4. Two 2.0 pt GOLD Rules (§7.3, §7.6)
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(2.0);
    pdf.line(0, 72.4, pageWidth, 72.4);   // Rule under title band
    pdf.line(0, 124.4, pageWidth, 124.4); // Rule under header

    // 5. Body Rows Top-Down
    let currentY = 125.4;
    const clusterRowTopYList = [];
    let bondRowInBlockIndex = 0;

    bodyRows.forEach((row) => {
      if (row.type === "bond") {
        if (row.isFirstInBlock) {
          bondRowInBlockIndex = 0;
        }
        const fillBg = (bondRowInBlockIndex % 2 === 0) ? ROW_TINT : ROW_WHITE;
        bondRowInBlockIndex++;

        // Draw all cell rects
        pdf.setLineWidth(0.4);
        pdf.setDrawColor(...GRID);
        pdf.setFillColor(...fillBg);

        // Label cell rect
        pdf.rect(0, currentY, labelColWidth, 30, "FD");

        // Day cells rects
        days.forEach((d, dIdx) => {
          const x = colX[dIdx + 1];
          const w = dayColWidths[dIdx];
          pdf.rect(x, currentY, w, 30, "FD");
        });

        // Total cell rect
        pdf.rect(totalX, currentY, totalColWidth, 30, "FD");

        // Texts
        const baselineY = currentY + (30 + 11 * 0.7) / 2;

        // Label text
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(...TEXT_LABEL);
        pdf.text(row.label, 12, baselineY);

        // Day cell texts
        days.forEach((d, dIdx) => {
          const x = colX[dIdx + 1];
          const w = dayColWidths[dIdx];
          const valStr = (row.values[dIdx] || 0).toFixed(2);
          const isZero = (valStr === "0.00");
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);
          pdf.setTextColor(...(isZero ? TEXT_ZERO : TEXT_VALUE));
          const wVal = getWidth(valStr, false, 11);
          pdf.text(valStr, x + (w - wVal) / 2, baselineY);
        });

        // Total cell text
        const totStr = (row.totalValue || 0).toFixed(2);
        const isZero = (totStr === "0.00");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(...(isZero ? TEXT_ZERO : TEXT_VALUE));
        const wTot = getWidth(totStr, true, 11);
        pdf.text(totStr, totalX + (totalColWidth - wTot) / 2, baselineY);

      } else if (row.type === "cluster") {
        clusterRowTopYList.push(currentY);

        pdf.setLineWidth(0.4);
        pdf.setDrawColor(...GRID);
        pdf.setFillColor(...NAVY);

        // Label cell rect
        pdf.rect(0, currentY, labelColWidth, 30, "FD");

        // Day cells rects
        days.forEach((d, dIdx) => {
          const x = colX[dIdx + 1];
          const w = dayColWidths[dIdx];
          pdf.rect(x, currentY, w, 30, "FD");
        });

        // Total cell rect
        pdf.rect(totalX, currentY, totalColWidth, 30, "FD");

        // Texts
        const baselineY = currentY + (30 + 11 * 0.7) / 2;

        // Label text
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(...GOLD);
        pdf.text(row.label, 12, baselineY);

        // Day cell texts
        days.forEach((d, dIdx) => {
          const x = colX[dIdx + 1];
          const w = dayColWidths[dIdx];
          const valStr = (row.values[dIdx] || 0).toFixed(2);
          const isZero = (valStr === "0.00");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.setTextColor(...(isZero ? TEXT_ZERO : GOLD));
          const wVal = getWidth(valStr, true, 11);
          pdf.text(valStr, x + (w - wVal) / 2, baselineY);
        });

        // Total cell text
        const totStr = (row.totalValue || 0).toFixed(2);
        const isZero = (totStr === "0.00");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(...(isZero ? TEXT_ZERO : GOLD));
        const wTot = getWidth(totStr, true, 11);
        pdf.text(totStr, totalX + (totalColWidth - wTot) / 2, baselineY);

      } else if (row.type === "grand_total") {
        pdf.setLineWidth(0.4);
        pdf.setDrawColor(...GRID);
        pdf.setFillColor(...GOLD);

        // Label cell rect
        pdf.rect(0, currentY, labelColWidth, 30, "FD");

        // Day cells rects
        days.forEach((d, dIdx) => {
          const x = colX[dIdx + 1];
          const w = dayColWidths[dIdx];
          pdf.rect(x, currentY, w, 30, "FD");
        });

        // Total cell rect
        pdf.rect(totalX, currentY, totalColWidth, 30, "FD");

        // Texts
        const baselineY = currentY + (30 + 11 * 0.7) / 2;

        // Label text
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(...NAVY);
        pdf.text("Grand Total", 12, baselineY);

        // Day cell texts
        days.forEach((d, dIdx) => {
          const x = colX[dIdx + 1];
          const w = dayColWidths[dIdx];
          const valStr = (row.values[dIdx] || 0).toFixed(2);
          const isZero = (valStr === "0.00");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.setTextColor(...(isZero ? TEXT_ZERO_GOLD : NAVY));
          const wVal = getWidth(valStr, true, 11);
          pdf.text(valStr, x + (w - wVal) / 2, baselineY);
        });

        // Total cell text
        const totStr = (row.totalValue || 0).toFixed(2);
        const isZero = (totStr === "0.00");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(...(isZero ? TEXT_ZERO_GOLD : NAVY));
        const wTot = getWidth(totStr, true, 11);
        pdf.text(totStr, totalX + (totalColWidth - wTot) / 2, baselineY);
      }

      currentY += 30;
    });

    // 6. Two 1.6 pt GOLD Rules per Cluster Row (VERY LAST DRAWING OPERATIONS §7.0)
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(1.6);
    clusterRowTopYList.forEach(topY => {
      pdf.line(0, topY + 0.8, pageWidth, topY + 0.8);
      pdf.line(0, topY + 29.2, pageWidth, topY + 29.2);
    });

    // Save PDF
    pdf.save(filename);
  } catch (err) {
    console.error("Error in exportShopSalesDailyBondPdf:", err);
    throw err;
  }
};

export const exportShopSalesPdf = exportShopSalesDailyBondPdf;

// Helper functions for date & data lookup
function getDaysList(startDate, endDate) {
  let s = dayjs(startDate);
  let e = dayjs(endDate);

  if (!startDate || !endDate || !s.isValid() || !e.isValid()) {
    s = dayjs("2026-08-01");
    e = dayjs("2026-08-19");
  }

  const days = [];
  let curr = s.clone();
  let idx = 0;
  while (curr.isBefore(e) || curr.isSame(e, "day")) {
    const dayNumStr = String(curr.date());
    const weekdayStr = curr.format("ddd").toUpperCase();
    const isoKey = curr.format("YYYY-MM-DD");
    const dMmmKey = curr.format("D MMM");
    const ddMmmKey = curr.format("DD-MMM");
    const ddMmYyyyKey = curr.format("DD-MM-YYYY");
    const ddMmmDdd = `${curr.format("DD-MMM")} (${curr.format("ddd")})`;
    const dMmmDdd = `${curr.format("D-MMM")} (${curr.format("ddd")})`;

    days.push({
      index: idx,
      date: curr.clone(),
      dayNumStr,
      weekdayStr,
      keys: [ddMmmDdd, dMmmDdd, isoKey, ddMmmKey, dMmmKey, ddMmYyyyKey, dayNumStr, curr.format("DD")]
    });
    curr = curr.add(1, "day");
    idx++;
  }
  return days;
}

function findBondRow(data, bondName) {
  if (!Array.isArray(data)) return null;
  const cleanName = bondName.toUpperCase().replace(/\s*-\s*/g, " ").trim();
  return data.find(row => {
    const rName = String(
      row.bond || row.bond_name || row.warehouse || row["Row Labels"] || row.label || row.name || ""
    ).toUpperCase().replace(/\s*-\s*/g, " ").trim()
      .replace(/^WH\s*/i, "")
      .replace(/\s+BOND$/i, "")
      .trim();
    return rName === cleanName || rName.includes(cleanName) || cleanName.includes(rName);
  });
}

function getDayValue(row, dayObj) {
  if (!row) return 0;
  for (const k of dayObj.keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
      const num = Number(row[k]);
      return isNaN(num) ? 0 : num;
    }
  }

  // Fallback scan over object keys
  const rowKeys = Object.keys(row);
  for (const k of rowKeys) {
    if (k.toLowerCase().includes("total") || k === "warehouse" || k === "bond" || k === "key") continue;
    if (dayObj.keys.some(dk => k.toLowerCase().startsWith(dk.toLowerCase()))) {
      const num = Number(row[k]);
      return isNaN(num) ? 0 : num;
    }
  }
  return 0;
}
