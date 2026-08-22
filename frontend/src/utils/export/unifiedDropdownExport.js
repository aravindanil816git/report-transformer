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
  const borderStyle = { style: "thin", color: { argb: "A5A5A5" } };

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
  selectLabelCell.alignment = { horizontal: "left", vertical: "middle" };

  const dropdownCell = reportSheet.getCell("B3");
  dropdownCell.value = "All";
  dropdownCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
  dropdownCell.alignment = { horizontal: "left", vertical: "middle" };
  dropdownCell.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: [warehousesRange]
  };
  dropdownCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
  dropdownCell.border = {
    top: { style: "thin", color: { argb: navyColor } },
    left: { style: "thin", color: { argb: navyColor } },
    bottom: { style: "thin", color: { argb: navyColor } },
    right: { style: "thin", color: { argb: navyColor } }
  };

  // Headers
  displayColumns.forEach((colName, index) => {
    const cell = reportSheet.getCell(6, index + 1);
    cell.value = colName.toUpperCase();
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    cell.alignment = { horizontal: index === 0 ? "left" : "right", vertical: "middle" };
  });

  // Rows
  data.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 7;
    const isShopHeader = row.isShopHeader;
    const isShopTotal = row.isShopTotal;
    const isBrandTotal = row.isBrandTotal;
    const filterVal = row[filterColumnName] || "";

    displayColumns.forEach((colName, colIndex) => {
      const cell = reportSheet.getCell(rowNumber, colIndex + 1);
      const val = row[colName];
      const rawDataColIndex = columns.indexOf(colName) + 1;
      const rawDataColLetter = getColLetter(rawDataColIndex);
      const filterColIdx = columns.indexOf(filterColumnName) + 1;
      const filterColLetter = getColLetter(filterColIdx);

      if (isShopHeader) {
        if (colIndex === 0) {
          cell.value = val;
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
        } else {
          const formula = `=IF(OR($B$3="All", $B$3="${filterVal}"), SUMIF(RawData!$${filterColLetter}:$${filterColLetter}, IF($B$3="All", "*", $B$3), RawData!$${rawDataColLetter}:$${rawDataColLetter}), 0)`;
          cell.value = { formula };
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
          cell.numFmt = "#,##0.00";
        }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBF1F5" } };
      } else if (isShopTotal) {
        if (colIndex === 0) {
          cell.value = val;
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
        } else {
          const formula = `=IF(OR($B$3="All", $B$3="${filterVal}"), ${val}, 0)`;
          cell.value = { formula };
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
          cell.numFmt = "#,##0.00";
        }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBF1F5" } };
      } else if (isBrandTotal) {
        if (colIndex === 0) {
          cell.value = val;
          cell.font = { name: "Segoe UI", size: 10, bold: true };
        } else {
          const formula = `=IF(OR($B$3="All", $B$3="${filterVal}"), ${val}, 0)`;
          cell.value = { formula };
          cell.font = { name: "Segoe UI", size: 10, bold: true };
          cell.numFmt = "#,##0.00";
        }
      } else {
        if (colIndex === 0) {
          cell.value = val;
          cell.font = { name: "Segoe UI", size: 10 };
        } else {
          if (val === "" || val === undefined || val === null) {
            cell.value = "";
          } else {
            const formula = `=IF(OR($B$3="All", $B$3="${filterVal}"), ${val}, 0)`;
            cell.value = { formula };
            cell.numFmt = "#,##0.00";
          }
          cell.font = { name: "Segoe UI", size: 10 };
        }
      }
      cell.border = borderStyle;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename);
};


/**
 * Export Shop Sales Multi-Tab Excel report matching exact current view coloring & crisp borders:
 * - Navy #0B294F & Gold #FFBD31 theme
 * - Row 1: K.S DISTILLERY (Navy background, White bold text)
 * - Row 2: SHOP SALES CUMULATIVE · [TAB NAME] (Left, Gold text) · Period (Right, Gold text)
 * - Row 3: Column Headers (BRAND/PACK | OPENING | RECEIPT | SALES | CLOSING - Navy fill, Gold bold text)
 * - Sharp, visible 4-side grid borders across all cells
 */
