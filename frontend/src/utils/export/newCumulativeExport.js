import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getSellThroughColorConfig } from "../colorUtils";

export const exportNewCumulativeExcel = async ({
  data,
  metadata = {},
  filename = "cumulative_report.xlsx",
  sheetName = "Cumulative Report",
  firstColHeader = "Warehouse",
  firstColKey = "warehouse",
  useWholeNumbers = false,
  currentPeriodLabel = "CM",
  lastMonthPeriodLabel = "LM",
  loadingLastMonth = false
}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  const navyColor = "0B294F";
  const goldColor = "FFBD31";
  const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

  // Setup Metadata/Title block
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 10;

  ws.mergeCells("A1:L1");
  ws.mergeCells("A2:L2");

  const titleCell = ws.getCell("A1");
  titleCell.value = "K.S DISTILLERY";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = `CUMULATIVE REPORT  •  ${metadata["Date Range"] || ""}`;
  subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Header Rows starting at Row 4 and 5
  ws.getRow(4).height = 24;
  ws.getRow(5).height = 24;

  const mainHeaders = [
    { cell: "A4", merge: "A4:A5", value: "#" },
    { cell: "B4", merge: "B4:B5", value: firstColHeader.toUpperCase() },
    { cell: "C4", merge: "C4:C5", value: "OPENING" },
    { cell: "D4", merge: "D4:D5", value: "RECEIPT" },
    { cell: "E4", merge: "E4:E5", value: "SALES" },
    { cell: "F4", merge: "F4:F5", value: "CLOSING" },
    { cell: "G4", merge: "G4:G5", value: "STOCK NET" },
    { cell: "H4", merge: "H4:H5", value: "STOCK NET %" },
    { cell: "I4", merge: "I4:I5", value: "SELL-THROUGH %" }
  ];

  // Apply main headers & vertical merges
  mainHeaders.forEach(h => {
    ws.mergeCells(h.merge);
    const cell = ws.getCell(h.cell);
    cell.value = h.value;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // AVERAGE SALES / DAY horizontal merge
  ws.mergeCells("J4:L4");
  const avgHeader = ws.getCell("J4");
  avgHeader.value = "AVERAGE SALES / DAY";
  avgHeader.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  avgHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  avgHeader.alignment = { horizontal: "center", vertical: "middle" };

  // Subheaders for AVERAGE SALES / DAY in row 5
  const subHeaders = [
    { cell: "J5", value: `Current Month Avg (${currentPeriodLabel})` },
    { cell: "K5", value: `Last Month Avg (${lastMonthPeriodLabel})` },
    { cell: "L5", value: "Difference" }
  ];

  subHeaders.forEach(sh => {
    const cell = ws.getCell(sh.cell);
    cell.value = sh.value;
    cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // Ensure all header cells have proper base cells styled in rows 4 & 5
  const headerCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  [4, 5].forEach(rIdx => {
    headerCols.forEach(col => {
      const cell = ws.getCell(`${col}${rIdx}`);
      if (!cell.fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      }
      if (!cell.font) {
        cell.font = { name: "Segoe UI", size: 9, color: { argb: "FFFFFF" } };
      }
    });
  });

  let sNo = 1;
  let rIdx = 6;

  const formatVal = (v) => {
    if (v === undefined || v === null || v === "") return "";
    const num = Number(v);
    if (isNaN(num)) return v;
    return useWholeNumbers ? Math.round(num) : Number(num.toFixed(2));
  };

  const styleCell = (cell, val, isTotalRow) => {
    const formatted = formatVal(val);
    cell.value = formatted;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    
    if (isTotalRow) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      if (formatted === 0 || formatted === "0" || formatted === "" || formatted === "-") {
        cell.value = "-";
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF999999" } };
      } else {
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
      }
    } else {
      if (formatted === 0 || formatted === "0" || formatted === "" || formatted === "-") {
        cell.value = "-";
        cell.font = { name: "Segoe UI", size: 10, color: { argb: "FF999999" } };
      } else {
        cell.font = { name: "Segoe UI", size: 10 };
      }
    }
  };

  data.forEach(row => {
    const excelRow = ws.getRow(rIdx);
    excelRow.height = 20;

    const isTotalRow = row.isTotal || row.isClusterTotal || String(row[firstColKey] || "").toLowerCase().includes("total");

    // #
    const cellA = ws.getCell(`A${rIdx}`);
    if (isTotalRow) {
      cellA.value = "TOTAL";
      cellA.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
      cellA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    } else {
      cellA.value = sNo++;
      cellA.font = { name: "Segoe UI", size: 10 };
    }
    cellA.alignment = { horizontal: "center", vertical: "middle" };

    // Warehouse/Shop/Brand name
    const cellB = ws.getCell(`B${rIdx}`);
    cellB.value = row[firstColKey] || row.shop_name || row.shop_code || "";
    cellB.font = { name: "Segoe UI", size: 10, bold: isTotalRow };
    cellB.alignment = { horizontal: "left", vertical: "middle" };
    if (isTotalRow) {
      cellB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cellB.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    }

    // Populate and style columns C through L
    styleCell(ws.getCell(`C${rIdx}`), row.opening, isTotalRow);
    styleCell(ws.getCell(`D${rIdx}`), row.receipt, isTotalRow);
    styleCell(ws.getCell(`E${rIdx}`), row.sales, isTotalRow);
    styleCell(ws.getCell(`F${rIdx}`), row.closing, isTotalRow);
    styleCell(ws.getCell(`G${rIdx}`), row.difference, isTotalRow);
    const formatPercVal = (v) => {
      if (v === null || v === undefined || v === "") return "";
      const valStr = formatVal(v);
      return valStr !== "" ? `${valStr}%` : "";
    };
    styleCell(ws.getCell(`H${rIdx}`), formatPercVal(row.perc), isTotalRow);
    
    const cellI = ws.getCell(`I${rIdx}`);
    const sellThroughVal = row.closing_stock_at_sales_perc;
    if (isTotalRow) {
      styleCell(cellI, sellThroughVal, true);
      const colors = getSellThroughColorConfig(sellThroughVal);
      const isZero = sellThroughVal === 0 || sellThroughVal === "0" || sellThroughVal === null || sellThroughVal === undefined || sellThroughVal === "";
      cellI.font = { 
        name: "Segoe UI", 
        size: 10, 
        bold: true, 
        color: { argb: isZero ? "FF999999" : ("FF" + colors.font) } 
      };
    } else {
      const colors = getSellThroughColorConfig(sellThroughVal);
      cellI.value = sellThroughVal !== undefined && sellThroughVal !== null && sellThroughVal !== "" ? Number(Number(sellThroughVal).toFixed(2)) : "-";
      cellI.alignment = { horizontal: "right", vertical: "middle" };
      cellI.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + colors.fill } };
      cellI.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF" + colors.font } };
    }
    
    styleCell(ws.getCell(`J${rIdx}`), row.avg_sales_per_day, isTotalRow);
    styleCell(ws.getCell(`K${rIdx}`), loadingLastMonth ? "" : row.last_month_avg, isTotalRow);
    const cellL = ws.getCell(`L${rIdx}`);
    const trendVal = loadingLastMonth ? "" : row.avg_diff;
    styleCell(cellL, trendVal, isTotalRow);
    const trendNum = Number(trendVal);
    if (!isNaN(trendNum) && trendNum !== 0) {
      const isPositive = trendNum > 0;
      const arrow = isPositive ? "▲" : "▼";
      cellL.value = `${arrow} ${formatVal(trendVal, true)}`;
      cellL.font = {
        name: "Segoe UI",
        size: isTotalRow ? 10 : 9,
        bold: true,
        color: { argb: isPositive ? "FF3F8600" : "FFCF1322" }
      };
    }

    rIdx++;
  });

  // Set widths
  ws.getColumn("A").width = 8;
  ws.getColumn("B").width = 30;
  ws.getColumn("C").width = 12;
  ws.getColumn("D").width = 12;
  ws.getColumn("E").width = 12;
  ws.getColumn("F").width = 12;
  ws.getColumn("G").width = 12;
  ws.getColumn("H").width = 12;
  ws.getColumn("I").width = 16;
  ws.getColumn("J").width = 30;
  ws.getColumn("K").width = 30;
  ws.getColumn("L").width = 15;

  // Apply borders
  for (let r = 7; r < rIdx; r++) {
    const isHeader = r === 7 || r === 8;
    const cellA = ws.getCell(`A${r}`);
    const isTotalRow = !isHeader && (String(cellA.value || "").toLowerCase() === "total" || String(ws.getCell(`B${r}`).value || "").toLowerCase().includes("total"));

    headerCols.forEach(col => {
      const cell = ws.getCell(`${col}${r}`);
      if (isTotalRow) {
        cell.border = {
          top: { style: 'medium', color: { argb: goldColor } },
          bottom: { style: 'double', color: { argb: goldColor } },
          left: borderStyle,
          right: borderStyle
        };
      } else {
        cell.border = {
          top: borderStyle,
          left: borderStyle,
          bottom: borderStyle,
          right: borderStyle
        };
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};
