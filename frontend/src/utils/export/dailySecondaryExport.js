import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parseLabelToDate } from "./core";

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
  titleCell.value = "K.S DISTILLERY";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = subtitle ? `${title.toUpperCase()}  •  ${subtitle}` : title.toUpperCase();
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
  const hasGrandTotalRow = data.some(row => {
    if (row.isClusterTotal) return false;
    const str = String(row[firstColKey] || "").toLowerCase().trim();
    return str === "total" || str === "grand total";
  });
  if (!hasGrandTotalRow && data.length > 0) {
    const totalRowIdx = currentWordRowIdx;
    ws.getRow(totalRowIdx).height = 20;

    const sNoCell = ws.getCell(`A${totalRowIdx}`);
    sNoCell.value = "";
    sNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };

    const mainCell = ws.getCell(`B${totalRowIdx}`);
    mainCell.value = "Grand Total";
    mainCell.alignment = { horizontal: "left", vertical: "middle" };
    mainCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
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
    const isTotalRow = row.isTotal || row.isClusterTotal || String(row[firstColKey] || "").toLowerCase().includes("total");
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
