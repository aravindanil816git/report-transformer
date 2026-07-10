import * as XLSX from "xlsx-js-style";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Exports data to Excel with optional metadata rows at the top.
 */
export const exportToExcel = (data, metadata = {}, filename = "report.xlsx", sheetName = "Report", options = {}) => {
  const wsData = [];

  if (Array.isArray(metadata)) {
    metadata.forEach(row => wsData.push(row));
  } else {
    Object.entries(metadata).forEach(([key, value]) => {
      if (value) {
        wsData.push([key, value]);
      }
    });
  }

  if (wsData.length > 0) {
    wsData.push([]);
    wsData.push([]);
  }

  let numCols = 1;
  let tableHeaderRowIdx = -1;
  if (data.length > 0) {
    const allKeys = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);
    numCols = headers.length;
    tableHeaderRowIdx = wsData.length;
    wsData.push(headers);

    data.forEach((row) => {
      wsData.push(headers.map((h) => row[h] !== undefined ? row[h] : ""));
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  if (data.length > 0) {
    const headers = Array.from(new Set(data.flatMap(r => Object.keys(r))));
    ws["!cols"] = headers.map(h => ({
      wch: Math.max(h.length + 5, 12)
    }));
  }

  const isArrayMetadata = Array.isArray(metadata);
  if (isArrayMetadata && metadata.length > 0 && numCols > 1) {
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } });
    ws["!merges"].push({ s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } });
  }

  if (options.autofilter && tableHeaderRowIdx !== -1) {
    const lastRowIndex = wsData.length - 1;
    const hasTotal = data.length > 0 && String(Object.values(data[data.length - 1])[0] || "").trim() === "Total";
    const endRow = hasTotal ? Math.max(tableHeaderRowIdx, lastRowIndex - 1) : lastRowIndex;
    
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: tableHeaderRowIdx, c: 0 },
        e: { r: endRow, c: numCols - 1 }
      })
    };
  }

  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellRef]) {
          ws[cellRef] = { t: "s", v: "" };
        }
        ws[cellRef].s = {
          ...(ws[cellRef].s || {}),
          font: { ...(ws[cellRef].s?.font || {}) },
          alignment: { ...(ws[cellRef].s?.alignment || {}) },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        };
        
        if (isArrayMetadata && (R === 0 || R === 1)) {
           ws[cellRef].s.font.bold = true;
           ws[cellRef].s.alignment = { horizontal: "center", vertical: "center" };
        }
        
        const rowFirstCellRef = XLSX.utils.encode_cell({ c: 0, r: R });
        const rowFirstCellValue = ws[rowFirstCellRef] ? String(ws[rowFirstCellRef].v).trim() : "";
        if (R === tableHeaderRowIdx) {
          ws[cellRef].s.font.bold = true;
          if (options.theme === "navy") {
            ws[cellRef].s.font.color = { rgb: "FFBD31" };
            ws[cellRef].s.fill = {
              patternType: "solid",
              fgColor: { rgb: "1B365D" }
            };
          }
        } else if (rowFirstCellValue === "Total") {
           ws[cellRef].s.font.bold = true;
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};

