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
  orientation = "portrait"
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
        orientation: orientation
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const formatVal = (val) => {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    return useWholeNumbers ? Math.round(num) : num.toFixed(2);
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
        const op = useWholeNumbers ? Math.round(item.opening || 0) : item.opening || 0;
        const inward = useWholeNumbers ? Math.round(item.inward || 0) : item.inward || 0;
        const outward = useWholeNumbers ? Math.round(item.outward || 0) : item.outward || 0;
        const closing = useWholeNumbers ? Math.round(item.closing || 0) : item.closing || 0;
        bOpening += op;
        bInward += inward;
        bOutward += outward;
        bClosing += closing;
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

  const drawHeader = (doc, currentTitle, currentPeriod, shopName, bondName = null, pageNumber = 1) => {
    const actualPage = doc.internal.getNumberOfPages();
    if (actualPage === 1) {
      doc.setFillColor(11, 41, 79); 
      doc.rect(0, 0, 210, 16, "F");

      doc.setFillColor(255, 189, 49); 
      doc.rect(0, 16, 210, 8, "F");

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 189, 49); 
      doc.text("K.S DISTILLERY", 105, 10, { align: "center" });

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      const cleanPeriod = (currentPeriod || "").replace(/^COMBINED PERIOD\s*:\s*/i, "").replace(/^Report Period:\s*/i, "").replace(/^As\s+on\s*:\s*/i, "").replace(/^As\s+On\s*:\s*/i, "").trim();
      doc.text(currentTitle.toUpperCase(), 15, 21.5, { align: "left" });
      doc.text(cleanPeriod, 195, 21.5, { align: "right" });
    }

    if (pageNumber === 1) {
      const rectY = (actualPage === 1) ? 25 : 5;
      const textY = (actualPage === 1) ? 30.5 : 10.5;

      doc.setFillColor(255, 189, 49); 
      doc.rect(0, rectY, 210, 8, "F");

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(11, 41, 79); 
      doc.text(shopName.toUpperCase(), 5, textY, { align: "left" });
      if (bondName && bondName.toUpperCase() !== "CURRENT VIEW") {
        doc.text(`${bondName.toUpperCase()} BOND`, 205, textY, { align: "right" });
      }
    }
  };

  let idx = 0;
  let pageAdded = false;
  for (const shop of bondShops) {
    const shopCode = shop.shop_code;
    const shopData = data.filter(d => String(d.shop_code) === String(shopCode));
    console.log(`[DEBUG] shopCode: ${shopCode}, shopData length: ${shopData.length}`);
    if (shopData.length === 0) continue;

    if (pageAdded) {
      doc.addPage();
    } else {
      pageAdded = true;
    }

    const displayShopName = shop.shop_name ? shop.shop_name : shop.shop_code;

    const shopRows = getShopTableRows(shopCode, shopData);
    const pdfCols = ["BRAND/PACK", "OPENING", "RECEIPT", "SALES", "CLOSING"];

    const tableRows = shopRows.map(row => {
      if (row.isSpacer) return ["", "", "", "", ""];
      return [row.label, formatVal(row.opening), formatVal(row.inward), formatVal(row.outward), formatVal(row.closing)];
    });

    const isFirstShop = (idx === 0);
    idx++;

    autoTable(doc, {
      head: [pdfCols],
      body: tableRows,
      startY: isFirstShop ? 34 : 14,
      margin: { top: 14, bottom: 8, left: 0, right: 0 },
      theme: "striped",
      showHead: "firstPage",
      styles: { font: "helvetica", fontStyle: "normal", fontSize: 9, cellPadding: 2.2, lineColor: [220, 220, 220], lineWidth: 0.15 },
      headStyles: { fillColor: [11, 41, 79], textColor: [255, 189, 49], font: "helvetica", fontStyle: "bold", fontSize: 9.5 },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didDrawPage: (data) => {
        drawHeader(doc, title, periodLabel, displayShopName, bondName, data.pageNumber);
      },
      didDrawCell: (data) => {
        const rowIndex = data.row.index;
        const rowObj = shopRows[rowIndex];
        if (rowObj?.isShopTotal && data.section === 'body') {
          doc.setDrawColor(11, 41, 79); 
          doc.setLineWidth(0.5);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      },
      didParseCell: (cellData) => {
        if (cellData.section === 'head') {
          doc.setFont("helvetica", "bold");
          if (cellData.column.index >= 1) {
            cellData.cell.styles.halign = 'center';
          }
        }
        if (cellData.section !== 'body') return;

        const rawVal = String(cellData.cell.raw || "").trim();
        const cellIndex = cellData.column.index;

        if (cellIndex >= 1 && !isNaN(Number(rawVal)) && rawVal !== "") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.halign = 'center';
          if (Number(rawVal) === 0) {
            cellData.cell.styles.textColor = [200, 205, 215]; 
          }
        }

        const rowIndex = cellData.row.index;
        const rowObj = shopRows[rowIndex];
        if (rowObj) {
          cellData.cell.styles.font = "helvetica";
          if (rowObj.isBrandHeader) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [11, 41, 79]; 
            cellData.cell.styles.textColor = [255, 255, 255]; 
          } else if (rowObj.isShopHeader) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [228, 233, 242]; // #E4E9F2
          } else if (rowObj.isShopTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [11, 41, 79]; 
            cellData.cell.styles.textColor = [255, 189, 49];  
          } else if (rowObj.isGrandTotal) {
            cellData.cell.styles.fontStyle = "bold";
            cellData.cell.styles.fillColor = [11, 41, 79]; // Navy blue background
            cellData.cell.styles.textColor = [255, 189, 49]; // Orange text
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
      doc.text(`Page ${i} of ${pageCount}`, 105, 293, { align: "center" });
    }
    doc.save(filename);
  }
};
