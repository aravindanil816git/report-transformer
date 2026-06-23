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
    // Header must be a navy blue background, with title in orange font
    doc.setFillColor(27, 54, 93); // Navy blue
    doc.rect(15, 12, 180, 10, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); // Orange font (#ffbd31)
    doc.text(currentTitle, 20, 18.5, { align: "left" });

    // Second row must be orange background, with navy blue text Period: {As_on_date}
    doc.setFillColor(255, 189, 49); // Orange background (#ffbd31)
    doc.rect(15, 22, 180, 8, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(27, 54, 93); // Navy blue text
    const cleanPeriod = (currentPeriod || "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
    
    let formattedDate = cleanPeriod;
    if (cleanPeriod) {
      const parts = cleanPeriod.split("-");
      if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          day = parseInt(parts[2], 10);
        } else {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          year = parseInt(parts[2], 10);
        }
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 0 && month < 12) {
          formattedDate = `${day} ${months[month]} ${year}`;
        }
      }
    }
    
    doc.text(`Period: ${formattedDate}`, 20, 27.5, { align: "left" });

    // After one row (leaving an empty row space of ~8mm, so start at 38), navy blue background row with black text {Warehouse Name}
    const whName = subHeader ? subHeader.replace(/^Warehouse:\s*/i, "") : (metadataWarehouse || "All");
    doc.setFillColor(27, 54, 93); // Navy blue
    doc.rect(15, 38, 180, 8, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0); // Black text
    doc.text(whName, 20, 43, { align: "left" });
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

      autoTable(doc, {
        head: [columns],
        body: tableRows,
        startY: 50,
        margin: { top: 50, bottom: 20, left: 15, right: 15 },
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2, font: "helvetica", lineColor: [220, 220, 220], lineWidth: 0.15 },
        headStyles: { fillColor: [27, 54, 93], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: (cellData) => {
          drawHeader(doc, title, periodLabel, `Warehouse: ${groupName}`);
        },
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

    autoTable(doc, {
      head: [columns],
      body: tableRows,
      startY: 50,
      margin: { top: 50, bottom: 20, left: 15, right: 15 },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2, font: "helvetica", lineColor: [220, 220, 220], lineWidth: 0.15 },
      headStyles: { fillColor: [27, 54, 93], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (cellData) => {
        drawHeader(doc, title, periodLabel, metadataWarehouse ? `Warehouse: ${metadataWarehouse}` : null);
      },
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

export const exportShopDrilldownPdfByBond = async ({
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
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const formatVal = (val) => {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    if (useWholeNumbers) {
      return Math.round(num);
    }
    return num.toFixed(2);
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
      rows.push({
        label: brand,
        isBrandHeader: true
      });

      const brandTotal = {
        label: `${brand} Total`,
        opening: 0,
        inward: 0,
        outward: 0,
        closing: 0,
        isBrandTotal: true
      };

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
        brandTotal.opening += op;
        brandTotal.inward += inward;
        brandTotal.outward += outward;
        brandTotal.closing += closing;
      });

      rows.push(brandTotal);
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
    doc.setFillColor(27, 54, 93); // Navy blue
    doc.rect(15, 12, 180, 10, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 189, 49); // Orange font
    doc.text(currentTitle, 20, 18.5, { align: "left" });

    doc.setFillColor(255, 189, 49); // Orange background
    doc.rect(15, 22, 180, 8, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(27, 54, 93); // Navy blue text
    const cleanPeriod = (currentPeriod || "").replace(/^COMBINED PERIOD\s*:\s*/i, "").trim();
    doc.text(`Period: ${cleanPeriod}`, 20, 27.5, { align: "left" });

    doc.setFillColor(27, 54, 93); // Navy blue
    doc.rect(15, 38, 180, 8, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0); // Black text
    doc.text(shopName, 20, 43, { align: "left" });
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

    const pdfCols = ["Row Labels", `Opening ${view === 'bottle' ? 'Bottles' : 'Cases'}`, `Receipt ${view === 'bottle' ? 'Bottles' : 'Cases'}`, `Sales ${view === 'bottle' ? 'Bottles' : 'Cases'}`, `Closing ${view === 'bottle' ? 'Bottles' : 'Cases'}`];

    const tableRows = shopRows.map(row => {
      if (row.isSpacer) {
        return ["", "", "", "", ""];
      }
      return [
        row.label,
        row.isBrandHeader ? "" : formatVal(row.opening),
        row.isBrandHeader ? "" : formatVal(row.inward),
        row.isBrandHeader ? "" : formatVal(row.outward),
        row.isBrandHeader ? "" : formatVal(row.closing)
      ];
    });

    const displayShopName = shop.shop_name ? shop.shop_name : shop.shop_code;

    autoTable(doc, {
      head: [pdfCols],
      body: tableRows,
      startY: 50,
      margin: { top: 50, bottom: 20, left: 15, right: 15 },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2, font: "helvetica", lineColor: [220, 220, 220], lineWidth: 0.15 },
      headStyles: { fillColor: [27, 54, 93], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: () => {
        drawHeader(doc, `${title} - ${bondName} Bond`, periodLabel, displayShopName);
      },
      didParseCell: (cellData) => {
        const rowIndex = cellData.row.index;
        const rowObj = shopRows[rowIndex];
        if (rowObj) {
          if (rowObj.isBrandHeader) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [240, 240, 240];
          } else if (rowObj.isBrandTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [214, 233, 198];
          } else if (rowObj.isShopTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [173, 201, 230];
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
      doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: "center" });
    }
    doc.save(filename);
  }
};