export const exportUnifiedWithDropdown = async ({
  data,
  warehouses,
  reportTitle,
  periodLabel,
  filename = "report.xlsx",
  sheetName = "Report",
  sumCols = [],
  dropdownLabel = "Warehouse",
  filterColumnName = "Warehouse",
  theme = null,
  reportColumns = null
}) => {
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

  const workbook = new ExcelJS.Workbook();
  const reportSheet = workbook.addWorksheet(sheetName);
  const rawDataSheet = workbook.addWorksheet("RawData", { state: "hidden" });

  const columns = Object.keys(data[0] || {});
  rawDataSheet.columns = columns.map(col => ({ header: col, key: col }));
  data.forEach(row => {
    rawDataSheet.addRow(row);
  });

  const allWarehouses = ["All", ...warehouses];
  const dropdownColIdx = columns.length + 5; 
  const dropdownColLetter = getColLetter(dropdownColIdx);
  allWarehouses.forEach((wh, index) => {
    rawDataSheet.getCell(index + 1, dropdownColIdx).value = wh;
  });
  const warehousesRange = `RawData!$${dropdownColLetter}$1:$${dropdownColLetter}$${allWarehouses.length}`;

  const displayColumns = reportColumns || columns;
  const lastColLetter = getColLetter(displayColumns.length);

  reportSheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = reportSheet.getCell("A1");
  titleCell.value = reportTitle;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFD00000" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  reportSheet.getCell("A2").value = `${dropdownLabel}:`;
  reportSheet.getCell("A2").font = { bold: true };
  const dropdownCell = reportSheet.getCell("B2");
  dropdownCell.value = "All";
  dropdownCell.font = { bold: true, color: { argb: "FF0000FF" } };
  dropdownCell.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [warehousesRange]
  };

  reportSheet.getCell("A3").value = periodLabel;
  reportSheet.getCell("A3").font = { italic: true };
  reportSheet.mergeCells(`A3:${lastColLetter}3`);

  reportSheet.getCell("A5").value = "Total (Filtered):";
  reportSheet.getCell("A5").font = { bold: true };

  const lastDataRow = 7 + data.length;

  sumCols.forEach(colKey => {
    const colIdx = displayColumns.indexOf(colKey);
    if (colIdx !== -1) {
      const colLetter = getColLetter(colIdx + 1);
      reportSheet.getCell(`${colLetter}5`).value = { formula: `SUM(${colLetter}7:${colLetter}${lastDataRow})` };
      reportSheet.getCell(`${colLetter}5`).font = { bold: true };
    }
  });

  const headerRow = reportSheet.getRow(6);
  headerRow.values = displayColumns;
  if (theme === "navy") {
    headerRow.font = { bold: true, color: { argb: "FFFFBD31" } };
  } else {
    headerRow.font = { bold: true };
  }
  headerRow.eachCell(cell => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "medium" },
      right: { style: "thin" }
    };
    if (theme === "navy") {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1B365D" }
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" }
      };
    }
  });

  const targetColLower = filterColumnName.toLowerCase();
  const foundIdx = columns.findIndex(col => col.toLowerCase() === targetColLower);
  const whColIdx = foundIdx !== -1 ? foundIdx + 1 : 1;
  const whColLetter = getColLetter(whColIdx);
  const lastRawRow = data.length + 1;

  for (let c = 1; c <= displayColumns.length; c++) {
    const colLetter = getColLetter(c);
    const rawDataColIdx = columns.indexOf(displayColumns[c - 1]) + 1;
    const rawDataColLetter = getColLetter(rawDataColIdx);
    
    const formula = `IFERROR(INDEX(RawData!${rawDataColLetter}:${rawDataColLetter}, SMALL(IF($B$2="All", ROW(RawData!$A$2:$A$${lastRawRow}), IF(RawData!$${whColLetter}$2:$${whColLetter}$${lastRawRow}=$B$2, ROW(RawData!$A$2:$A$${lastRawRow}))), ROW() - 6)), "")`;
    reportSheet.getCell(7, c).value = {
      formula,
      shareType: "array",
      ref: `${colLetter}7:${colLetter}${lastDataRow}`
    };
  }

  // Set column widths
  reportSheet.columns = displayColumns.map(col => ({
    width: Math.max(col.length + 5, 15)
  }));

  for (let r = 7; r <= lastDataRow; r++) {
    for (let c = 1; c <= displayColumns.length; c++) {
      const cell = reportSheet.getCell(r, c);
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } }
      };
    }
  }

  // Add Conditional Formatting to highlight totals and bold headers
  try {
    reportSheet.addConditionalFormatting({
      ref: `A7:${lastColLetter}${lastDataRow}`,
      rules: [
        // Bold and highlight rows containing "Total" (totals)
        {
          type: 'expression',
          formulae: ['NOT(ISERR(SEARCH("Total", $A7)))'],
          style: {
            font: { bold: true },
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD6E9C6' } }
          }
        },
        // Bold headers (non-indented, non-empty, non-totals)
        {
          type: 'expression',
          formulae: ['AND($A7<>"", LEFT($A7, 2)<>"  ", ISERR(SEARCH("Total", $A7)))'],
          style: {
            font: { bold: true }
          }
        }
      ]
    });
  } catch (err) {
    console.warn("Failed to apply conditional formatting:", err);
  }

  workbook.calcProperties.fullCalcOnLoad = true;

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};

