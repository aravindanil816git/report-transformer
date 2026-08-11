import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const getDayWithSuffix = (day) => {
  if (day >= 11 && day <= 13) {
    return day + "th";
  }
  switch (day % 10) {
    case 1: return day + "st";
    case 2: return day + "nd";
    case 3: return day + "rd";
    default: return day + "th";
  }
};

export const DEFAULT_CLUSTERS = {
  "CLUSTER - 1": [
    "WH-BALARAMAPURAM",
    "WH-NEDUMANGAD",
    "WH-ATTINGAL",
    "WH-MENAMKULAM",
    "WH-KOLLAM",
    "WH-KARUNAGAPPALLY",
    "WH-KOTTARAKARA",
    "WH-PATHANAMTHITA",
    "WH-THIRUVALLA",
    "WH-ALAPPUZHA"
  ],
  "CLUSTER - 2": [
    "WH-KOTTAYAM",
    "WH-AYARKKUNNAM",
    "WH-THODUPUZHA",
    "WH-TRIPUNITHURA",
    "WH-KADAVANTHRA",
    "WH-PERUMBAVOOR",
    "WH-KOTHAMANGALAM",
    "WH-ALUVA",
    "WH-CHALAKUDY",
    "WH-THRISSUR"
  ],
  "CLUSTER - 3": [
    "WH-PALAKKAD",
    "WH-MENONPARA",
    "WH-PERINTHALMANNA",
    "WH-KOZHIKODE",
    "WH-NADUVANNUR",
    "WH-KALPETTA",
    "WH-KANNUR",
    "WH-BATTATHUR"
  ]
};

const getClusterKey = (wh, clusters = {}) => {
  const activeClusters = Object.keys(clusters || {}).length > 0 ? clusters : DEFAULT_CLUSTERS;
  const norm = (w) => String(w || "").trim().toUpperCase();
  const whNorm = norm(wh);
  const whWithWH = whNorm.startsWith("WH-") ? whNorm : "WH-" + whNorm;
  
  for (const [clusterName, whList] of Object.entries(activeClusters)) {
    const matched = whList.some(item => {
      const itemNorm = norm(item);
      const itemWithWH = itemNorm.startsWith("WH-") ? itemNorm : "WH-" + itemNorm;
      return whNorm === itemNorm || whWithWH === itemWithWH;
    });
    if (matched) return clusterName;
  }
  return "OTHER";
};

const formatDepot = (name) => {
  if (name && typeof name === "string") {
    return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim();
  }
  return name;
};

// Colors
const navyColor = "0B294F";
const goldColor = "FFBD31";
const clusterBgColor = "FFC000";
const totalBgColor = "FFC000";
const borderStyle = { style: "thin", color: { argb: "FFFFBD31" } };
const lightGrayBorder = { style: "thin", color: { argb: "FFFFBD31" } };

