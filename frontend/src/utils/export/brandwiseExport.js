import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

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
