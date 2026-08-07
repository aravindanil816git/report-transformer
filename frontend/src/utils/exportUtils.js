import * as XLSX from "xlsx-js-style";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import dayjs from "dayjs";

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
  const reportSheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });
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

  const navyColor = "0B294F";
  const goldColor = "FFBD31";
  const totalBgColor = "FFD966";
  const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

  reportSheet.getRow(1).height = 30;
  reportSheet.getRow(2).height = 22;
  reportSheet.getRow(3).height = 20;
  reportSheet.getRow(4).height = 10;
  reportSheet.getRow(5).height = 20;
  reportSheet.getRow(6).height = 24;

  // Title Banner
  reportSheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = reportSheet.getCell("A1");
  titleCell.value = reportTitle.toUpperCase();
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Dropdown Row
  const selectLabelCell = reportSheet.getCell("A2");
  selectLabelCell.value = `SELECT ${dropdownLabel.toUpperCase()}:`;
  selectLabelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
  selectLabelCell.alignment = { horizontal: "right", vertical: "middle" };

  const dropdownCell = reportSheet.getCell("B2");
  dropdownCell.value = "All";
  dropdownCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "0000FF" } };
  dropdownCell.alignment = { horizontal: "left", vertical: "middle" };
  dropdownCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE6F0FA" }
  };
  dropdownCell.border = {
    top: { style: "thin", color: { argb: "FFB0C4DE" } },
    left: { style: "thin", color: { argb: "FFB0C4DE" } },
    bottom: { style: "thin", color: { argb: "FFB0C4DE" } },
    right: { style: "thin", color: { argb: "FFB0C4DE" } }
  };
  dropdownCell.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [warehousesRange]
  };

  // Subtitle / Period Banner
  reportSheet.mergeCells(`A3:${lastColLetter}3`);
  const subtitleCell = reportSheet.getCell("A3");
  subtitleCell.value = periodLabel;
  subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Total (Filtered) row setup
  const tLabelCell = reportSheet.getCell("A5");
  tLabelCell.value = "TOTAL (FILTERED)";
  tLabelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  tLabelCell.alignment = { horizontal: "center", vertical: "middle" };

  for (let c = 1; c <= displayColumns.length; c++) {
    const cell = reportSheet.getCell(5, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    if (c > 1) {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }

  const lastDataRow = 7 + data.length;

  sumCols.forEach(colKey => {
    const colIdx = displayColumns.indexOf(colKey);
    if (colIdx !== -1) {
      const colLetter = getColLetter(colIdx + 1);
      const sumCell = reportSheet.getCell(`${colLetter}5`);
      sumCell.value = { formula: `SUM(${colLetter}7:${colLetter}${lastDataRow})` };
      sumCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
    }
  });

  // Table Headers
  const headerRow = reportSheet.getRow(6);
  headerRow.values = displayColumns;
  headerRow.eachCell((cell, idx) => {
    cell.font = {
      name: "Segoe UI",
      size: 10,
      bold: true,
      color: { argb: (idx === 1 || idx === displayColumns.length) ? goldColor : "FFFFFF" }
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: idx === 1 ? "left" : "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB0C4DE" } },
      left: { style: "thin", color: { argb: "FFB0C4DE" } },
      bottom: { style: "medium", color: { argb: "FFB0C4DE" } },
      right: { style: "thin", color: { argb: "FFB0C4DE" } }
    };
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
  reportSheet.getColumn(1).width = 45;
  for (let c = 2; c <= displayColumns.length; c++) {
    reportSheet.getColumn(c).width = 15;
  }

  for (let r = 7; r <= lastDataRow; r++) {
    for (let c = 1; c <= displayColumns.length; c++) {
      const cell = reportSheet.getCell(r, c);
      cell.font = { name: "Segoe UI", size: 10 };
      cell.border = {
        top: borderStyle,
        left: borderStyle,
        bottom: borderStyle,
        right: borderStyle
      };
      if (c > 1) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
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
            font: { name: 'Segoe UI', bold: true, color: { argb: '1B365D' } },
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFADC9E6' } }
          }
        },
        // Bold headers (non-indented, non-empty, non-totals)
        {
          type: 'expression',
          formulae: ['AND($A7<>"", LEFT($A7, 2)<>"  ", ISERR(SEARCH("Total", $A7)))'],
          style: {
            font: { name: 'Segoe UI', bold: true }
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
  orientation = "portrait",
  head = null
}) => {
  let doc;

  const getPageWidth = (cols) => {
    return orientation === "landscape" ? Math.max(297, cols.length * 22 + 40) : 210;
  };

  const drawHeader = (doc, currentTitle, currentPeriod, subHeader = null, pageNumber = 1) => {
    const pageWidth = getPageWidth(columns);
    const startX = zeroMargin ? 0 : 10;
    const width = zeroMargin ? pageWidth : pageWidth - 20;
    const paddingLeft = zeroMargin ? 5 : 15;
    const paddingRight = zeroMargin ? pageWidth - 5 : pageWidth - 15;

    // Row 1 & 2 Base Color block setup
    doc.setFillColor(11, 41, 79); 
    doc.rect(startX, zeroMargin ? 0 : 12, width, 16, "F");

    // Divider accent belt rule line
    doc.setFillColor(255, 189, 49); 
    doc.rect(startX, zeroMargin ? 16 : 28, width, 8, "F");

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); 
    doc.text("K.S DISTILLERY", pageWidth / 2, zeroMargin ? 10 : 22, { align: "center" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(11, 41, 79); 
    const cleanPeriod = (currentPeriod || "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
    doc.text(currentTitle.toUpperCase(), paddingLeft, zeroMargin ? 21.5 : 33.5, { align: "left" });
    doc.text(cleanPeriod, paddingRight, zeroMargin ? 21.5 : 33.5, { align: "right" });
  };

  const getTableHeight = (cols, rows) => {
    const pageWidth = getPageWidth(cols);
    const dummyDoc = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: [pageWidth, 2000]
    });
    autoTable(dummyDoc, {
      head: head || [cols],
      body: rows,
      startY: 24,
      margin: { top: 24, bottom: 0, left: 0, right: 0 },
      theme: "striped",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5 },
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], fontStyle: "bold", fontSize: 11, lineWidth: 0.1, lineColor: [200, 205, 215] }
    });
    return (dummyDoc.lastAutoTable?.finalY || 24) + 2;
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
        head: head || [columns],
        body: tableRows,
        startY: 28,
        margin: { top: 28, bottom: 0, left: 0, right: 0 },
        theme: "striped",
        styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, textColor: [40, 40, 40] },
        columnStyles: columnStyles,
        headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 10, lineWidth: 0.1, lineColor: [200, 205, 215] },
        alternateRowStyles: { fillColor: [244, 247, 252] },
        didDrawPage: (data) => {
          drawHeader(doc, title, periodLabel, `${groupName}`, data.pageNumber);
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
            if (cellData.cell.text) {
              cellData.cell.text = cellData.cell.text.map(t => t.toUpperCase());
            }
            const rawKey = cellData.column.dataKey;
            const cellText = cellData.cell.text ? (Array.isArray(cellData.cell.text) ? cellData.cell.text.join(" ") : String(cellData.cell.text)) : "";
            const rawCol = cellData.column.raw;
            const rawColTitle = rawCol && typeof rawCol === "object" ? (rawCol.title || rawCol.header || "") : String(rawCol || "");
            const colTitle = String(rawKey || cellText || rawColTitle || "").toUpperCase().trim();
            if (["PHYSICAL", "ALLOTABLE", "PENDING", "PACK", "OPENING", "RECEIPT", "SALES", "CLOSING", "DIFFERENCE", "AVG SALES / DAY", "TOTAL"].includes(colTitle)) {
              cellData.cell.styles.halign = 'center';
            }
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
      head: head || [columns],
      body: tableRows,
      startY: 28,
      margin: { top: 28, bottom: 0, left: 0, right: 0 },
      theme: "striped",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, textColor: [40, 40, 40] },
      columnStyles: columnStyles,
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 10, lineWidth: 0.1, lineColor: [200, 205, 215] },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didDrawPage: (data) => {
        drawHeader(doc, title, periodLabel, metadataWarehouse ? `${metadataWarehouse}` : null, data.pageNumber);
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
          if (cellData.cell.text) {
            cellData.cell.text = cellData.cell.text.map(t => t.toUpperCase());
          }
          const rawKey = cellData.column.dataKey;
          const cellText = cellData.cell.text ? (Array.isArray(cellData.cell.text) ? cellData.cell.text.join(" ") : String(cellData.cell.text)) : "";
          const rawCol = cellData.column.raw;
          const rawColTitle = rawCol && typeof rawCol === "object" ? (rawCol.title || rawCol.header || "") : String(rawCol || "");
          const colTitle = String(rawKey || cellText || rawColTitle || "").toUpperCase().trim();
          if (["PHYSICAL", "ALLOTABLE", "PENDING", "PACK", "OPENING", "RECEIPT", "SALES", "CLOSING", "DIFFERENCE", "AVG SALES / DAY", "TOTAL"].includes(colTitle)) {
            cellData.cell.styles.halign = 'center';
          }
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

    });

    rows.push({
      label: "TOTAL",
      opening: shopOpening,
      inward: shopInward,
      outward: shopOutward,
      closing: shopClosing,
      isShopTotal: true
    });

    return rows;
  };

  const drawHeader = (doc, currentTitle, currentPeriod, shopName, bondName = null, pageNumber = 1) => {
    const actualPage = doc.internal.getNumberOfPages();
    if (actualPage === 1) {
      doc.setFillColor(11, 41, 79); 
      doc.rect(0, 0, 210, 16, "F");

      doc.setFillColor(255, 189, 49); 
      doc.rect(0, 16, 210, 8, "F");

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 189, 49); 
      doc.text("K.S DISTILLERY", 105, 10, { align: "center" });

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      const cleanPeriod = (currentPeriod || "").replace(/^COMBINED PERIOD\s*:\s*/i, "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
      doc.text(currentTitle.toUpperCase(), 15, 21.5, { align: "left" });
      doc.text(cleanPeriod, 195, 21.5, { align: "right" });
    }

    if (pageNumber === 1) {
      const rectY = (actualPage === 1) ? 25 : 5;
      const textY = (actualPage === 1) ? 30.5 : 10.5;

      doc.setFillColor(255, 189, 49); 
      doc.rect(0, rectY, 210, 8, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      doc.text(shopName.toUpperCase(), 5, textY, { align: "left" });
      if (bondName && bondName.toUpperCase() !== "CURRENT VIEW") {
        doc.text(`${bondName.toUpperCase()} BOND`, 205, textY, { align: "right" });
      }
    }
  };

  let idx = 0;
  let pageAdded = false;
  for (const shop of bondShops) {
    const shopCode = shop.shop_code;
    const shopData = data.filter(d => String(d.shop_code) === String(shopCode));
    console.log(`[DEBUG] shopCode: ${shopCode}, shopData length: ${shopData.length}`);
    if (shopData.length === 0) continue;

    if (pageAdded) {
      doc.addPage();
    } else {
      pageAdded = true;
    }

    const displayShopName = shop.shop_name ? shop.shop_name : shop.shop_code;

    const shopRows = getShopTableRows(shopCode, shopData);
    const pdfCols = ["BRAND/PACK", "OPENING", "RECEIPT", "SALES", "CLOSING"];

    const tableRows = shopRows.map(row => {
      if (row.isSpacer) return ["", "", "", "", ""];
      return [row.label, formatVal(row.opening), formatVal(row.inward), formatVal(row.outward), formatVal(row.closing)];
    });

    const isFirstShop = (idx === 0);
    idx++;

    autoTable(doc, {
      head: [pdfCols],
      body: tableRows,
      startY: isFirstShop ? 34 : 14,
      margin: { top: 14, bottom: 8, left: 0, right: 0 },
      theme: "striped",
      showHead: "firstPage",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 9, cellPadding: 2.2, lineColor: [220, 220, 220], lineWidth: 0.15 },
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 9.5 },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didDrawPage: (data) => {
        drawHeader(doc, title, periodLabel, displayShopName, bondName, data.pageNumber);
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
          if (cellData.column.index >= 1) {
            cellData.cell.styles.halign = 'center';
          }
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
            cellData.cell.styles.fillColor = [11, 41, 79]; 
            cellData.cell.styles.textColor = [255, 189, 49];  
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

/**
 * Helper to parse custom labels (e.g. "01-Jul 2026" or "01-Jul") to a Dayjs object
 */
const parseLabelToDate = (label, baseDateStr) => {
  if (!label) return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const datePart = label.split(" ")[0]; // "01-Jul"
  const parts = datePart.split("-");
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const mon = parts[1];
  const monthIdx = months[mon];
  if (monthIdx === undefined) return null;
  const year = baseDateStr ? dayjs(baseDateStr).year() : dayjs().year();
  
  // Since dayjs might not be imported directly under this exact name in scope (we import it as dayjs or it might not be imported),
  // let's dynamically check or use window.dayjs / fallback
  // Wait, let's look at the imports in exportUtils.js:
  // It doesn't import dayjs! Oh, let's import it or construct a native Date/custom representation, or import dayjs at the top of exportUtils.js.
  // Wait! Let's check if dayjs is imported at the top of exportUtils.js. No, it isn't. Let's add it or construct a clean parser.
  // We can use a simple native date parsing and day-of-week detector to avoid adding dependencies, or just import dayjs at the top.
  // Let's import dayjs at the top of exportUtils.js.
  // Let's see: import dayjs from "dayjs";
  // Let's add parseLabelToDate with native JS Date or dayjs. Since dayjs is already in node_modules, we can import dayjs.
  return dayjs().year(year).month(monthIdx).date(day).startOf("day");
};

export const exportDailySecondaryExcel = async ({
  data,
  labels,
  title = "WAREHOUSE DAILY OFFTAKE",
  subtitle = "",
  filename = "warehouse_daily_offtake.xlsx",
  sheetName = "Daily Offtake",
  firstColHeader = "Warehouse",
  firstColKey = "warehouse",
  baseDateStr = null
}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }]
  });

  const numLabels = labels.length;
  const lastColIdx = 3 + numLabels;

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

  const endHeaderColLetter = getColLetter(2 + numLabels);
  const totalColLetter = getColLetter(lastColIdx);

  const navyColor = "0B294F";
  const goldColor = "FFBD31";
  const totalBgColor = "FFD966";
  const sundayBgColor = "F2F2F2";
  const borderStyle = { style: "thin", color: { argb: "FFD3D3D3" } };

  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 10;
  ws.getRow(4).height = 20;
  ws.getRow(5).height = 20;

  ws.mergeCells(`A1:${totalColLetter}1`);
  ws.mergeCells(`A2:${totalColLetter}2`);

  const titleCell = ws.getCell("A1");
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A4:A5");
  const sNoHeader = ws.getCell("A4");
  sNoHeader.value = "S.NO";
  
  ws.mergeCells("B4:B5");
  const mainHeader = ws.getCell("B4");
  mainHeader.value = firstColHeader;

  ws.mergeCells(`${totalColLetter}4:${totalColLetter}5`);
  const totalHeader = ws.getCell(`${totalColLetter}4`);
  totalHeader.value = "TOTAL";

  const styleMergedHeader = (cell) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };
  styleMergedHeader(sNoHeader);
  styleMergedHeader(mainHeader);
  styleMergedHeader(totalHeader);

  const sundayColIndices = new Set();
  labels.forEach((label, idx) => {
    const colIdx = 3 + idx;
    const cellColLetter = getColLetter(colIdx);
    const dayNameCell = ws.getCell(`${cellColLetter}4`);
    const dayNumCell = ws.getCell(`${cellColLetter}5`);

    const date = parseLabelToDate(label, baseDateStr);
    const isSunday = date && date.day() === 0;
    if (isSunday) {
      sundayColIndices.add(colIdx);
    }

    dayNameCell.value = date ? date.format("ddd").toUpperCase() : "";
    dayNumCell.value = date ? date.date() : idx + 1;

    const headerFont = {
      name: "Segoe UI",
      size: 9,
      bold: true,
      color: { argb: isSunday ? goldColor : "FFFFFF" }
    };

    [dayNameCell, dayNumCell].forEach(c => {
      c.font = headerFont;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
  });

  let currentWordRowIdx = 6;
  let sNoCounter = 1;

  // Let's track column sums
  const colSums = {};
  labels.forEach(l => colSums[l] = 0);
  let grandTotalSum = 0;

  data.forEach((row) => {
    const excelRow = ws.getRow(currentWordRowIdx);
    excelRow.height = 20;

    const isTotalRow = row.isClusterTotal || String(row[firstColKey] || "").toLowerCase().includes("total");

    const sNoCell = ws.getCell(`A${currentWordRowIdx}`);
    if (!isTotalRow && !row.isClusterHeader) {
      sNoCell.value = sNoCounter++;
      sNoCell.alignment = { horizontal: "center", vertical: "middle" };
      sNoCell.font = { name: "Segoe UI", size: 10 };
    } else if (isTotalRow) {
      sNoCell.value = "TOTAL";
      sNoCell.alignment = { horizontal: "center", vertical: "middle" };
      sNoCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
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

    labels.forEach((label, idx) => {
      const colIdx = 3 + idx;
      const cellColLetter = getColLetter(colIdx);
      const valCell = ws.getCell(`${cellColLetter}${currentWordRowIdx}`);
      const val = row[label];

      const isSunday = sundayColIndices.has(colIdx);

      if (val === 0 || val === null || val === undefined) {
        valCell.value = "-";
        valCell.font = { name: "Segoe UI", size: 10, color: { argb: "FF999999" } };
      } else {
        valCell.value = Number(val);
        valCell.font = { name: "Segoe UI", size: 10, bold: isTotalRow };
        if (!isTotalRow && !row.isClusterHeader) {
          colSums[label] += Number(val);
        }
      }

      valCell.alignment = { horizontal: "center", vertical: "middle" };

      if (isTotalRow) {
        valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
        valCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      } else if (isSunday) {
        valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sundayBgColor } };
      }
    });

    const totalCell = ws.getCell(`${totalColLetter}${currentWordRowIdx}`);
    const rTotal = Number(row.total || 0);
    totalCell.value = rTotal;
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.font = { name: "Segoe UI", size: 10, bold: true };
    if (isTotalRow) {
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

  // Append Grand Total Row if not present in the original dataset
  const hasGrandTotalRow = data.some(row => String(row[firstColKey] || "").toLowerCase().includes("total"));
  if (!hasGrandTotalRow && data.length > 0) {
    const totalRowIdx = currentWordRowIdx;
    ws.getRow(totalRowIdx).height = 20;

    const sNoCell = ws.getCell(`A${totalRowIdx}`);
    sNoCell.value = "TOTAL";
    sNoCell.alignment = { horizontal: "center", vertical: "middle" };
    sNoCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    sNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    const mainCell = ws.getCell(`B${totalRowIdx}`);
    mainCell.value = "";
    mainCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    labels.forEach((label, idx) => {
      const colIdx = 3 + idx;
      const cellColLetter = getColLetter(colIdx);
      const valCell = ws.getCell(`${cellColLetter}${totalRowIdx}`);
      const val = colSums[label];
      valCell.value = val === 0 ? "-" : val;
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      valCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    });

    const totalCell = ws.getCell(`${totalColLetter}${totalRowIdx}`);
    totalCell.value = grandTotalSum;
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    currentWordRowIdx++;
  }

  ws.getColumn("A").width = 6;
  ws.getColumn("B").width = 25;
  for (let c = 3; c < lastColIdx; c++) {
    ws.getColumn(c).width = 5;
  }
  ws.getColumn(lastColIdx).width = 12;

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

export const exportDailySecondaryPdf = ({
  data,
  labels,
  title = "WAREHOUSE DAILY OFFTAKE",
  subtitle = "",
  filename = "warehouse_daily_offtake.pdf",
  firstColHeader = "Warehouse",
  firstColKey = "warehouse",
  baseDateStr = null
}) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const parsedDates = labels.map(label => parseLabelToDate(label, baseDateStr));

  const tableHeaders = [
    ["S.NO", firstColHeader, ...parsedDates.map((d, idx) => d ? d.format("ddd").toUpperCase() : ""), "TOTAL"],
    ["", "", ...parsedDates.map((d, idx) => d ? d.format("D") : String(idx + 1)), ""]
  ];

  let sNoCounter = 1;
  const tableRows = data.map((row) => {
    const isTotalRow = row.isClusterTotal || String(row[firstColKey] || "").toLowerCase().includes("total");
    const sNo = isTotalRow ? "" : String(sNoCounter++);
    
    const rowValues = [
      isTotalRow ? "TOTAL" : sNo,
      row[firstColKey] || row.shop_name || row.shop_code || "",
      ...labels.map(l => {
        const val = row[l];
        return (val === 0 || val === null || val === undefined) ? "-" : String(val);
      }),
      String(row.total || 0)
    ];
    return rowValues;
  });

  const numLabels = labels.length;
  const dateColWidth = Math.max(5, 217 / numLabels);

  const columnStyles = {
    0: { cellWidth: 10, halign: "center" },
    1: { cellWidth: 45, halign: "left" }
  };
  for (let i = 0; i < numLabels; i++) {
    columnStyles[2 + i] = { cellWidth: dateColWidth, halign: "center" };
  }
  columnStyles[2 + numLabels] = { cellWidth: 15, halign: "center" };

  autoTable(doc, {
    head: tableHeaders,
    body: tableRows,
    startY: 32,
    margin: { top: 32, bottom: 10, left: 5, right: 5 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1,
      lineColor: [200, 200, 200],
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: [11, 41, 79],
      textColor: [255, 189, 49],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle"
    },
    columnStyles: columnStyles,
    didDrawPage: (data) => {
      doc.setFillColor(11, 41, 79); 
      doc.rect(5, 5, 287, 12, "F");

      doc.setFillColor(255, 189, 49); 
      doc.rect(5, 17, 287, 6, "F");

      doc.setFillColor(11, 41, 79); 
      doc.rect(5, 23, 287, 6, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255); 
      doc.text(title.toUpperCase(), 148.5, 11, { align: "center" });

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      doc.text(subtitle, 148.5, 21.5, { align: "center" });

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 189, 49); 
      doc.text(firstColHeader.toUpperCase() + " DAILY OFFTAKE", 10, 27.5);
    },
    didParseCell: (cellData) => {
      if (cellData.section === 'head') {
        const colIndex = cellData.column.index;
        if (cellData.row.index === 1 && (colIndex === 0 || colIndex === 1 || colIndex === 2 + numLabels)) {
          cellData.cell.text = [];
        }
      }

      if (cellData.section === 'body') {
        const colIndex = cellData.column.index;
        const rowFirstCellVal = String(cellData.row.cells[0]?.raw || "").trim();
        const isTotalRow = rowFirstCellVal === "TOTAL" || String(cellData.row.cells[1]?.raw || "").toLowerCase().includes("total");

        if (isTotalRow) {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.fillColor = [11, 41, 79];
          cellData.cell.styles.textColor = [255, 189, 49];
        } else {
          if (colIndex >= 2 && colIndex < 2 + numLabels) {
            const dateObj = parsedDates[colIndex - 2];
            if (dateObj && dateObj.day() === 0) {
              cellData.cell.styles.fillColor = [240, 240, 240];
              cellData.cell.styles.textColor = [190, 140, 40];
              cellData.cell.styles.fontStyle = "bold";
            }
          }

          if (colIndex === 2 + numLabels) {
            cellData.cell.styles.fillColor = [255, 230, 153];
            cellData.cell.styles.fontStyle = "bold";
          }

          if (cellData.cell.raw === "-") {
            cellData.cell.styles.textColor = [180, 180, 180];
          }
        }
      }
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${i} of ${pageCount}`, 148.5, 203, { align: "center" });
  }

  doc.save(filename);
};

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

export const exportBrandwiseCumExcel = async ({
  data,
  columns,
  title = "WAREHOUSE BRANDWISE SECONDARY SALES CUMULATIVE",
  subtitle = "",
  filename = "warehouse_brandwise_cumulative.xlsx",
  sheetName = "Brandwise Cumulative",
  firstColHeader = "Warehouse",
  firstColKey = "warehouse",
  baseDateStr = null
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
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = subtitle;
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

    const isTotalRow = row.isClusterTotal || String(row[firstColKey] || "").toLowerCase().includes("total");

    const sNoCell = ws.getCell(`A${currentWordRowIdx}`);
    if (!isTotalRow && !row.isClusterHeader) {
      sNoCell.value = sNoCounter++;
      sNoCell.alignment = { horizontal: "center", vertical: "middle" };
      sNoCell.font = { name: "Segoe UI", size: 10 };
    } else if (isTotalRow) {
      sNoCell.value = "TOTAL";
      sNoCell.alignment = { horizontal: "center", vertical: "middle" };
      sNoCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
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
        valCell.value = Number(val);
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
    totalCell.value = rTotal;
    totalCell.alignment = { horizontal: "center", vertical: "middle" };
    totalCell.font = { name: "Segoe UI", size: 10, bold: true };
    if (isTotalRow) {
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
    sNoCell.value = "TOTAL";
    sNoCell.alignment = { horizontal: "center", vertical: "middle" };
    sNoCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    sNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    const mainCell = ws.getCell(`B${totalRowIdx}`);
    mainCell.value = "";
    mainCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    columns.forEach((col, idx) => {
      const colIdx = 3 + idx;
      const cellColLetter = getColLetter(colIdx);
      const valCell = ws.getCell(`${cellColLetter}${totalRowIdx}`);
      
      const colKey = typeof col === "object" ? col.key : col;
      const val = colSums[colKey];
      
      valCell.value = val === 0 ? "-" : val;
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      valCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    });

    const totalCell = ws.getCell(`${totalColLetter}${totalRowIdx}`);
    totalCell.value = grandTotalSum;
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