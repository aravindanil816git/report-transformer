import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";

/**
 * Exports data to Excel with optional metadata rows at the top.
 * @param {Array} data - The array of objects to export.
 * @param {Object|Array} metadata - Key-value pairs of filters/metadata, or an array of custom rows.
 * @param {string} filename - The name of the file to save.
 * @param {string} sheetName - The name of the worksheet.
 */
export const exportToExcel = (data, metadata = {}, filename = "report.xlsx", sheetName = "Report") => {
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
  saveAs(new Blob([buf]), filename);
};
