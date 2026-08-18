import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";

const fmtVal = (val, useWholeNumbers = false) => {
  if (val === undefined || val === null || isNaN(val)) return 0;
  const num = Number(val);
  return useWholeNumbers ? Math.round(num) : Number(num.toFixed(2));
};

export const exportBrandwiseCumExcel = async ({
  data,
  columns,
  title = "WAREHOUSE BRANDWISE SECONDARY SALES CUMULATIVE",
  subtitle = "",
  filename = "warehouse_brandwise_cumulative.xlsx",
  sheetName = "Brandwise Cumulative",
  firstColHeader = "Warehouse",
  firstColKey = "warehouse",
  baseDateStr = null,
  useWholeNumbers = false
}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  const numCols = columns.length;
  const lastColIdx = 3 + numCols;

  const getColLetter = (c) => {
    let temp = c;
    let letter = "";
    while (temp > 0) {
      let modulo = (temp - 1) % 26;
      letter = String.fromCharCode(65 + modulo) + letter;
      temp = Math.floor((temp - modulo) / 26);
    }
    return letter;
  };

  const endHeaderColLetter = getColLetter(2 + numCols);
  const totalColLetter = getColLetter(lastColIdx);

  const navyColor = "0B294F";
  const goldColor = "FFBD31";
  const totalBgColor = "FFD966";
  const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 10;
  ws.getRow(4).height = 24;

  ws.mergeCells(`A1:${totalColLetter}1`);
  ws.mergeCells(`A2:${totalColLetter}2`);

  const titleCell = ws.getCell("A1");
  titleCell.value = "K.S DISTILLERY";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = subtitle ? `${title.toUpperCase()}  •  ${subtitle}` : title.toUpperCase();
  subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  const sNoHeader = ws.getCell("A4");
  sNoHeader.value = "S.NO";

  const mainHeader = ws.getCell("B4");
  mainHeader.value = firstColHeader;

  const totalHeader = ws.getCell(`${totalColLetter}4`);
  totalHeader.value = "TOTAL";

  const styleHeader = (cell) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };
  styleHeader(sNoHeader);
  styleHeader(mainHeader);
  styleHeader(totalHeader);

  columns.forEach((col, idx) => {
    const colIdx = 3 + idx;
    const cellColLetter = getColLetter(colIdx);
    const brandHeaderCell = ws.getCell(`${cellColLetter}4`);
    const brandTitle = typeof col === "object" ? col.title : col.replace("BRAND_", "");
    brandHeaderCell.value = brandTitle;
    
    brandHeaderCell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFF" } };
    brandHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    brandHeaderCell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const colSums = {};
  columns.forEach(col => {
    const colKey = typeof col === "object" ? col.key : col;
    colSums[colKey] = 0;
  });
  let grandTotalSum = 0;

  let currentWordRowIdx = 5;
  let sNoCounter = 1;

  data.forEach((row) => {
    const excelRow = ws.getRow(currentWordRowIdx);
    excelRow.height = 20;

    const isTotalRow = row.isTotal || row.isClusterTotal || String(row[firstColKey] || "").toLowerCase().includes("total");

    const sNoCell = ws.getCell(`A${currentWordRowIdx}`);
    if (!isTotalRow && !row.isClusterHeader) {
      sNoCell.value = sNoCounter++;
      sNoCell.alignment = { horizontal: "center", vertical: "middle" };
      sNoCell.font = { name: "Segoe UI", size: 10 };
    } else if (isTotalRow) {
      sNoCell.value = "";
      sNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    }

    const mainCell = ws.getCell(`B${currentWordRowIdx}`);
    mainCell.value = row[firstColKey] || row.shop_name || row.shop_code || "";
    mainCell.alignment = { horizontal: "left", vertical: "middle" };
    mainCell.font = { name: "Segoe UI", size: 10, bold: isTotalRow };
    if (isTotalRow) {
      mainCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      mainCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    }

    columns.forEach((col, idx) => {
      const colIdx = 3 + idx;
      const cellColLetter = getColLetter(colIdx);
      const valCell = ws.getCell(`${cellColLetter}${currentWordRowIdx}`);
      
      const colKey = typeof col === "object" ? col.key : col;
      const val = row[colKey];

      if (val === 0 || val === null || val === undefined) {
        valCell.value = "-";
        valCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF999999" } };
      } else {
        valCell.value = fmtVal(val, useWholeNumbers);
        valCell.font = { name: "Segoe UI", size: 10, bold: isTotalRow };
        if (!isTotalRow && !row.isClusterHeader) {
          colSums[colKey] += Number(val);
        }
      }

      valCell.alignment = { horizontal: "center", vertical: "middle" };

      if (isTotalRow) {
        valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
        valCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      }
    });

    const totalCell = ws.getCell(`${totalColLetter}${currentWordRowIdx}`);
    const rTotal = Number(row.total || 0);
    totalCell.value = fmtVal(rTotal, useWholeNumbers);
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.font = { name: "Segoe UI", size: 10, bold: true };
    if (isTotalRow) {
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      totalCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    } else {
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: totalBgColor } };
      if (!row.isClusterHeader) {
        grandTotalSum += rTotal;
      }
    }

    currentWordRowIdx++;
  });

  const hasGrandTotalRow = data.some(row => String(row[firstColKey] || "").toLowerCase().includes("total"));
  if (!hasGrandTotalRow && data.length > 0) {
    const totalRowIdx = currentWordRowIdx;
    ws.getRow(totalRowIdx).height = 20;

    const sNoCell = ws.getCell(`A${totalRowIdx}`);
    sNoCell.value = "";
    sNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    const mainCell = ws.getCell(`B${totalRowIdx}`);
    mainCell.value = "Grand Total";
    mainCell.alignment = { horizontal: "left", vertical: "middle" };
    mainCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    columns.forEach((col, idx) => {
      const colIdx = 3 + idx;
      const cellColLetter = getColLetter(colIdx);
      const valCell = ws.getCell(`${cellColLetter}${totalRowIdx}`);
      
      const colKey = typeof col === "object" ? col.key : col;
      const val = colSums[colKey];
      
      valCell.value = val === 0 ? "-" : fmtVal(val, useWholeNumbers);
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      valCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    });

    const totalCell = ws.getCell(`${totalColLetter}${totalRowIdx}`);
    totalCell.value = fmtVal(grandTotalSum, useWholeNumbers);
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    currentWordRowIdx++;
  }

  ws.getColumn("A").width = 6;
  ws.getColumn("B").width = 25;
  for (let c = 3; c < lastColIdx; c++) {
    ws.getColumn(c).width = 15;
  }
  ws.getColumn(lastColIdx).width = 15;

  for (let r = 4; r < currentWordRowIdx; r++) {
    for (let c = 1; c <= lastColIdx; c++) {
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

/**
 * Secondary Sales - Brandwise PDF Generator (Exact Formatting Specification)
 */
export const exportBrandwiseSecondaryPdf = ({
  data,
  allBrands = [],
  periodLabel = "",
  groupByField = "Warehouse",
  filename = "secondary_sales_brandwise.pdf",
  useWholeNumbers = false
}) => {
  // Group shops by warehouse
  const warehouseGroups = {};
  data.forEach((row) => {
    const whName = String(row[groupByField] || row.warehouse || row.Warehouse || row.bond || row.Bond || "UNKNOWN").trim();
    if (!warehouseGroups[whName]) {
      warehouseGroups[whName] = [];
    }
    // Exclude existing summary/total rows from input data
    const isTot = row.isTotal || row.isClusterTotal || String(row["Shop Name"] || row.shop_name || "").toLowerCase().includes("total");
    if (!isTot) {
      warehouseGroups[whName].push(row);
    }
  });

  const whKeys = Object.keys(warehouseGroups);
  if (whKeys.length === 0) return;

  const navyRgb = [10, 41, 79];      // #0A294F
  const goldRgb = [255, 189, 48];    // #FFBD30
  const oddRowRgb = [245, 247, 252];  // #F5F7FC
  const evenRowRgb = [255, 255, 255]; // #FFFFFF
  const bodyTextRgb = [40, 40, 40];  // #282828
  const dimRgb = [199, 204, 214];    // #C7CCD6

  // Helper for line wrapping strictly at word boundaries (spaces only)
  const wrapHeaderTitle = (title, maxColWidth, pdfDoc) => {
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(6.4);
    const words = String(title).split(" ");
    const lines = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = pdfDoc.getTextWidth(testLine);
      if (testWidth <= maxColWidth || !currentLine) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  };

  // Pre-pass: Measure dimensions across all warehouses to determine single uniform file width and height (§3)
  const tempDoc = new jsPDF({ unit: "pt" });
  
  // Helper for cell value lookup
  const getVal = (s, bObj) => {
    const v1 = s[bObj.key];
    if (v1 !== undefined && v1 !== null) return Number(v1);
    const v2 = s[bObj.title];
    if (v2 !== undefined && v2 !== null) return Number(v2);
    const v3 = s[`BRAND_${bObj.title}`];
    if (v3 !== undefined && v3 !== null) return Number(v3);
    return 0;
  };

  const warehouseMetadataMap = {};
  let maxFilePageWidth = 400;
  let maxFilePageHeight = 200;

  whKeys.forEach((whName) => {
    const shops = warehouseGroups[whName];

    // 1. Identify active brands with >0 sales in this warehouse
    const activeBrands = allBrands.filter((b) => {
      const bKey = typeof b === "object" ? b.key : b;
      return shops.some((s) => Number(s[bKey] || s[b.title] || 0) > 0);
    });

    const keptBrandObjs = activeBrands.map((b) => {
      if (typeof b === "object") return b;
      return { title: String(b).replace(/^BRAND_/i, ""), key: b };
    });

    // 2. Measure shop names
    tempDoc.setFont("helvetica", "normal");
    tempDoc.setFontSize(8.5);
    let maxShopNameWidth = 0;
    shops.forEach((s) => {
      const name = String(s["Shop Name"] || s.shop_name || s.shop_code || "").trim();
      const w = tempDoc.getTextWidth(name);
      if (w > maxShopNameWidth) maxShopNameWidth = w;
    });

    // 3. Measure figures & totals
    tempDoc.setFont("helvetica", "bold");
    tempDoc.setFontSize(8.5);
    let maxFigureWidth = 0;
    const brandTotals = {};
    keptBrandObjs.forEach((b) => (brandTotals[b.key] = 0));
    let grandTotal = 0;

    shops.forEach((s) => {
      let rTot = 0;
      keptBrandObjs.forEach((b) => {
        const val = getVal(s, b);
        brandTotals[b.key] += val;
        rTot += val;
        const figW = tempDoc.getTextWidth(String(val));
        if (figW > maxFigureWidth) maxFigureWidth = figW;
      });
      s._rowTotal = rTot;
      const rTotW = tempDoc.getTextWidth(String(rTot));
      if (rTotW > maxFigureWidth) maxFigureWidth = rTotW;
      grandTotal += rTot;
    });

    Object.values(brandTotals).forEach((t) => {
      const figW = tempDoc.getTextWidth(String(t));
      if (figW > maxFigureWidth) maxFigureWidth = figW;
    });
    const gTotW = tempDoc.getTextWidth(String(grandTotal));
    if (gTotW > maxFigureWidth) maxFigureWidth = gTotW;

    // 4. Measure header words
    tempDoc.setFont("helvetica", "bold");
    tempDoc.setFontSize(6.4);
    let maxHeaderWordWidth = tempDoc.getTextWidth("TOTAL");
    keptBrandObjs.forEach((b) => {
      const words = String(b.title).split(" ");
      words.forEach((w) => {
        const ww = tempDoc.getTextWidth(w);
        if (ww > maxHeaderWordWidth) maxHeaderWordWidth = ww;
      });
    });

    // 5. Column & page calculation (§4)
    const n = keptBrandObjs.length + 1; // Kept brand columns + TOTAL
    const nameWidth = Math.max(maxShopNameWidth + 10, 110);
    const minColWidth = Math.max(maxFigureWidth + 12, maxHeaderWordWidth + 6, 26);
    const neededWidth = Math.max(400, nameWidth + n * minColWidth);

    const initialColWidth = (neededWidth - nameWidth) / n;

    // Compute header text wrapped lines
    const headerLinesMap = {};
    let maxHeaderLines = 1;
    keptBrandObjs.forEach((b) => {
      const lines = wrapHeaderTitle(b.title, initialColWidth - 4, tempDoc);
      headerLinesMap[b.key] = lines;
      if (lines.length > maxHeaderLines) maxHeaderLines = lines.length;
    });
    headerLinesMap["TOTAL"] = ["TOTAL"];

    const headerBandHeight = Math.max(22, maxHeaderLines * 7.6 + 8);
    const shopCount = shops.length;
    const neededHeight = 34 + 34 + headerBandHeight + shopCount * 15 + 1.0 + 19 + 1.0 + 17 + 6;

    if (neededWidth > maxFilePageWidth) maxFilePageWidth = neededWidth;
    if (neededHeight > maxFilePageHeight) maxFilePageHeight = neededHeight;

    warehouseMetadataMap[whName] = {
      keptBrandObjs,
      nameWidth,
      brandTotals,
      grandTotal,
      headerLinesMap,
      headerBandHeight,
      shops
    };
  });

  // Single uniform page dimensions across all pages in the file (§3)
  const fileWidth = maxFilePageWidth;
  const fileHeight = maxFilePageHeight;

  let doc = null;

  whKeys.forEach((whName, pageIndex) => {
    const meta = warehouseMetadataMap[whName];
    const { keptBrandObjs, nameWidth, brandTotals, grandTotal, headerLinesMap, headerBandHeight, shops } = meta;

    const n = keptBrandObjs.length + 1;
    // Spare width distributed into figure columns (§4 step 4)
    const colWidth = (fileWidth - nameWidth) / n;

    // 3. Add custom sized page directly to document using uniform size
    if (pageIndex === 0) {
      doc = new jsPDF({
        orientation: "p",
        unit: "pt",
        format: [fileWidth, fileHeight],
        putOnlyUsedFonts: true
      });
    } else {
      doc.addPage([fileWidth, fileHeight], "p");
    }

    doc.internal.pageSize.width = fileWidth;
    doc.internal.pageSize.height = fileHeight;

    let currentY = 0;

    // --- Title Band (34 pt) ---
    doc.setFillColor(navyRgb[0], navyRgb[1], navyRgb[2]);
    doc.rect(0, 0, fileWidth, 34, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.text("K.S DISTILLERY", fileWidth / 2, 22, { align: "center" });

    currentY = 34;

    // --- Sub Band (34 pt) ---
    doc.setFillColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.rect(0, currentY, fileWidth, 34, "F");

    // Row 1: SECONDARY SALES - BRANDWISE (left 8pt inset) & Period (right aligned)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.6);
    doc.setTextColor(navyRgb[0], navyRgb[1], navyRgb[2]);
    doc.text("SECONDARY SALES - BRANDWISE", 8, currentY + 15);

    if (periodLabel) {
      doc.setFontSize(8.6);
      doc.text(periodLabel, fileWidth - 8, currentY + 15, { align: "right" });
    }

    // Row 2: WH - <NAME> (centered)
    doc.setFontSize(9.6);
    const cleanWh = String(whName).replace(/^WH\s*-\s*/i, "").trim().toUpperCase();
    doc.text(`WH - ${cleanWh}`, fileWidth / 2, currentY + 28, { align: "center" });

    currentY += 34;

    // --- Table Header ---
    doc.setFillColor(navyRgb[0], navyRgb[1], navyRgb[2]);
    doc.rect(0, currentY, fileWidth, headerBandHeight, "F");

    // "SHOP NAME" header cell
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.text("SHOP NAME", 6, currentY + headerBandHeight / 2 + 2.5, { align: "left" });

    // Brand headers & TOTAL
    keptBrandObjs.forEach((b, idx) => {
      const cellLeft = nameWidth + idx * colWidth;
      const lines = headerLinesMap[b.key];
      const startTextY = currentY + (headerBandHeight - lines.length * 7.6) / 2 + 6;
      lines.forEach((line, lIdx) => {
        doc.text(line, cellLeft + colWidth / 2, startTextY + lIdx * 7.6, { align: "center" });
      });
    });

    const totalLeft = nameWidth + keptBrandObjs.length * colWidth;
    doc.text("TOTAL", totalLeft + colWidth / 2, currentY + headerBandHeight / 2 + 2.5, { align: "center" });

    // Gold vertical rules & bottom border for header band
    doc.setDrawColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.setLineWidth(0.6);
    doc.line(0, currentY + headerBandHeight, fileWidth, currentY + headerBandHeight);

    doc.line(nameWidth, currentY, nameWidth, currentY + headerBandHeight);
    for (let i = 1; i <= n; i++) {
      const ruleX = nameWidth + i * colWidth;
      doc.line(ruleX, currentY, ruleX, currentY + headerBandHeight);
    }

    currentY += headerBandHeight;

    // --- Data Rows (15 pt each) ---
    shops.forEach((s, rIdx) => {
      const rowFill = rIdx % 2 === 0 ? oddRowRgb : evenRowRgb;
      doc.setFillColor(rowFill[0], rowFill[1], rowFill[2]);
      doc.rect(0, currentY, fileWidth, 15, "F");

      // Bottom rule (0.3 pt `#C7CCD6`)
      doc.setDrawColor(dimRgb[0], dimRgb[1], dimRgb[2]);
      doc.setLineWidth(0.3);
      doc.line(0, currentY + 15, fileWidth, currentY + 15);

      // Body vertical dividers (0.3 pt `#C7CCD6`)
      doc.line(nameWidth, currentY, nameWidth, currentY + 15);
      for (let i = 1; i < n; i++) {
        const ruleX = nameWidth + i * colWidth;
        doc.line(ruleX, currentY, ruleX, currentY + 15);
      }

      // Shop Name (Helvetica 8.5 pt `#282828`, left 6pt inset)
      const shopName = String(s["Shop Name"] || s.shop_name || s.shop_code || "").trim();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(bodyTextRgb[0], bodyTextRgb[1], bodyTextRgb[2]);
      doc.text(shopName, 6, currentY + 10.5);

      // Figures
      keptBrandObjs.forEach((b, cIdx) => {
        const cellLeft = nameWidth + cIdx * colWidth;
        const val = getVal(s, b);
        if (val === 0) {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(dimRgb[0], dimRgb[1], dimRgb[2]);
          doc.text("0", cellLeft + colWidth / 2, currentY + 10.5, { align: "center" });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(bodyTextRgb[0], bodyTextRgb[1], bodyTextRgb[2]);
          doc.text(String(fmtVal(val, useWholeNumbers)), cellLeft + colWidth / 2, currentY + 10.5, { align: "center" });
        }
      });

      // Shop Total column
      const rTot = s._rowTotal || 0;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(bodyTextRgb[0], bodyTextRgb[1], bodyTextRgb[2]);
      doc.text(String(fmtVal(rTot, useWholeNumbers)), totalLeft + colWidth / 2, currentY + 10.5, { align: "center" });

      currentY += 15;
    });

    // --- Gold Strip Top (1.0 pt filled rect) ---
    doc.setFillColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.rect(0, currentY, fileWidth, 1.0, "F");
    currentY += 1.0;

    // --- TOTAL Row (19 pt) ---
    doc.setFillColor(navyRgb[0], navyRgb[1], navyRgb[2]);
    doc.rect(0, currentY, fileWidth, 19, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.8);
    doc.setTextColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.text("TOTAL", 6, currentY + 12.5);

    keptBrandObjs.forEach((b, cIdx) => {
      const cellLeft = nameWidth + cIdx * colWidth;
      const bTot = brandTotals[b.key] || 0;
      doc.text(String(fmtVal(bTot, useWholeNumbers)), cellLeft + colWidth / 2, currentY + 12.5, { align: "center" });
    });

    doc.text(String(fmtVal(grandTotal, useWholeNumbers)), totalLeft + colWidth / 2, currentY + 12.5, { align: "center" });

    currentY += 19;

    // --- Gold Strip Bottom (1.0 pt filled rect) ---
    doc.setFillColor(goldRgb[0], goldRgb[1], goldRgb[2]);
    doc.rect(0, currentY, fileWidth, 1.0, "F");
    currentY += 1.0;

    // --- Footer (17 pt) ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(bodyTextRgb[0], bodyTextRgb[1], bodyTextRgb[2]);
    doc.text(`Page ${pageIndex + 1} of ${whKeys.length}`, fileWidth - 8, currentY + 11, { align: "right" });
  });

  if (doc) {
    doc.save(filename);
  }
};
