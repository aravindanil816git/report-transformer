import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

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
    const isShopTotalRow = Boolean(row.isShopTotal) || (label.toUpperCase().includes("TOTAL") && (label.includes("Shop") || label.includes("(")));
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
      // Pack row
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
