import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToPdf } from "./core";

export const exportClusterPdf = async ({
  title,
  periodLabel,
  columns,
  data,
  groupByField,
  sumCols,
  clusters,
  filenamePrefix = "report",
  zeroMargin = false,
  orientation = "portrait",
  didParseCell = null,
  blackPackColumn = false
}) => {
  const entries = Object.entries(clusters);
  for (const [clusterName, whList] of entries) {
    const clusterData = data.filter(row => {
      const whVal = String(row[groupByField] || "").trim().toUpperCase().replace(/^WH-/i, "");
      return whList.some(wh => wh.trim().toUpperCase().replace(/^WH-/i, "") === whVal);
    });

    if (clusterData.length > 0) {
      const cleanClusterName = clusterName.replace(/\s+/g, "_").toLowerCase();
      exportToPdf({
        title: `${title}`,
        periodLabel,
        columns,
        data: clusterData,
        groupByField,
        sumCols,
        filename: `${filenamePrefix}_${cleanClusterName}.pdf`,
        zeroMargin: true,
        orientation: orientation,
        didParseCell: didParseCell,
        blackPackColumn: blackPackColumn
      });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
};

export const exportShopDrilldownPdfByBond = ({
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
  const colors = {
    NAVY: [11, 41, 79],        // #0B294F
    GOLD: [255, 189, 49],      // #FFBD31
    BLACK: [80, 80, 80],       // Ink #505050
    WHITE: [255, 255, 255],     // #FFFFFF
    GREY: [140, 140, 140],     // #8C8C8C
    ZEBRA: [245, 247, 252],    // #F5F7FC
    DIM: [200, 205, 215]       // #C8CDD7
  };

  const formatVal = (val) => {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    return useWholeNumbers ? Math.round(num).toString() : num.toFixed(2);
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
      let bOpening = 0, bInward = 0, bOutward = 0, bClosing = 0;
      items.forEach(item => {
        bOpening += item.opening || 0;
        bInward += item.inward || 0;
        bOutward += item.outward || 0;
        bClosing += item.closing || 0;
      });

      rows.push({
        label: brand,
        isBrandHeader: true,
        opening: bOpening,
        inward: bInward,
        outward: bOutward,
        closing: bClosing
      });

      items.forEach(item => {
        rows.push({
          label: `  ${item.pack}`,
          opening: item.opening || 0,
          inward: item.inward || 0,
          outward: item.outward || 0,
          closing: item.closing || 0
        });
      });
    });

    rows.push({
      label: "TOTAL",
      opening: shopOpening,
      inward: shopInward,
      outward: shopOutward,
      closing: shopClosing,
      isShopTotal: true
    });

    return rows;
  };

  // 1. Compute dynamic column widths & page width
  const tempDoc = new jsPDF("p", "pt", "a4");
  const getWidth = (text, size, isBold) => {
    tempDoc.setFont("helvetica", isBold ? "bold" : "normal");
    tempDoc.setFontSize(size);
    return tempDoc.getTextWidth(String(text || ""));
  };

  const headerLabels = ["BRAND/PACK", "OPENING", "RECEIPT", "SALES", "CLOSING"];
  const colWidths = Array(5).fill(0);

  for (let col = 1; col <= 4; col++) {
    colWidths[col] = getWidth(headerLabels[col], 9.5, true);
  }

  let maxLabelW = 0;
  bondShops.forEach(shop => {
    const shopCode = shop.shop_code;
    const shopData = data.filter(d => String(d.shop_code) === String(shopCode));
    if (shopData.length === 0) return;

    const shopRows = getShopTableRows(shopCode, shopData);
    shopRows.forEach(row => {
      const isPack = row.label.startsWith("  ");
      const indent = isPack ? 12 : 0;
      maxLabelW = Math.max(maxLabelW, indent + getWidth(row.label.trim(), 9, !isPack));

      colWidths[1] = Math.max(colWidths[1], getWidth(formatVal(row.opening), 9, true));
      colWidths[2] = Math.max(colWidths[2], getWidth(formatVal(row.inward), 9, true));
      colWidths[3] = Math.max(colWidths[3], getWidth(formatVal(row.outward), 9, true));
      colWidths[4] = Math.max(colWidths[4], getWidth(formatVal(row.closing), 9, true));
    });
  });

  colWidths[0] = maxLabelW + 12.4;
  for (let col = 1; col <= 4; col++) {
    colWidths[col] += 16.0;
  }

  let calculatedPageWidth = colWidths.reduce((sum, w) => sum + w, 0);

  let maxCaptionW = 0;
  const cleanPeriod = (periodLabel || "").replace(/^COMBINED PERIOD\s*:\s*/i, "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
  const cap1 = getWidth("SHOP SALES CUMULATIVE", 11, true) + getWidth(cleanPeriod, 11, true) + 30;
  maxCaptionW = Math.max(maxCaptionW, cap1);

  bondShops.forEach(shop => {
    const rawShopName = shop.shop_name ? `${shop.shop_code}-${shop.shop_name}` : shop.shop_code;
    const displayShopName = String(rawShopName).replace(/^\d{6}-/, "").toUpperCase();
    const bondText = bondName && bondName.toUpperCase() !== "CURRENT VIEW" ? bondName.toUpperCase().replace(/\s+BOND$/i, "").replace(/^WH-/i, "") : "";
    const cap2 = getWidth(displayShopName, 11, true) + getWidth(bondText, 11, true) + 30;
    maxCaptionW = Math.max(maxCaptionW, cap2);
  });

  const PAGE_WIDTH = Math.max(calculatedPageWidth, maxCaptionW);
  const extra = PAGE_WIDTH - calculatedPageWidth;
  const finalColWidths = colWidths.map(w => w + (extra / 5));

  // 2. Compute dynamic row height to fit tightest page
  let derivedRowHeight = 22.8;
  bondShops.forEach((shop, index) => {
    const shopCode = shop.shop_code;
    const shopData = data.filter(d => String(d.shop_code) === String(shopCode));
    if (shopData.length === 0) return;
    const shopRows = getShopTableRows(shopCode, shopData);
    const overhead = (index === 0 ? (45.4 + 22.7) : 0) + 22.7 + 23.4 + 26;
    const availableForBody = 841.890 - overhead;
    const neededHeight = availableForBody / shopRows.length;
    derivedRowHeight = Math.min(derivedRowHeight, neededHeight);
  });

  const doc = new jsPDF("p", "pt", [PAGE_WIDTH, 841.890]);

  const drawHeader = (doc, currentTitle, currentPeriod, shopName, bondName = null, pageIndex = 0) => {
    if (pageIndex === 0) {
      doc.setFillColor(11, 41, 79); 
      doc.rect(0, 0, PAGE_WIDTH, 45.4, "F");

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 189, 49); 
      doc.text("K.S DISTILLERY", PAGE_WIDTH / 2, 28, { align: "center" });

      doc.setFillColor(255, 189, 49); 
      doc.rect(0, 45.4, PAGE_WIDTH, 22.7, "F");

      doc.setFontSize(11);
      doc.setTextColor(11, 41, 79); 
      doc.text("SHOP SALES CUMULATIVE", 15, 45.4 + 15);
      doc.text(cleanPeriod, PAGE_WIDTH - 15, 45.4 + 15, { align: "right" });

      doc.setFillColor(255, 189, 49); 
      doc.rect(0, 45.4 + 22.7, PAGE_WIDTH, 22.7, "F");

      const cleanShopName = (shopName || "").replace(/^\d{6}-/, "").toUpperCase();
      const cleanBondName = (bondName || "").replace(/\s+BOND$/i, "").replace(/^WH-/i, "").toUpperCase();

      doc.text(cleanShopName, 15, 45.4 + 22.7 + 15);
      if (cleanBondName && cleanBondName !== "CURRENT VIEW") {
        doc.text(cleanBondName, PAGE_WIDTH - 15, 45.4 + 22.7 + 15, { align: "right" });
      }
    } else {
      doc.setFillColor(255, 189, 49); 
      doc.rect(0, 0, PAGE_WIDTH, 22.7, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      const cleanShopName = (shopName || "").replace(/^\d{6}-/, "").toUpperCase();
      const cleanBondName = (bondName || "").replace(/\s+BOND$/i, "").replace(/^WH-/i, "").toUpperCase();

      doc.text(cleanShopName, 15, 15);
      if (cleanBondName && cleanBondName !== "CURRENT VIEW") {
        doc.text(cleanBondName, PAGE_WIDTH - 15, 15, { align: "right" });
      }
    }
  };

  const colStyles = {};
  for (let col = 0; col < 5; col++) {
    colStyles[col] = {
      cellWidth: finalColWidths[col],
      halign: col === 0 ? "left" : "center"
    };
    if (col === 0) {
      colStyles[col].cellPadding = { left: 6.2, right: 6.2, top: 4, bottom: 4 };
    } else {
      colStyles[col].cellPadding = { left: 8.0, right: 8.0, top: 4, bottom: 4 };
    }
  }

  let idx = 0;
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

    const displayShopName = shop.shop_name ? `${shop.shop_code}-${shop.shop_name}` : shop.shop_code;
    const shopRows = getShopTableRows(shopCode, shopData);
    const tableRows = shopRows.map(row => {
      return [row.label, formatVal(row.opening), formatVal(row.inward), formatVal(row.outward), formatVal(row.closing)];
    });

    const isFirstPageOfDoc = (idx === 0);
    const pageIndexVal = idx;
    idx++;

    autoTable(doc, {
      head: [headerLabels],
      body: tableRows,
      startY: isFirstPageOfDoc ? 90.8 : 22.7,
      margin: { top: 22.7, bottom: 26.0, left: 0, right: 0 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9.0,
        minCellHeight: derivedRowHeight,
        valign: "middle",
        lineWidth: 0,
        textColor: colors.BLACK
      },
      headStyles: {
        fillColor: colors.NAVY,
        textColor: colors.GOLD,
        fontStyle: "bold",
        fontSize: 9.5,
        valign: "middle",
        minCellHeight: 23.4
      },
      columnStyles: colStyles,
      didDrawPage: (data) => {
        drawHeader(doc, title, periodLabel, displayShopName, bondName, pageIndexVal);
      },
      didDrawCell: (data) => {
        const { x, y, width, height } = data.cell;
        const rowIndex = data.row.index;
        const rowObj = shopRows[rowIndex];

        if (data.section === 'head') {
          doc.setDrawColor(255, 189, 49); // GOLD
          if (data.column.index < 4) {
            doc.setLineWidth(1.6);
            doc.line(x + width, y, x + width, y + height);
          }
          doc.setLineWidth(2.2);
          doc.line(x, y + height - 1.1, x + width, y + height - 1.1);
        } else {
          // Draw TOTAL row gold rules
          if (rowObj?.isShopTotal && data.section === 'body') {
            doc.setDrawColor(255, 189, 49); // GOLD
            doc.setLineWidth(1.6);
            doc.line(x, y + 0.8, x + width, y + 0.8);
            doc.line(x, y + height - 0.8, x + width, y + height - 0.8);
          }
        }
      },
      didParseCell: (cellData) => {
        if (cellData.section === 'head') {
          cellData.cell.styles.fillColor = colors.NAVY;
          cellData.cell.styles.textColor = colors.GOLD;
          cellData.cell.styles.fontStyle = "bold";
        }
        
        if (cellData.section !== 'body') return;

        const rowIndex = cellData.row.index;
        const rowObj = shopRows[rowIndex];
        
        if (rowObj) {
          if (rowObj.isBrandHeader) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = colors.NAVY; 
            cellData.cell.styles.textColor = [255, 255, 255]; 
            cellData.cell.styles.cellPadding = { left: 6.2, right: 6.2, top: 4, bottom: 4 };
          } else if (rowObj.isShopTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fontSize = 10.5;
            cellData.cell.styles.fillColor = colors.NAVY; 
            cellData.cell.styles.textColor = colors.GOLD;  
            cellData.cell.styles.cellPadding = { left: 6.2, right: 6.2, top: 4, bottom: 4 };
          } else {
            // Zebra striping for pack rows
            cellData.cell.styles.fillColor = (cellData.row.index % 2 === 0) ? colors.WHITE : colors.ZEBRA;
            cellData.cell.styles.textColor = colors.BLACK;
            
            // Pack rows: add the 12pt indent only to column 0 left padding
            if (cellData.column.index === 0) {
              cellData.cell.styles.cellPadding = { left: 12 + 6.2, right: 6.2, top: 4, bottom: 4 };
            } else {
              cellData.cell.styles.cellPadding = { left: 8.0, right: 8.0, top: 4, bottom: 4 };
            }
            
            const rawVal = Number(cellData.cell.raw);
            if (!isNaN(rawVal) && rawVal === 0 && cellData.column.index >= 1) {
              cellData.cell.styles.textColor = colors.DIM;
            }
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
      doc.setTextColor(140, 140, 140); // GREY #8C8C8C
      doc.text(`Page ${i} of ${pageCount}`, PAGE_WIDTH / 2, 841.890 - 9.7 - 8, { align: "center" });
    }
    doc.save(filename);
  }
};