export const exportToPdf = ({
  title,
  periodLabel,
  columns,
  data,
  groupByField = null,
  sumCols = [],
  filename = "report.pdf",
  metadataWarehouse = null,
  didParseCell = null,
  didDrawCell = null,
  zeroMargin = false,
  orientation = "portrait"
}) => {
  let doc;

  const getPageWidth = (cols) => {
    return orientation === "landscape" ? Math.max(297, cols.length * 22 + 40) : 210;
  };

  const drawHeader = (doc, currentTitle, currentPeriod, subHeader = null) => {
    const pageWidth = getPageWidth(columns);
    const startX = zeroMargin ? 0 : 10;
    const width = zeroMargin ? pageWidth : pageWidth - 20;
    const paddingLeft = zeroMargin ? 5 : 15;

    // Row 1 & 2 Base Color block setup
    doc.setFillColor(11, 41, 79); 
    doc.rect(startX, zeroMargin ? 0 : 12, width, 16, "F");

    // Divider accent belt rule line
    doc.setFillColor(255, 189, 49); 
    doc.rect(startX, zeroMargin ? 16 : 28, width, 8, "F");

    // Subtitle background track base
    doc.setFillColor(11, 41, 79); 
    doc.rect(startX, zeroMargin ? 24 : 36, width, 8, "F");

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); 
    doc.text("K.S DISTILLERY", pageWidth / 2, zeroMargin ? 10 : 22, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 41, 79); 
    const cleanPeriod = (currentPeriod || "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
    doc.text(`Period: ${cleanPeriod}`, pageWidth / 2, zeroMargin ? 21.5 : 33.5, { align: "center" });

    const whName = subHeader ? subHeader.replace(/^Warehouse:\s*/i, "") : (metadataWarehouse || "All");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); 
    doc.text(`${currentTitle}  .  ${whName.toUpperCase()}`, paddingLeft, zeroMargin ? 30 : 42, { align: "left" });
  };

  const getTableHeight = (cols, rows) => {
    const pageWidth = getPageWidth(cols);
    const dummyDoc = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: [pageWidth, 2000]
    });
    autoTable(dummyDoc, {
      head: [cols],
      body: rows,
      startY: 32,
      margin: { top: 32, bottom: 0, left: 0, right: 0 },
      theme: "striped",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5 },
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], fontStyle: "bold", fontSize: 11 }
    });
    return (dummyDoc.lastAutoTable?.finalY || 32) + 2;
  };

  // Dynamically resolve metrics alignment based on current data shape
  const columnStyles = {
    0: { cellWidth: 'auto', halign: 'left' }
  };
  
  // If a column isn't the primary descriptor text column, align it center
  for (let i = 1; i < columns.length; i++) {
    const colName = String(columns[i]).toLowerCase();
    if (colName === "pack" || colName === "package") {
      columnStyles[i] = { cellWidth: 28, halign: 'center', textColor: [140, 150, 170] };
    } else {
      columnStyles[i] = { cellWidth: 'auto', halign: 'center' };
    }
  }

  const handleGrandTotalBorders = (cellData) => {
    const firstCellRaw = cellData.row.cells[0]?.raw;
    const isGrandTotal = String(firstCellRaw).trim().toLowerCase().startsWith("total") || 
                         String(firstCellRaw).trim().toLowerCase().startsWith("grand total") ||
                         String(firstCellRaw).trim().toLowerCase().startsWith("grandtotal");
    if (isGrandTotal) {
      cellData.cell.styles.fontStyle = "bold";
      cellData.cell.styles.textColor = [255, 189, 49]; // Orangish-yellow text
      cellData.cell.styles.fillColor = [11, 41, 79]; // Navy blue background
    }
  };


  if (groupByField) {
    const groups = {};
    data.forEach(row => {
      const groupVal = row[groupByField] || "Unknown";
      if (!groups[groupVal]) groups[groupVal] = [];
      groups[groupVal].push(row);
    });

    const groupNames = Object.keys(groups).sort();

    groupNames.forEach((groupName, idx) => {
      const groupRows = groups[groupName];
      const tableRows = groupRows.map(row => 
        columns.map(col => row[col] !== undefined ? row[col] : "")
      );

      // Determine if a summary bottom row already exists in the view input stack
      const lastRowFirstCell = tableRows.length > 0 ? String(tableRows[tableRows.length - 1][0]).trim().toLowerCase() : "";
      const insideTotalExists = lastRowFirstCell.startsWith("total") || lastRowFirstCell.startsWith("grand");

      if (sumCols.length > 0 && !insideTotalExists) {
        const totalsRow = columns.map(col => {
          if (col === groupByField || col === columns[0]) return "TOTAL";
          if (sumCols.includes(col)) {
            return groupRows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
          }
          return "";
        });
        tableRows.push(totalsRow);
      }

      const pageWidth = getPageWidth(columns);
      const pageHeight = Math.max(orientation === "landscape" ? 210 : 297, getTableHeight(columns, tableRows) + 20);

      if (idx === 0) {
        doc = new jsPDF({ orientation: orientation, unit: "mm", format: [pageWidth, pageHeight] });
      } else {
        doc.addPage([pageWidth, pageHeight], orientation);
      }

      autoTable(doc, {
        head: [columns],
        body: tableRows,
        startY: 36,
        margin: { top: 36, bottom: 0, left: 0, right: 0 },
        theme: "striped",
        styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, textColor: [40, 40, 40] },
        columnStyles: columnStyles,
        headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 11 },
        alternateRowStyles: { fillColor: [244, 247, 252] },
        didDrawPage: () => {
          drawHeader(doc, title, periodLabel, `${groupName}`);
        },
        didDrawCell: (data) => { // Draw top border for Grand Total
          const firstCellRaw = data.row.cells[0]?.raw;
          const isGrandTotal = String(firstCellRaw).trim().toLowerCase().startsWith("total") || String(firstCellRaw).trim().toLowerCase().startsWith("grand");
          if (data.section === 'body' && isGrandTotal) {
            doc.setDrawColor(255, 189, 49); // Orangish color
            doc.setLineWidth(0.7); // ~2px
            doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
          }
          if (didDrawCell) didDrawCell(data);
        },
        didParseCell: (cellData) => {
          if (cellData.section === 'head') {
            doc.setFont("helvetica", "bold");
          }
          handleGrandTotalBorders(cellData);

          if (cellData.section === 'body') {
            const cellIndex = cellData.column.index;
            const rawVal = String(cellData.cell.raw || "").trim();
            const firstCellRaw = cellData.row.cells[0]?.raw;
            const isGrandTotal = String(firstCellRaw).trim().toLowerCase().startsWith("total") || String(firstCellRaw).trim().toLowerCase().startsWith("grand");

            if (cellIndex >= 1 && !isNaN(Number(rawVal)) && rawVal !== "") {
              cellData.cell.styles.fontStyle = "bold";
              if (Number(rawVal) === 0) {
                cellData.cell.styles.textColor = [200, 205, 215]; 
              } else if (!isGrandTotal) { // Only set dark text for non-total rows
                cellData.cell.styles.textColor = [15, 25, 45];
              }
            } else if (cellIndex >= 1 && (rawVal === "" || Number(rawVal) === 0)) {
              cellData.cell.styles.textColor = [200, 205, 215];
            }
          }
          if (didParseCell) didParseCell(cellData);
        }
      });
    });
  } else {
    const tableRows = data.map(row => 
      columns.map(col => row[col] !== undefined ? row[col] : "")
    );

    const lastRowFirstCell = tableRows.length > 0 ? String(tableRows[tableRows.length - 1][0]).trim().toLowerCase() : "";
    const hasTotalRow = lastRowFirstCell.startsWith("total") || lastRowFirstCell.startsWith("grand");

    const pageWidth = getPageWidth(columns);
    const pageHeight = Math.max(orientation === "landscape" ? 210 : 297, getTableHeight(columns, tableRows) + 20);
    doc = new jsPDF({ orientation: orientation, unit: "mm", format: [pageWidth, pageHeight] });

    autoTable(doc, {
      head: [columns],
      body: tableRows,
      startY: 36,
      margin: { top: 36, bottom: 0, left: 0, right: 0 },
      theme: "striped",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, textColor: [40, 40, 40] },
      columnStyles: columnStyles,
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 11 },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didDrawPage: () => {
        drawHeader(doc, title, periodLabel, metadataWarehouse ? `${metadataWarehouse}` : null);
      },
      didDrawCell: (data) => { // Draw top border for Grand Total
        const firstCellRaw = data.row.cells[0]?.raw;
        const isGrandTotal = String(firstCellRaw).trim().toLowerCase().startsWith("total") || String(firstCellRaw).trim().toLowerCase().startsWith("grand");
        if (data.section === 'body' && isGrandTotal) {
          doc.setDrawColor(255, 189, 49); // Orangish color
          doc.setLineWidth(0.7); // ~2px
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
        if (didDrawCell) didDrawCell(data);
      },
      didParseCell: (cellData) => {
        if (cellData.section === 'head') {
          doc.setFont("helvetica", "bold");
        }
        handleGrandTotalBorders(cellData);

        if (cellData.section === 'body') {
          const cellIndex = cellData.column.index;
          const rawVal = String(cellData.cell.raw || "").trim();
          const firstCellRaw = cellData.row.cells[0]?.raw;
          const isGrandTotal = String(firstCellRaw).trim().toLowerCase().startsWith("total") || String(firstCellRaw).trim().toLowerCase().startsWith("grand");

          if (cellIndex >= 1 && !isNaN(Number(rawVal)) && rawVal !== "") {
            cellData.cell.styles.fontStyle = "bold";
            if (Number(rawVal) === 0) {
              cellData.cell.styles.textColor = [200, 205, 215]; 
            } else if (!isGrandTotal) { // Only set dark text for non-total rows
              cellData.cell.styles.textColor = [15, 25, 45];
            }
          } else if (cellIndex >= 1 && (rawVal === "" || Number(rawVal) === 0)) {
            cellData.cell.styles.textColor = [200, 205, 215];
          }
        }
        if (didParseCell) didParseCell(cellData);
      }
    });
  }

  doc.save(filename);
};