export const exportItemIssueConsolidationExcel = async ({
  data,
  clusters = {},
  date1,
  date2,
  lastMonthLabel = "",
  daySales1 = "-",
  daySales2 = "-",
  industrySales1 = "",
  industrySales2 = "",
  filename = "item_issue_consolidation.xlsx",
  title = "K.S DISTILLERY"
}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Consolidation Report", {
    views: [{ showGridLines: true }]
  });

  const activeClusters = Object.keys(clusters || {}).length > 0 ? clusters : DEFAULT_CLUSTERS;

  const d1Label = date1 ? date1.format("MMM YYYY") : "";
  const d2Label = date2 ? date2.format("MMM YYYY") : "";
  const lmLabel = lastMonthLabel ? lastMonthLabel : "Last Month";

  const d1Day = date1 ? date1.date() : 1;
  const d2Day = date2 ? date2.date() : 1;
  const d1Suffix = getDayWithSuffix(d1Day);
  const d2Suffix = getDayWithSuffix(d2Day);

  // Helper to style all cells in a merged range
  const styleRange = (rangeStr, fill, font, alignment, border) => {
    const [start, end] = rangeStr.split(":");
    const startColStr = start.replace(/[0-9]/g, "");
    const startRow = parseInt(start.replace(/[^0-9]/g, ""), 10);
    const endColStr = end.replace(/[0-9]/g, "");
    const endRow = parseInt(end.replace(/[^0-9]/g, ""), 10);
    
    const colLetterToNum = (letStr) => {
      let num = 0;
      for (let i = 0; i < letStr.length; i++) {
        num = num * 26 + (letStr.charCodeAt(i) - 64);
      }
      return num;
    };
    
    const sCol = colLetterToNum(startColStr);
    const eCol = colLetterToNum(endColStr);
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = sCol; c <= eCol; c++) {
        const cell = ws.getCell(r, c);
        if (fill) cell.fill = fill;
        if (font) cell.font = font;
        if (alignment) cell.alignment = alignment;
        if (border) cell.border = border;
      }
    }
  };

  // Set Row Heights
  ws.getRow(1).height = 35;
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 24;

  const navyFill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

  // Title Row 1
  ws.mergeCells("A1:B1");
  styleRange("A1:B1", navyFill, null, null, null);

  ws.mergeCells("C1:Q1");
  styleRange(
    "C1:Q1", 
    navyFill, 
    { name: "Segoe UI", size: 16, bold: true, color: { argb: goldColor } },
    { horizontal: "center", vertical: "middle" },
    null
  );

  // Subtitle Row 2
  ws.mergeCells("A2:B2");
  styleRange(
    "A2:B2",
    navyFill,
    { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFF" } },
    { horizontal: "left", vertical: "middle" },
    null
  );
  ws.getCell("A2").value = `SECONDARY SALES · ${date1 ? date1.format("MMM YY").toUpperCase() : ""} vs ${date2 ? date2.format("MMM YY").toUpperCase() : ""}`;

  ws.mergeCells("C2:N2");
  styleRange("C2:N2", navyFill, null, null, null);

  ws.mergeCells("O2:Q2");
  styleRange(
    "O2:Q2",
    navyFill,
    { name: "Segoe UI", size: 12, bold: true, color: { argb: goldColor } },
    { horizontal: "right", vertical: "middle" },
    null
  );
  ws.getCell("O2").value = `AS ON ${date1 ? date1.format("D MMMM YYYY").toUpperCase() : ""}`;

  // Style all header cells in rows 3 & 4 FIRST to avoid cell formatting bugs on merged cells
  const allHeaderCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"];
  [3, 4].forEach(rIdx => {
    allHeaderCols.forEach(col => {
      const cell = ws.getCell(`${col}${rIdx}`);
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = navyFill;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = borderStyle;
    });
  });

  // Setup main headers and merge ranges
  ws.mergeCells("A3:A4");
  ws.getCell("A3").value = "SL NO";
  
  ws.mergeCells("B3:B4");
  ws.getCell("B3").value = "WAREHOUSE";

  // First Period Header Group
  ws.mergeCells("C3:H3");
  ws.getCell("C3").value = `${date1 ? date1.format("MMMM YYYY").toUpperCase() : ""}  ·  as on ${date1 ? date1.format("DD-MM-YYYY") : ""}`;
  
  // Second Period Header Group
  ws.mergeCells("I3:N3");
  ws.getCell("I3").value = `${date2 ? date2.format("MMMM YYYY").toUpperCase() : ""}  ·  as on ${date2 ? date2.format("DD-MM-YYYY") : ""}`;

  // Difference Header Group
  ws.mergeCells("O3:P3");
  ws.getCell("O3").value = "DIFFERENCE";

  // Last Month Header
  ws.mergeCells("Q3:Q4");
  ws.getCell("Q3").value = `LAST MONTH\n(${lmLabel.toUpperCase()})`;

  // Sub-headers for periods and diff
  const subHeaders = [
    // Period 1
    { cell: "C4", val: "STN" }, { cell: "D4", val: "GTN" }, { cell: "E4", val: "TOTAL" }, { cell: "F4", val: "C FED" }, { cell: "G4", val: "BAR" }, { cell: "H4", val: `${d1Day}${date1 ? date1.format("MMM") : ""}` },
    // Period 2
    { cell: "I4", val: "STN" }, { cell: "J4", val: "GTN" }, { cell: "K4", val: "TOTAL" }, { cell: "L4", val: "C FED" }, { cell: "M4", val: "BAR" }, { cell: "N4", val: `${d2Day}${date2 ? date2.format("MMM") : ""}` },
    // Difference
    { cell: "O4", val: "Cases" }, { cell: "P4", val: "%" }
  ];

  subHeaders.forEach(sh => {
    ws.getCell(sh.cell).value = sh.val;
  });

  // Apply gold font color to specific merged header titles
  ["C3", "I3", "O3", "Q3"].forEach(cellName => {
    ws.getCell(cellName).font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  });

  // Process and Group Data by Cluster
  let sNoCounter = 1;
  let currentExcelRowIdx = 5;

  const clusterKeys = ["CLUSTER - 1", "CLUSTER - 2", "CLUSTER - 3"];
  const allClusterKeys = Array.from(new Set([...clusterKeys, ...Object.keys(activeClusters)]));

  const grandTotals = {
    stn1: 0, gtn1: 0, total1: 0, cfed1: 0, bar1: 0, final1: 0,
    stn2: 0, gtn2: 0, total2: 0, cfed2: 0, bar2: 0, final2: 0,
    diff: 0, last_month_final: 0
  };

  const styleNumericCell = (cell, val, isBold = false, textColor = "000000") => {
    const num = Number(val);
    if (isNaN(num) || val === null || val === undefined || val === "-") {
      cell.value = val === 0 ? 0 : "-";
      cell.font = { name: "Segoe UI", size: 10, bold: isBold, color: { argb: "FF999999" } };
    } else {
      cell.value = num;
      cell.font = { name: "Segoe UI", size: 10, bold: isBold, color: { argb: textColor } };
      cell.numFmt = "#,##0";
    }
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };

  allClusterKeys.forEach(clusterName => {
    const whList = clusters[clusterName] || [];
    const clusterRows = data.filter(d => getClusterKey(d.warehouse, clusters) === clusterName);
    if (clusterRows.length === 0) return;

    // Sort warehouses to match order in cluster config
    const norm = (w) => String(w || "").trim().toUpperCase();
    clusterRows.sort((a, b) => {
      const idxA = whList.findIndex(item => {
        const itemNorm = norm(item);
        const itemWithWH = itemNorm.startsWith("WH-") ? itemNorm : "WH-" + itemNorm;
        const aNorm = norm(a.warehouse);
        const aWithWH = aNorm.startsWith("WH-") ? aNorm : "WH-" + aNorm;
        return aNorm === itemNorm || aWithWH === itemWithWH;
      });
      const idxB = whList.findIndex(item => {
        const itemNorm = norm(item);
        const itemWithWH = itemNorm.startsWith("WH-") ? itemNorm : "WH-" + itemNorm;
        const bNorm = norm(b.warehouse);
        const bWithWH = bNorm.startsWith("WH-") ? bNorm : "WH-" + bNorm;
        return bNorm === itemNorm || bWithWH === itemWithWH;
      });
      return idxA - idxB;
    });

    const clusterTotals = {
      stn1: 0, gtn1: 0, total1: 0, cfed1: 0, bar1: 0, final1: 0,
      stn2: 0, gtn2: 0, total2: 0, cfed2: 0, bar2: 0, final2: 0,
      diff: 0, last_month_final: 0
    };

    // Render cluster warehouses
    clusterRows.forEach(row => {
      const excelRow = ws.getRow(currentExcelRowIdx);
      excelRow.height = 20;

      // SL NO
      ws.getCell(`A${currentExcelRowIdx}`).value = sNoCounter++;
      ws.getCell(`A${currentExcelRowIdx}`).font = { name: "Segoe UI", size: 10 };
      ws.getCell(`A${currentExcelRowIdx}`).alignment = { horizontal: "center", vertical: "middle" };

      // Depot Name
      ws.getCell(`B${currentExcelRowIdx}`).value = formatDepot(row.warehouse).toUpperCase();
      ws.getCell(`B${currentExcelRowIdx}`).font = { name: "Segoe UI", size: 10 };
      ws.getCell(`B${currentExcelRowIdx}`).alignment = { horizontal: "left", vertical: "middle" };

      // Columns STN1 -> Final1
      styleNumericCell(ws.getCell(`C${currentExcelRowIdx}`), row.stn1);
      styleNumericCell(ws.getCell(`D${currentExcelRowIdx}`), row.gtn1);
      styleNumericCell(ws.getCell(`E${currentExcelRowIdx}`), row.total1);
      styleNumericCell(ws.getCell(`F${currentExcelRowIdx}`), row.cfed1);
      styleNumericCell(ws.getCell(`G${currentExcelRowIdx}`), row.bar1);
      styleNumericCell(ws.getCell(`H${currentExcelRowIdx}`), row.final1, true, "0B294F");

      // Columns STN2 -> Final2
      const month2Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
      ["I", "J", "K", "L", "M", "N"].forEach(col => {
        ws.getCell(`${col}${currentExcelRowIdx}`).fill = month2Fill;
      });
      styleNumericCell(ws.getCell(`I${currentExcelRowIdx}`), row.stn2);
      styleNumericCell(ws.getCell(`J${currentExcelRowIdx}`), row.gtn2);
      styleNumericCell(ws.getCell(`K${currentExcelRowIdx}`), row.total2);
      styleNumericCell(ws.getCell(`L${currentExcelRowIdx}`), row.cfed2);
      styleNumericCell(ws.getCell(`M${currentExcelRowIdx}`), row.bar2);
      styleNumericCell(ws.getCell(`N${currentExcelRowIdx}`), row.final2, true, "0B294F");

      // Difference Cases and %
      const diffVal = row.diff || 0;
      const diffColor = diffVal < 0 ? "C00000" : "375623"; // Dark Red vs Dark Green
      styleNumericCell(ws.getCell(`O${currentExcelRowIdx}`), diffVal, true, diffColor);

      const pctCell = ws.getCell(`P${currentExcelRowIdx}`);
      const pctVal = row.pct || 0;
      pctCell.value = pctVal / 100;
      pctCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF" + diffColor } };
      pctCell.alignment = { horizontal: "center", vertical: "middle" };
      pctCell.numFmt = "0%";

      // Last Month
      styleNumericCell(ws.getCell(`Q${currentExcelRowIdx}`), row.last_month_final);

      // Borders
      allHeaderCols.forEach(col => {
        ws.getCell(`${col}${currentExcelRowIdx}`).border = lightGrayBorder;
      });

      // Sum cluster totals
      clusterTotals.stn1 += row.stn1 || 0;
      clusterTotals.gtn1 += row.gtn1 || 0;
      clusterTotals.total1 += row.total1 || 0;
      clusterTotals.cfed1 += row.cfed1 || 0;
      clusterTotals.bar1 += row.bar1 || 0;
      clusterTotals.final1 += row.final1 || 0;
      clusterTotals.stn2 += row.stn2 || 0;
      clusterTotals.gtn2 += row.gtn2 || 0;
      clusterTotals.total2 += row.total2 || 0;
      clusterTotals.cfed2 += row.cfed2 || 0;
      clusterTotals.bar2 += row.bar2 || 0;
      clusterTotals.final2 += row.final2 || 0;
      clusterTotals.diff += row.diff || 0;
      clusterTotals.last_month_final += row.last_month_final || 0;

      // Sum grand totals
      grandTotals.stn1 += row.stn1 || 0;
      grandTotals.gtn1 += row.gtn1 || 0;
      grandTotals.total1 += row.total1 || 0;
      grandTotals.cfed1 += row.cfed1 || 0;
      grandTotals.bar1 += row.bar1 || 0;
      grandTotals.final1 += row.final1 || 0;
      grandTotals.stn2 += row.stn2 || 0;
      grandTotals.gtn2 += row.gtn2 || 0;
      grandTotals.total2 += row.total2 || 0;
      grandTotals.cfed2 += row.cfed2 || 0;
      grandTotals.bar2 += row.bar2 || 0;
      grandTotals.final2 += row.final2 || 0;
      grandTotals.diff += row.diff || 0;
      grandTotals.last_month_final += row.last_month_final || 0;

      currentExcelRowIdx++;
    });

    // Render cluster total row
    const totalRow = ws.getRow(currentExcelRowIdx);
    totalRow.height = 22;

    ws.mergeCells(`A${currentExcelRowIdx}:B${currentExcelRowIdx}`);
    const nameCell = ws.getCell(`A${currentExcelRowIdx}`);
    nameCell.value = clusterName.toUpperCase();
    nameCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF000000" } };
    nameCell.alignment = { horizontal: "left", vertical: "middle" };

    styleNumericCell(ws.getCell(`C${currentExcelRowIdx}`), clusterTotals.stn1, true);
    styleNumericCell(ws.getCell(`D${currentExcelRowIdx}`), clusterTotals.gtn1, true);
    styleNumericCell(ws.getCell(`E${currentExcelRowIdx}`), clusterTotals.total1, true);
    styleNumericCell(ws.getCell(`F${currentExcelRowIdx}`), clusterTotals.cfed1, true);
    styleNumericCell(ws.getCell(`G${currentExcelRowIdx}`), clusterTotals.bar1, true);
    styleNumericCell(ws.getCell(`H${currentExcelRowIdx}`), clusterTotals.final1, true, "0B294F");

    const month2Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
    ["I", "J", "K", "L", "M", "N"].forEach(col => {
      ws.getCell(`${col}${currentExcelRowIdx}`).fill = month2Fill;
    });
    styleNumericCell(ws.getCell(`I${currentExcelRowIdx}`), clusterTotals.stn2, true);
    styleNumericCell(ws.getCell(`J${currentExcelRowIdx}`), clusterTotals.gtn2, true);
    styleNumericCell(ws.getCell(`K${currentExcelRowIdx}`), clusterTotals.total2, true);
    styleNumericCell(ws.getCell(`L${currentExcelRowIdx}`), clusterTotals.cfed2, true);
    styleNumericCell(ws.getCell(`M${currentExcelRowIdx}`), clusterTotals.bar2, true);
    styleNumericCell(ws.getCell(`N${currentExcelRowIdx}`), clusterTotals.final2, true, "0B294F");

    const clDiff = clusterTotals.diff;
    const clDiffColor = clDiff < 0 ? "C00000" : "375623";
    styleNumericCell(ws.getCell(`O${currentExcelRowIdx}`), clDiff, true, clDiffColor);

    const clPctCell = ws.getCell(`P${currentExcelRowIdx}`);
    const clPct = clusterTotals.final2 ? (clDiff / clusterTotals.final2) : 0;
    clPctCell.value = clPct;
    clPctCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF" + clDiffColor } };
    clPctCell.alignment = { horizontal: "center", vertical: "middle" };
    clPctCell.numFmt = "0%";

    styleNumericCell(ws.getCell(`Q${currentExcelRowIdx}`), clusterTotals.last_month_final, true);

    // Apply background and borders for cluster summary row
    allHeaderCols.forEach(col => {
      const cell = ws.getCell(`${col}${currentExcelRowIdx}`);
      if (col !== "I" && col !== "J" && col !== "K" && col !== "L" && col !== "M" && col !== "N") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: clusterBgColor } };
      }
      cell.border = borderStyle;
    });

    currentExcelRowIdx++;
  });

  // Render TOTAL row
  const grandTotalRowIdx = currentExcelRowIdx;
  ws.getRow(grandTotalRowIdx).height = 24;
  ws.mergeCells(`A${grandTotalRowIdx}:B${grandTotalRowIdx}`);
  const grandNameCell = ws.getCell(`A${grandTotalRowIdx}`);
  grandNameCell.value = "TOTAL";
  grandNameCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  grandNameCell.alignment = { horizontal: "center", vertical: "middle" };

  styleNumericCell(ws.getCell(`C${grandTotalRowIdx}`), grandTotals.stn1, true, "FFFFFF");
  styleNumericCell(ws.getCell(`D${grandTotalRowIdx}`), grandTotals.gtn1, true, "FFFFFF");
  styleNumericCell(ws.getCell(`E${grandTotalRowIdx}`), grandTotals.total1, true, "FFFFFF");
  styleNumericCell(ws.getCell(`F${grandTotalRowIdx}`), grandTotals.cfed1, true, "FFFFFF");
  styleNumericCell(ws.getCell(`G${grandTotalRowIdx}`), grandTotals.bar1, true, "FFFFFF");
  styleNumericCell(ws.getCell(`H${grandTotalRowIdx}`), grandTotals.final1, true, "FFFFFF");

  const month2Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
  ["I", "J", "K", "L", "M", "N"].forEach(col => {
    ws.getCell(`${col}${grandTotalRowIdx}`).fill = month2Fill;
  });
  styleNumericCell(ws.getCell(`I${grandTotalRowIdx}`), grandTotals.stn2, true, "FFFFFF");
  styleNumericCell(ws.getCell(`J${grandTotalRowIdx}`), grandTotals.gtn2, true, "FFFFFF");
  styleNumericCell(ws.getCell(`K${grandTotalRowIdx}`), grandTotals.total2, true, "FFFFFF");
  styleNumericCell(ws.getCell(`L${grandTotalRowIdx}`), grandTotals.cfed2, true, "FFFFFF");
  styleNumericCell(ws.getCell(`M${grandTotalRowIdx}`), grandTotals.bar2, true, "FFFFFF");
  styleNumericCell(ws.getCell(`N${grandTotalRowIdx}`), grandTotals.final2, true, "FFFFFF");

  const grDiff = grandTotals.diff;
  styleNumericCell(ws.getCell(`O${grandTotalRowIdx}`), grDiff, true, "FFFFFF");

  const grPctCell = ws.getCell(`P${grandTotalRowIdx}`);
  grPctCell.value = grandTotals.final2 ? (grDiff / grandTotals.final2) : 0;
  grPctCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  grPctCell.alignment = { horizontal: "center", vertical: "middle" };
  grPctCell.numFmt = "0%";

  styleNumericCell(ws.getCell(`Q${grandTotalRowIdx}`), grandTotals.last_month_final, true, "FFFFFF");

  allHeaderCols.forEach(col => {
    const cell = ws.getCell(`${col}${grandTotalRowIdx}`);
    if (col !== "I" && col !== "J" && col !== "K" && col !== "L" && col !== "M" && col !== "N") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    }
    cell.border = borderStyle;
  });

  currentExcelRowIdx++;

  // Render Day Sale Row
  const daySaleRowIdx = currentExcelRowIdx;
  ws.getRow(daySaleRowIdx).height = 22;
  ws.mergeCells(`A${daySaleRowIdx}:B${daySaleRowIdx}`);
  const dayNameCell = ws.getCell(`A${daySaleRowIdx}`);
  dayNameCell.value = "Day Sale";
  dayNameCell.font = { name: "Segoe UI", size: 10, bold: true };
  dayNameCell.alignment = { horizontal: "left", vertical: "middle" };

  // Month 1 Merged C:H
  ws.mergeCells(`C${daySaleRowIdx}:H${daySaleRowIdx}`);
  const ds1Cell = ws.getCell(`C${daySaleRowIdx}`);
  styleNumericCell(ds1Cell, daySales1, true, "0B294F");

  // Month 2 Merged I:N
  ws.mergeCells(`I${daySaleRowIdx}:N${daySaleRowIdx}`);
  const ds2Cell = ws.getCell(`I${daySaleRowIdx}`);
  styleNumericCell(ds2Cell, daySales2, true, "0B294F");
  
  const month2FillInd = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
  styleRange(`I${daySaleRowIdx}:N${daySaleRowIdx}`, month2FillInd, null, null, null);

  // Day Sale Difference Cases & %
  const dayDiff = (Number(daySales1) || 0) - (Number(daySales2) || 0);
  const dayDiffColor = dayDiff < 0 ? "C00000" : "375623";
  styleNumericCell(ws.getCell(`O${daySaleRowIdx}`), dayDiff, true, dayDiffColor);

  const dayPctCell = ws.getCell(`P${daySaleRowIdx}`);
  const daySales2Num = Number(daySales2) || 0;
  dayPctCell.value = daySales2Num ? (dayDiff / daySales2Num) : 0;
  dayPctCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF" + dayDiffColor } };
  dayPctCell.alignment = { horizontal: "center", vertical: "middle" };
  dayPctCell.numFmt = "0%";

  ws.getCell(`Q${daySaleRowIdx}`).value = ""; // Last Month blank

  allHeaderCols.forEach(col => {
    ws.getCell(`${col}${daySaleRowIdx}`).border = borderStyle;
  });

  currentExcelRowIdx++;

  // Render Industry Total Row
  const indRowIdx = currentExcelRowIdx;
  ws.getRow(indRowIdx).height = 22;
  ws.mergeCells(`A${indRowIdx}:B${indRowIdx}`);
  const indNameCell = ws.getCell(`A${indRowIdx}`);
  indNameCell.value = "Industry Total";
  indNameCell.font = { name: "Segoe UI", size: 10, bold: true };
  indNameCell.alignment = { horizontal: "left", vertical: "middle" };

  // Month 1 Merged C:H
  ws.mergeCells(`C${indRowIdx}:H${indRowIdx}`);
  const ind1Cell = ws.getCell(`C${indRowIdx}`);
  styleNumericCell(ind1Cell, industrySales1, true, "0B294F");

  // Month 2 Merged I:N
  ws.mergeCells(`I${indRowIdx}:N${indRowIdx}`);
  const ind2Cell = ws.getCell(`I${indRowIdx}`);
  styleNumericCell(ind2Cell, industrySales2, true, "0B294F");
  styleRange(`I${indRowIdx}:N${indRowIdx}`, month2FillInd, null, null, null);

  const indDiff = (Number(industrySales1) || 0) - (Number(industrySales2) || 0);
  const indDiffColor = indDiff < 0 ? "C00000" : "375623";
  styleNumericCell(ws.getCell(`O${indRowIdx}`), indDiff, true, indDiffColor);

  const indPctCell = ws.getCell(`P${indRowIdx}`);
  const indSales2Num = Number(industrySales2) || 0;
  indPctCell.value = indSales2Num ? (indDiff / indSales2Num) : 0;
  indPctCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF" + indDiffColor } };
  indPctCell.alignment = { horizontal: "center", vertical: "middle" };
  indPctCell.numFmt = "0%";

  // Last Month Industry Sales
  ws.getCell(`Q${indRowIdx}`).value = "";

  allHeaderCols.forEach(col => {
    ws.getCell(`${col}${indRowIdx}`).border = borderStyle;
  });

  // Column Widths
  ws.getColumn("A").width = 7;
  ws.getColumn("B").width = 24;
  ws.getColumn("C").width = 9;
  ws.getColumn("D").width = 9;
  ws.getColumn("E").width = 9;
  ws.getColumn("F").width = 9;
  ws.getColumn("G").width = 9;
  ws.getColumn("H").width = 13;
  ws.getColumn("I").width = 9;
  ws.getColumn("J").width = 9;
  ws.getColumn("K").width = 9;
  ws.getColumn("L").width = 9;
  ws.getColumn("M").width = 9;
  ws.getColumn("N").width = 13;
  ws.getColumn("O").width = 12;
  ws.getColumn("P").width = 10;
  ws.getColumn("Q").width = 15;

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};

