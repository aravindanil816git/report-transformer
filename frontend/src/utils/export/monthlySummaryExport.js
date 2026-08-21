import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import dayjs from "dayjs";

/**
 * Export Monthly Summary Scorecard to Excel with exact styling matching specifications:
 * - Brand Banner (Navy #0B1931, Gold #D4AF37, 18pt font)
 * - Title Band (Gold #D4AF37 background, Navy #0B1931 text, 13pt font)
 * - 3-Tier Nested Headers (Navy #0B1931 background, Gold #D4AF37 bold text)
 * - Section Dividers (Thick Gold #D4AF37 vertical borders between sections)
 * - Alternating Row Tinting (#F5F7FC vs #FFFFFF)
 * - Cluster Subtotal Rows (Navy #0B1931 background, Gold #D4AF37 bold text)
 * - Grand Total & Average Rows (Gold #D4AF37 background, Navy #0B1931 bold text)
 * - Directional Variance Arrows (▲ Green #3F8600 / ▼ Red #CF1322)
 */
export const exportMonthlySummaryExcel = async ({
  data = [],
  totals = {},
  averages = {},
  meta = null,
  title = "BOND LIQUIDATION SCORECARD",
  useWholeNumbers = false,
  filename = "monthly_summary_scorecard.xlsx"
}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Liquidation Scorecard", {
    views: [{ showGridLines: true }]
  });

  const NAVY = "0B2C52";
  const GOLD = "FAAF19";
  const CHARCOAL = "2C3540"; // Dark Gray for Total and Average rows
  const CHARCOAL_LIGHT = "3E4957"; // Alternating Dark Gray for Average row
  const ROW_TINT = "F5F7FC";
  const ROW_WHITE = "FFFFFF";
  const GRID_COLOR = "C7C7C7";
  const GREEN_COLOR = "3F8600";
  const RED_COLOR = "CF1322";
  const GREEN_LIGHT = "52C41A"; // Lighter/brighter green for dark summary rows
  const RED_LIGHT = "FF7875";   // Lighter/brighter red for dark summary rows

  // Date Label Calculations
  const currMonth = meta?.curr_month ? dayjs(meta.curr_month) : dayjs();
  const prevMonth = meta?.prev_month ? dayjs(meta.prev_month) : currMonth.subtract(1, 'month');

  const currMonthStr = currMonth.format("MMMM").toUpperCase();
  const prevMonthStr = prevMonth.format("MMMM").toUpperCase();
  const currYearStr = currMonth.format("YYYY");
  const prevYearShortStr = prevMonth.format("YY");

  const currDays = meta?.curr_end_date ? dayjs(meta.curr_end_date).date() : currMonth.date();
  const prevDays = meta?.prev_end_date ? dayjs(meta.prev_end_date).date() : prevMonth.date();
  const daysRangeStr = `DAYS 1–${currDays}`;

  const titleText = `${title} — ${currMonthStr} vs ${prevMonthStr} ${currYearStr}  ·  ${daysRangeStr}`;

  const borderThin = { style: "thin", color: { argb: GRID_COLOR } };
  const borderGoldThick = { style: "medium", color: { argb: GOLD } };

  // Helper for formatting values
  const fmtNum = (val, isPct = false) => {
    if (val === undefined || val === null || isNaN(val)) return 0;
    const num = Number(val);
    if (isPct) {
      return useWholeNumbers ? Math.round(num) : Number(num.toFixed(1));
    }
    return useWholeNumbers ? Math.round(num) : Number(num.toFixed(2));
  };

  // --- Row 1: Brand Banner ---
  ws.getRow(1).height = 36;
  ws.mergeCells("A1:T1");
  const r1Cell = ws.getCell("A1");
  r1Cell.value = "K.S DISTILLERY";
  r1Cell.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: GOLD } };
  r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  r1Cell.alignment = { horizontal: "center", vertical: "middle" };

  // --- Row 2: Title Band ---
  ws.getRow(2).height = 24;
  const reportTitle = "BOND LIQUIDATION SCORECARD";
  const periodStr = `${currMonthStr} vs ${prevMonthStr} ${currYearStr}  ·  DAYS 1–${currDays}`;

  ws.mergeCells("A2:I2");
  const r2Left = ws.getCell("A2");
  r2Left.value = reportTitle;
  r2Left.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: NAVY } };
  r2Left.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  r2Left.alignment = { horizontal: "left", vertical: "middle" };

  ws.mergeCells("J2:T2");
  const r2Right = ws.getCell("J2");
  r2Right.value = periodStr;
  r2Right.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: NAVY } };
  r2Right.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  r2Right.alignment = { horizontal: "right", vertical: "middle" };

  // --- Header Rows 3, 4, 5 ---
  ws.getRow(3).height = 22;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;

  // Header Tier 1: Section Titles
  ws.mergeCells("A3:A5");
  ws.getCell("A3").value = "Bond";

  ws.mergeCells("B3:E3");
  ws.getCell("B3").value = `SHOP LIQUIDATION (KSBC)`;

  ws.mergeCells("G3:J3");
  ws.getCell("G3").value = "SECONDARY SALES";

  ws.mergeCells("L3:O3");
  ws.getCell("L3").value = "FED / BAR INVOICE";

  ws.mergeCells("Q3:T3");
  ws.getCell("Q3").value = "TOTAL LIQUIDATION";

  // Spacers between sections (F3:F5, K3:K5, P3:P5)
  ws.mergeCells("F3:F5");
  ws.mergeCells("K3:K5");
  ws.mergeCells("P3:P5");

  // Header Tier 2: Days / Labels
  ws.getCell("B4").value = `AUG 1–${currDays}`;
  ws.getCell("C4").value = `JUL 1–${prevDays}`;
  ws.mergeCells("D4:D5"); ws.getCell("D4").value = "Δ CASES";
  ws.mergeCells("E4:E5"); ws.getCell("E4").value = "Δ %";

  ws.getCell("G4").value = `AUG 1–${currDays}`;
  ws.getCell("H4").value = `JUL 1–${prevDays}`;
  ws.mergeCells("I4:I5"); ws.getCell("I4").value = "Δ CASES";
  ws.mergeCells("J4:J5"); ws.getCell("J4").value = "Δ %";

  ws.getCell("L4").value = `AUG 1–${currDays}`;
  ws.getCell("M4").value = `JUL 1–${prevDays}`;
  ws.mergeCells("N4:N5"); ws.getCell("N4").value = "Δ CASES";
  ws.mergeCells("O4:O5"); ws.getCell("O4").value = "Δ %";

  ws.getCell("Q4").value = `AUG 1–${currDays}`;
  ws.getCell("R4").value = `JUL 1–${prevDays}`;
  ws.mergeCells("S4:S5"); ws.getCell("S4").value = "Δ CASES";
  ws.mergeCells("T4:T5"); ws.getCell("T4").value = "Δ %";

  // Header Tier 3: Specific Days Labels
  const cShDays = meta?.curr_sh_days ?? currDays;
  const pShDays = meta?.prev_sh_days ?? prevDays;
  const cWhDays = meta?.curr_wh_days ?? currDays;
  const pWhDays = meta?.prev_wh_days ?? prevDays;

  ws.getCell("B5").value = `${cShDays} DAYS`;
  ws.getCell("C5").value = `${pShDays} DAYS`;

  ws.getCell("G5").value = `${cWhDays} DAYS`;
  ws.getCell("H5").value = `${pWhDays} DAYS`;

  ws.getCell("L5").value = `${cWhDays} DAYS`;
  ws.getCell("M5").value = `${pWhDays} DAYS`;

  ws.getCell("Q5").value = `${cShDays} DAYS`;
  ws.getCell("R5").value = `${pShDays} DAYS`;

  // Apply Header Styles
  for (let r = 3; r <= 5; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = ws.getCell(r, c);
      if (c === 6 || c === 11 || c === 16) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        cell.border = {
          left: borderGoldThick,
          right: borderGoldThick
        };
        continue;
      }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: GOLD } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      const isRightSectionEdge = (c === 1 || c === 5 || c === 10 || c === 15 || c === 20);
      const isLeftSectionEdge = (c === 1 || c === 2 || c === 7 || c === 12 || c === 17);

      cell.border = {
        top: borderThin,
        bottom: borderThin,
        left: isLeftSectionEdge ? borderGoldThick : borderThin,
        right: isRightSectionEdge ? borderGoldThick : borderThin
      };
    }
  }

  let rIdx = 6;

  const writeRowValues = (row, isClusterTotal, isGrandTotal, isAvgRow = false) => {
    ws.getRow(rIdx).height = 20;

    const valuesMap = [
      { key: "bond", isText: true },
      // Shop Liq
      { val: fmtNum(row.curr_shop_liq), isCurr: true },
      { val: fmtNum(row.prev_shop_liq), isPrev: true },
      { val: fmtNum(row.var_shop_liq), isVar: true },
      { val: fmtNum(row.pct_shop_liq, true), isPct: true },
      // Spacer F
      { isSpacer: true },
      // Sec Sales
      { val: fmtNum(row.curr_sec_sales), isCurr: true },
      { val: fmtNum(row.prev_sec_sales), isPrev: true },
      { val: fmtNum(row.var_sec_sales), isVar: true },
      { val: fmtNum(row.pct_sec_sales, true), isPct: true },
      // Spacer K
      { isSpacer: true },
      // Fed Bar
      { val: fmtNum(row.curr_fed_bar), isCurr: true },
      { val: fmtNum(row.prev_fed_bar), isPrev: true },
      { val: fmtNum(row.var_fed_bar), isVar: true },
      { val: fmtNum(row.pct_fed_bar, true), isPct: true },
      // Spacer P
      { isSpacer: true },
      // Total Liq
      { val: fmtNum(row.curr_total), isCurr: true },
      { val: fmtNum(row.prev_total), isPrev: true },
      { val: fmtNum(row.var_total), isVar: true },
      { val: fmtNum(row.pct_total, true), isPct: true },
    ];

    valuesMap.forEach((colInfo, idx) => {
      const colNum = idx + 1;
      const cell = ws.getCell(rIdx, colNum);

      const isRightSectionEdge = (colNum === 1 || colNum === 5 || colNum === 10 || colNum === 15 || colNum === 20);
      const isLeftSectionEdge = (colNum === 1 || colNum === 2 || colNum === 7 || colNum === 12 || colNum === 17);

      let border = {
        top: borderThin,
        bottom: borderThin,
        left: isLeftSectionEdge ? borderGoldThick : borderThin,
        right: isRightSectionEdge ? borderGoldThick : borderThin
      };

      if (isGrandTotal || isAvgRow) {
        border.top = borderGoldThick;
        border.bottom = borderGoldThick;
      }

      if (colInfo.isSpacer) {
        cell.value = "";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        cell.border = {
          left: borderGoldThick,
          right: borderGoldThick
        };
        return;
      }

      cell.border = border;

      const rowBgColor = isGrandTotal ? CHARCOAL : (isAvgRow ? CHARCOAL_LIGHT : (isClusterTotal ? NAVY : null));

      if (colInfo.isText) {
        cell.value = row.bond || row.label || "";
        cell.alignment = { horizontal: "left", vertical: "middle" };
        if (isGrandTotal || isAvgRow) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBgColor } };
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
        } else if (isClusterTotal) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: GOLD } };
        } else {
          const isZebra = rIdx % 2 === 0;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isZebra ? ROW_TINT : ROW_WHITE } };
          cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "282828" } };
        }
        return;
      }

      const numVal = Number(colInfo.val || 0);

      if (isGrandTotal || isAvgRow) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBgColor } };
        cell.alignment = { horizontal: "right", vertical: "middle" };
        
        if (colInfo.isVar || colInfo.isPct) {
          const isPos = numVal > 0;
          const isNeg = numVal < 0;
          const arrow = isPos ? "▲ " : (isNeg ? "▼ " : "");
          const formattedStr = colInfo.isPct ? `${arrow}${Math.abs(numVal).toFixed(1)}%` : `${arrow}${Math.abs(numVal)}`;
          cell.value = formattedStr;
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: isPos ? GREEN_LIGHT : (isNeg ? RED_LIGHT : "FFFFFF") } };
        } else {
          cell.value = numVal === 0 ? "-" : numVal;
          if (typeof cell.value === "number") cell.numFmt = useWholeNumbers ? "0" : "0.00";
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
        }
      } else if (isClusterTotal) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: "right", vertical: "middle" };

        if (colInfo.isVar || colInfo.isPct) {
          const isPos = numVal > 0;
          const isNeg = numVal < 0;
          const arrow = isPos ? "▲ " : (isNeg ? "▼ " : "");
          const formattedStr = colInfo.isPct ? `${arrow}${Math.abs(numVal).toFixed(1)}%` : `${arrow}${Math.abs(numVal)}`;
          cell.value = formattedStr;
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: isPos ? GREEN_LIGHT : (isNeg ? RED_LIGHT : GOLD) } };
        } else {
          cell.value = numVal === 0 ? "-" : numVal;
          if (typeof cell.value === "number") cell.numFmt = useWholeNumbers ? "0" : "0.00";
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: GOLD } };
        }
      } else {
        // Leaf row
        const isZebra = rIdx % 2 === 0;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isZebra ? ROW_TINT : ROW_WHITE } };
        cell.alignment = { horizontal: "right", vertical: "middle" };

        if (colInfo.isVar || colInfo.isPct) {
          const isPos = numVal > 0;
          const isNeg = numVal < 0;
          const arrow = isPos ? "▲ " : (isNeg ? "▼ " : "");
          const formattedStr = colInfo.isPct ? `${arrow}${Math.abs(numVal).toFixed(1)}%` : `${arrow}${Math.abs(numVal)}`;
          cell.value = formattedStr;
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: isPos ? GREEN_COLOR : (isNeg ? RED_COLOR : "282828") } };
        } else {
          cell.value = numVal === 0 ? "-" : numVal;
          if (typeof cell.value === "number") cell.numFmt = useWholeNumbers ? "0" : "0.00";
          cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "0F192D" } };
        }
      }
    });

    rIdx++;
  };

  // Write Data Rows & Subtotals
  data.forEach(row => {
    writeRowValues(row, Boolean(row.isClusterTotal), false, false);
  });

  // Write Grand Total Row
  writeRowValues({ bond: "TOTAL", ...totals }, false, true, false);

  // Write Average Daily Sale Row
  writeRowValues({ bond: "AVERAGE DAILY SALE", ...averages }, false, false, true);

  // Column Widths
  ws.getColumn(1).width = 24;
  for (let c = 2; c <= 20; c++) {
    if (c === 6 || c === 11 || c === 16) {
      ws.getColumn(c).width = 3;
    } else {
      const isVarOrPct = (c % 5 === 0 || c % 5 === 4);
      ws.getColumn(c).width = isVarOrPct ? 13 : 11;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};

/**
 * Export Monthly Summary Scorecard to PDF with auto-fit canvas layout.
 */
export const exportMonthlySummaryPdf = ({
  data = [],
  totals = {},
  averages = {},
  meta = null,
  title = "BOND LIQUIDATION SCORECARD",
  useWholeNumbers = false,
  filename = "monthly_summary_scorecard.pdf"
}) => {
  // Date Labels
  const currMonth = meta?.curr_month ? dayjs(meta.curr_month) : dayjs();
  const prevMonth = meta?.prev_month ? dayjs(meta.prev_month) : currMonth.subtract(1, 'month');

  const currMonthStr = currMonth.format("MMMM").toUpperCase();
  const prevMonthStr = prevMonth.format("MMMM").toUpperCase();
  const currYearStr = currMonth.format("YYYY");

  const currDays = meta?.curr_end_date ? dayjs(meta.curr_end_date).date() : currMonth.date();
  const prevDays = meta?.prev_end_date ? dayjs(meta.prev_end_date).date() : prevMonth.date();

  // Column Metrics & Layout Calculations (Zero margins, custom fit canvas)
  const labelColWidth = 110;
  const dataColWidth = 52;
  const spacerWidth = 6;
  const numDataCols = 16;
  const numSpacers = 3;

  const colWidths = [labelColWidth];
  for (let i = 0; i < numDataCols; i++) {
    colWidths.push(dataColWidth);
    if (i === 3 || i === 7 || i === 11) {
      colWidths.push(spacerWidth);
    }
  }

  const colX = [0];
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(colX[i] + colWidths[i]);
  }

  const pageWidth = colX[colX.length - 1];
  const rowHeight = 20;
  const headerHeight = 36;
  const totalRows = data.length + 2; // Data/subtotals + Grand Total + Average
  const pageHeight = 44 + 26 + headerHeight + (totalRows * rowHeight);

  const doc = new jsPDF({
    unit: "pt",
    format: [pageWidth, pageHeight],
    orientation: pageWidth > pageHeight ? "landscape" : "portrait"
  });

  const NAVY = [11, 44, 82];          // #0B2C52 Dark Navy
  const GOLD = [250, 175, 25];        // #FAAF19 Vibrant Gold
  const ROW_TINT = [245, 247, 252];   // #F5F7FC
  const ROW_WHITE = [255, 255, 255];  // #FFFFFF
  const GRID_COLOR = [199, 199, 199];
  const GREEN_COLOR = [63, 134, 0];
  const RED_COLOR = [207, 19, 34];

  // 1. Top Brand Banner: K.S DISTILLERY
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 44, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...GOLD);
  const brandText = "K.S DISTILLERY";
  const wBrand = doc.getTextWidth(brandText);
  doc.text(brandText, (pageWidth - wBrand) / 2, 28);

  // 2. Title Band: BOND LIQUIDATION SCORECARD
  doc.setFillColor(...GOLD);
  doc.rect(0, 44, pageWidth, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text("BOND LIQUIDATION SCORECARD", 12, 61);

  const periodText = `${currMonthStr} vs ${prevMonthStr} ${currYearStr}  ·  DAYS 1–${currDays}  ·  cases`;
  const wPeriod = doc.getTextWidth(periodText);
  doc.text(periodText, pageWidth - 12 - wPeriod, 61);

  // 3. Nested Table Header (y = 70 to y = 106)
  const headerTopY = 70;

  doc.setFillColor(...NAVY);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.0);

  // Bond Header
  doc.rect(colX[0], headerTopY, colWidths[0], headerHeight, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.text("Bond", colX[0] + 8, headerTopY + 22);

  // Section Tier 1 (startCol 1=Shop Liq, 6=Sec Sales, 11=Fed Bar, 16=Total Liq)
  const sections = [
    { name: `SHOP LIQUIDATION (KSBC)`, startCol: 1, span: 4 },
    { name: `SECONDARY SALES`, startCol: 6, span: 4 },
    { name: `FED / BAR INVOICE`, startCol: 11, span: 4 },
    { name: `TOTAL LIQUIDATION`, startCol: 16, span: 4 }
  ];

  sections.forEach(sec => {
    const x = colX[sec.startCol];
    const w = sec.span * dataColWidth;
    doc.setFillColor(...NAVY);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.0);
    doc.rect(x, headerTopY, w, 18, "FD");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GOLD);
    doc.text(sec.name, x + (w - doc.getTextWidth(sec.name)) / 2, headerTopY + 12);
  });

  // Section Tier 2 Sub-Headers ('AUG', 'JUL', 'Δ CS', 'Δ %')
  const subHeaders = [
    // Shop Liq
    { c1: "AUG", colIdx: 1 }, { c1: "JUL", colIdx: 2 }, { c1: "Δ CS", isDeltaCs: true, colIdx: 3 }, { c1: "Δ %", isDeltaPct: true, colIdx: 4 },
    // Sec Sales
    { c1: "AUG", colIdx: 6 }, { c1: "JUL", colIdx: 7 }, { c1: "Δ CS", isDeltaCs: true, colIdx: 8 }, { c1: "Δ %", isDeltaPct: true, colIdx: 9 },
    // Fed Bar
    { c1: "AUG", colIdx: 11 }, { c1: "JUL", colIdx: 12 }, { c1: "Δ CS", isDeltaCs: true, colIdx: 13 }, { c1: "Δ %", isDeltaPct: true, colIdx: 14 },
    // Total Liq
    { c1: "AUG", colIdx: 16 }, { c1: "JUL", colIdx: 17 }, { c1: "Δ CS", isDeltaCs: true, colIdx: 18 }, { c1: "Δ %", isDeltaPct: true, colIdx: 19 }
  ];

  subHeaders.forEach((sh) => {
    const x = colX[sh.colIdx];
    const w = dataColWidth;
    const subTopY = headerTopY + 18;

    doc.setFillColor(...NAVY);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.0);
    doc.rect(x, subTopY, w, 18, "FD");

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GOLD);
    doc.setFillColor(...GOLD);

    if (sh.isDeltaCs) {
      const textW = doc.getTextWidth("CS");
      const triW = 4.5;
      const gapW = 2.0;
      const totalW = textW + triW + gapW;
      const cellCenter = x + w / 2;
      const startX = cellCenter - totalW / 2;
      const triX = startX + triW / 2;
      const centerY = subTopY + 9;

      doc.triangle(triX, centerY - 2.5, triX - 2.0, centerY + 2.0, triX + 2.0, centerY + 2.0, "FD");
      doc.text("CS", startX + triW + gapW, subTopY + 12);
    } else if (sh.isDeltaPct) {
      const textW = doc.getTextWidth("%");
      const triW = 4.5;
      const gapW = 2.0;
      const totalW = textW + triW + gapW;
      const cellCenter = x + w / 2;
      const startX = cellCenter - totalW / 2;
      const triX = startX + triW / 2;
      const centerY = subTopY + 9;

      doc.triangle(triX, centerY - 2.5, triX - 2.0, centerY + 2.0, triX + 2.0, centerY + 2.0, "FD");
      doc.text("%", startX + triW + gapW, subTopY + 12);
    } else {
      doc.text(sh.c1, x + (w - doc.getTextWidth(sh.c1)) / 2, subTopY + 12);
    }
  });

  // Table Body Rows
  let currentY = headerTopY + headerHeight;

  const fmtValue = (val, isPct = false) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    const num = Number(val);
    if (num === 0) return "-";
    if (isPct) {
      return useWholeNumbers ? `${Math.round(num)}%` : `${num.toFixed(1)}%`;
    }
    return useWholeNumbers ? Math.round(num).toString() : num.toFixed(2);
  };

  const CHARCOAL_PDF = [44, 53, 64];
  const CHARCOAL_LIGHT_PDF = [62, 73, 87];

  const renderPdfRow = (row, isClusterTotal = false, isGrandTotal = false, isAvgRow = false) => {
    const valuesList = [
      row.bond || row.label || "",
      // Shop Liq
      fmtValue(row.curr_shop_liq), fmtValue(row.prev_shop_liq), fmtValue(row.var_shop_liq), fmtValue(row.pct_shop_liq, true),
      // Spacer 5
      "",
      // Sec Sales
      fmtValue(row.curr_sec_sales), fmtValue(row.prev_sec_sales), fmtValue(row.var_sec_sales), fmtValue(row.pct_sec_sales, true),
      // Spacer 10
      "",
      // Fed Bar
      fmtValue(row.curr_fed_bar), fmtValue(row.prev_fed_bar), fmtValue(row.var_fed_bar), fmtValue(row.pct_fed_bar, true),
      // Spacer 15
      "",
      // Total Liq
      fmtValue(row.curr_total), fmtValue(row.prev_total), fmtValue(row.var_total), fmtValue(row.pct_total, true)
    ];

    const rawVars = [
      null,
      null, null, row.var_shop_liq, row.pct_shop_liq,
      null,
      null, null, row.var_sec_sales, row.pct_sec_sales,
      null,
      null, null, row.var_fed_bar, row.pct_fed_bar,
      null,
      null, null, row.var_total, row.pct_total
    ];

    valuesList.forEach((valStr, cIdx) => {
      const x = colX[cIdx];
      const w = colWidths[cIdx];

      if (cIdx === 5 || cIdx === 10 || cIdx === 15) {
        // Render Navy pillar with Gold double borders matching design spec
        doc.setFillColor(...NAVY);
        doc.rect(x, currentY, w, rowHeight, "F");
        doc.setLineWidth(1.0);
        doc.setDrawColor(...GOLD);
        doc.line(x, currentY, x, currentY + rowHeight);
        doc.line(x + w, currentY, x + w, currentY + rowHeight);
        return;
      }

      if (isGrandTotal) {
        doc.setFillColor(...CHARCOAL_PDF);
      } else if (isAvgRow) {
        doc.setFillColor(...CHARCOAL_LIGHT_PDF);
      } else if (isClusterTotal) {
        doc.setFillColor(...NAVY);
      } else {
        const isZebra = Math.floor(currentY / rowHeight) % 2 === 0;
        doc.setFillColor(...(isZebra ? ROW_TINT : ROW_WHITE));
      }

      if (isGrandTotal || isAvgRow) {
        doc.setLineWidth(0.8);
        doc.setDrawColor(...GOLD);
      } else {
        doc.setLineWidth(0.3);
        doc.setDrawColor(...GRID_COLOR);
      }

      doc.rect(x, currentY, w, rowHeight, "FD");

      doc.setFont("helvetica", (isClusterTotal || isGrandTotal || isAvgRow) ? "bold" : "normal");
      doc.setFontSize(8.0);

      const rawVar = rawVars[cIdx];
      let textColor = (isGrandTotal || isAvgRow) ? [255, 255, 255] : (isClusterTotal ? GOLD : [40, 40, 40]);
      let renderText = String(valStr);

      if (rawVar !== null && rawVar !== undefined && !isNaN(Number(rawVar)) && Number(rawVar) !== 0) {
        const numV = Number(rawVar);
        const isPos = numV > 0;
        if (isGrandTotal || isAvgRow || isClusterTotal) {
          textColor = isPos ? [82, 196, 26] : [255, 120, 117];
        } else {
          textColor = isPos ? GREEN_COLOR : RED_COLOR;
        }

        if (cIdx % 5 === 3 || cIdx % 5 === 4) {
          const isPctCol = cIdx % 5 === 4;
          const numOnlyStr = renderText.replace(/^[▲▼%\s]+/, '').replace(/%$/, '').trim();
          const cleanNumVal = isPctCol ? `${numOnlyStr}%` : numOnlyStr;

          doc.setFont("helvetica", (isClusterTotal || isGrandTotal || isAvgRow) ? "bold" : "normal");
          doc.setFontSize(8.0);
          doc.setTextColor(...textColor);
          doc.setFillColor(...textColor);
          doc.setDrawColor(...textColor);

          const textW = doc.getTextWidth(cleanNumVal);
          const triW = 4.5;
          const gapW = 2.0;
          const totalW = textW + triW + gapW;

          const cellCenter = x + w / 2;
          const startX = cellCenter - totalW / 2;
          const triX = startX + triW / 2;
          const centerY = currentY + 10;

          if (isPos) {
            doc.triangle(triX, centerY - 3, triX - 2.5, centerY + 2.5, triX + 2.5, centerY + 2.5, "FD");
          } else {
            doc.triangle(triX, centerY + 3, triX - 2.5, centerY - 2.5, triX + 2.5, centerY - 2.5, "FD");
          }

          doc.text(cleanNumVal, startX + triW + gapW, currentY + 13.0);
          return;
        }
      }

      doc.setTextColor(...textColor);

      if (cIdx === 0) {
        doc.text(renderText, x + 6, currentY + 13.0);
      } else {
        const tw = doc.getTextWidth(renderText);
        doc.text(renderText, x + (w - tw) / 2, currentY + 13.0);
      }
    });

    currentY += rowHeight;
  };

  // Render Data Rows
  data.forEach(row => {
    renderPdfRow(row, Boolean(row.isClusterTotal), false, false);
  });

  // Render Grand Total
  renderPdfRow({ bond: "TOTAL", ...totals }, false, true, false);

  // Render Average Sale Row
  renderPdfRow({ bond: "AVERAGE DAILY SALE", ...averages }, false, false, true);

  doc.save(filename);
};
