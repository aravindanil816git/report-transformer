import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import dayjs from "dayjs";
import { getSellThroughColorConfig } from "../colorUtils";

/**
 * Helper to parse custom labels (e.g. "01-Jul 2026" or "01-Jul") to a Dayjs object
 */
export const parseLabelToDate = (label, baseDateStr) => {
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
  return dayjs().year(year).month(monthIdx).date(day).startOf("day");
};

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
  head = null,
  blackPackColumn = false
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

    if (subHeader) {
      const rectY = zeroMargin ? 24 : 36;
      const textY = zeroMargin ? 29.5 : 41.5;

      doc.setFillColor(255, 189, 49); 
      doc.rect(startX, rectY, width, 8, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      doc.text(subHeader.toUpperCase(), pageWidth / 2, textY, { align: "center" });
    }
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
    if ((colName === "pack" || colName === "package") && !blackPackColumn) {
      columnStyles[i] = { cellWidth: 28, halign: 'center', textColor: [140, 150, 170] };
    } else if (colName === "pack" || colName === "package") {
      columnStyles[i] = { cellWidth: 28, halign: 'center' };
    } else {
      columnStyles[i] = { cellWidth: 'auto', halign: 'center' };
    }
  }

  const handleGrandTotalBorders = (cellData) => {
    const firstCellRaw = cellData.row.cells[0]?.raw;
    const isGrandTotal = String(firstCellRaw).trim().toLowerCase().includes("total") || 
                         String(firstCellRaw).trim().toLowerCase().includes("grand");
    if (isGrandTotal) {
      cellData.cell.styles.fontStyle = "bold";
      cellData.cell.styles.textColor = [255, 189, 49]; // Gold text
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

      const subHeaderStr = groupName ? String(groupName).replace(/^WH-/i, "").trim() : "";

      autoTable(doc, {
        head: head || [columns],
        body: tableRows,
        startY: subHeaderStr ? 32 : 28,
        margin: { top: subHeaderStr ? 32 : 28, bottom: 0, left: 0, right: 0 },
        theme: "striped",
        styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, textColor: [40, 40, 40] },
        columnStyles: columnStyles,
        headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 10, lineWidth: 0.1, lineColor: [200, 205, 215] },
        alternateRowStyles: { fillColor: [244, 247, 252] },
        didDrawPage: (data) => {
          drawHeader(doc, title, periodLabel, subHeaderStr, data.pageNumber);
        },
        didDrawCell: (data) => {
          const firstCellRaw = data.row.cells[0]?.raw;
          const isGrandTotal = String(firstCellRaw).trim().toLowerCase().includes("total") || String(firstCellRaw).trim().toLowerCase().includes("grand");
          if (data.section === 'body' && isGrandTotal) {
            doc.setDrawColor(255, 189, 49); // Gold color
            doc.setLineWidth(0.7);
            doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
          }
          const rawCol = data.column.raw;
          const rawColTitle = rawCol && typeof rawCol === "object" ? (rawCol.title || rawCol.header || "") : String(rawCol || "");
          const colTitle = String(rawColTitle).toUpperCase().trim();
          const isTrend = colTitle.includes("TREND") || colTitle.includes("AVG DIFF");
          if (data.section === 'body' && isTrend) {
            const valNum = Number(data.cell.raw);
            if (!isNaN(valNum) && valNum !== 0) {
              const isPositive = valNum > 0;
              if (isGrandTotal) {
                doc.setDrawColor(isPositive ? 144 : 255, isPositive ? 238 : 182, isPositive ? 144 : 193);
                doc.setFillColor(isPositive ? 144 : 255, isPositive ? 238 : 182, isPositive ? 144 : 193);
              } else {
                doc.setDrawColor(isPositive ? 63 : 207, isPositive ? 134 : 19, isPositive ? 0 : 34);
                doc.setFillColor(isPositive ? 63 : 207, isPositive ? 134 : 19, isPositive ? 0 : 34);
              }
              const x = data.cell.x + 2.0;
              const y = data.cell.y + data.cell.height / 2;
              const size = 1.0;
              if (isPositive) {
                doc.triangle(x, y - size, x - size, y + size, x + size, y + size, "FD");
              } else {
                doc.triangle(x, y + size, x - size, y - size, x + size, y - size, "FD");
              }
            }
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
            const colTitle = String(cellText || rawKey || rawColTitle || "").toUpperCase().trim();
            if (["PHYSICAL", "ALLOTABLE", "PENDING", "PACK", "OPENING", "RECEIPT", "SALES", "CLOSING", "DIFFERENCE", "STOCK NET", "STOCK NET %", "AVG SALES / DAY", "TOTAL"].includes(colTitle)) {
              cellData.cell.styles.halign = 'center';
            }
          }
          handleGrandTotalBorders(cellData);

          if (cellData.section === 'body') {
            const cellIndex = cellData.column.index;
            const rawVal = String(cellData.cell.raw || "").trim();
            const firstCellRaw = cellData.row.cells[0]?.raw;
            const isGrandTotal = String(firstCellRaw).trim().toLowerCase().includes("total") || String(firstCellRaw).trim().toLowerCase().includes("grand");

            const rawCol = cellData.column.raw;
            const rawColTitle = rawCol && typeof rawCol === "object" ? (rawCol.title || rawCol.header || "") : String(rawCol || "");
            const headerText = cellData.table.columns[cellIndex]?.header?.text;
            const colHeaderStr = Array.isArray(headerText) ? headerText.join(" ") : String(headerText || "");
            const colTitle = String(rawColTitle || colHeaderStr || "").toUpperCase().trim();

            const isCompSales = String(title || "").toLowerCase().includes("comparative") || String(title || "").toLowerCase().includes("comparitive") || String(title || "").toLowerCase().includes("shopsales");
            const isSellThrough = colTitle.includes("SELL") || cellIndex === 7;
            const isTrend = colTitle.includes("TREND") || colTitle.includes("AVG DIFF") || cellIndex === 10;

            if (isCompSales && isTrend) {
              const valNum = Number(rawVal);
              if (!isNaN(valNum) && valNum !== 0) {
                if (isGrandTotal) {
                  cellData.cell.styles.textColor = valNum > 0 ? [144, 238, 144] : [255, 182, 193];
                } else {
                  cellData.cell.styles.textColor = valNum > 0 ? [63, 134, 0] : [207, 19, 34];
                }
                cellData.cell.styles.fontStyle = "bold";
              }
            } else if (isCompSales && isSellThrough) {
              if (!isGrandTotal) {
                const colors = getSellThroughColorConfig(rawVal);
                cellData.cell.styles.fillColor = colors.rgbFill;
                cellData.cell.styles.textColor = colors.rgbFont;
                cellData.cell.styles.fontStyle = "bold";
              } else {
                const colors = getSellThroughColorConfig(rawVal);
                const isZero = rawVal === "" || Number(rawVal) === 0;
                cellData.cell.styles.textColor = isZero ? [200, 205, 215] : colors.rgbFont;
              }
            } else if (cellIndex >= 1 && !isNaN(Number(rawVal)) && rawVal !== "") {
              if (isGrandTotal) {
                cellData.cell.styles.fontStyle = "bold";
              }
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
      startY: metadataWarehouse ? 32 : 28,
      margin: { top: metadataWarehouse ? 32 : 28, bottom: 0, left: 0, right: 0 },
      theme: "striped",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 11, cellPadding: 3.5, textColor: [40, 40, 40] },
      columnStyles: columnStyles,
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 10, lineWidth: 0.1, lineColor: [200, 205, 215] },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didDrawPage: (data) => {
        drawHeader(doc, title, periodLabel, metadataWarehouse ? `${metadataWarehouse}` : null, data.pageNumber);
      },
      didDrawCell: (data) => {
        const firstCellRaw = data.row.cells[0]?.raw;
        const isGrandTotal = String(firstCellRaw).trim().toLowerCase().includes("total") || String(firstCellRaw).trim().toLowerCase().includes("grand");
        if (data.section === 'body' && isGrandTotal) {
          doc.setDrawColor(255, 189, 49); // Gold color
          doc.setLineWidth(0.7);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
        const rawCol = data.column.raw;
        const rawColTitle = rawCol && typeof rawCol === "object" ? (rawCol.title || rawCol.header || "") : String(rawCol || "");
        const colTitle = String(rawColTitle).toUpperCase().trim();
        const isTrend = colTitle.includes("TREND") || colTitle.includes("AVG DIFF") || data.column.index === 10;
        if (data.section === 'body' && isTrend) {
          const valNum = Number(data.cell.raw);
          if (!isNaN(valNum) && valNum !== 0) {
            const isPositive = valNum > 0;
            if (isGrandTotal) {
              doc.setDrawColor(isPositive ? 144 : 255, isPositive ? 238 : 182, isPositive ? 144 : 193);
              doc.setFillColor(isPositive ? 144 : 255, isPositive ? 238 : 182, isPositive ? 144 : 193);
            } else {
              doc.setDrawColor(isPositive ? 63 : 207, isPositive ? 134 : 19, isPositive ? 0 : 34);
              doc.setFillColor(isPositive ? 63 : 207, isPositive ? 134 : 19, isPositive ? 0 : 34);
            }
            const x = data.cell.x + 2.0;
            const y = data.cell.y + data.cell.height / 2;
            const size = 1.0;
            if (isPositive) {
              doc.triangle(x, y - size, x - size, y + size, x + size, y + size, "FD");
            } else {
              doc.triangle(x, y + size, x - size, y - size, x + size, y - size, "FD");
            }
          }
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
          const colTitle = String(cellText || rawKey || rawColTitle || "").toUpperCase().trim();
          if (["PHYSICAL", "ALLOTABLE", "PENDING", "PACK", "OPENING", "RECEIPT", "SALES", "CLOSING", "DIFFERENCE", "STOCK NET", "STOCK NET %", "AVG SALES / DAY", "TOTAL"].includes(colTitle)) {
            cellData.cell.styles.halign = 'center';
          }
        }
        handleGrandTotalBorders(cellData);

        if (cellData.section === 'body') {
          const cellIndex = cellData.column.index;
          const rawVal = String(cellData.cell.raw || "").trim();
          const firstCellRaw = cellData.row.cells[0]?.raw;
          const isGrandTotal = String(firstCellRaw).trim().toLowerCase().includes("total") || String(firstCellRaw).trim().toLowerCase().includes("grand");

          const rawCol = cellData.column.raw;
          const rawColTitle = rawCol && typeof rawCol === "object" ? (rawCol.title || rawCol.header || "") : String(rawCol || "");
          const headerText = cellData.table.columns[cellIndex]?.header?.text;
          const colHeaderStr = Array.isArray(headerText) ? headerText.join(" ") : String(headerText || "");
          const colTitle = String(rawColTitle || colHeaderStr || "").toUpperCase().trim();

          const isCompSales = String(title || "").toLowerCase().includes("comparative") || String(title || "").toLowerCase().includes("comparitive") || String(title || "").toLowerCase().includes("shopsales");
          const isSellThrough = colTitle.includes("SELL") || cellIndex === 7;
          const isTrend = colTitle.includes("TREND") || colTitle.includes("AVG DIFF") || cellIndex === 10;

          if (isCompSales && isTrend) {
            const valNum = Number(rawVal);
            if (!isNaN(valNum) && valNum !== 0) {
              if (isGrandTotal) {
                cellData.cell.styles.textColor = valNum > 0 ? [144, 238, 144] : [255, 182, 193];
              } else {
                cellData.cell.styles.textColor = valNum > 0 ? [63, 134, 0] : [207, 19, 34];
              }
              cellData.cell.styles.fontStyle = "bold";
            }
          } else if (isCompSales && isSellThrough) {
            if (!isGrandTotal) {
              const colors = getSellThroughColorConfig(rawVal);
              cellData.cell.styles.fillColor = colors.rgbFill;
              cellData.cell.styles.textColor = colors.rgbFont;
              cellData.cell.styles.fontStyle = "bold";
            } else {
              const colors = getSellThroughColorConfig(rawVal);
              const isZero = rawVal === "" || Number(rawVal) === 0;
              cellData.cell.styles.textColor = isZero ? [200, 205, 215] : colors.rgbFont;
            }
          } else if (cellIndex >= 1 && !isNaN(Number(rawVal)) && rawVal !== "") {
            if (isGrandTotal) {
              cellData.cell.styles.fontStyle = "bold";
            }
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