export const exportItemIssueConsolidationPdf = ({
  data,
  clusters = {},
  date1,
  date2,
  lastMonthLabel = "",
  daySales1 = "-",
  daySales2 = "-",
  industrySales1 = "",
  industrySales2 = "",
  filename = "item_issue_consolidation.pdf",
  title = "K.S DISTILLERY"
}) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [297, 250]
  });

  const d1Label = date1 ? date1.format("MMM YYYY") : "";
  const d2Label = date2 ? date2.format("MMM YYYY") : "";
  const lmLabel = lastMonthLabel ? lastMonthLabel : "Last Month";

  const d1Day = date1 ? date1.date() : 1;
  const d2Day = date2 ? date2.date() : 1;

  // Set up header structure
  const period1HeaderText = `${date1 ? date1.format("MMMM YYYY").toUpperCase() : ""} - as on ${date1 ? date1.format("D MMMM YYYY") : ""}`;
  const period2HeaderText = `${date2 ? date2.format("MMMM YYYY").toUpperCase() : ""} - as on ${date2 ? date2.format("D MMMM YYYY") : ""}`;

  const headers = [
    [
      { content: "SL NO", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
      { content: "WAREHOUSE", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
      { content: period1HeaderText, colSpan: 6, styles: { halign: "center" } },
      { content: period2HeaderText, colSpan: 6, styles: { halign: "center" } },
      { content: "DIFFERENCE", colSpan: 2, styles: { halign: "center" } },
      { content: `LAST MONTH\n(${lmLabel.toUpperCase()})`, rowSpan: 2, styles: { valign: "middle", halign: "center" } }
    ],
    [
      "STN", "GTN", "TOTAL", "C FED", "BAR", `${d1Day}${date1 ? date1.format("MMM") : ""}`,
      "STN", "GTN", "TOTAL", "C FED", "BAR", `${d2Day}${date2 ? date2.format("MMM") : ""}`,
      "Cases", "%"
    ]
  ];

  // Group and sort data rows
  const tableRows = [];
  let sNoCounter = 1;

  const clusterKeys = ["CLUSTER - 1", "CLUSTER - 2", "CLUSTER - 3"];
  const activeClusters = Object.keys(clusters || {}).length > 0 ? clusters : DEFAULT_CLUSTERS;
  const allClusterKeys = Array.from(new Set([...clusterKeys, ...Object.keys(activeClusters)]));

  const grandTotals = {
    stn1: 0, gtn1: 0, total1: 0, cfed1: 0, bar1: 0, final1: 0,
    stn2: 0, gtn2: 0, total2: 0, cfed2: 0, bar2: 0, final2: 0,
    diff: 0, last_month_final: 0
  };

  const formatNum = (val) => {
    const num = Number(val);
    return isNaN(num) || val === null || val === undefined || val === "-" ? "-" : num.toLocaleString("en-IN");
  };

  allClusterKeys.forEach(clusterName => {
    const whList = activeClusters[clusterName] || [];
    const clusterRows = data.filter(d => getClusterKey(d.warehouse, activeClusters) === clusterName);
    if (clusterRows.length === 0) return;

    const norm = (w) => String(w || "").trim().toUpperCase();
    clusterRows.sort((a, b) => {
      const idxA = whList.findIndex(item => {
        const itemNorm = norm(item);
        const itemWithWH = itemNorm.startsWith("WH-") ? itemNorm : "WH-" + itemNorm;
        const aNorm = norm(a.warehouse);
        const aWithWH = aNorm.startsWith("WH-") ? aNorm : "WH-" + aNorm;
        return aNorm === itemNorm || aWithWH === itemWithWH;
      });
      const idxB = whList.findIndex(item => {
        const itemNorm = norm(item);
        const itemWithWH = itemNorm.startsWith("WH-") ? itemNorm : "WH-" + itemNorm;
        const bNorm = norm(b.warehouse);
        const bWithWH = bNorm.startsWith("WH-") ? bNorm : "WH-" + bNorm;
        return bNorm === itemNorm || bWithWH === itemWithWH;
      });
      return idxA - idxB;
    });

    const clusterTotals = {
      stn1: 0, gtn1: 0, total1: 0, cfed1: 0, bar1: 0, final1: 0,
      stn2: 0, gtn2: 0, total2: 0, cfed2: 0, bar2: 0, final2: 0,
      diff: 0, last_month_final: 0
    };

    clusterRows.forEach(row => {
      const diffVal = row.diff || 0;
      const pctVal = row.pct !== undefined ? `${row.pct}%` : "-";

      tableRows.push([
        String(sNoCounter++),
        formatDepot(row.warehouse).toUpperCase(),
        formatNum(row.stn1),
        formatNum(row.gtn1),
        formatNum(row.total1),
        formatNum(row.cfed1),
        formatNum(row.bar1),
        formatNum(row.final1),
        formatNum(row.stn2),
        formatNum(row.gtn2),
        formatNum(row.total2),
        formatNum(row.cfed2),
        formatNum(row.bar2),
        formatNum(row.final2),
        formatNum(diffVal),
        pctVal,
        formatNum(row.last_month_final)
      ]);

      // Sum totals
      clusterTotals.stn1 += row.stn1 || 0;
      clusterTotals.gtn1 += row.gtn1 || 0;
      clusterTotals.total1 += row.total1 || 0;
      clusterTotals.cfed1 += row.cfed1 || 0;
      clusterTotals.bar1 += row.bar1 || 0;
      clusterTotals.final1 += row.final1 || 0;
      clusterTotals.stn2 += row.stn2 || 0;
      clusterTotals.gtn2 += row.gtn2 || 0;
      clusterTotals.total2 += row.total2 || 0;
      clusterTotals.cfed2 += row.cfed2 || 0;
      clusterTotals.bar2 += row.bar2 || 0;
      clusterTotals.final2 += row.final2 || 0;
      clusterTotals.diff += row.diff || 0;
      clusterTotals.last_month_final += row.last_month_final || 0;

      grandTotals.stn1 += row.stn1 || 0;
      grandTotals.gtn1 += row.gtn1 || 0;
      grandTotals.total1 += row.total1 || 0;
      grandTotals.cfed1 += row.cfed1 || 0;
      grandTotals.bar1 += row.bar1 || 0;
      grandTotals.final1 += row.final1 || 0;
      grandTotals.stn2 += row.stn2 || 0;
      grandTotals.gtn2 += row.gtn2 || 0;
      grandTotals.total2 += row.total2 || 0;
      grandTotals.cfed2 += row.cfed2 || 0;
      grandTotals.bar2 += row.bar2 || 0;
      grandTotals.final2 += row.final2 || 0;
      grandTotals.diff += row.diff || 0;
      grandTotals.last_month_final += row.last_month_final || 0;
    });

    // Append cluster summary row (now as an array with properties)
    const clPct = clusterTotals.final2 ? Math.round((clusterTotals.diff / clusterTotals.final2) * 100) : 0;
    const clRow = [
      { content: clusterName.toUpperCase(), colSpan: 2, styles: { fontStyle: "bold" } },
      formatNum(clusterTotals.stn1),
      formatNum(clusterTotals.gtn1),
      formatNum(clusterTotals.total1),
      formatNum(clusterTotals.cfed1),
      formatNum(clusterTotals.bar1),
      formatNum(clusterTotals.final1),
      formatNum(clusterTotals.stn2),
      formatNum(clusterTotals.gtn2),
      formatNum(clusterTotals.total2),
      formatNum(clusterTotals.cfed2),
      formatNum(clusterTotals.bar2),
      formatNum(clusterTotals.final2),
      formatNum(clusterTotals.diff),
      `${clPct}%`,
      formatNum(clusterTotals.last_month_final)
    ];
    clRow.isClusterTotal = true;
    clRow.clusterName = clusterName;
    tableRows.push(clRow);
  });

  // Grand Total row (now as an array with properties)
  const grPct = grandTotals.final2 ? Math.round((grandTotals.diff / grandTotals.final2) * 100) : 0;
  const grRow = [
    { content: "TOTAL", colSpan: 2, styles: { fontStyle: "bold", halign: "center" } },
    formatNum(grandTotals.stn1),
    formatNum(grandTotals.gtn1),
    formatNum(grandTotals.total1),
    formatNum(grandTotals.cfed1),
    formatNum(grandTotals.bar1),
    formatNum(grandTotals.final1),
    formatNum(grandTotals.stn2),
    formatNum(grandTotals.gtn2),
    formatNum(grandTotals.total2),
    formatNum(grandTotals.cfed2),
    formatNum(grandTotals.bar2),
    formatNum(grandTotals.final2),
    formatNum(grandTotals.diff),
    `${grPct}%`,
    formatNum(grandTotals.last_month_final)
  ];
  grRow.isGrandTotal = true;
  tableRows.push(grRow);

  // Day Sale row (now as an array with properties)
  const dayDiff = (Number(daySales1) || 0) - (Number(daySales2) || 0);
  const daySales2Num = Number(daySales2) || 0;
  const dayPct = daySales2Num ? Math.round((dayDiff / daySales2Num) * 100) : 0;
  const dsRow = [
    { content: "Day Sale", colSpan: 2, styles: { fontStyle: "bold" } },
    { content: formatNum(daySales1), colSpan: 6, styles: { halign: "center", fontStyle: "bold", textColor: [11, 41, 79] } },
    { content: formatNum(daySales2), colSpan: 6, styles: { halign: "center", fontStyle: "bold", textColor: [11, 41, 79] } },
    formatNum(dayDiff), `${dayPct}%`, ""
  ];
  dsRow.isDaySale = true;
  tableRows.push(dsRow);

  // Industry Total row (now as an array with properties)
  const indDiff = (Number(industrySales1) || 0) - (Number(industrySales2) || 0);
  const indSales2Num = Number(industrySales2) || 0;
  const indPct = indSales2Num ? Math.round((indDiff / indSales2Num) * 100) : 0;
  const indRow = [
    { content: "Industry Total", colSpan: 2, styles: { fontStyle: "bold" } },
    { content: formatNum(industrySales1), colSpan: 6, styles: { halign: "center", fontStyle: "bold", textColor: [11, 41, 79] } },
    { content: formatNum(industrySales2), colSpan: 6, styles: { halign: "center", fontStyle: "bold", textColor: [11, 41, 79] } },
    formatNum(indDiff), `${indPct}%`, ""
  ];
  indRow.isIndustryTotal = true;
  tableRows.push(indRow);

  // Column width calculations (landscape A4 is 297mm, margin is 0 -> 297mm print width)
  const colStyles = {
    0: { cellWidth: 10, halign: "center" },  // SL NO
    1: { cellWidth: 64, halign: "left" },    // DEPOT
    2: { cellWidth: 13, halign: "center" },  // STN 1
    3: { cellWidth: 13, halign: "center" },  // GTN 1
    4: { cellWidth: 13, halign: "center" },  // TOTAL 1
    5: { cellWidth: 13, halign: "center" },  // C FED 1
    6: { cellWidth: 13, halign: "center" },  // BAR 1
    7: { cellWidth: 18, halign: "center" },  // Final 1
    8: { cellWidth: 13, halign: "center" },  // STN 2
    9: { cellWidth: 13, halign: "center" },  // GTN 2
    10: { cellWidth: 13, halign: "center" }, // TOTAL 2
    11: { cellWidth: 13, halign: "center" }, // C FED 2
    12: { cellWidth: 13, halign: "center" }, // BAR 2
    13: { cellWidth: 18, halign: "center" }, // Final 2
    14: { cellWidth: 18, halign: "center" }, // Diff Cases
    15: { cellWidth: 15, halign: "center" }, // Diff %
    16: { cellWidth: 24, halign: "center" }  // Last Month
  };

  autoTable(doc, {
    head: headers,
    body: tableRows,
    startY: 20,
    margin: { top: 20, bottom: 10, left: 0, right: 0 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.2,
      lineColor: [255, 189, 49],
      lineWidth: 0.15,
      textColor: [0, 0, 0]
    },
    headStyles: {
      fillColor: [11, 41, 79],
      textColor: [255, 189, 49],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle"
    },
    columnStyles: colStyles,
    didDrawPage: (data) => {
      // Draw Navy header bands (fully borderless)
      doc.setFillColor(11, 41, 79); 
      doc.rect(0, 0, 297, 12, "F");

      doc.setFillColor(11, 41, 79); 
      doc.rect(0, 12, 297, 8, "F");

      // Draw Main Title
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 189, 49); 
      doc.text(title.toUpperCase(), 173.5, 8, { align: "center" });

      // Draw Sub-headings
      doc.setFontSize(10.5);
      doc.setTextColor(255, 255, 255); 
      doc.text(`SECONDARY SALES · ${date1 ? date1.format("MMM YY").toUpperCase() : ""} vs ${date2 ? date2.format("MMM YY").toUpperCase() : ""}`, 5, 17);

      doc.setTextColor(255, 189, 49); 
      doc.text(`AS ON ${date1 ? date1.format("D MMMM YYYY").toUpperCase() : ""}`, 292, 17, { align: "right" });
    },
    didParseCell: (cellData) => {
      // Style headers appropriately
      if (cellData.section === 'head') {
        const colIdx = cellData.column.index;
        if (cellData.row.index === 0) {
          if (colIdx >= 2 && colIdx <= 7) {
            cellData.cell.styles.textColor = [255, 189, 49];
          } else if (colIdx >= 8 && colIdx <= 13) {
            cellData.cell.styles.textColor = [255, 189, 49];
          } else if (colIdx === 14 || colIdx === 15) {
            cellData.cell.styles.textColor = [255, 189, 49];
          } else if (colIdx === 16) {
            cellData.cell.styles.textColor = [255, 189, 49];
          }
        }
      }

      if (cellData.section === 'body') {
        const rawRow = cellData.row.raw;
        const colIdx = cellData.column.index;
        
        // Cream fill for columns 8-13
        if (colIdx >= 8 && colIdx <= 13) {
          cellData.cell.styles.fillColor = [255, 249, 230];
        }

        if (rawRow.isClusterTotal) {
          cellData.cell.styles.fillColor = [255, 192, 0]; // Gold color #FFC000
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.textColor = [0, 0, 0];
          
          if (colIdx === 7 || colIdx === 13) {
            cellData.cell.styles.textColor = [11, 41, 79];
          }
          if (colIdx === 14 || colIdx === 15) {
            const rawVal = String(cellData.row.cells[14]?.raw || "");
            const isNeg = rawVal.startsWith("-");
            cellData.cell.styles.textColor = isNeg ? [192, 0, 0] : [55, 86, 35];
          }
        } else if (rawRow.isGrandTotal) {
          cellData.cell.styles.fillColor = [11, 41, 79]; // Navy #0B294F
          cellData.cell.styles.textColor = [255, 255, 255];
          cellData.cell.styles.fontStyle = "bold";
        } else if (rawRow.isDaySale || rawRow.isIndustryTotal) {
          cellData.cell.styles.fontStyle = "bold";
          if (colIdx === 7 || colIdx === 13) {
            cellData.cell.styles.textColor = [11, 41, 79];
          }
          if (colIdx === 14 || colIdx === 15) {
            const rawVal = String(cellData.row.cells[14]?.raw || "");
            const isNeg = rawVal.startsWith("-");
            cellData.cell.styles.textColor = isNeg ? [192, 0, 0] : [55, 86, 35];
          }
        } else {
          // Regular rows
          // Highlight final1 and final2 columns in Navy
          if (colIdx === 7 || colIdx === 13) {
            cellData.cell.styles.textColor = [11, 41, 79];
            cellData.cell.styles.fontStyle = "bold";
          }
          // Color Difference Cases and %
          if (colIdx === 14 || colIdx === 15) {
            const rawVal = String(cellData.row.cells[14]?.raw || "");
            const isNeg = rawVal.startsWith("-");
            cellData.cell.styles.textColor = isNeg ? [192, 0, 0] : [55, 86, 35];
            cellData.cell.styles.fontStyle = "bold";
          }
          if (cellData.cell.raw === "-") {
            cellData.cell.styles.textColor = [180, 180, 180];
          }
        }
      }
    }
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${i} of ${pageCount}`, 148.5, pageHeight - 7, { align: "center" });
  }

  doc.save(filename);
};
