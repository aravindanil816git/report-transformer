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
const borderStyle = {
  top: { style: "thin", color: { argb: "FFFFBD31" } },
  left: { style: "thin", color: { argb: "FFFFBD31" } },
  bottom: { style: "thin", color: { argb: "FFFFBD31" } },
  right: { style: "thin", color: { argb: "FFFFBD31" } }
};
const lightGrayBorder = {
  top: { style: "thin", color: { argb: "FFFFBD31" } },
  left: { style: "thin", color: { argb: "FFFFBD31" } },
  bottom: { style: "thin", color: { argb: "FFFFBD31" } },
  right: { style: "thin", color: { argb: "FFFFBD31" } }
};

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
  ws.getCell("C1").value = title.toUpperCase();

  // Subtitle Row 2
  ws.mergeCells("A2:N2");
  styleRange(
    "A2:N2",
    navyFill,
    { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFF" } },
    { horizontal: "left", vertical: "middle" },
    null
  );
  ws.getCell("A2").value = `SECONDARY SALES · ${date1 ? date1.format("MMM YY").toUpperCase() : ""} vs ${date2 ? date2.format("MMM YY").toUpperCase() : ""}`;

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
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: clusterBgColor } };
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
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
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
  // Derive dates dynamically
  const curAson = date1;
  const priorAson = date2;
  const priorEnd = priorAson.clone().endOf("month");

  const curMonthName = curAson.format("MMMM").toUpperCase();
  const priorMonthName = priorAson.format("MMMM").toUpperCase();
  const curYear = curAson.format("YYYY");
  const priorYear = priorAson.format("YYYY");

  const subLeft = `SECONDARY SALES · ${curAson.format("MMM YY").toUpperCase()} vs ${priorAson.format("MMM YY").toUpperCase()}`;
  const subRight = `AS ON ${curAson.format("D MMMM YYYY")}`;
  const curBanner = `${curMonthName} ${curYear} - as on ${curAson.format("D MMMM YYYY")}`;
  const priorBanner = `${priorMonthName} ${priorYear} - as on ${priorAson.format("D MMMM YYYY")}`;
  
  const d1Day = curAson.date();
  const d2Day = priorAson.date();
  const curDayColLabel = `${d1Day}${curAson.format("MMM")}`;
  const priorDayColLabel = `${d2Day}${priorAson.format("MMM")}`;
  const lastMonthColLabel = `LAST\nMONTH\n(${priorEnd.format("D\u00A0MMM").toUpperCase()})`;

  const headers = [
    [
      { content: "WAREHOUSE", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
      { content: curBanner, colSpan: 6, styles: { halign: "center" } },
      { content: priorBanner, colSpan: 6, styles: { halign: "center" } },
      { content: "DIFFERENCE", colSpan: 2, styles: { halign: "center" } },
      { content: lastMonthColLabel, rowSpan: 2, styles: { valign: "middle", halign: "center" } }
    ],
    [
      "STN", "GTN", "TOTAL", "C\u00A0FED", "BAR", curDayColLabel,
      "STN", "GTN", "TOTAL", "C\u00A0FED", "BAR", priorDayColLabel,
      "Cases", "%"
    ]
  ];

  // Group and sort data rows
  const tableRows = [];

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

    // Append cluster summary row
    const clPct = clusterTotals.final2 ? Math.round((clusterTotals.diff / clusterTotals.final2) * 100) : 0;
    const clRow = [
      { content: clusterName.toUpperCase(), styles: { fontStyle: "bold" } },
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

  // Grand Total row
  const grPct = grandTotals.final2 ? Math.round((grandTotals.diff / grandTotals.final2) * 100) : 0;
  const grRow = [
    { content: "TOTAL", styles: { fontStyle: "bold", halign: "center" } },
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

  // Day Sale row
  const dayDiff = (Number(daySales1) || 0) - (Number(daySales2) || 0);
  const daySales2Num = Number(daySales2) || 0;
  const dayPct = daySales2Num ? Math.round((dayDiff / daySales2Num) * 100) : 0;
  const dsRow = [
    { content: "Day Sale", styles: { fontStyle: "bold" } },
    { content: formatNum(daySales1), colSpan: 6, styles: { halign: "center", fontStyle: "bold" } },
    { content: formatNum(daySales2), colSpan: 6, styles: { halign: "center", fontStyle: "bold" } },
    formatNum(dayDiff), `${dayPct}%`, ""
  ];
  dsRow.isDaySale = true;
  tableRows.push(dsRow);

  // Industry Total row
  const indDiff = (Number(industrySales1) || 0) - (Number(industrySales2) || 0);
  const indSales2Num = Number(industrySales2) || 0;
  const indPct = indSales2Num ? Math.round((indDiff / indSales2Num) * 100) : 0;
  const indRow = [
    { content: "Industry Total", styles: { fontStyle: "bold" } },
    { content: formatNum(industrySales1), colSpan: 6, styles: { halign: "center", fontStyle: "bold" } },
    { content: formatNum(industrySales2), colSpan: 6, styles: { halign: "center", fontStyle: "bold" } },
    formatNum(indDiff), `${indPct}%`, ""
  ];
  indRow.isIndustryTotal = true;
  tableRows.push(indRow);

  // Initialize jsPDF in points (A4 portrait dimensions: 595.276 x 841.890)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [595.276, 841.890]
  });

  const colors = {
    NAVY: [10, 41, 79],        // #0A294F
    GOLD: [255, 188, 48],      // #FFBC30
    AMBER: [255, 191, 0],      // #FFBF00
    CREAM: [255, 249, 229],    // #FFF9E5
    RED: [192, 0, 0],          // #C00000
    GREEN: [55, 85, 34],       // #375522
    GREY: [139, 139, 139],     // #8B8B8B
    BLACK: [0, 0, 0],          // #000000
    WHITE: [255, 255, 255]     // #FFFFFF
  };

  const PAD = 2.75;
  let activeFontSize = 10.5;
  let finalColWidths = [];

  // Solver helper to measure string widths using dynamic sizes
  const getStringWidthInPt = (text, fontSize, isBold) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    return doc.getTextWidth(String(text || ""));
  };

  while (activeFontSize >= 6) {
    const colWidths = Array(16).fill(0);
    const headerFontSize = 8.5 * (activeFontSize / 10.5);

    const headerWidestWords = [
      "WAREHOUSE", "STN", "GTN", "TOTAL", "C\u00A0FED", "BAR", curDayColLabel,
      "STN", "GTN", "TOTAL", "C\u00A0FED", "BAR", priorDayColLabel,
      "Cases", "%", "(31\u00A0JUL)"
    ];

    for (let col = 0; col < 16; col++) {
      const wordWidth = getStringWidthInPt(headerWidestWords[col], headerFontSize, true);
      colWidths[col] = Math.max(colWidths[col], wordWidth);
    }

    tableRows.forEach(row => {
      for (let col = 0; col < 16; col++) {
        let cellText = "";
        let isBold = false;
        const cellData = row[col];
        if (cellData && typeof cellData === "object") {
          cellText = String(cellData.content || "");
          if (cellData.styles?.fontStyle === "bold") {
            isBold = true;
          }
        } else {
          cellText = String(cellData || "");
        }

        if (row.isClusterTotal || row.isGrandTotal || row.isDaySale || row.isIndustryTotal) {
          isBold = true;
        }
        if (col === 6 || col === 12 || col === 13 || col === 14) {
          isBold = true;
        }

        const valueWidth = getStringWidthInPt(cellText, activeFontSize, isBold);
        colWidths[col] = Math.max(colWidths[col], valueWidth);
      }
    });

    // Apply padding boundaries
    for (let col = 0; col < 16; col++) {
      if (col === 0) {
        colWidths[col] += 4 * PAD; // depot indent padding
      } else {
        colWidths[col] += 2 * PAD;
      }
    }

    // Mirror AUGUST and JULY columns
    for (let i = 0; i < 6; i++) {
      const augCol = 1 + i;
      const julCol = 7 + i;
      const maxPairWidth = Math.max(colWidths[augCol], colWidths[julCol]);
      colWidths[augCol] = colWidths[julCol] = maxPairWidth;
    }

    const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
    if (totalWidth <= 595.276) {
      const leftover = 595.276 - totalWidth;
      const share = leftover / 16;
      finalColWidths = colWidths.map(w => w + share);
      break;
    }

    activeFontSize -= 0.25;
  }

  // Row height derived mathematically to perfectly span the page
  const bodyRowsCount = tableRows.length;
  // Calculate dynamic page height based on rows length to eliminate extra space at the bottom
  // StartY (20) + Header heights (approx 12) + rows * height (approx 5.8mm per row) + margin/footer (25)
  const pageHeight = Math.max(100, 20 + 12 + (tableRows.length * 5.8) + 25);
  const derivedHeight = (841.890 - 40 - 26 - 24 - 26 - 26 - 10) / bodyRowsCount;

  const colStyles = {};
  for (let col = 0; col < 16; col++) {
    colStyles[col] = {
      cellWidth: finalColWidths[col],
      halign: col === 0 ? "left" : "center"
    };
    if (col === 0) {
      colStyles[col].cellPadding = { left: 2 * PAD, right: PAD, top: 2, bottom: 2 };
    }
  }

  autoTable(doc, {
    head: headers,
    body: tableRows,
    startY: 66, // starts immediately below Navy sub-band (40 + 26)
    margin: { top: 66, bottom: 20, left: 0, right: 0 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: activeFontSize,
      minCellHeight: derivedHeight,
      valign: "middle",
      lineWidth: 0, // disabling default autoTable borders to draw custom clean rules
      textColor: colors.BLACK,
      cellPadding: PAD // Set uniform default cellPadding to 2.75pt
    },
    headStyles: {
      fillColor: colors.NAVY,
      textColor: colors.GOLD,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      valign: "middle"
    },
    columnStyles: colStyles,
    didParseCell: (data) => {
      const headerFontSize = 8.5 * (activeFontSize / 10.5);
      if (data.section === 'head') {
        data.cell.styles.fillColor = colors.NAVY;
        data.cell.styles.textColor = colors.GOLD;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = headerFontSize;
        data.cell.styles.minCellHeight = data.row.index === 0 ? 24.0 : 26.0;
      }

      if (data.section === 'body') {
        const rawRow = data.row.raw;
        const colIdx = data.column.index;

        data.cell.styles.fontSize = activeFontSize;
        data.cell.styles.textColor = colors.BLACK;
        data.cell.styles.fontStyle = "normal";

        if (rawRow.isClusterTotal) {
          data.cell.styles.fillColor = colors.AMBER;
          data.cell.styles.fontStyle = "bold";
          if (colIdx === 13 || colIdx === 14) {
            const rawVal = String(data.row.cells[13]?.raw || "");
            const isNeg = rawVal.startsWith("-");
            data.cell.styles.textColor = isNeg ? colors.RED : colors.GREEN;
          }
          if (colIdx === 6 || colIdx === 12) {
            data.cell.styles.textColor = colors.NAVY;
          }
        } else if (rawRow.isGrandTotal) {
          data.cell.styles.fillColor = colors.NAVY;
          data.cell.styles.textColor = colors.WHITE;
          data.cell.styles.fontStyle = "bold";
        } else if (rawRow.isDaySale || rawRow.isIndustryTotal) {
          data.cell.styles.fontStyle = "bold";
          if (colIdx === 0) {
            data.cell.styles.fillColor = colors.WHITE;
            data.cell.styles.halign = "center";
          } else if (colIdx >= 1 && colIdx <= 6) {
            data.cell.styles.fillColor = colors.WHITE;
            data.cell.styles.textColor = colors.NAVY;
            data.cell.styles.halign = "center";
          } else if (colIdx >= 7 && colIdx <= 12) {
            data.cell.styles.fillColor = colors.CREAM;
            data.cell.styles.textColor = colors.NAVY;
            data.cell.styles.halign = "center";
          } else if (colIdx === 13 || colIdx === 14) {
            data.cell.styles.fillColor = colors.WHITE;
            const rawVal = String(data.row.cells[13]?.raw || "");
            const isNeg = rawVal.startsWith("-");
            data.cell.styles.textColor = isNeg ? colors.RED : colors.GREEN;
          } else if (colIdx === 15) {
            data.cell.styles.fillColor = colors.WHITE;
          }
        } else {
          data.cell.styles.fillColor = (colIdx >= 7 && colIdx <= 12) ? colors.CREAM : colors.WHITE;
          
          if (colIdx === 6 || colIdx === 12) {
            data.cell.styles.textColor = colors.NAVY;
            data.cell.styles.fontStyle = "bold";
          }
          if (colIdx === 13 || colIdx === 14) {
            const rawVal = String(data.row.cells[13]?.raw || "");
            const isNeg = rawVal.startsWith("-");
            data.cell.styles.textColor = isNeg ? colors.RED : colors.GREEN;
            data.cell.styles.fontStyle = "bold";
          }
          if (data.cell.raw === "-") {
            data.cell.styles.textColor = [180, 180, 180];
          }
        }
      }
    },
    didDrawPage: (data) => {
      // Draw Navy header bands (fully borderless)
      doc.setFillColor(10, 41, 79); 
      doc.rect(0, 0, 595.276, 40, "F");

      doc.rect(0, 40, 595.276, 26, "F");

      // Draw Main Title (16pt Bold Gold)
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 188, 48); 
      doc.text("K.S DISTILLERY", 297.638, 25, { align: "center" });

      // Draw Sub-headings (11pt Bold Gold)
      doc.setFontSize(11);
      doc.text(subLeft, 10, 56);
      doc.text(subRight, 585.276, 56, { align: "right" });
    },
    didDrawCell: (data) => {
      const { x, y, width, height } = data.cell;
      
      // Draw Gold Grid for Header Block
      if (data.section === 'head') {
        doc.setDrawColor(255, 188, 48); // GOLD
        
        // top rule (row 0, inset by half width)
        if (data.row.index === 0) {
          doc.setLineWidth(2.0); // 2.0pt
          doc.line(x, y + 1.0, x + width, y + 1.0);
          
          // horizontal separator between row 0 and row 1 (1.4pt)
          doc.setLineWidth(1.4);
          doc.line(x, y + height, x + width, y + height);
        }
        // bottom rule (row 1, inset by half width)
        if (data.row.index === 1) {
          doc.setLineWidth(2.0); // 2.0pt
          doc.line(x, y + height - 1.0, x + width, y + height - 1.0);
        }
        
        // vertical column separators (1.4pt)
        doc.setLineWidth(1.4);
        doc.line(x + width, y, x + width, y + height);
      } else {
        // Draw Clean Hairlines for Body cells (0.43pt BLACK)
        doc.setDrawColor(0, 0, 0); 
        doc.setLineWidth(0.43);
        doc.rect(x, y, width, height, 'S');
      }
    }
  });


  const docHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(139, 139, 139); // GREY #8B8B8B
    doc.text(`Page ${i} of ${pageCount}`, 297.638, docHeight - 10 - 8, { align: "center" });
  }

  doc.save(filename);
};