export const exportClusterPdf = async ({
  title,
  periodLabel,
  columns,
  data,
  groupByField,
  sumCols,
  clusters,
  filenamePrefix = "report",
  zeroMargin = false,
  orientation = "portrait"
}) => {
  const entries = Object.entries(clusters);
  for (const [clusterName, whList] of entries) {
    const clusterData = data.filter(row => {
      const whVal = String(row[groupByField] || "").trim().toUpperCase().replace(/^WH-/i, "");
      return whList.some(wh => wh.trim().toUpperCase().replace(/^WH-/i, "") === whVal);
    });

    if (clusterData.length > 0) {
      const cleanClusterName = clusterName.replace(/\s+/g, "_").toLowerCase();
      exportToPdf({
        title: `${title}`,
        periodLabel,
        columns,
        data: clusterData,
        groupByField,
        sumCols,
        filename: `${filenamePrefix}_${cleanClusterName}.pdf`,
        zeroMargin: true,
        orientation: orientation
      });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
};

export const exportShopDrilldownPdfByBond = ({
  title,
  periodLabel,
  data,
  bondName,
  bondShops,
  allShops,
  useWholeNumbers,
  view,
  filename
}) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const formatVal = (val) => {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    return useWholeNumbers ? Math.round(num) : num.toFixed(2);
  };

  const getShopTableRows = (shopCode, shopData) => {
    const rows = [];
    const brands = {};
    shopData.forEach(row => {
      const brand = row.brand;
      if (!brands[brand]) brands[brand] = [];
      brands[brand].push(row);
    });

    const shopInfo = allShops.find(s => String(s.value) === String(shopCode));
    const displayLabel = shopInfo?.shopName ? shopInfo.shopName : shopCode;

    let shopOpening = 0, shopInward = 0, shopOutward = 0, shopClosing = 0;
    Object.values(brands).flat().forEach(item => {
      shopOpening += item.opening || 0;
      shopInward += item.inward || 0;
      shopOutward += item.outward || 0;
      shopClosing += item.closing || 0;
    });

    Object.entries(brands).forEach(([brand, items]) => {
      let bOpening = 0, bInward = 0, bOutward = 0, bClosing = 0;
      items.forEach(item => {
        const op = useWholeNumbers ? Math.round(item.opening || 0) : item.opening || 0;
        const inward = useWholeNumbers ? Math.round(item.inward || 0) : item.inward || 0;
        const outward = useWholeNumbers ? Math.round(item.outward || 0) : item.outward || 0;
        const closing = useWholeNumbers ? Math.round(item.closing || 0) : item.closing || 0;
        bOpening += op;
        bInward += inward;
        bOutward += outward;
        bClosing += closing;
      });

      rows.push({
        label: brand,
        isBrandHeader: true,
        opening: bOpening,
        inward: bInward,
        outward: bOutward,
        closing: bClosing
      });

      items.forEach(item => {
        const op = useWholeNumbers ? Math.round(item.opening || 0) : item.opening || 0;
        const inward = useWholeNumbers ? Math.round(item.inward || 0) : item.inward || 0;
        const outward = useWholeNumbers ? Math.round(item.outward || 0) : item.outward || 0;
        const closing = useWholeNumbers ? Math.round(item.closing || 0) : item.closing || 0;
        rows.push({
          label: `  ${item.pack}`,
          opening: op,
          inward: inward,
          outward: outward,
          closing: closing
        });
      });

      rows.push({ isSpacer: true });
    });

    rows.push({
      label: `${displayLabel} Total`,
      opening: shopOpening,
      inward: shopInward,
      outward: shopOutward,
      closing: shopClosing,
      isShopTotal: true
    });

    return rows;
  };

  const drawHeader = (doc, currentTitle, currentPeriod, shopName) => {
    doc.setFillColor(11, 41, 79); 
    doc.rect(0, 0, 210, 16, "F");

    doc.setFillColor(255, 189, 49); 
    doc.rect(0, 16, 210, 8, "F");

    doc.setFillColor(11, 41, 79); 
    doc.rect(0, 24, 210, 8, "F");

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); 
    doc.text("K.S DISTILLERY", 105, 10, { align: "center" });

    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 41, 79); 
    const cleanPeriod = (currentPeriod || "").replace(/^COMBINED PERIOD\s*:\s*/i, "").trim();
    doc.text(`Period: ${cleanPeriod}`, 105, 21.5, { align: "center" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); 
    doc.text(shopName.toUpperCase(), 5, 30, { align: "left" });
  };

  let pageAdded = false;

  for (const shop of bondShops) {
    const shopCode = shop.shop_code;
    const shopData = data.filter(d => String(d.shop_code) === String(shopCode));
    if (shopData.length === 0) continue;

    if (pageAdded) {
      doc.addPage();
    } else {
      pageAdded = true;
    }

    const shopRows = getShopTableRows(shopCode, shopData);
    const pdfCols = ["Brand/Pack", "Opening", "Receipt", "Sales", "Closing"];

    const tableRows = shopRows.map(row => {
      if (row.isSpacer) return ["", "", "", "", ""];
      return [row.label, formatVal(row.opening), formatVal(row.inward), formatVal(row.outward), formatVal(row.closing)];
    });

    const displayShopName = shop.shop_name ? shop.shop_name : shop.shop_code;

    autoTable(doc, {
      head: [pdfCols],
      body: tableRows,
      startY: 32,
      margin: { top: 32, bottom: 8, left: 0, right: 0 },
      theme: "striped",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, lineColor: [220, 220, 220], lineWidth: 0.15 },
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 11 },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didDrawPage: () => {
        drawHeader(doc, `${title} - ${bondName} Bond`, periodLabel, displayShopName);
      },
      didDrawCell: (data) => {
        const rowIndex = data.row.index;
        const rowObj = shopRows[rowIndex];
        if (rowObj?.isShopTotal && data.section === 'body') {
          doc.setDrawColor(11, 41, 79); 
          doc.setLineWidth(0.5);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      },
      didParseCell: (cellData) => {
        if (cellData.section === 'head') {
          doc.setFont("helvetica", "bold");
        }
        if (cellData.section !== 'body') return;

        const rawVal = String(cellData.cell.raw || "").trim();
        const cellIndex = cellData.column.index;

        if (cellIndex >= 1 && !isNaN(Number(rawVal)) && rawVal !== "") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.halign = 'center';
          if (Number(rawVal) === 0) {
            cellData.cell.styles.textColor = [200, 205, 215]; 
          }
        }

        const rowIndex = cellData.row.index;
        const rowObj = shopRows[rowIndex];
        if (rowObj) {
          cellData.cell.styles.font = "helvetica";
          if (rowObj.isBrandHeader) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [11, 41, 79]; 
            cellData.cell.styles.textColor = [255, 255, 255]; 
          } else if (rowObj.isShopHeader) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [228, 233, 242]; // #E4E9F2
          } else if (rowObj.isShopTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [255, 255, 255]; 
            cellData.cell.styles.textColor = [11, 41, 79]; 
          } else if (rowObj.isGrandTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [11, 41, 79]; // Navy blue background
            cellData.cell.styles.textColor = [255, 189, 49]; // Orange text
          }
        }
      }
    });
  }

  if (pageAdded) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`Page ${i} of ${pageCount}`, 105, 293, { align: "center" });
    }
    doc.save(filename);
  }
};