import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import dayjs from "dayjs";

/**
 * Export PI Variance Report to Excel matching exact specifications:
 * - Brand Banner (Navy #0B2C52, Gold #FAAF19, 18pt font: K.S DISTILLERY)
 * - Title Band (Gold #FAAF19 background, Navy #0B2C52 text: PURCHASE INSTRUCTION · [MONTH])
 * - Multi-Tier Nested Headers:
 *   - Tier 1: Row Labels (Col A), Brand Names (Merged across metric columns)
 *   - Tier 2: Metric Titles (L3MS, RL, RQ, MQ - with MQ highlighted in Gold/Navy background)
 *   - Tier 3 (Comparative Mode): CM, LM, VAR under each metric
 * - Section Dividers: Gold vertical borders between brand blocks
 * - Group Header / Warehouse Rows: Dark Navy #0B2C52 fill with Gold #FAAF19 bold text
 * - Leaf Data Rows: Clean zebra background (#F5F7FC vs #FFFFFF)
 * - Group Subtotal Rows: Navy #0B2C52 fill with Gold #FAAF19 bold text
 * - Grand Total Row: Dark Charcoal #2C3540 fill with White bold text
 */
export const exportPiVarianceExcel = async ({
  tableData = [],
  meta = { brands: [] },
  config = {},
  mode = "warehouse",
  useWholeNumbers = false,
  comparativeMode = true,
  filename = "pi_variance_report.xlsx"
}) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("PI Variance", {
    views: [{ showGridLines: true }]
  });

  const NAVY = "0B2C52";
  const GOLD = "FAAF19";
  const CHARCOAL = "2C3540";
  const ROW_TINT = "F5F7FC";
  const ROW_WHITE = "FFFFFF";
  const GRID_COLOR = "C7C7C7";
  const GREEN_COLOR = "3F8600";
  const RED_COLOR = "CF1322";

  const brands = meta.brands || [];
  const metrics = ['l3ms', 'rl', 'rq', 'mq'];

  // Calculate total columns needed
  const colsPerMetric = comparativeMode ? 3 : 1;
  const colsPerBrand = metrics.length * colsPerMetric; // 12 cols per brand if comparative, 4 if non-comparative
  const totalCols = 1 + (brands.length * colsPerBrand);

  const borderThin = { style: "thin", color: { argb: GRID_COLOR } };
  const borderGoldThick = { style: "medium", color: { argb: GOLD } };

  // Helper for column letter string
  const getColLetter = (colIdx) => {
    let temp = "";
    let letter = "";
    while (colIdx > 0) {
      temp = (colIdx - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      colIdx = (colIdx - temp - 1) / 26;
    }
    return letter;
  };

  const lastColLetter = getColLetter(totalCols);

  // --- Row 1: Brand Banner ---
  ws.getRow(1).height = 36;
  ws.mergeCells(`A1:${lastColLetter}1`);
  const r1Cell = ws.getCell("A1");
  r1Cell.value = "K.S DISTILLERY";
  r1Cell.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: GOLD } };
  r1Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  r1Cell.alignment = { horizontal: "center", vertical: "middle" };

  // --- Row 2: Title Band ---
  ws.getRow(2).height = 24;
  ws.mergeCells(`A2:${lastColLetter}2`);
  const r2Cell = ws.getCell("A2");
  
  let formattedDateStr = "1 AUGUST 2026";
  if (config.month) {
    const parsedDate = dayjs(config.month, ["YYYY-MM-DD", "YYYY-MM", "MMMM YYYY", "MMMM"]);
    if (parsedDate.isValid()) {
      formattedDateStr = `${parsedDate.date()} ${parsedDate.format("MMMM YYYY")}`.toUpperCase();
    } else {
      formattedDateStr = String(config.month).toUpperCase();
    }
  }
  
  r2Cell.value = `PURCHASE INSTRUCTION · ${formattedDateStr}`;
  r2Cell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: NAVY } };
  r2Cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  r2Cell.alignment = { horizontal: "center", vertical: "middle" };

  // --- Header Rows 3, 4, (5 if comparative) ---
  const headerStartRow = 3;
  const headerRowsCount = comparativeMode ? 3 : 2;
  const headerEndRow = headerStartRow + headerRowsCount - 1;

  for (let r = headerStartRow; r <= headerEndRow; r++) {
    ws.getRow(r).height = 20;
  }

  // Row Labels Header (Col A)
  ws.mergeCells(`A${headerStartRow}:A${headerEndRow}`);
  const rLabelCell = ws.getCell(`A${headerStartRow}`);
  rLabelCell.value = "Row Labels";

  let colCounter = 2; // Column B onwards

  brands.forEach((brand, bIdx) => {
    const brandStartCol = colCounter;
    const brandEndCol = colCounter + colsPerBrand - 1;
    const startLetter = getColLetter(brandStartCol);
    const endLetter = getColLetter(brandEndCol);

    // Tier 1: Brand Name Header
    ws.mergeCells(`${startLetter}3:${endLetter}3`);
    const bCell = ws.getCell(`${startLetter}3`);
    bCell.value = brand.toUpperCase();

    metrics.forEach((metric) => {
      const metricStartCol = colCounter;
      const metricEndCol = colCounter + colsPerMetric - 1;
      const mStartLetter = getColLetter(metricStartCol);
      const mEndLetter = getColLetter(metricEndCol);

      // Tier 2: Metric Name Header (L3MS, RL, RQ, MQ)
      if (comparativeMode) {
        ws.mergeCells(`${mStartLetter}4:${mEndLetter}4`);
        const mCell = ws.getCell(`${mStartLetter}4`);
        mCell.value = metric.toUpperCase();

        // Tier 3: Sub-Headers (CM, LM, VAR)
        ws.getCell(`${mStartLetter}5`).value = "CM";
        ws.getCell(getColLetter(metricStartCol + 1) + "5").value = "LM";
        ws.getCell(`${mEndLetter}5`).value = "VAR";
      } else {
        ws.getCell(`${mStartLetter}4`).value = metric.toUpperCase();
      }

      colCounter += colsPerMetric;
    });
  });

  // Apply Header Styling across B3 to End
  for (let r = headerStartRow; r <= headerEndRow; r++) {
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(r, c);
      const colLetter = getColLetter(c);

      // Determine if MQ metric column block for gold highlight
      let isMqMetric = false;
      if (c > 1) {
        const dataColIdx = c - 2;
        const metricIdx = Math.floor((dataColIdx % colsPerBrand) / colsPerMetric);
        isMqMetric = (metrics[metricIdx] === 'mq');
      }

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isMqMetric && r > 3 ? GOLD : NAVY }
      };

      cell.font = {
        name: "Segoe UI",
        size: 9.5,
        bold: true,
        color: { argb: isMqMetric && r > 3 ? NAVY : GOLD }
      };

      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      // Gold vertical divider at section boundaries
      const isBrandBoundary = (c === 1 || ((c - 1) % colsPerBrand === 0) || c === totalCols);
      const isMetricBoundary = comparativeMode && (((c - 1) % colsPerMetric === 0) || isBrandBoundary);
      cell.border = {
        top: borderThin,
        bottom: borderThin,
        left: (c === 1 || ((c - 2) % colsPerBrand === 0)) ? borderGoldThick : borderThin,
        right: (isBrandBoundary || isMetricBoundary) ? borderGoldThick : borderThin
      };
    }
  }

  // --- Data Rows ---
  let rIdx = headerEndRow + 1;

  const fmtNum = (val) => {
    if (val === undefined || val === null || isNaN(val)) return 0;
    const num = Number(val);
    if (num === 0) return 0;
    return useWholeNumbers ? Math.round(num) : Number(num.toFixed(2));
  };

  tableData.forEach(row => {
    if (row.isSpacer) return;

    ws.getRow(rIdx).height = 20;

    const isGroupHeader = Boolean(row.isGroupHeader);
    const isGroupTotal = Boolean(row.isGroupTotal);
    const isGrandTotal = Boolean(row.isGrandTotal);
    const isSpecialRow = isGroupHeader || isGroupTotal || isGrandTotal;

    // Col 1: Display Name
    const labelCell = ws.getCell(rIdx, 1);
    labelCell.value = row.display_name || "";
    labelCell.alignment = { horizontal: "left", vertical: "middle" };

    let labelBg = isGrandTotal ? CHARCOAL : (isSpecialRow ? NAVY : (rIdx % 2 === 0 ? ROW_TINT : ROW_WHITE));
    let labelFg = (isGrandTotal || isSpecialRow) ? GOLD : "0F192D";

    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: labelBg } };
    labelCell.font = { name: "Segoe UI", size: 9.5, bold: isSpecialRow, color: { argb: labelFg } };
    labelCell.border = {
      top: isGrandTotal ? borderGoldThick : borderThin,
      bottom: isGrandTotal ? borderGoldThick : borderThin,
      left: borderGoldThick,
      right: borderGoldThick
    };

    let colIdx = 2;

    brands.forEach(brand => {
      metrics.forEach(metric => {
        const types = comparativeMode ? ['cm', 'lm', 'var'] : ['cm'];

        types.forEach(type => {
          const cell = ws.getCell(rIdx, colIdx);
          const dataKey = `${brand}_${metric}_${type}`;
          const numVal = Number(row[dataKey] || 0);

          const isMq = (metric === 'mq');
          const isVar = (type === 'var');

          let cellBg = isGrandTotal ? CHARCOAL : (isSpecialRow ? NAVY : (rIdx % 2 === 0 ? ROW_TINT : ROW_WHITE));
          if (!isSpecialRow && isMq && !isVar) {
            // Light Gold tint for MQ data columns
            cellBg = "FFF9E6";
          }

          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cellBg } };
          cell.alignment = { horizontal: "right", vertical: "middle" };

          const isBrandBoundary = ((colIdx - 1) % colsPerBrand === 0) || colIdx === totalCols;
          const isLeftBoundary = ((colIdx - 2) % colsPerBrand === 0);
          const isMetricBoundary = comparativeMode && (((colIdx - 1) % colsPerMetric === 0) || isBrandBoundary);

          cell.border = {
            top: isGrandTotal ? borderGoldThick : borderThin,
            bottom: isGrandTotal ? borderGoldThick : borderThin,
            left: isLeftBoundary ? borderGoldThick : borderThin,
            right: (isBrandBoundary || isMetricBoundary) ? borderGoldThick : borderThin
          };

          if (numVal === 0) {
            cell.value = "-";
            cell.alignment = { horizontal: "center", vertical: "middle" };
            cell.font = { name: "Segoe UI", size: 9.5, color: { argb: isSpecialRow ? (isGrandTotal ? "FFFFFF" : GOLD) : "8C8C8C" } };
          } else {
            cell.value = fmtNum(numVal);
            if (typeof cell.value === "number") cell.numFmt = useWholeNumbers ? "#,##0" : "#,##0.00";

            let fontColor = "0F192D";
            if (isGrandTotal || isGroupHeader || isGroupTotal) {
              fontColor = isGrandTotal ? "FFFFFF" : GOLD;
            }

            if (isVar) {
              if (numVal > 0) fontColor = isSpecialRow ? "52C41A" : GREEN_COLOR;
              if (numVal < 0) fontColor = isSpecialRow ? "FF7875" : RED_COLOR;
            }

            cell.font = { name: "Segoe UI", size: 9.5, bold: isSpecialRow, color: { argb: fontColor } };
          }

          colIdx++;
        });
      });
    });

    rIdx++;
  });

  // Set Column Widths
  ws.getColumn(1).width = 32; // Row Labels
  for (let c = 2; c <= totalCols; c++) {
    ws.getColumn(c).width = comparativeMode ? 10 : 12;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
};
