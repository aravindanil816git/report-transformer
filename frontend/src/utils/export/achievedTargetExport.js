import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import dayjs from "dayjs";

const navyColor = "0B294F";
const goldColor = "FFBD31";
const yellowHighlight = "FFC000"; // For cluster totals
const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

// Helpers
const getAchPercentage = (target, achieved) => {
  if (target === 0) {
    return achieved > 0 ? "100.00%" : "-";
  }
  return `${((achieved * 100) / target).toFixed(2)}%`;
};

const getAchPercentageNum = (target, achieved) => {
  if (target === 0) {
    return achieved > 0 ? 100 : 0;
  }
  return (achieved * 100) / target;
};

// --- EXCEL EXPORT ---
export const exportAchievedTargetExcel = async ({
  data,
  viewMode,
  displayedBrands,
  dateRange,
  clusters
}) => {
  const workbook = new ExcelJS.Workbook();
  const sheetName = viewMode === "bond" ? "Target vs Achievement" : "Shopwise Target vs Achievement";
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  const formattedDate = dateRange && dateRange[1] 
    ? `AS ON ${dayjs(dateRange[1]).format("D MMM YYYY")}` 
    : `AS ON ${dayjs().format("D MMM YYYY")}`;

  // Header / Title block
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 10;

  if (viewMode === "bond") {
    const numCols = 4 + displayedBrands.length; // Bond, Cat, Brands..., Grand Total, ACH %
    const lastColLetter = String.fromCharCode(65 + numCols - 1);

    ws.mergeCells(`A1:${lastColLetter}1`);
    ws.mergeCells(`A2:${lastColLetter}2`);

    const titleCell = ws.getCell("A1");
    titleCell.value = "K.S DISTILLERY";
    titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const subtitleCell = ws.getCell("A2");
    subtitleCell.value = "TARGET VS ACHIEVEMENT";
    subtitleCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFF" } };
    subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    subtitleCell.alignment = { horizontal: "left", vertical: "middle" };

    subtitleCell.value = `TARGET VS ACHIEVEMENT` + " ".repeat(15) + formattedDate;
    subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };

    // Headers row starting at row 5
    ws.getRow(5).height = 26;
    const headerCols = ["STAFF - BOND", "CAT"];
    displayedBrands.forEach(b => headerCols.push(b.replace(" BRANDY", "").replace(" RUM", "")));
    headerCols.push("Grand Total", "ACH %");

    headerCols.forEach((hText, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = ws.getCell(`${colLetter}5`);
      cell.value = hText.toUpperCase();
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = borderStyle;
    });

    let rIdx = 6;

    for (let i = 0; i < data.length; i += 2) {
      const tgtRow = data[i];
      const achRow = data[i + 1];
      if (!tgtRow || !achRow) continue;

      const isCluster = tgtRow.isClusterTotal;
      const bondName = tgtRow.bond;

      ws.getRow(rIdx).height = 20;
      ws.getRow(rIdx + 1).height = 20;

      // Merge Bond cell vertically
      const bondCellRange = `A${rIdx}:A${rIdx + 1}`;
      ws.mergeCells(bondCellRange);
      const bondCell = ws.getCell(`A${rIdx}`);
      bondCell.value = bondName;
      bondCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: isCluster ? "000000" : "FFFFFF" } };
      bondCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isCluster ? yellowHighlight : navyColor }
      };
      bondCell.alignment = { horizontal: "center", vertical: "middle" };
      bondCell.border = borderStyle;

      // CAT column
      const catTgtCell = ws.getCell(`B${rIdx}`);
      catTgtCell.value = "TGT";
      catTgtCell.font = { name: "Segoe UI", size: 9, bold: isCluster };
      catTgtCell.alignment = { horizontal: "center", vertical: "middle" };
      catTgtCell.border = borderStyle;
      if (isCluster) {
        catTgtCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
      }

      const catAchCell = ws.getCell(`B${rIdx + 1}`);
      catAchCell.value = "ACH";
      catAchCell.font = { name: "Segoe UI", size: 9, bold: isCluster };
      catAchCell.alignment = { horizontal: "center", vertical: "middle" };
      catAchCell.border = borderStyle;
      if (isCluster) {
        catAchCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
      }

      // Brand columns & Totals
      let tgtSum = 0;
      let achSum = 0;

      displayedBrands.forEach((brand, bIdx) => {
        const colLetter = String.fromCharCode(67 + bIdx);
        const cellTgt = ws.getCell(`${colLetter}${rIdx}`);
        const cellAch = ws.getCell(`${colLetter}${rIdx + 1}`);

        const tVal = Math.round(tgtRow.brands?.[brand]?.target || 0);
        const aVal = Math.round(achRow.brands?.[brand]?.achieved || 0);

        tgtSum += tVal;
        achSum += aVal;

        cellTgt.value = tVal;
        cellTgt.font = { name: "Segoe UI", size: 10, bold: isCluster };
        cellTgt.alignment = { horizontal: "center", vertical: "middle" };
        cellTgt.border = borderStyle;

        cellAch.value = aVal;
        cellAch.font = { name: "Segoe UI", size: 10, bold: isCluster };
        cellAch.alignment = { horizontal: "center", vertical: "middle" };
        cellAch.border = borderStyle;

        if (isCluster) {
          cellTgt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
          cellAch.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
        }
      });

      // Grand Total column
      const gtColLetter = String.fromCharCode(67 + displayedBrands.length);
      const gtTgtCell = ws.getCell(`${gtColLetter}${rIdx}`);
      gtTgtCell.value = tgtSum;
      gtTgtCell.font = { name: "Segoe UI", size: 10, bold: true };
      gtTgtCell.alignment = { horizontal: "center", vertical: "middle" };
      gtTgtCell.border = borderStyle;

      const gtAchCell = ws.getCell(`${gtColLetter}${rIdx + 1}`);
      gtAchCell.value = achSum;
      gtAchCell.font = { name: "Segoe UI", size: 10, bold: true };
      gtAchCell.alignment = { horizontal: "center", vertical: "middle" };
      gtAchCell.border = borderStyle;

      if (isCluster) {
        gtTgtCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
        gtAchCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
      }

      // ACH % column (merged vertically)
      const achPctColLetter = String.fromCharCode(68 + displayedBrands.length);
      ws.mergeCells(`${achPctColLetter}${rIdx}:${achPctColLetter}${rIdx + 1}`);
      const achPctCell = ws.getCell(`${achPctColLetter}${rIdx}`);
      
      const pctVal = getAchPercentage(tgtSum, achSum);
      const pctNum = getAchPercentageNum(tgtSum, achSum);

      achPctCell.value = pctVal;
      achPctCell.font = {
        name: "Segoe UI",
        size: 10,
        bold: true,
        color: { argb: pctNum >= 100 ? "3F8600" : "CF1322" }
      };
      achPctCell.alignment = { horizontal: "center", vertical: "middle" };
      achPctCell.border = borderStyle;

      if (isCluster) {
        achPctCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yellowHighlight } };
      }

      rIdx += 2;
    }

    // Now calculate and write Grand Total row at the bottom
    let grandTgtSum = 0;
    let grandAchSum = 0;
    const grandBrandTgts = {};
    const grandBrandAchs = {};
    displayedBrands.forEach(b => {
      grandBrandTgts[b] = 0;
      grandBrandAchs[b] = 0;
    });

    data.forEach(row => {
      if (row.isClusterTotal) return;
      if (row.type === "Target") {
        displayedBrands.forEach(b => {
          grandBrandTgts[b] += row.brands?.[b]?.target || 0;
        });
      } else {
        displayedBrands.forEach(b => {
          grandBrandAchs[b] += row.brands?.[b]?.achieved || 0;
        });
      }
    });

    displayedBrands.forEach(b => {
      grandTgtSum += grandBrandTgts[b];
      grandAchSum += grandBrandAchs[b];
    });

    // Write Grand Total row
    ws.getRow(rIdx).height = 20;
    ws.getRow(rIdx + 1).height = 20;

    ws.mergeCells(`A${rIdx}:A${rIdx + 1}`);
    const gtLabelCell = ws.getCell(`A${rIdx}`);
    gtLabelCell.value = "GRAND TOTAL";
    gtLabelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    gtLabelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtLabelCell.alignment = { horizontal: "center", vertical: "middle" };
    gtLabelCell.border = borderStyle;

    const gtTgtCat = ws.getCell(`B${rIdx}`);
    gtTgtCat.value = "TGT";
    gtTgtCat.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    gtTgtCat.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtTgtCat.alignment = { horizontal: "center", vertical: "middle" };
    gtTgtCat.border = borderStyle;

    const gtAchCat = ws.getCell(`B${rIdx + 1}`);
    gtAchCat.value = "ACH";
    gtAchCat.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    gtAchCat.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtAchCat.alignment = { horizontal: "center", vertical: "middle" };
    gtAchCat.border = borderStyle;

    displayedBrands.forEach((brand, bIdx) => {
      const colLetter = String.fromCharCode(67 + bIdx);
      const cellTgt = ws.getCell(`${colLetter}${rIdx}`);
      const cellAch = ws.getCell(`${colLetter}${rIdx + 1}`);

      cellTgt.value = Math.round(grandBrandTgts[brand]);
      cellTgt.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cellTgt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cellTgt.alignment = { horizontal: "center", vertical: "middle" };
      cellTgt.border = borderStyle;

      cellAch.value = Math.round(grandBrandAchs[brand]);
      cellAch.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cellAch.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cellAch.alignment = { horizontal: "center", vertical: "middle" };
      cellAch.border = borderStyle;
    });

    const gtValColLetter = String.fromCharCode(67 + displayedBrands.length);
    const gtValTgtCell = ws.getCell(`${gtValColLetter}${rIdx}`);
    gtValTgtCell.value = Math.round(grandTgtSum);
    gtValTgtCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    gtValTgtCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtValTgtCell.alignment = { horizontal: "center", vertical: "middle" };
    gtValTgtCell.border = borderStyle;

    const gtValAchCell = ws.getCell(`${gtValColLetter}${rIdx + 1}`);
    gtValAchCell.value = Math.round(grandAchSum);
    gtValAchCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    gtValAchCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtValAchCell.alignment = { horizontal: "center", vertical: "middle" };
    gtValAchCell.border = borderStyle;

    const gtPctColLetter = String.fromCharCode(68 + displayedBrands.length);
    ws.mergeCells(`${gtPctColLetter}${rIdx}:${gtPctColLetter}${rIdx + 1}`);
    const gtPctCell = ws.getCell(`${gtPctColLetter}${rIdx}`);
    const finalPct = getAchPercentage(grandTgtSum, grandAchSum);
    const finalPctNum = getAchPercentageNum(grandTgtSum, grandAchSum);

    gtPctCell.value = finalPct;
    gtPctCell.font = {
      name: "Segoe UI",
      size: 11,
      bold: true,
      color: { argb: finalPctNum >= 100 ? "3F8600" : "CF1322" }
    };
    gtPctCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtPctCell.alignment = { horizontal: "center", vertical: "middle" };
    gtPctCell.border = borderStyle;

    ws.getColumn("A").width = 24;
    ws.getColumn("B").width = 8;
    displayedBrands.forEach((_, bIdx) => {
      const colLetter = String.fromCharCode(67 + bIdx);
      ws.getColumn(colLetter).width = 16;
    });
    ws.getColumn(gtValColLetter).width = 16;
    ws.getColumn(gtPctColLetter).width = 14;

  } else {
    // --- Shop View Excel ---
    const numCols = 5 + displayedBrands.length;
    const lastColLetter = String.fromCharCode(65 + numCols - 1);

    ws.mergeCells(`A1:${lastColLetter}1`);
    ws.mergeCells(`A2:${lastColLetter}2`);

    const titleCell = ws.getCell("A1");
    titleCell.value = "K.S DISTILLERY";
    titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const subtitleCell = ws.getCell("A2");
    subtitleCell.value = `SHOPWISE TARGET VS ACHIEVEMENT  •  ${formattedDate}`;
    subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    ws.getRow(5).height = 24;
    const headers = ["CATEGORY", "SHOP CODE", "SHOP NAME", "BOND"];
    displayedBrands.forEach(b => headers.push(b.replace(" BRANDY", "").replace(" RUM", "")));
    headers.push("TOTAL ACHIEVED");

    headers.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = ws.getCell(`${colLetter}5`);
      cell.value = h;
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = borderStyle;
    });

    let rIdx = 6;
    let shopGrandTotals = {};
    displayedBrands.forEach(b => { shopGrandTotals[b] = 0; });
    let totalAchievedSum = 0;

    data.forEach(row => {
      ws.getRow(rIdx).height = 20;

      const c1 = ws.getCell(`A${rIdx}`);
      c1.value = row.category || "";
      c1.font = { name: "Segoe UI", size: 9 };
      c1.alignment = { horizontal: "center", vertical: "middle" };
      c1.border = borderStyle;

      const c2 = ws.getCell(`B${rIdx}`);
      c2.value = row.shop_code || "";
      c2.font = { name: "Segoe UI", size: 9 };
      c2.alignment = { horizontal: "center", vertical: "middle" };
      c2.border = borderStyle;

      const c3 = ws.getCell(`C${rIdx}`);
      c3.value = row.shop_name || "";
      c3.font = { name: "Segoe UI", size: 9 };
      c3.alignment = { horizontal: "left", vertical: "middle" };
      c3.border = borderStyle;

      const c4 = ws.getCell(`D${rIdx}`);
      c4.value = row.bond || "";
      c4.font = { name: "Segoe UI", size: 9 };
      c4.alignment = { horizontal: "center", vertical: "middle" };
      c4.border = borderStyle;

      let rowTotal = 0;
      displayedBrands.forEach((b, bIdx) => {
        const colLetter = String.fromCharCode(69 + bIdx);
        const cell = ws.getCell(`${colLetter}${rIdx}`);
        const val = Math.round(row.brands?.[b]?.achieved || 0);
        rowTotal += val;
        shopGrandTotals[b] += val;

        cell.value = val || "-";
        cell.font = { name: "Segoe UI", size: 9 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = borderStyle;
      });

      const totalCell = ws.getCell(`${String.fromCharCode(69 + displayedBrands.length)}${rIdx}`);
      totalCell.value = rowTotal;
      totalCell.font = { name: "Segoe UI", size: 9, bold: true };
      totalCell.alignment = { horizontal: "center", vertical: "middle" };
      totalCell.border = borderStyle;
      totalAchievedSum += rowTotal;

      rIdx++;
    });

    ws.getRow(rIdx).height = 22;
    const gtLabel = ws.getCell(`A${rIdx}`);
    ws.mergeCells(`A${rIdx}:D${rIdx}`);
    gtLabel.value = "GRAND TOTAL ACHIEVED";
    gtLabel.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    gtLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    gtLabel.alignment = { horizontal: "center", vertical: "middle" };

    for (let c = 0; c < 4; c++) {
      ws.getCell(`${String.fromCharCode(65 + c)}${rIdx}`).border = borderStyle;
      ws.getCell(`${String.fromCharCode(65 + c)}${rIdx}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    }

    displayedBrands.forEach((b, bIdx) => {
      const colLetter = String.fromCharCode(69 + bIdx);
      const cell = ws.getCell(`${colLetter}${rIdx}`);
      cell.value = Math.round(shopGrandTotals[b]);
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderStyle;
    });

    const finalTotalCell = ws.getCell(`${String.fromCharCode(69 + displayedBrands.length)}${rIdx}`);
    finalTotalCell.value = totalAchievedSum;
    finalTotalCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    finalTotalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    finalTotalCell.alignment = { horizontal: "center", vertical: "middle" };
    finalTotalCell.border = borderStyle;

    ws.getColumn("A").width = 14;
    ws.getColumn("B").width = 14;
    ws.getColumn("C").width = 28;
    ws.getColumn("D").width = 16;
    displayedBrands.forEach((_, bIdx) => {
      ws.getColumn(String.fromCharCode(69 + bIdx)).width = 16;
    });
    ws.getColumn(String.fromCharCode(69 + displayedBrands.length)).width = 18;
  }

  const filename = viewMode === "bond" ? "target_vs_achievement_report.xlsx" : "shopwise_target_vs_achievement_report.xlsx";
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};


// --- PDF EXPORT ---
export const exportAchievedTargetPdf = ({
  data = [],
  viewMode = "bond",
  displayedBrands = [],
  dateRange = [],
  clusters = {},
  isSummaryOnly = false,
  customTitle = null,
  filename = null,
  showGrandTotal = true
}) => {
  const formattedDate = dateRange && dateRange[1] 
    ? `AS ON ${dayjs(dateRange[1]).format("D MMM YYYY")}` 
    : `AS ON ${dayjs().format("D MMM YYYY")}`;

  if (viewMode === "shop") {
    // --- Shop View PDF ---
    const orientation = "landscape";
    const doc = new jsPDF({ orientation: orientation, unit: "mm", format: "a4" });

    const drawHeader = (doc, title, period) => {
      doc.setFillColor(11, 41, 79); 
      doc.rect(10, 10, 277, 14, "F");

      doc.setFillColor(255, 189, 49); 
      doc.rect(10, 24, 277, 7, "F");

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 189, 49); 
      doc.text("K.S DISTILLERY", 148.5, 19.5, { align: "center" });

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      doc.text(title.toUpperCase(), 15, 28.5, { align: "left" });
      doc.text(period, 272, 28.5, { align: "right" });
    };

    const headers = [
      "CATEGORY",
      "SHOP CODE",
      "SHOP NAME",
      "BOND",
      ...displayedBrands.map(b => b.replace(" BRANDY", "").replace(" RUM", "")),
      "TOTAL ACHIEVED"
    ];

    let shopGrandTotals = {};
    displayedBrands.forEach(b => { shopGrandTotals[b] = 0; });
    let totalAchievedSum = 0;

    const tableRows = data.map(row => {
      let rowTotal = 0;
      const brandVals = displayedBrands.map(b => {
        const val = Math.round(row.brands?.[b]?.achieved || 0);
        rowTotal += val;
        shopGrandTotals[b] += val;
        return val ? String(val) : "-";
      });
      totalAchievedSum += rowTotal;

      return [
        row.category || "",
        row.shop_code || "",
        row.shop_name || "",
        row.bond || "",
        ...brandVals,
        String(rowTotal)
      ];
    });

    tableRows.push([
      { content: "GRAND TOTAL ACHIEVED", colSpan: 4, styles: { halign: "center", fontStyle: "bold", fillColor: [11, 41, 79], textColor: [255, 189, 49] } },
      ...displayedBrands.map(b => ({ content: String(Math.round(shopGrandTotals[b])), styles: { halign: "center", fontStyle: "bold", fillColor: [11, 41, 79], textColor: [255, 255, 255] } })),
      { content: String(totalAchievedSum), styles: { halign: "center", fontStyle: "bold", fillColor: [11, 41, 79], textColor: [255, 189, 49] } }
    ]);

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 35,
      margin: { top: 35, bottom: 15, left: 10, right: 10 },
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 2, lineWidth: 0.1, lineColor: [220, 220, 220] },
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
      didDrawPage: (data) => {
        drawHeader(doc, customTitle || "SHOPWISE TARGET VS ACHIEVEMENT", formattedDate);
      }
    });

    doc.save(filename || "shopwise_target_vs_achievement_report.pdf");
    return;
  }

  // --- Bond View Build Spec PDF ---
  // Group into 2-row blocks (TGT and ACH)
  const blocks = [];
  const processedKeys = new Set();

  data.forEach(row => {
    const rawBond = row.bond || row.label || "";
    if (!rawBond) return;
    if (processedKeys.has(rawBond)) return;
    processedKeys.add(rawBond);

    const bondRows = data.filter(r => (r.bond || r.label) === rawBond);
    const tgtRow = bondRows.find(r => r.type === "Target") || bondRows[0];
    const achRow = bondRows.find(r => r.type === "Achieved") || bondRows[1] || tgtRow;

    const isClusterTotal = !!tgtRow.isClusterTotal || !!achRow.isClusterTotal;

    if (isSummaryOnly && !isClusterTotal) return;

    let cleanLabelStr = String(rawBond).trim();
    cleanLabelStr = cleanLabelStr.replace(/CLUSTER\s*-\s*/gi, "CLUSTER ");

    if (isSummaryOnly || (isClusterTotal && !cleanLabelStr.toUpperCase().includes("GRAND TOTAL"))) {
      cleanLabelStr = cleanLabelStr.replace(/\s+TOTAL$/gi, "");
    }
    if (cleanLabelStr.toUpperCase().includes("GRAND TOTAL")) {
      cleanLabelStr = "GRAND TOTAL";
    }

    let isTotalBlock = false;
    if (isSummaryOnly) {
      isTotalBlock = cleanLabelStr.toUpperCase() === "GRAND TOTAL";
    } else {
      isTotalBlock = isClusterTotal || cleanLabelStr.toUpperCase() === "GRAND TOTAL";
    }

    let tgtSum = 0;
    let achSum = 0;
    const tgtMap = {};
    const achMap = {};

    displayedBrands.forEach(b => {
      const tVal = Math.round(tgtRow.brands?.[b]?.target || 0);
      const aVal = Math.round(achRow.brands?.[b]?.achieved || 0);
      tgtMap[b] = tVal;
      achMap[b] = aVal;
      tgtSum += tVal;
      achSum += aVal;
    });

    let pctStr = "-";
    if (tgtSum === 0) {
      pctStr = achSum > 0 ? "100.00%" : "-";
    } else {
      pctStr = `${((achSum * 100) / tgtSum).toFixed(2)}%`;
    }

    blocks.push({
      label: cleanLabelStr,
      isTotalBlock,
      tgtMap,
      achMap,
      tgtSum,
      achSum,
      pctStr
    });
  });

  // Automatically compute and append GRAND TOTAL block if needed
  if (isSummaryOnly) {
    const hasGrandTotal = blocks.some(b => b.label.toUpperCase() === "GRAND TOTAL");
    if (!hasGrandTotal && blocks.length > 0) {
      let gtTgtSum = 0;
      let gtAchSum = 0;
      const gtTgtMap = {};
      const gtAchMap = {};

      displayedBrands.forEach(b => {
        gtTgtMap[b] = 0;
        gtAchMap[b] = 0;
      });

      blocks.forEach(blk => {
        displayedBrands.forEach(b => {
          gtTgtMap[b] += blk.tgtMap[b] || 0;
          gtAchMap[b] += blk.achMap[b] || 0;
        });
        gtTgtSum += blk.tgtSum;
        gtAchSum += blk.achSum;
      });

      let gtPctStr = "-";
      if (gtTgtSum === 0) {
        gtPctStr = gtAchSum > 0 ? "100.00%" : "-";
      } else {
        gtPctStr = `${((gtAchSum * 100) / gtTgtSum).toFixed(2)}%`;
      }

      blocks.push({
        label: "GRAND TOTAL",
        isTotalBlock: true,
        tgtMap: gtTgtMap,
        achMap: gtAchMap,
        tgtSum: gtTgtSum,
        achSum: gtAchSum,
        pctStr: gtPctStr
      });
    }
  } else if (showGrandTotal) {
    const hasGrandTotal = blocks.some(b => b.label.toUpperCase() === "GRAND TOTAL");
    const clusterTotalBlocks = blocks.filter(b => b.isTotalBlock);
    if (!hasGrandTotal && clusterTotalBlocks.length > 1) {
      let gtTgtSum = 0;
      let gtAchSum = 0;
      const gtTgtMap = {};
      const gtAchMap = {};

      displayedBrands.forEach(b => {
        gtTgtMap[b] = 0;
        gtAchMap[b] = 0;
      });

      const detailBlocks = blocks.filter(b => !b.isTotalBlock);
      detailBlocks.forEach(blk => {
        displayedBrands.forEach(b => {
          gtTgtMap[b] += blk.tgtMap[b] || 0;
          gtAchMap[b] += blk.achMap[b] || 0;
        });
        gtTgtSum += blk.tgtSum;
        gtAchSum += blk.achSum;
      });

      let gtPctStr = "-";
      if (gtTgtSum === 0) {
        gtPctStr = gtAchSum > 0 ? "100.00%" : "-";
      } else {
        gtPctStr = `${((gtAchSum * 100) / gtTgtSum).toFixed(2)}%`;
      }

      blocks.push({
        label: "GRAND TOTAL",
        isTotalBlock: true,
        tgtMap: gtTgtMap,
        achMap: gtAchMap,
        tgtSum: gtTgtSum,
        achSum: gtAchSum,
        pctStr: gtPctStr
      });
    }
  }

  // Calculate Heights & Pagination
  const mastheadH = 42.0;
  const bandH = 28.0;
  const headerLines = 3;
  const headerH = headerLines * (7.25 + 4.5) + 18.0; // 53.25pt
  const blockH = 60.0;
  const totalHeaderH = mastheadH + bandH + headerH; // 123.25pt

  const maxSinglePageH = 841.890; // A4 max height
  const calculatedH = totalHeaderH + (blocks.length * blockH);

  const isMultiPage = calculatedH > maxSinglePageH;
  const blocksPerPage = isMultiPage ? Math.floor((maxSinglePageH - totalHeaderH) / blockH) : blocks.length;
  const totalPages = isMultiPage ? Math.ceil(blocks.length / blocksPerPage) : 1;

  const pageW = 595.276;
  const pageH = isMultiPage ? maxSinglePageH : Math.max(300.0, calculatedH);
  const orientation = pageW > pageH ? "landscape" : "portrait";

  const doc = new jsPDF({
    orientation: orientation,
    unit: "pt",
    format: [pageW, pageH]
  });

  const LAB_PAD = 3.0;

  // 12 columns measured widths summing to 595.276
  const colWidths = [
    108.15, // 0: BOND
    29.74,  // 1: CAT
    47.32,  // 2: BCB
    47.32,  // 3: BLENDERS CHOICE
    47.32,  // 4: CCB
    47.32,  // 5: KS.99
    47.32,  // 6: MAGIC BLEND
    47.32,  // 7: MORNING WALKERS
    47.32,  // 8: OLD PEARL
    47.32,  // 9: ROYAL OLD FORT
    36.19,  // 10: GRAND TOTAL
    42.616  // 11: ACH %
  ];

  const colX = [0];
  for (let c = 0; c < 12; c++) {
    colX.push(colX[c] + colWidths[c]);
  }
  colX[12] = 595.276;

  let reportTitle = customTitle || "TARGET VS ACHIEVEMENT";
  reportTitle = reportTitle.toUpperCase().replace(/\s+V\/S\s+/g, " VS ").replace(/CLUSTER\s*-\s*/g, "CLUSTER ");

  const headers = [
    ["BOND"],
    ["CAT"],
    ["BCB"],
    ["BLENDERS", "CHOICE"],
    ["CCB"],
    ["KS.99"],
    ["MAGIC", "BLEND"],
    ["MORNING", "WALKERS"],
    ["OLD", "PEARL"],
    ["ROYAL", "OLD", "FORT"],
    ["GRAND", "TOTAL"],
    ["ACH %"]
  ];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    if (pIdx > 0) {
      doc.addPage([pageW, pageH], orientation);
    }

    // --- Band 1: Navy Masthead ---
    doc.setFillColor(11, 41, 79); // #0B294F
    doc.rect(0, 0, 595.276, mastheadH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 189, 49); // Gold #FFBD31
    doc.text("K.S DISTILLERY", 595.276 / 2, 26.0, { align: "center" });

    // --- Band 2: Gold Band ---
    doc.setFillColor(255, 189, 49); // #FFBD31
    doc.rect(0, mastheadH, 595.276, bandH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(11, 41, 79); // Navy #0B294F
    doc.text(reportTitle, 3 * LAB_PAD, mastheadH + 18.5, { align: "left" });
    doc.text(formattedDate, 595.276 - 3 * LAB_PAD, mastheadH + 18.5, { align: "right" });

    // --- Band 3: Column Header Block ---
    const headerTopY = mastheadH + bandH;
    doc.setFillColor(11, 41, 79); // Navy #0B294F
    doc.rect(0, headerTopY, 595.276, headerH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.25);
    doc.setTextColor(255, 255, 255); // White

    headers.forEach((linesArr, c) => {
      const N = linesArr.length;
      const textCenterY = headerTopY + headerH / 2;
      const startY = textCenterY - ((N - 1) * 11.75) / 2;

      const align = c === 0 ? "left" : "center";
      const x = c === 0 ? colX[c] + 3 * LAB_PAD : colX[c] + colWidths[c] / 2;

      linesArr.forEach((lineText, lineIdx) => {
        const lineY = startY + lineIdx * 11.75;
        doc.text(lineText, x, lineY, { align, baseline: "middle" });
      });
    });

    // Header rules (Gold)
    doc.setDrawColor(255, 189, 49); // Gold #FFBD31
    doc.setLineWidth(2.0);
    doc.line(0, headerTopY + 1.0, 595.276, headerTopY + 1.0); // Top rule
    doc.line(0, headerTopY + headerH - 1.0, 595.276, headerTopY + headerH - 1.0); // Bottom rule

    doc.setLineWidth(1.4);
    for (let c = 1; c < 12; c++) {
      const x = colX[c];
      doc.line(x, headerTopY, x, headerTopY + headerH);
    }

    // --- Band 4: Body Blocks ---
    const bodyStartY = headerTopY + headerH;
    const pageBlocks = blocks.slice(pIdx * blocksPerPage, (pIdx + 1) * blocksPerPage);

    pageBlocks.forEach((blk, bIdx) => {
      const blockY = bodyStartY + bIdx * blockH;

      const tgtBg = blk.isTotalBlock ? [241, 179, 46] : [241, 241, 241];
      const achBg = blk.isTotalBlock ? [255, 189, 49] : [255, 255, 255];
      const blockMainBg = blk.isTotalBlock ? [255, 189, 49] : [255, 255, 255];

      doc.setLineWidth(0.4);
      doc.setDrawColor(199, 199, 199); // #C7C7C7 hairline

      // Draw cells
      for (let c = 0; c < 12; c++) {
        const x = colX[c];
        const w = colWidths[c];

        if (c === 0) {
          // Label cell merged across TGT + ACH (height 60.0pt)
          doc.setFillColor(11, 41, 79); // Navy #0B294F
          doc.rect(x, blockY, w, blockH, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          if (blk.isTotalBlock) {
            doc.setTextColor(255, 189, 49); // Gold text
          } else {
            doc.setTextColor(255, 255, 255); // White text
          }
          doc.text(blk.label, x + 3 * LAB_PAD, blockY + 30.0, { align: "left", baseline: "middle" });
        } else if (c === 11) {
          // ACH % cell merged across TGT + ACH (height 60.0pt)
          doc.setFillColor(blockMainBg[0], blockMainBg[1], blockMainBg[2]);
          doc.rect(x, blockY, w, blockH, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10.5);
          if (blk.isTotalBlock) {
            doc.setTextColor(0, 0, 0); // Black on gold row
          } else {
            doc.setTextColor(207, 19, 34); // Red #CF1322 on white row
          }
          doc.text(blk.pctStr, x + w / 2, blockY + 30.0, { align: "center", baseline: "middle" });
        } else {
          // TGT Row cell
          doc.setFillColor(tgtBg[0], tgtBg[1], tgtBg[2]);
          doc.rect(x, blockY, w, 30.0, "FD");

          // ACH Row cell
          doc.setFillColor(achBg[0], achBg[1], achBg[2]);
          doc.rect(x, blockY + 30.0, w, 30.0, "FD");

          doc.setFontSize(10.5);
          doc.setFont("helvetica", blk.isTotalBlock ? "bold" : (c === 10 ? "bold" : "normal"));
          doc.setTextColor(0, 0, 0); // Black values

          let tgtValStr = "";
          let achValStr = "";

          if (c === 1) {
            tgtValStr = "TGT";
            achValStr = "ACH";
          } else if (c >= 2 && c <= 9) {
            const brand = displayedBrands[c - 2];
            tgtValStr = String(blk.tgtMap[brand] || 0);
            achValStr = String(blk.achMap[brand] || 0);
          } else if (c === 10) {
            tgtValStr = String(blk.tgtSum);
            achValStr = String(blk.achSum);
          }

          const cx = x + w / 2;
          doc.text(tgtValStr, cx, blockY + 15.0, { align: "center", baseline: "middle" });
          doc.text(achValStr, cx, blockY + 45.0, { align: "center", baseline: "middle" });
        }
      }

      // Navy block separator between every block (width 1.5pt)
      const blockBottomY = blockY + blockH;
      doc.setDrawColor(11, 41, 79); // Navy #0B294F
      doc.setLineWidth(1.5);
      doc.line(0, blockBottomY, 595.276, blockBottomY);
    });
  }

  doc.save(filename || "target_vs_achievement.pdf");
};
