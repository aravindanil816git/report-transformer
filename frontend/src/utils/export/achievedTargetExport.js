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
  data,
  viewMode,
  displayedBrands,
  dateRange,
  clusters
}) => {
  const orientation = "landscape";
  const doc = new jsPDF({ orientation: orientation, unit: "mm", format: "a4" });
  const formattedDate = dateRange && dateRange[1] 
    ? `AS ON ${dayjs(dateRange[1]).format("D MMM YYYY")}` 
    : `AS ON ${dayjs().format("D MMM YYYY")}`;

  const drawHeader = (doc, title, period, pageNumber = 1) => {
    if (pageNumber === 1) {
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
    }
  };

  if (viewMode === "bond") {
    const tableRows = [];
    
    for (let i = 0; i < data.length; i += 2) {
      const tgtRow = data[i];
      const achRow = data[i + 1];
      if (!tgtRow || !achRow) continue;

      const isCluster = tgtRow.isClusterTotal;
      const bondName = tgtRow.bond;

      let tgtSum = 0;
      let achSum = 0;
      const brandTgts = [];
      const brandAchs = [];

      displayedBrands.forEach(brand => {
        const tVal = Math.round(tgtRow.brands?.[brand]?.target || 0);
        const aVal = Math.round(achRow.brands?.[brand]?.achieved || 0);
        tgtSum += tVal;
        achSum += aVal;
        brandTgts.push(tVal);
        brandAchs.push(aVal);
      });

      const pctVal = getAchPercentage(tgtSum, achSum);

      const row1 = [
        { content: bondName, rowSpan: 2, styles: { halign: "center", valign: "middle", fontStyle: "bold", fillColor: isCluster ? [255, 192, 0] : [11, 41, 79], textColor: isCluster ? [0, 0, 0] : [255, 255, 255] } },
        { content: "TGT", styles: { halign: "center", fillColor: isCluster ? [255, 192, 0] : [255, 255, 255], textColor: [0, 0, 0] } },
        ...brandTgts.map(v => ({ content: String(v), styles: { halign: "center", fillColor: isCluster ? [255, 192, 0] : [255, 255, 255] } })),
        { content: String(tgtSum), styles: { halign: "center", fontStyle: "bold", fillColor: isCluster ? [255, 192, 0] : [255, 255, 255] } },
        { content: pctVal, rowSpan: 2, styles: { halign: "center", valign: "middle", fontStyle: "bold", textColor: getAchPercentageNum(tgtSum, achSum) >= 100 ? [63, 134, 0] : [207, 19, 34], fillColor: isCluster ? [255, 192, 0] : [255, 255, 255] } }
      ];

      const row2 = [
        { content: "ACH", styles: { halign: "center", fillColor: isCluster ? [255, 192, 0] : [255, 255, 255], textColor: [0, 0, 0] } },
        ...brandAchs.map(v => ({ content: String(v), styles: { halign: "center", fillColor: isCluster ? [255, 192, 0] : [255, 255, 255] } })),
        { content: String(achSum), styles: { halign: "center", fontStyle: "bold", fillColor: isCluster ? [255, 192, 0] : [255, 255, 255] } }
      ];

      tableRows.push(row1);
      tableRows.push(row2);
    }

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

    const finalPctVal = getAchPercentage(grandTgtSum, grandAchSum);

    tableRows.push([
      { content: "GRAND TOTAL", rowSpan: 2, styles: { halign: "center", valign: "middle", fontStyle: "bold", fillColor: [11, 41, 79], textColor: [255, 189, 49] } },
      { content: "TGT", styles: { halign: "center", fillColor: [11, 41, 79], textColor: [255, 255, 255], fontStyle: "bold" } },
      ...displayedBrands.map(b => ({ content: String(Math.round(grandBrandTgts[b])), styles: { halign: "center", fillColor: [11, 41, 79], textColor: [255, 255, 255], fontStyle: "bold" } })),
      { content: String(Math.round(grandTgtSum)), styles: { halign: "center", fontStyle: "bold", fillColor: [11, 41, 79], textColor: [255, 189, 49] } },
      { content: finalPctVal, rowSpan: 2, styles: { halign: "center", valign: "middle", fontStyle: "bold", fillColor: [11, 41, 79], textColor: getAchPercentageNum(grandTgtSum, grandAchSum) >= 100 ? [255, 255, 255] : [255, 100, 100] } }
    ]);

    tableRows.push([
      { content: "ACH", styles: { halign: "center", fillColor: [11, 41, 79], textColor: [255, 255, 255], fontStyle: "bold" } },
      ...displayedBrands.map(b => ({ content: String(Math.round(grandBrandAchs[b])), styles: { halign: "center", fillColor: [11, 41, 79], textColor: [255, 255, 255], fontStyle: "bold" } })),
      { content: String(Math.round(grandAchSum)), styles: { halign: "center", fontStyle: "bold", fillColor: [11, 41, 79], textColor: [255, 189, 49] } }
    ]);

    const headers = [
      "STAFF - BOND",
      "CAT",
      ...displayedBrands.map(b => b.replace(" BRANDY", "").replace(" RUM", "")),
      "GRAND TOTAL",
      "ACH %"
    ];

    autoTable(doc, {
      head: [headers],
      body: tableRows,
      startY: 35,
      margin: { top: 35, bottom: 15, left: 10, right: 10 },
      theme: "plain",
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        textColor: [0, 0, 0]
      },
      headStyles: {
        fillColor: [11, 41, 79],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center"
      },
      didDrawPage: (data) => {
        drawHeader(doc, "TARGET VS ACHIEVEMENT", formattedDate, data.pageNumber);
      }
    });

  } else {
    // --- Shop View PDF ---
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
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        lineWidth: 0.1,
        lineColor: [220, 220, 220]
      },
      headStyles: {
        fillColor: [11, 41, 79],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center"
      },
      didDrawPage: (data) => {
        drawHeader(doc, "SHOPWISE TARGET VS ACHIEVEMENT", formattedDate, data.pageNumber);
      }
    });
  }

  const filename = viewMode === "bond" ? "target_vs_achievement_report.pdf" : "shopwise_target_vs_achievement_report.pdf";
  doc.save(filename);
};
