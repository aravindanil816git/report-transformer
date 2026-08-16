import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

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
  titleCell.value = "K.S DISTILLERY";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: goldColor } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Sub-banner: Left title, Right period
  const halfCols = Math.max(1, Math.floor(displayColumns.length / 2));
  const leftEndColLetter = getColLetter(halfCols);
  const rightStartColLetter = getColLetter(halfCols + 1);

  if (displayColumns.length > 1) {
    reportSheet.mergeCells(`A2:${leftEndColLetter}2`);
    reportSheet.mergeCells(`${rightStartColLetter}2:${lastColLetter}2`);
  }

  const leftSubCell = reportSheet.getCell("A2");
  leftSubCell.value = dropdownLabel ? `${reportTitle.toUpperCase()} · ${dropdownLabel.toUpperCase()}` : reportTitle.toUpperCase();
  leftSubCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFF" } };
  leftSubCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  leftSubCell.alignment = { horizontal: "left", vertical: "middle" };

  const rightSubCell = reportSheet.getCell(`${rightStartColLetter}2`);
  rightSubCell.value = periodLabel ? periodLabel.toUpperCase() : "";
  rightSubCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: goldColor } };
  rightSubCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  rightSubCell.alignment = { horizontal: "right", vertical: "middle" };

  for (let c = 1; c <= displayColumns.length; c++) {
    const cell = reportSheet.getCell(2, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  }

  // Dropdown Row
  const selectLabelCell = reportSheet.getCell("A3");
  selectLabelCell.value = `SELECT ${dropdownLabel.toUpperCase()}:`;
  selectLabelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
  selectLabelCell.alignment = { horizontal: "right", vertical: "middle" };

  const dropdownCell = reportSheet.getCell("B3");
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

  // Total Row setup (Row 5)
  const tLabelCell = reportSheet.getCell("A5");
  tLabelCell.value = "TOTAL (FILTERED)";
  tLabelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
  tLabelCell.alignment = { horizontal: "center", vertical: "middle" };

  for (let c = 1; c <= displayColumns.length; c++) {
    const cell = reportSheet.getCell(5, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    if (c > 1) {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
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
      sumCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
    }
  });

  // Table Headers (Row 6)
  const headerRow = reportSheet.getRow(6);
  headerRow.values = displayColumns;
  headerRow.eachCell((cell, idx) => {
    cell.font = {
      name: "Segoe UI",
      size: 10,
      bold: true,
      color: { argb: goldColor }
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
    
    const formula = `IFERROR(INDEX(RawData!${rawDataColLetter}:${rawDataColLetter}, SMALL(IF($B$3="All", ROW(RawData!$A$2:$A$${lastRawRow}), IF(RawData!$${whColLetter}$2:$${whColLetter}$${lastRawRow}=$B$3, ROW(RawData!$A$2:$A$${lastRawRow}))), ROW() - 6)), "")`;
    reportSheet.getCell(7, c).value = {
      formula,
      shareType: "array",
      ref: `${colLetter}7:${colLetter}${lastDataRow}`
    };
  }

  // Set column widths
  reportSheet.getColumn(1).width = 45;
  for (let c = 2; c <= displayColumns.length; c++) {
    reportSheet.getColumn(c).width = 18;
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

  // Add Conditional Formatting:
  // 1. Hide borders & formatting for empty formula rows
  // 2. Highlight row immediately following the last non-empty row as TOTAL
  try {
    reportSheet.addConditionalFormatting({
      ref: `A7:${lastColLetter}${lastDataRow}`,
      rules: [
        // Rule 1: Blank formula cells -> white text to conceal empty results
        {
          type: 'expression',
          formulae: ['$A7=""'],
          style: {
            font: { color: { argb: 'FFFFFFFF' } }
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
