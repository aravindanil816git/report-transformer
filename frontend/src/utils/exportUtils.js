import * as XLSX from "xlsx-js-style";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Exports data to Excel with optional metadata rows at the top.
 * @param {Array} data - The array of objects to export.
 * @param {Object|Array} metadata - Key-value pairs of filters/metadata, or an array of custom rows.
 * @param {string} filename - The name of the file to save.
 * @param {string} sheetName - The name of the worksheet.
 */
export const exportToExcel = (data, metadata = {}, filename = "report.xlsx", sheetName = "Report", options = {}) => {
  const wsData = [];

  // Add metadata rows
  if (Array.isArray(metadata)) {
    metadata.forEach(row => wsData.push(row));
  } else {
    Object.entries(metadata).forEach(([key, value]) => {
      if (value) {
        wsData.push([key, value]);
      }
    });
  }

  // Add a blank row if there was metadata
  if (wsData.length > 0) {
    wsData.push([]);
    wsData.push([]);
  }

  // Add table headers
  let numCols = 1;
  let tableHeaderRowIdx = -1;
  if (data.length > 0) {
    // Collect all unique keys from all rows to ensure no columns are missed
    const allKeys = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);
    numCols = headers.length;
    tableHeaderRowIdx = wsData.length;
    wsData.push(headers);

    // Add table data
    data.forEach((row) => {
      wsData.push(headers.map((h) => row[h] !== undefined ? row[h] : ""));
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size column widths so the text isn't squished
  if (data.length > 0) {
    const headers = Array.from(new Set(data.flatMap(r => Object.keys(r))));
    ws["!cols"] = headers.map(h => ({
      wch: Math.max(h.length + 5, 12) // Minimum width of 12, or header length + padding
    }));
  }

  // Merge custom header rows so they span across the table and don't get cut off
  const isArrayMetadata = Array.isArray(metadata);
  if (isArrayMetadata && metadata.length > 0 && numCols > 1) {
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } });
    ws["!merges"].push({ s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } });
  }

  // Apply AutoFilter if requested
  if (options.autofilter && tableHeaderRowIdx !== -1) {
    const lastRowIndex = wsData.length - 1;
    // Check if the last row is a Total row (contains 'Total' in the first column)
    const hasTotal = data.length > 0 && String(Object.values(data[data.length - 1])[0] || "").trim() === "Total";
    const endRow = hasTotal ? Math.max(tableHeaderRowIdx, lastRowIndex - 1) : lastRowIndex;
    
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: tableHeaderRowIdx, c: 0 },
        e: { r: endRow, c: numCols - 1 }
      })
    };
  }

  // Apply borders to all cells
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
        
        // Bold and center the custom headers (Rows 0 and 1)
        if (isArrayMetadata && (R === 0 || R === 1)) {
           ws[cellRef].s.font.bold = true;
           ws[cellRef].s.alignment = { horizontal: "center", vertical: "center" };
        }
        
        // Bold the table headers and any row that starts with "Total"
        const rowFirstCellRef = XLSX.utils.encode_cell({ c: 0, r: R });
        const rowFirstCellValue = ws[rowFirstCellRef] ? String(ws[rowFirstCellRef].v).trim() : "";
        if (R === tableHeaderRowIdx || rowFirstCellValue === "Total") {
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
  filterColumnName = "Warehouse"
}) => {
  // Helper to convert 1-based column index to Excel column letter (e.g. 1 -> A, 27 -> AA)
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
  const dropdownColIdx = columns.length + 5; // Put validation list 5 columns to the right of active columns
  const dropdownColLetter = getColLetter(dropdownColIdx);
  allWarehouses.forEach((wh, index) => {
    rawDataSheet.getCell(index + 1, dropdownColIdx).value = wh;
  });
  const warehousesRange = `RawData!$${dropdownColLetter}$1:$${dropdownColLetter}$${allWarehouses.length}`;

  // Report Title
  reportSheet.mergeCells("A1:F1");
  const titleCell = reportSheet.getCell("A1");
  titleCell.value = reportTitle;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFD00000" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Selector
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

  // Period
  reportSheet.getCell("A3").value = periodLabel;
  reportSheet.getCell("A3").font = { italic: true };
  reportSheet.mergeCells("A3:F3");

  // Sums (Totals) row
  reportSheet.getCell("A5").value = "Total (Filtered):";
  reportSheet.getCell("A5").font = { bold: true };

  const lastDataRow = 7 + data.length;

  sumCols.forEach(colKey => {
    const colIdx = columns.indexOf(colKey);
    if (colIdx !== -1) {
      const colLetter = String.fromCharCode(65 + colIdx);
      reportSheet.getCell(`${colLetter}5`).value = { formula: `SUM(${colLetter}7:${colLetter}${lastDataRow})` };
      reportSheet.getCell(`${colLetter}5`).font = { bold: true };
    }
  });

  // Table Headers
  const headerRow = reportSheet.getRow(6);
  headerRow.values = columns;
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "medium" },
      right: { style: "thin" }
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" }
    };
  });

  // getColLetter helper is defined at the top of function scope

  const lastColLetter = getColLetter(columns.length);
  const targetColLower = filterColumnName.toLowerCase();
  const foundIdx = columns.findIndex(col => col.toLowerCase() === targetColLower);
  const whColIdx = foundIdx !== -1 ? foundIdx + 1 : 1;
  const whColLetter = getColLetter(whColIdx);
  const lastRawRow = data.length + 1;

  // Write cell-by-cell filter formulas using INDEX + SMALL + IF (fully compatible with Google Sheets & all Excel versions)
  for (let r = 7; r <= lastDataRow; r++) {
    const k = r - 6; // 1-based match index
    for (let c = 1; c <= columns.length; c++) {
      const colLetter = getColLetter(c);
      const formula = `IFERROR(INDEX(RawData!${colLetter}:${colLetter}, SMALL(IF($B$2="All", ROW(RawData!$A$2:$A$${lastRawRow}), IF(RawData!$${whColLetter}$2:$${whColLetter}$${lastRawRow}=$B$2, ROW(RawData!$A$2:$A$${lastRawRow}))), ${k})), "")`;
      reportSheet.getCell(r, c).value = {
        formula,
        shareType: "array",
        ref: `${colLetter}${r}`
      };
    }
  }

  // Set column widths
  reportSheet.columns = columns.map(col => ({
    width: Math.max(col.length + 5, 15)
  }));

  // Style thin borders for spilled cells (bounded to data size)
  for (let r = 7; r <= lastDataRow; r++) {
    for (let c = 1; c <= columns.length; c++) {
      const cell = reportSheet.getCell(r, c);
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } }
      };
    }
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
  metadataWarehouse = null
}) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const drawHeader = (doc, currentTitle, currentPeriod, subHeader = null) => {
    // Report Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(208, 0, 0); // Red Accent
    doc.text(currentTitle, 105, 15, { align: "center" });

    // Period / Subtext
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(currentPeriod, 15, 22);

    if (subHeader) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(43, 87, 154); // Blue Accent for warehouse name
      doc.text(subHeader, 15, 27);
    }
    
    // Thin divider line
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(15, 30, 195, 30);
  };

  if (groupByField) {
    // Group rows by the groupByField
    const groups = {};
    data.forEach(row => {
      const groupVal = row[groupByField] || "Unknown";
      if (!groups[groupVal]) groups[groupVal] = [];
      groups[groupVal].push(row);
    });

    const groupNames = Object.keys(groups).sort();
    groupNames.forEach((groupName, idx) => {
      if (idx > 0) doc.addPage();

      const groupRows = groups[groupName];
      const tableRows = groupRows.map(row => 
        columns.map(col => row[col] !== undefined ? row[col] : "")
      );

      // Append Totals row for this group if there are sum columns
      if (sumCols.length > 0) {
        const totalsRow = columns.map(col => {
          if (col === groupByField || col === columns[0]) return "Total";
          if (sumCols.includes(col)) {
            const sum = groupRows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
            const isPrice = col.toLowerCase().includes("price") || col.toLowerCase().includes("cost");
            return isPrice ? sum.toFixed(2) : sum;
          }
          return "";
        });
        tableRows.push(totalsRow);
      }

      drawHeader(doc, title, periodLabel, `Warehouse: ${groupName}`);

      autoTable(doc, {
        head: [columns],
        body: tableRows,
        startY: 34,
        margin: { top: 35, bottom: 20, left: 15, right: 15 },
        styles: { fontSize: 8, cellPadding: 2, font: "helvetica" },
        headStyles: { fillColor: [43, 87, 154], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (cellData) => {
          const isTotalRow = cellData.row.index === tableRows.length - 1;
          if (isTotalRow && sumCols.length > 0) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [241, 245, 249];
          }
        }
      });
    });
  } else {
    // Single table render
    const tableRows = data.map(row => 
      columns.map(col => row[col] !== undefined ? row[col] : "")
    );

    // Check if the last row is already a "Total" row (for Current View where parent might add totals)
    const lastRow = data[data.length - 1];
    const firstCellVal = lastRow ? String(Object.values(lastRow)[0] || "").trim().toLowerCase() : "";
    const hasTotalRow = firstCellVal === "total";

    drawHeader(doc, title, periodLabel, metadataWarehouse ? `Warehouse: ${metadataWarehouse}` : null);

    autoTable(doc, {
      head: [columns],
      body: tableRows,
      startY: 34,
      margin: { top: 35, bottom: 20, left: 15, right: 15 },
      styles: { fontSize: 8, cellPadding: 2, font: "helvetica" },
      headStyles: { fillColor: [43, 87, 154], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (cellData) => {
        const isTotalRow = hasTotalRow && (cellData.row.index === tableRows.length - 1);
        if (isTotalRow) {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });
  }

  // Draw Page Numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: "center" });
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
  filenamePrefix = "report"
}) => {
  const entries = Object.entries(clusters);
  for (const [clusterName, whList] of entries) {
    // Filter data for warehouses belonging to this cluster
    const clusterData = data.filter(row => {
      const whVal = String(row[groupByField] || "").trim().toUpperCase().replace(/^WH-/i, "");
      return whList.some(wh => wh.trim().toUpperCase().replace(/^WH-/i, "") === whVal);
    });

    if (clusterData.length > 0) {
      const cleanClusterName = clusterName.replace(/\s+/g, "_").toLowerCase();
      exportToPdf({
        title: `${title} (${clusterName})`,
        periodLabel,
        columns,
        data: clusterData,
        groupByField,
        sumCols,
        filename: `${filenamePrefix}_${cleanClusterName}.pdf`
      });
      // Introduce a 300ms delay to prevent browser from blocking subsequent downloads
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
};
