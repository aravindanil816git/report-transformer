import { jsPDF } from "jspdf";
import dayjs from "dayjs";

/**
 * Clean short title helper for brand names
 */
const BRAND_SHORT_NAMES = {
  "BRAND_BCB NO.1 CLASSIC BRANDY": "BCB No.1",
  "BRAND_BLENDERS CHOICE NO.1 BRANDY": "Blender's Choice",
  "BRAND_CHAIRMAN'S CHOICE XO BRANDY": "Chairman's XO",
  "BRAND_K.S 99 LIFE TIME MATURED XXX RUM": "K.S 99",
  "BRAND_MAGIC BLEND RESERVED XXX RUM": "Magic Blend",
  "BRAND_MORNING WALKERS XO BRANDY": "Morning Walker XO",
  "BRAND_OLD PEARL NO.1 MATURED XXX RUM": "Old Pearl No.1",
  "BRAND_ROYAL OLD FORT NO.1 XXX RUM": "Royal Old Fort"
};

const getBrandShortName = (brandKey) => {
  if (BRAND_SHORT_NAMES[brandKey]) return BRAND_SHORT_NAMES[brandKey];
  return brandKey.replace(/^BRAND_/i, "").split(/\s+(?:NO\.1|XO|XXX|BRANDY|RUM)/i)[0].trim();
};

/**
 * Export PI Variance Report to PDF (Pivoted design, 1 page or section per Warehouse/Bond).
 */
