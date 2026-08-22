import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import dayjs from "dayjs";

/**
 * Export Permit Status Report to Excel matching exact specifications:
 * - Each warehouse as a separate tab in Excel
 * - Brand Banner (Navy #0B2C52 fill, Gold #FAAF19 text: K.S DISTILLERY)
 * - Title Band (Gold #FAAF19 fill, Navy #0B2C52 text: PERMIT STATUS REPORT · [DATE] · [WAREHOUSE])
 * - Light Blue Column Headers (#D9E1F2 fill, Navy #0B2C52 bold text)
 * - Bold Golden Section Dividers (#D4B106) between brand blocks
 * - Conditional formatting for Trigger Status, Variance, and Required Stock
 */
export const exportPermitStatusExcel = async ({
  reportsByWarehouse = {},
  warehouses = [],
  config = {},
  filename = null
}) => {
  const workbook = new ExcelJS.Workbook();

  const NAVY = "0B2C52";
  const GOLD = "FAAF19";
  const GOLD_BORDER = "D4B106";
  const HEADER_BLUE = "D9E1F2";
  const GRID_COLOR = "D9D9D9";
  const RED_TEXT = "CF1322";
  const GREEN_TEXT = "3F8600";
  const SOFT_RED_FILL = "FDE8E8";
  const SOFT_GREEN_FILL = "E6F7ED";
  const ROW_TINT = "F9FAFC";
  const ROW_WHITE = "FFFFFF";

  const thinBorder = { style: "thin", color: { argb: GRID_COLOR } };
  const goldBorder = { style: "medium", color: { argb: GOLD_BORDER } };

  const getColLetter = (colIdx) => {
    let temp = "";
    let letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  };

  const formattedDateStr = config.date
    ? dayjs(config.date).format("DD MMMM YYYY").toUpperCase()
    : dayjs().format("DD MMMM YYYY").toUpperCase();

  const maintTh = config.maint_threshold !== undefined ? config.maint_threshold : 40;
  const targetTh = config.target_threshold !== undefined ? config.target_threshold : 125;

  const whList = warehouses.length > 0 ? warehouses : Object.keys(reportsByWarehouse);

  whList.forEach((whName) => {
    const whReport = reportsByWarehouse[whName] || {};
    const rowsData = whReport.data || [];
    const monthLabels = whReport.month_labels || ["Month 1", "Month 2", "Month 3"];

    // Clean sheet name (max 31 chars)
    let sheetName = String(whName).replace(/[\\/?*:[\]]/g, "_");
    if (sheetName.length > 31) {
      sheetName = sheetName.substring(0, 31);
    }

    const ws = workbook.addWorksheet(sheetName, {
      views: [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: true }]
    });

    const totalCols = 13;
    const lastCol = getColLetter(totalCols);

    // --- Row 1: Brand Banner ---
    ws.getRow(1).height = 36;
    ws.mergeCells(`A1:${lastCol}1`);
    const r1Cell = ws.getCell("A1");
    r1Cell.value = "K.S DISTILLERY";
    r1Cell.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: GOLD } };
    r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    r1Cell.alignment = { horizontal: "center", vertical: "middle" };

    // --- Row 2: Title Band ---
    ws.getRow(2).height = 24;
    ws.mergeCells(`A2:${lastCol}2`);
    const r2Cell = ws.getCell("A2");
    r2Cell.value = `PERMIT STATUS REPORT · AS ON: ${formattedDateStr} · ${whName.toUpperCase()}`;
    r2Cell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: NAVY } };
    r2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    r2Cell.alignment = { horizontal: "center", vertical: "middle" };

    // --- Row 3: Sub-Header Config Info ---
    ws.getRow(3).height = 20;
    ws.mergeCells(`A3:${lastCol}3`);
    const r3Cell = ws.getCell("A3");
    r3Cell.value = `Maintenance Threshold: ${maintTh}%   |   Target Threshold: ${targetTh}% of 3 Months Average`;
    r3Cell.font = { name: "Segoe UI", size: 10, italic: true, bold: true, color: { argb: NAVY } };
    r3Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F2F4F8" } };
    r3Cell.alignment = { horizontal: "center", vertical: "middle" };

    // --- Row 4: Column Headers ---
    ws.getRow(4).height = 28;
    const headers = [
      "Brand",
      "Pack Size",
      monthLabels[0] || "Month 1",
      monthLabels[1] || "Month 2",
      monthLabels[2] || "Month 3",
      "AVG 3 Months",
      "STOCK TO BE MAINTAINED",
      "ALLOTABLE STOCK",
      "VARIANCE",
      "Trigger Status",
      "PENDING PERMIT",
      `TARGET STOCK (${targetTh}% OF 3M AVG)`,
      "Required stock for Permit"
    ];

    headers.forEach((hText, cIdx) => {
      const cell = ws.getCell(`${getColLetter(cIdx + 1)}4`);
      cell.value = hText;
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BLUE } };
      cell.alignment = {
        horizontal: cIdx < 2 ? "left" : cIdx === 9 ? "center" : "right",
        vertical: "middle",
        wrapText: true
      };
      cell.border = {
        top: thinBorder,
        left: thinBorder,
        right: thinBorder,
        bottom: goldBorder
      };
    });

    // --- Rows 5+: Data Rows ---
    let currentRow = 5;
    const brandRowSpans = [];

    // Calculate Brand Group Rowspans
    let currentBrand = null;
    let brandStartRow = 5;

    rowsData.forEach((row, rIdx) => {
      const rNum = 5 + rIdx;
      ws.getRow(rNum).height = 22;
      const isZebra = Math.floor(rIdx / 5) % 2 === 1;
      const rowBg = isZebra ? ROW_TINT : ROW_WHITE;
      const isBrandLastRow = (rIdx + 1) % 5 === 0 || rIdx === rowsData.length - 1;

      // Values
      const brandVal = row.brand || "";
      const packVal = row.pack || "";
      const m1Val = Number(row.m1) || 0;
      const m2Val = Number(row.m2) || 0;
      const m3Val = Number(row.m3) || 0;
      const avgVal = Number(row.avg_3m) || 0;
      const maintVal = Number(row.maint_stock) || 0;
      const allotableVal = Number(row.allotable) || 0;
      const varianceVal = Number(row.variance) || 0;
      const triggerStatusVal = row.trigger_status || (varianceVal < 0 ? "APPLY FOR PERMIT" : "STOCK OK");
      const pendingVal = Number(row.pending_permit) || 0;
      const targetVal = Number(row.target_stock) || 0;
      const reqVal = Number(row.required_stock) || 0;

      const cellVals = [
        brandVal,
        packVal,
        m1Val,
        m2Val,
        m3Val,
        avgVal,
        maintVal,
        allotableVal,
        varianceVal,
        triggerStatusVal,
        pendingVal,
        targetVal,
        reqVal
      ];

      cellVals.forEach((val, cIdx) => {
        const colLet = getColLetter(cIdx + 1);
        const cell = ws.getCell(`${colLet}${rNum}`);
        cell.value = val;

        // Base Font & Alignment
        cell.font = { name: "Segoe UI", size: 10, color: { argb: "000000" } };
        cell.alignment = {
          horizontal: cIdx === 0 || cIdx === 1 ? "left" : cIdx === 9 ? "center" : "right",
          vertical: "middle"
        };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };

        // Number Formatting for metrics
        if (cIdx >= 2 && cIdx !== 9) {
          cell.numFmt = "#,##0.00";
        }

        // Custom Cell Styling
        if (cIdx === 0) {
          cell.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: NAVY } };
        } else if (cIdx === 1) {
          cell.font = { name: "Segoe UI", size: 10, bold: true };
        } else if (cIdx === 8) {
          // Variance
          cell.font = {
            name: "Segoe UI",
            size: 10,
            bold: true,
            color: { argb: varianceVal < 0 ? RED_TEXT : GREEN_TEXT }
          };
        } else if (cIdx === 9) {
          // Trigger Status Badge
          const isApply = triggerStatusVal === "APPLY FOR PERMIT";
          cell.font = {
            name: "Segoe UI",
            size: 9.5,
            bold: true,
            color: { argb: isApply ? RED_TEXT : GREEN_TEXT }
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isApply ? SOFT_RED_FILL : SOFT_GREEN_FILL }
          };
        } else if (cIdx === 12) {
          // Required stock for Permit
          cell.font = {
            name: "Segoe UI",
            size: 10,
            bold: true,
            color: { argb: reqVal > 0 ? RED_TEXT : "000000" }
          };
        }

        // Cell Borders with Gold Divider on Brand Group Bottom
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          right: thinBorder,
          bottom: isBrandLastRow ? goldBorder : thinBorder
        };
      });

      // Track Rowspan for Brand Column
      if (brandVal !== currentBrand) {
        if (currentBrand !== null) {
          brandRowSpans.push({ start: brandStartRow, end: rNum - 1 });
        }
        currentBrand = brandVal;
        brandStartRow = rNum;
      }
      if (rIdx === rowsData.length - 1 && currentBrand !== null) {
        brandRowSpans.push({ start: brandStartRow, end: rNum });
      }
    });

    // Merge Brand Column Cells
    brandRowSpans.forEach(({ start, end }) => {
      if (end > start) {
        ws.mergeCells(`A${start}:A${end}`);
        const mergedCell = ws.getCell(`A${start}`);
        mergedCell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });

    // Column Widths
    const colWidths = [24, 12, 14, 14, 14, 16, 24, 18, 14, 22, 16, 28, 24];
    colWidths.forEach((w, cIdx) => {
      ws.getColumn(cIdx + 1).width = w;
    });
  });

  // Write and Save File
  const buffer = await workbook.xlsx.writeBuffer();
  const outName = filename || `Permit_Status_Report_${dayjs().format("YYYY-MM-DD")}.xlsx`;
  saveAs(new Blob([buffer]), outName);
};
