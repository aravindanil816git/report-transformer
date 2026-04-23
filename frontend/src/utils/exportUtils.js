import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/**
 * Exports data to Excel with optional metadata rows at the top.
 * @param {Array} data - The array of objects to export.
 * @param {Object} metadata - Key-value pairs of filters/metadata.
 * @param {string} filename - The name of the file to save.
 * @param {string} sheetName - The name of the worksheet.
 */
export const exportToExcel = (data, metadata = {}, filename = "report.xlsx", sheetName = "Report") => {
  const wsData = [];

  // Add metadata rows
  Object.entries(metadata).forEach(([key, value]) => {
    if (value) {
      wsData.push([key, value]);
    }
  });

  // Add a blank row if there was metadata
  if (wsData.length > 0) {
    wsData.push([]);
  }

  // Add table headers
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    wsData.push(headers);

    // Add table data
    data.forEach((row) => {
      wsData.push(headers.map((h) => row[h]));
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf]), filename);
};