export const exportPiVariancePdf = ({
  data = [],
  meta = { brands: [] },
  config = {},
  mode = "warehouse",
  useWholeNumbers = false,
  filename = "pi_variance_purchase_instruction.pdf"
}) => {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: "portrait"
  });

  const pageWidth = 595.28;
  const pageHeight = 841.89;

  const NAVY = [11, 44, 82];          // #0B2C52 Dark Navy
  const GOLD = [250, 175, 25];        // #FAAF19 Vibrant Gold
  const ROW_TINT = [245, 247, 252];   // #F5F7FC
  const ROW_WHITE = [255, 255, 255];  // #FFFFFF
  const GRID_COLOR = [220, 224, 230];
  const TEXT_DARK = [30, 35, 45];
  const SUBTITLE_COLOR = [180, 195, 215];

  const groupKey = mode === "warehouse" ? "warehouse" : "bond";

  // Group raw data items by warehouse or bond
  const groupedData = data.reduce((acc, item) => {
    const key = item[groupKey] || "UNMAPPED";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const groupNames = Object.keys(groupedData).sort((a, b) => a.localeCompare(b));

  const monthStr = config.month ? (dayjs(config.month).isValid() ? `${dayjs(config.month).date()} ${dayjs(config.month).format("MMMM YYYY")}` : String(config.month)) : "AUGUST 2026";

  const metrics = ["l3ms", "rl", "rq", "mq"];
  const brands = meta.brands || [];

  const fmtVal = (val, isWhole = false) => {
    if (val === undefined || val === null || isNaN(val)) return ".";
    const num = Number(val);
    if (num === 0) return ".";
    return (useWholeNumbers || isWhole) ? Math.round(num).toLocaleString() : num.toFixed(2);
  };

  let pageIndex = 0;

    groupNames.forEach((groupName) => {
      const items = groupedData[groupName];
      if (!items || items.length === 0) return;

      const doc = new jsPDF({
        unit: "pt",
        format: "a4",
        orientation: "portrait"
      });

      let currentY = 0;

      // --- 1. Header Banner (Dark Navy) ---
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageWidth, 85, "F");

      // Brand Tag
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...GOLD);
      doc.text("K.S. DISTILLERY", 20, 22);

      // Group Name Header (e.g. KOTTAYAM / WH-ALAPPUZHA)
      const cleanGroupName = groupName.replace(/^WH-/i, "").split(/\s+RFL/i)[0].trim().toUpperCase();
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(cleanGroupName, 20, 48);

      // Subtitle Info
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SUBTITLE_COLOR);
      doc.text(`Purchase Instruction  ·  ${monthStr.toUpperCase()}`, 20, 64);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GOLD);
      doc.text(`${items.length} shops  ·  ${brands.length} brands on indent`, 20, 76);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SUBTITLE_COLOR);
      const codeTag = `${groupName}/01/2026-27/${cleanGroupName.substring(0, 3)}`;
      const wCodeTag = doc.getTextWidth(codeTag);
      doc.text(codeTag, pageWidth - 20 - wCodeTag, 76);

      // Golden Accent Line below Header
      doc.setFillColor(...GOLD);
      doc.rect(0, 85, pageWidth, 3, "F");

      currentY = 98;

      // Helper to render a Pivoted Table Block (for Warehouse Total or Individual Shop)
      const renderPivotBlock = (blockTitle, shopCountOrSubtext, itemsList, isTotalBlock = false) => {
        const blockWidth = pageWidth - 40; // 555.28pt
        const startX = 20;

        // Compute pivoted totals for each brand across itemsList
        const brandTotals = brands.map(brand => {
          const l3ms = itemsList.reduce((sum, item) => sum + Number(item[`${brand}_l3ms_cm`] || 0), 0);
          const rl = itemsList.reduce((sum, item) => sum + Number(item[`${brand}_rl_cm`] || 0), 0);
          const rq = itemsList.reduce((sum, item) => sum + Number(item[`${brand}_rq_cm`] || 0), 0);
          const mq = itemsList.reduce((sum, item) => sum + Number(item[`${brand}_mq_cm`] || 0), 0);
          return { brand, l3ms, rl, rq, mq };
        });

        const totalL3ms = brandTotals.reduce((s, b) => s + b.l3ms, 0);
        const totalRl = brandTotals.reduce((s, b) => s + b.rl, 0);
        const totalRq = brandTotals.reduce((s, b) => s + b.rq, 0);
        const totalMq = brandTotals.reduce((s, b) => s + b.mq, 0);

        const tableRowsCount = brandTotals.length + 1; // Brands + Grand Total row
        const blockHeight = 24 + 14 + 18 + (tableRowsCount * 18) + 10;

        if (currentY + blockHeight > pageHeight - 30) {
          doc.addPage("a4", "portrait");
          currentY = 25;
        }

        // Block Container Frame
        doc.setFillColor(...NAVY);
        doc.rect(startX, currentY, blockWidth, 24, "F");

        // Left Accent Strip
        doc.setFillColor(...GOLD);
        doc.rect(startX, currentY, 4, 24, "F");

        // Block Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(blockTitle.toUpperCase(), startX + 12, currentY + 16);

        if (shopCountOrSubtext) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...GOLD);
          const wSub = doc.getTextWidth(shopCountOrSubtext);
          doc.text(shopCountOrSubtext, startX + blockWidth - 10 - wSub, currentY + 16);
        }

        currentY += 24;

        // Sub-Description Bar
        if (isTotalBlock) {
          doc.setFillColor(240, 243, 248);
          doc.rect(startX, currentY, blockWidth, 14, "F");
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7.5);
          doc.setTextColor(100, 110, 125);
          doc.text("Sum of every shop below. L3MS in bottles · RL / RQ / MQ in cases.", startX + 12, currentY + 10);
          currentY += 14;
        }

        // Column Headers
        const colW = { brand: 225, l3ms: 80, rl: 80, rq: 80, mq: 90.28 };

        doc.setFillColor(...NAVY);
        doc.rect(startX, currentY, colW.brand + colW.l3ms + colW.rl + colW.rq, 18, "F");

        // MQ Header in Gold
        doc.setFillColor(...GOLD);
        doc.rect(startX + colW.brand + colW.l3ms + colW.rl + colW.rq, currentY, colW.mq, 18, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...GOLD);
        doc.text("BRAND", startX + 10, currentY + 12);
        doc.text("L3MS", startX + colW.brand + colW.l3ms - 10, currentY + 12, { align: "right" });
        doc.text("RL", startX + colW.brand + colW.l3ms + colW.rl - 10, currentY + 12, { align: "right" });
        doc.text("RQ", startX + colW.brand + colW.l3ms + colW.rl + colW.rq - 10, currentY + 12, { align: "right" });

        doc.setTextColor(...NAVY);
        doc.text("MQ", startX + blockWidth - 10, currentY + 12, { align: "right" });

        currentY += 18;

        // Brand Rows
        brandTotals.forEach((bItem, idx) => {
          const isZebra = idx % 2 === 1;
          doc.setFillColor(...(isZebra ? ROW_TINT : ROW_WHITE));
          doc.rect(startX, currentY, blockWidth - colW.mq, 18, "F");

          // MQ Column Light Gold Tint
          doc.setFillColor(255, 249, 230);
          doc.rect(startX + blockWidth - colW.mq, currentY, colW.mq, 18, "F");

          // Grid Line
          doc.setDrawColor(...GRID_COLOR);
          doc.setLineWidth(0.3);
          doc.line(startX, currentY + 18, startX + blockWidth, currentY + 18);

          // Values
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(...TEXT_DARK);

          const shortBrandName = getBrandShortName(bItem.brand);
          doc.text(shortBrandName, startX + 10, currentY + 12);
          doc.text(fmtVal(bItem.l3ms, true), startX + colW.brand + colW.l3ms - 10, currentY + 12, { align: "right" });
          doc.text(fmtVal(bItem.rl, true), startX + colW.brand + colW.l3ms + colW.rl - 10, currentY + 12, { align: "right" });
          doc.text(fmtVal(bItem.rq, true), startX + colW.brand + colW.l3ms + colW.rl + colW.rq - 10, currentY + 12, { align: "right" });

          doc.setFont("helvetica", "bold");
          doc.setTextColor(...NAVY);
          doc.text(fmtVal(bItem.mq, true), startX + blockWidth - 10, currentY + 12, { align: "right" });

          currentY += 18;
        });

        // Block Total Row (TOTAL)
        doc.setFillColor(230, 238, 248);
        doc.rect(startX, currentY, blockWidth - colW.mq, 20, "F");

        doc.setFillColor(255, 238, 180);
        doc.rect(startX + blockWidth - colW.mq, currentY, colW.mq, 20, "F");

        doc.setDrawColor(...GOLD);
        doc.setLineWidth(1.0);
        doc.line(startX, currentY, startX + blockWidth, currentY);
        doc.line(startX, currentY + 20, startX + blockWidth, currentY + 20);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...NAVY);
        doc.text("TOTAL", startX + 10, currentY + 13);
        doc.text(fmtVal(totalL3ms, true), startX + colW.brand + colW.l3ms - 10, currentY + 13, { align: "right" });
        doc.text(fmtVal(totalRl, true), startX + colW.brand + colW.l3ms + colW.rl - 10, currentY + 13, { align: "right" });
        doc.text(fmtVal(totalRq, true), startX + colW.brand + colW.l3ms + colW.rl + colW.rq - 10, currentY + 13, { align: "right" });
        doc.text(fmtVal(totalMq, true), startX + blockWidth - 10, currentY + 13, { align: "right" });

        currentY += 30; // Spacing after block
      };

      // 1. Render WAREHOUSE TOTAL Pivot Block
      renderPivotBlock(`${groupName} TOTAL`, `${items.length} shops`, items, true);

      // 2. Render Individual Shop Pivot Blocks
      items.forEach((shopItem) => {
        const shopTitle = `${shopItem.shop_code}-${shopItem.shop_name}`;
        renderPivotBlock(shopTitle, `${brands.length} brands`, [shopItem], false);
      });

      const cleanFileName = `pi_variance_purchase_instruction_${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`;
      doc.save(cleanFileName);
    });
};
