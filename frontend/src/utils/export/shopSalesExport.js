import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export const exportShopSalesExcel = async (data, metadata = {}, filename = "shop_sales_daily.xlsx", sheetName = "Shop Sales Daily") => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  const navyColor = "0B294F";
  const goldColor = "FFBD31";
  const brandTotalBg = "D6E9C6"; // Light green
  const grandTotalBg = "ADC9E6"; // Light blue
  const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 10;

  ws.mergeCells("A1:E1");
  ws.mergeCells("A2:E2");

  const titleCell = ws.getCell("A1");
  titleCell.value = "K.S DISTILLERY";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const periodStr = metadata.Period || "";
  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = `SHOP SALES DAILY  •  ${periodStr}`;
  subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;

  ws.getCell("A4").value = "Bond:";
  ws.getCell("A4").font = { name: "Segoe UI", size: 9, bold: true };
  ws.getCell("B4").value = metadata.Bond || "All";
  ws.getCell("B4").font = { name: "Segoe UI", size: 9 };

  ws.getCell("C4").value = "Warehouse:";
  ws.getCell("C4").font = { name: "Segoe UI", size: 9, bold: true };
  ws.getCell("D4").value = metadata.Warehouse || "All";
  ws.getCell("D4").font = { name: "Segoe UI", size: 9 };

  ws.getCell("A5").value = "Shop:";
  ws.getCell("A5").font = { name: "Segoe UI", size: 9, bold: true };
  ws.getCell("B5").value = metadata.Shop || "All";
  ws.getCell("B5").font = { name: "Segoe UI", size: 9 };

  ws.getCell("C5").value = "View / Unit:";
  ws.getCell("C5").font = { name: "Segoe UI", size: 9, bold: true };
  ws.getCell("D5").value = metadata.View ? metadata.View.toUpperCase() : "CASE";
  ws.getCell("D5").font = { name: "Segoe UI", size: 9 };

  ws.getRow(7).height = 24;
  const headers = ["Row Labels", "Opening", "Receipt", "Sales", "Closing"];
  headers.forEach((h, idx) => {
    const cell = ws.getCell(7, idx + 1);
    cell.value = h;
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: idx === 0 ? "left" : "center", vertical: "middle" };
  });

  let grandOpening = 0, grandInward = 0, grandOutward = 0, grandClosing = 0;

  let rIdx = 8;
  data.forEach(row => {
    const label = row["Row Labels"] || "";
    const labelVal = label.trim();

    if (!row["Row Labels"] && row["Opening"] === undefined) {
      ws.getRow(rIdx).height = 6;
      for (let c = 1; c <= 5; c++) {
        ws.getCell(rIdx, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF" } };
      }
      rIdx++;
      return;
    }

    const rowVal = ws.getRow(rIdx);
    rowVal.height = 20;

    const isGrandTotal = label.startsWith("GRAND TOTAL");
    const isShopTotal = label.includes("Total") && (label.includes("(") || label.includes("Shop -"));
    const isBrandTotal = label.includes("Total") && !isShopTotal && !isGrandTotal;
    const isTotalRow = isGrandTotal || isShopTotal || isBrandTotal;
    const isShopHeader = !label.startsWith("  ") && !isTotalRow && (label.includes("(") || label.includes("Shop -"));
    const isBrandHeader = !label.startsWith("  ") && !isTotalRow && !isShopHeader;

    const hasValues = row["Opening"] !== undefined;

    const cellL = ws.getCell(rIdx, 1);
    cellL.value = label;
    cellL.alignment = { horizontal: "left", vertical: "middle" };

    const valCols = ["Opening", "Receipt", "Sales", "Closing"];
    valCols.forEach((col, cIdx) => {
      const cellV = ws.getCell(rIdx, cIdx + 2);
      const val = row[col];
      if (val === 0 || val === null || val === undefined) {
        cellV.value = isTotalRow || hasValues ? "-" : "";
        cellV.font = { name: "Segoe UI", size: 10, color: { argb: "FF999999" } };
      } else {
        cellV.value = Number(val);
        cellV.font = { name: "Segoe UI", size: 10 };
      }
      cellV.alignment = { horizontal: "center", vertical: "middle" };
    });

    if (isGrandTotal) {
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      }
    } else if (isBrandTotal) {
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 10, bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandTotalBg } };
      }
    } else if (isShopTotal) {
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(rIdx, c);
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "1B365D" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: grandTotalBg } };
      }
    } else if (isShopHeader && !hasValues) {
      cellL.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "A52A2A" } };
    } else if (isBrandHeader && !hasValues) {
      cellL.font = { name: "Segoe UI", size: 10, bold: true };
    } else {
      cellL.font = { name: "Segoe UI", size: 10 };
    }

    if (isShopTotal) {
      grandOpening += Number(row["Opening"] || 0);
      grandInward += Number(row["Receipt"] || 0);
      grandOutward += Number(row["Sales"] || 0);
      grandClosing += Number(row["Closing"] || 0);
    }

    rIdx++;
  });

  ws.getRow(rIdx).height = 20;
  ws.getCell(rIdx, 1).value = "GRAND TOTAL";
  ws.getCell(rIdx, 2).value = grandOpening;
  ws.getCell(rIdx, 3).value = grandInward;
  ws.getCell(rIdx, 4).value = grandOutward;
  ws.getCell(rIdx, 5).value = grandClosing;

  for (let c = 1; c <= 5; c++) {
    const cell = ws.getCell(rIdx, c);
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle" };
  }
  rIdx++;

  ws.getColumn("A").width = 45;
  ws.getColumn("B").width = 15;
  ws.getColumn("C").width = 15;
  ws.getColumn("D").width = 15;
  ws.getColumn("E").width = 15;

  for (let r = 7; r < rIdx; r++) {
    for (let c = 1; c <= 5; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: borderStyle,
        left: borderStyle,
        bottom: borderStyle,
        right: borderStyle
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};