export const exportShopSalesMultiTabExcel = async ({
  fullData = [],
  filterMode = "bond", // "bond" or "warehouse"
  reportTitle = "Shop Sales Cumulative",
  periodLabel = "All",
  filename = null,
  useWholeNumbers = false,
  bondMapping = {},
  filterMapping = {},
  allShops = [],
  shopcodeMapping = {}
}) => {
  const workbook = new ExcelJS.Workbook();

  const navyColor = "0B294F";
  const goldColor = "FFBD31";
  const brandHeaderBg = "0B294F";
  const brandHeaderFg = "FFFFFF";
  const zebraBg = "F5F7FC";

  // Crisp grid borders for light & dark cells
  const leafBorder = {
    top: { style: "thin", color: { argb: "A5A5A5" } },
    left: { style: "thin", color: { argb: "A5A5A5" } },
    bottom: { style: "thin", color: { argb: "A5A5A5" } },
    right: { style: "thin", color: { argb: "A5A5A5" } }
  };

  const darkHeaderBorder = {
    top: { style: "thin", color: { argb: "557088" } },
    left: { style: "thin", color: { argb: "557088" } },
    bottom: { style: "thin", color: { argb: "557088" } },
    right: { style: "thin", color: { argb: "557088" } }
  };

  const goldMediumBorder = {
    top: { style: "medium", color: { argb: goldColor } },
    bottom: { style: "medium", color: { argb: goldColor } },
    left: { style: "thin", color: { argb: "557088" } },
    right: { style: "thin", color: { argb: "557088" } }
  };

  // Clean title
  const cleanTitle = String(reportTitle || "SHOP SALES CUMULATIVE")
    .replace(/\s*\([^)]*\)/gi, "")
    .trim()
    .toUpperCase();

  const periodStr = String(periodLabel || "")
    .replace(/^COMBINED PERIOD\s*:\s*/i, "")
    .replace(/^Report Period:\s*/i, "")
    .trim();

  // Group fullData by Tab Key (Bond or Warehouse)
  const tabGroups = {};

  fullData.forEach((row) => {
    const shopCodeStr = String(row.shop_code || "");
    let tabKey = "Other";

    if (filterMode === "bond") {
      let resolvedBond = row.Bond || row.bond;
      if (!resolvedBond) {
        for (const [bondName, bData] of Object.entries(bondMapping)) {
          const list = Array.isArray(bData) ? bData : (bData?.shops || []);
          if (list.some(s => String(typeof s === 'object' ? s.shop_code : s) === shopCodeStr)) {
            resolvedBond = bondName;
            break;
          }
        }
      }
      if (!resolvedBond && shopcodeMapping) {
        for (const [bondName, shopsList] of Object.entries(shopcodeMapping)) {
          if (shopsList.some(s => String(s.shop_code) === shopCodeStr)) {
            resolvedBond = bondName;
            break;
          }
        }
      }
      tabKey = resolvedBond || "Other Bonds";
    } else {
      let resolvedWh = row.Warehouse || row.warehouse;
      if (!resolvedWh) {
        for (const [whName, shopCodes] of Object.entries(filterMapping)) {
          if (shopCodes.map(String).includes(shopCodeStr)) {
            resolvedWh = whName;
            break;
          }
        }
      }
      tabKey = resolvedWh || "Other Warehouses";
    }

    if (!tabGroups[tabKey]) {
      tabGroups[tabKey] = [];
    }
    tabGroups[tabKey].push(row);
  });

  const tabKeys = Object.keys(tabGroups).sort();

  tabKeys.forEach((tabKey) => {
    let sheetName = String(tabKey).replace(/[\\/?*:[\]]/g, "_");
    if (sheetName.length > 31) {
      sheetName = sheetName.substring(0, 31);
    }

    const ws = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }]
    });

    ws.getRow(1).height = 30;
    ws.getRow(2).height = 20;

    const modeLabelStr = filterMode === "bond" ? "BOND WISE" : "WAREHOUSE WISE";
    const modeTagStr = filterMode === "bond" ? "BOND" : "WAREHOUSE";

    // Row 1: K.S DISTILLERY Banner (Navy background, Gold text)
    ws.mergeCells("A1:E1");
    const r1Cell = ws.getCell("A1");
    r1Cell.value = "K.S DISTILLERY";
    r1Cell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: goldColor } };
    r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
    r1Cell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= 5; c++) {
      ws.getCell(1, c).border = darkHeaderBorder;
    }

    // Row 2: Gold Banner (Merged A2:E2, Gold background, Navy text)
    ws.mergeCells("A2:E2");
    const r2Cell = ws.getCell("A2");
    r2Cell.value = `SHOP SALES CUMULATIVE (${modeLabelStr}) · ${periodStr.toUpperCase()} · ${modeTagStr}: ${sheetName.toUpperCase()}`;
    r2Cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: navyColor } };
    r2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: goldColor } };
    r2Cell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= 5; c++) {
      ws.getCell(2, c).border = darkHeaderBorder;
    }

    // Row 3: Column Headers (BRAND/PACK | OPENING | RECEIPT | SALES | CLOSING)
    ws.getRow(3).height = 24;
    const headers = ["BRAND/PACK", "OPENING", "RECEIPT", "SALES", "CLOSING"];
    headers.forEach((hText, idx) => {
      const cell = ws.getCell(3, idx + 1);
      cell.value = hText;
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cell.alignment = { horizontal: idx === 0 ? "left" : "right", vertical: "middle" };
      cell.border = darkHeaderBorder;
    });

    // Group sheet data by shop_code -> brand -> items
    const rows = tabGroups[tabKey];
    const shopGrouped = {};
    rows.forEach((row) => {
      const sCode = row.shop_code;
      const bName = row.brand;
      if (!shopGrouped[sCode]) shopGrouped[sCode] = {};
      if (!shopGrouped[sCode][bName]) shopGrouped[sCode][bName] = [];
      shopGrouped[sCode][bName].push(row);
    });

    let rNum = 4;
    let grandOpening = 0, grandReceipt = 0, grandSales = 0, grandClosing = 0;

    Object.entries(shopGrouped).forEach(([sCode, brands]) => {
      const shopInfo = allShops.find(s => String(s.value) === String(sCode));
      const firstRowInShop = Object.values(brands)[0]?.[0];
      const rawShopName = firstRowInShop?.shop_name;
      const displayLabel = rawShopName || (shopInfo?.shopName ? `${sCode} - ${shopInfo.shopName}` : sCode);
      const cleanShopLabel = String(displayLabel).replace(/^\d{6}-/, "").toUpperCase();

      let sOpening = 0, sIn = 0, sOut = 0, sClosing = 0;
      Object.values(brands).flat().forEach(item => {
        sOpening += item.opening || 0;
        sIn += item.inward || 0;
        sOut += item.outward || 0;
        sClosing += item.closing || 0;
      });

      // Shop Header Row
      ws.getRow(rNum).height = 22;
      const sCells = [
        cleanShopLabel,
        useWholeNumbers ? Math.round(sOpening) : Number(sOpening.toFixed(2)),
        useWholeNumbers ? Math.round(sIn) : Number(sIn.toFixed(2)),
        useWholeNumbers ? Math.round(sOut) : Number(sOut.toFixed(2)),
        useWholeNumbers ? Math.round(sClosing) : Number(sClosing.toFixed(2))
      ];

      sCells.forEach((v, cIdx) => {
        const cell = ws.getCell(rNum, cIdx + 1);
        cell.value = v;
        cell.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
        cell.alignment = { horizontal: cIdx === 0 ? "left" : "right", vertical: "middle" };
        if (cIdx >= 1) cell.numFmt = "0.00";
        cell.border = darkHeaderBorder;
      });
      rNum++;

      // Brand Blocks
      Object.entries(brands).forEach(([brand, items]) => {
        // Brand Header Row (Navy background, White bold text)
        ws.getRow(rNum).height = 20;
        const bhCell = ws.getCell(rNum, 1);
        bhCell.value = brand;
        bhCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: brandHeaderFg } };
        bhCell.alignment = { horizontal: "left", vertical: "middle" };
        for (let c = 1; c <= 5; c++) {
          const cell = ws.getCell(rNum, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandHeaderBg } };
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: brandHeaderFg } };
          cell.border = darkHeaderBorder;
        }
        rNum++;

        let bOpening = 0, bIn = 0, bOut = 0, bClosing = 0;
        items.forEach(item => {
          const op = item.opening || 0;
          const i = item.inward || 0;
          const o = item.outward || 0;
          const c = item.closing || 0;

          ws.getRow(rNum).height = 20;
          const isZebra = rNum % 2 === 0;
          const rowBg = isZebra ? zebraBg : "FFFFFF";

          const itemCells = [
            "  " + item.pack,
            useWholeNumbers ? Math.round(op) : Number(op.toFixed(2)),
            useWholeNumbers ? Math.round(i) : Number(i.toFixed(2)),
            useWholeNumbers ? Math.round(o) : Number(o.toFixed(2)),
            useWholeNumbers ? Math.round(c) : Number(c.toFixed(2))
          ];

          itemCells.forEach((iv, cIdx) => {
            const cell = ws.getCell(rNum, cIdx + 1);
            cell.value = iv;
            cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "000000" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
            cell.alignment = { horizontal: cIdx === 0 ? "left" : "right", vertical: "middle" };
            if (cIdx >= 1) cell.numFmt = "0.00";
            cell.border = leafBorder;
          });

          bOpening += op;
          bIn += i;
          bOut += o;
          bClosing += c;
          rNum++;
        });

        // Brand Total Row (Gold bold text, Navy fill)
        ws.getRow(rNum).height = 20;
        const bTotalCells = [
          "TOTAL",
          useWholeNumbers ? Math.round(bOpening) : Number(bOpening.toFixed(2)),
          useWholeNumbers ? Math.round(bIn) : Number(bIn.toFixed(2)),
          useWholeNumbers ? Math.round(bOut) : Number(bOut.toFixed(2)),
          useWholeNumbers ? Math.round(bClosing) : Number(bClosing.toFixed(2))
        ];

        bTotalCells.forEach((bv, cIdx) => {
          const cell = ws.getCell(rNum, cIdx + 1);
          cell.value = bv;
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
          cell.alignment = { horizontal: cIdx === 0 ? "left" : "right", vertical: "middle" };
          if (cIdx >= 1) cell.numFmt = "0.00";
          cell.border = darkHeaderBorder;
        });
        rNum++;
      });

      // Shop Total Row (Gold bold text, Navy fill, Gold medium borders)
      ws.getRow(rNum).height = 22;
      const sTotalCells = [
        `${cleanShopLabel} TOTAL`,
        useWholeNumbers ? Math.round(sOpening) : Number(sOpening.toFixed(2)),
        useWholeNumbers ? Math.round(sIn) : Number(sIn.toFixed(2)),
        useWholeNumbers ? Math.round(sOut) : Number(sOut.toFixed(2)),
        useWholeNumbers ? Math.round(sClosing) : Number(sClosing.toFixed(2))
      ];

      sTotalCells.forEach((sv, cIdx) => {
        const cell = ws.getCell(rNum, cIdx + 1);
        cell.value = sv;
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: goldColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
        cell.alignment = { horizontal: cIdx === 0 ? "left" : "right", vertical: "middle" };
        if (cIdx >= 1) cell.numFmt = "0.00";
        cell.border = goldMediumBorder;
      });
      rNum++;

      // Accumulate Grand Total for tab
      grandOpening += sOpening;
      grandReceipt += sIn;
      grandSales += sOut;
      grandClosing += sClosing;
    });

    // Tab Grand Total Row (At the bottom, Gold bold text, Navy fill, Gold medium borders)
    ws.getRow(rNum).height = 24;
    const gCells = [
      "GRAND TOTAL",
      useWholeNumbers ? Math.round(grandOpening) : Number(grandOpening.toFixed(2)),
      useWholeNumbers ? Math.round(grandReceipt) : Number(grandReceipt.toFixed(2)),
      useWholeNumbers ? Math.round(grandSales) : Number(grandSales.toFixed(2)),
      useWholeNumbers ? Math.round(grandClosing) : Number(grandClosing.toFixed(2))
    ];

    gCells.forEach((gv, cIdx) => {
      const cell = ws.getCell(rNum, cIdx + 1);
      cell.value = gv;
      cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: goldColor } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navyColor } };
      cell.alignment = { horizontal: cIdx === 0 ? "left" : "right", vertical: "middle" };
      if (cIdx >= 1) cell.numFmt = "0.00";
      cell.border = goldMediumBorder;
    });

    // Column Widths
    ws.getColumn(1).width = 34;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const outName = filename || `${cleanTitle.toLowerCase().replace(/\s+/g, '_')}_${filterMode}_multi_tab.xlsx`;
  saveAs(new Blob([buffer]), outName);
};
