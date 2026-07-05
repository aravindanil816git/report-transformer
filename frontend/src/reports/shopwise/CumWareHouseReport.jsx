import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, message } from "antd";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getReport, processReport, getJson } from "../../api";
import dayjs from "dayjs";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportClusterPdf } from "../../utils/exportUtils";
import DownloadDropdown from "../../components/DownloadDropdown";

const { RangePicker } = DatePicker;

const PDF_REPLACEMENT_BRANDS = [
  { title: "BCB", key: "BRAND_BCB NO.1 CLASSIC BRANDY" },
  { title: "BLN", key: "BRAND_BLENDERS CHOICE NO.1 BRANDY" },
  { title: "CCB", key: "BRAND_CHAIRMAN'S CHOICE XO BRANDY" },
  { title: "K99", key: "BRAND_K.S 99 LIFE TIME MATURED XXX RUM" },
  { title: "MBR", key: "BRAND_MAGIC BLEND RESERVED XXX RUM" },
  { title: "MWB", key: "BRAND_MORNING WALKERS XO BRANDY" },
  { title: "OPR", key: "BRAND_OLD PEARL NO.1 MATURED XXX RUM" },
  { title: "ROF", key: "BRAND_ROYAL OLD FORT NO.1 XXX RUM" }
];

export default function CumulativeWarehouseReport() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState(searchParams.get("view") || "daywise");

  const [bondFilter, setBondFilter] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState(searchParams.get("mode") || "bond");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);
  const [drilledBond, setDrilledBond] = useState(null);

  const isDailyWiseType = config?.type === "dailywise_secondary_sales_cum";
  const isBrandwiseCumType = config?.type === "brandwise_cum_secondary_sales";

  const [clusters, setClusters] = useState({});

  useEffect(() => {
    getJson("warehouse_clusters")
      .then((res) => {
        setClusters(res.data || {});
      })
      .catch((err) => {
        console.error("Failed to load warehouse clusters config:", err);
      });
  }, []);

  const normalizeWhName = (name) => {
    if (!name) return "";
    return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim().toUpperCase();
  };

  const isWarehouseInCluster = (whName, clusterList) => {
    if (!whName || !clusterList) return false;
    const normalizedWh = normalizeWhName(whName);
    return clusterList.some(item => normalizeWhName(item) === normalizedWh);
  };

  // Force view based on report type
  useEffect(() => {
    if (isDailyWiseType) setView("daywise");
    else if (isBrandwiseCumType) setView("cumulative");
  }, [config?.type]);

  // 🔹 load data from backend
  const load = async (startIdx = null, endIdx = null, selectedWarehouse = warehouseFilter, selectedBond = null, selectedMode = mode, d1 = null, d2 = null) => {
    setLoading(true);
    try {
      const params = {
        start_idx: startIdx,
        end_idx: endIdx,
        mode: selectedMode,
        warehouse: selectedWarehouse,
        bond: selectedBond
      };
      if (d1 && d2) {
        params.start_date = d1;
        params.end_date = d2;
      }
      const res = await getReport(id, null, selectedWarehouse ? "shopwise" : view, params);
      const cleaned = (res.data.data || []).filter(d => d.warehouse || d.shop_code || d.bond);
  
      setData(cleaned);
      setLabels(res.data.labels || []);
      setConfig(res.data.config || {});
  
      if (allLabels.length === 0) {
        setAllLabels(res.data.labels || []);
      }
    } finally {
      setLoading(false);
    }
  };

  // Initialize default date range (1st of month to today) on load
  useEffect(() => {
    getReport(id, null, view, { limit: 1 }).then(res => {
      const reportConfig = res?.data?.config || {};
      
      let defaultStart = dayjs().startOf("month");
      let defaultEnd = dayjs();

      const startDateStr = reportConfig.start_date || reportConfig.date1;
      const endDateStr = reportConfig.end_date || reportConfig.date2;

      if (startDateStr && endDateStr) {
         const configStart = dayjs(startDateStr);
         const configEnd = dayjs(endDateStr);
         
         if (defaultEnd.isAfter(configEnd)) defaultEnd = configEnd;
         if (defaultEnd.isBefore(configStart)) defaultEnd = configEnd;
         
         defaultStart = defaultEnd.startOf("month");
         if (defaultStart.isBefore(configStart)) defaultStart = configStart;
      }

      setDateRange([defaultStart, defaultEnd]);

      let currentMode = mode;
      if (drilledWarehouse) currentMode = "shop";
      else if (drilledBond) currentMode = "shop";

      load(null, null, warehouseFilter, drilledBond, currentMode, defaultStart.format("YYYY-MM-DD"), defaultEnd.format("YYYY-MM-DD"));
    }).catch(() => {});
  }, [id]);

  // 🔥 Reload when view or data parameters change
  useEffect(() => {
    fetchCurrentView();
  }, [view, drilledWarehouse, drilledBond, mode]);

  // 🔹 convert label → date (robust manual parse)
  const labelToDate = (label) => {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const datePart = label.split(" ")[0]; // "01-Apr"
    const [day, mon] = datePart.split("-");
    const year = config.start_date ? dayjs(config.start_date).year() : dayjs().year();
    return dayjs().year(year).month(months[mon]).date(parseInt(day)).startOf("day");
  };

  // 🔹 get index from date
  const getIndexFromDate = (date) => {
    if (!date || allLabels.length === 0) return null;
    const target = dayjs(date).startOf("day");
    const idx = allLabels.findIndex(l => {
      const d = labelToDate(l);
      return d.isValid() && d.isSame(target, "day");
    });
    return idx === -1 ? null : idx;
  };

  const fetchCurrentView = async () => {
    // 🔥 STRICT BLOCK: Do not initiate any network calls if dates are not completely selected.
    if (!dateRange || !Array.isArray(dateRange) || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) {
      return;
    }

    let currentMode = mode;
    if (drilledWarehouse) currentMode = "shop";
    else if (drilledBond) currentMode = "shop";
    
    const d1 = dateRange[0].format("YYYY-MM-DD");
    const d2 = dateRange[1].format("YYYY-MM-DD");

    await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode, d1, d2);
  };

  // 🔥 APPLY FILTERS (Reload data from backend for date range)
  const handleApplyDateRange = async () => {
    if (!dateRange || !Array.isArray(dateRange) || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) {
      message.warning("Please select a complete start and end date");
      return;
    }
    
    let currentMode = mode;
    if (drilledWarehouse) currentMode = "shop";
    else if (drilledBond) currentMode = "shop";

    const d1 = dateRange[0].format("YYYY-MM-DD");
    const d2 = dateRange[1].format("YYYY-MM-DD");
    
    try {
      await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode, d1, d2);
      message.success("Report date range applied successfully");
    } catch (e) {
      message.error("Failed to process date range");
    }
  };

  // 🔥 RESET FILTERS
  const resetFilters = async () => {
    setBondFilter(null);
    setWarehouseFilter(null);
    setDateRange([]);
    setDrilledWarehouse(null);
    setDrilledBond(null);
    setMode("warehouse");
    
    try {
      await load(null, null, null, null, "warehouse", "RESET", "RESET");
    } catch (e) {
      message.error("Failed to reset filters");
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      await processReport(id);
      message.success("Report refreshed successfully!");
      let currentMode = mode;
      if (drilledWarehouse) currentMode = "shop";
      else if (drilledBond) currentMode = "shop";
      await load(null, null, drilledWarehouse, drilledBond, currentMode);
    } catch (error) {
      message.error("Failed to refresh report");
      setLoading(false);
    }
  };

  // 🔹 Aggregation and Filtering Logic
  const processedData = useMemo(() => {
    // 1. Apply Filters
    let filtered = data.filter(d => {
      const bondMatch = !bondFilter || d.bond === bondFilter;
      const whMatch = !warehouseFilter || d.warehouse === warehouseFilter;
      const drillBondMatch = !drilledBond || d.bond === drilledBond;
      const drillWhMatch = !drilledWarehouse || d.warehouse === drilledWarehouse;
      return bondMatch && whMatch && drillBondMatch && drillWhMatch;
    });

    if (mode === "warehouse" && !drilledWarehouse && Object.keys(clusters).length > 0) {
      const groupedData = [];
      const unclustered = [...filtered];

      // Identify brand keys
      const brandKeys = new Set();
      data.forEach(row => {
        Object.keys(row).forEach(k => {
          if (k.startsWith("BRAND_")) brandKeys.add(k);
        });
      });

      Object.entries(clusters).forEach(([clusterName, whList]) => {
        const clusterWarehouses = [];
        for (let i = unclustered.length - 1; i >= 0; i--) {
          const d = unclustered[i];
          if (isWarehouseInCluster(d.warehouse, whList)) {
            clusterWarehouses.push(d);
            unclustered.splice(i, 1);
          }
        }

        if (clusterWarehouses.length > 0) {
          clusterWarehouses.sort((a, b) => (a.warehouse || "").localeCompare(b.warehouse || ""));

          groupedData.push(...clusterWarehouses);

          let clusterTotal = 0;
          let clusterSums = {};
          labels.forEach(l => clusterSums[l] = 0);
          brandKeys.forEach(bk => clusterSums[bk] = 0);

          clusterWarehouses.forEach(d => {
            clusterTotal += (Number(d.total) || 0);
            labels.forEach(l => {
              clusterSums[l] += (Number(d[l]) || 0);
            });
            brandKeys.forEach(bk => {
              clusterSums[bk] += (Number(d[bk]) || 0);
            });
          });

          groupedData.push({
            isClusterTotal: true,
            clusterName: clusterName,
            warehouse: `${clusterName} Total`,
            total: clusterTotal,
            ...clusterSums,
            key: `total-${clusterName}`
          });
        }
      });

      if (unclustered.length > 0) {
        unclustered.sort((a, b) => (a.warehouse || "").localeCompare(b.warehouse || ""));
        groupedData.push(...unclustered);

        let unclusteredTotal = 0;
        let unclusteredSums = {};
        labels.forEach(l => unclusteredSums[l] = 0);
        brandKeys.forEach(bk => unclusteredSums[bk] = 0);

        unclustered.forEach(d => {
          unclusteredTotal += (Number(d.total) || 0);
          labels.forEach(l => {
            unclusteredSums[l] += (Number(d[l]) || 0);
          });
          brandKeys.forEach(bk => {
            unclusteredSums[bk] += (Number(d[bk]) || 0);
          });
        });

        groupedData.push({
          isClusterTotal: true,
          clusterName: "UNCLUSTERED WAREHOUSES",
          warehouse: "UNCLUSTERED Total",
          total: unclusteredTotal,
          ...unclusteredSums,
          key: "total-unclustered"
        });
      }

      return groupedData;
    }

    return filtered;
  }, [data, bondFilter, warehouseFilter, drilledBond, drilledWarehouse, mode, clusters, labels]);

  const uniqueBonds = useMemo(() => {
    const bonds = new Set();
    data.forEach(d => { if (d.bond) bonds.add(d.bond); });
    return [...bonds].sort();
  }, [data]);

  const uniqueWarehouses = useMemo(() => {
    const warehouses = new Set();
    data
      .filter(d => !bondFilter || d.bond === bondFilter)
      .forEach(d => { if (d.warehouse) warehouses.add(d.warehouse); });
    return [...warehouses].sort();
  }, [data, bondFilter]);

  const brandColumns = useMemo(() => {
    const brands = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(k => {
        if (k.startsWith("BRAND_")) brands.add(k);
      });
    });
    return [...brands].sort().map(b => ({
      title: b.replace("BRAND_", ""),
      dataIndex: b,
      width: 120,
      align: "center",
      render: (v, record) => {
        if (record.isClusterHeader) return "";
        if (record.isClusterTotal) return <strong>{v || 0}</strong>;
        return v || 0;
      }
    }));
  }, [data]);

  // 🔹 strict date limits
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
    if (!current) return false;
    if (current.isAfter(dayjs().add(1, "day"), "day")) return true;
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
  };

  // 🔹 dynamic columns helpers
  const getTitle = () => {
    if (drilledWarehouse || drilledBond || mode === "shop") return "Shop Name";
    if (mode === "bond" && !drilledBond) return "Bond";
    return "Warehouse";
  };

  const getDataIndex = () => {
    if (drilledWarehouse || drilledBond || mode === "shop") return "shop_name";
    return "warehouse";
  };

  const formatName = (name) => {
    if (name && typeof name === "string") {
      return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim();
    }
    return name;
  };

  const renderFirstCol = (text, record) => {
    if (record.isClusterHeader) {
      return <strong style={{ fontSize: "14px", color: "#1890ff" }}>{record.clusterName}</strong>;
    }
    if (record.isClusterTotal) {
      return <strong>{record.warehouse}</strong>;
    }
    const displayText = formatName(text) || record.shop_code || "";
    if (mode === "warehouse" && !drilledWarehouse) {
      return <a onClick={() => setDrilledWarehouse(record.warehouse)}>{displayText}</a>;
    }
    if (mode === "bond" && !drilledBond) {
      return <a onClick={() => setDrilledBond(record.warehouse)}>{displayText}</a>;
    }
    return <span>{displayText}</span>;
  };

  // 🔹 columns
  const daywiseColumns = [
    { 
      title: getTitle(), 
      dataIndex: getDataIndex(), 
      fixed: "left", 
      width: 200,
      render: renderFirstCol
    },
    ...labels.map(l => ({
      title: l,
      dataIndex: l,
      width: 100,
      align: "center",
      render: (v, record) => {
        if (record.isClusterHeader) return "";
        if (record.isClusterTotal) return <strong>{v || 0}</strong>;
        return v || 0;
      }
    })),
    {
      title: "Total",
      dataIndex: "total",
      width: 100,
      fixed: "right",
      render: (v, record) => {
        if (record.isClusterHeader) return "";
        if (record.isClusterTotal) return <strong>{v || 0}</strong>;
        return v || 0;
      }
    }
  ];

  const cumulativeColumns = [
    { 
      title: getTitle(), 
      dataIndex: getDataIndex(), 
      width: 250,
      render: renderFirstCol
    },
    ...brandColumns,
    {
      title: "Total Issues",
      dataIndex: "total",
      width: 150,
      render: (v, record) => {
        if (record.isClusterHeader) return "";
        if (record.isClusterTotal) return <strong>{v || 0}</strong>;
        return v || 0;
      }
    },
  ];

  const getPdfDataAndColumns = (sourceRows) => {
    // 1. Resolve columns
    const firstColTitle = getTitle();
    const firstColKey = getDataIndex();
    
    const pdfCols = [firstColTitle];
    const mappingCols = [{ title: firstColTitle, key: firstColKey }];
    
    if (view === "daywise") {
      labels.forEach(l => {
        pdfCols.push(l);
        mappingCols.push({ title: l, key: l });
      });
      pdfCols.push("Total");
      mappingCols.push({ title: "Total", key: "total" });
    } else {
      PDF_REPLACEMENT_BRANDS.forEach(bc => {
        pdfCols.push(bc.title);
        mappingCols.push({ title: bc.title, key: bc.key });
      });
      pdfCols.push("TOT");
      mappingCols.push({ title: "TOT", key: "total" });
    }
    
    // 2. Map data rows
    const pdfData = sourceRows.map(row => {
      const pdfRow = {};
      mappingCols.forEach(col => {
        let val = row[col.key];
        if (row.isClusterHeader) {
          val = "";
        }
        if (col.key === firstColKey) {
          if (row.isClusterTotal) {
            val = row.warehouse;
          } else {
            val = formatName(val);
          }
        }
        pdfRow[col.title] = val !== undefined && val !== null ? val : 0;
      });
      return pdfRow;
    });

    // 3. Append Grand Total Row (since PDF export is static and doesn't use Ant Design's summary prop)
    const grandTotalRow = {};
    mappingCols.forEach(col => {
      grandTotalRow[col.title] = "";
    });
    grandTotalRow[firstColTitle] = "Grand Total";
    
    // Compute grand totals
    const actualRows = sourceRows.filter(r => !r.isClusterHeader && !r.isClusterTotal);
    if (view === "daywise") {
      labels.forEach(l => {
        let sum = 0;
        actualRows.forEach(r => sum += Number(r[l] || 0));
        grandTotalRow[l] = sum;
      });
    } else {
      PDF_REPLACEMENT_BRANDS.forEach(bc => {
        let sum = 0;
        actualRows.forEach(r => sum += Number(r[bc.key] || 0));
        grandTotalRow[bc.title] = sum;
      });
    }
    let totalSum = 0;
    actualRows.forEach(r => totalSum += Number(r.total || 0));
    grandTotalRow[view === "daywise" ? "Total" : "TOT"] = totalSum;
    
    pdfData.push(grandTotalRow);
    
    return { columns: pdfCols, data: pdfData };
  };

  // 🔥 DOWNLOAD
  const handleDownload = async (format, modeType) => {
    const reportTitle = isDailyWiseType 
      ? "DailyWise Secondary Sales" 
      : (isBrandwiseCumType ? "Brandwise Cum Secondary Sales" : "Cumulative Warehouse Report");

    if (format === "xlsx") {
      if (modeType === "unified") {
        setLoading(true);
        try {
          const d1 = dateRange[0]?.format("YYYY-MM-DD");
          const d2 = dateRange[1]?.format("YYYY-MM-DD");
          
          const isBondMode = mode === "bond";
          const filterField = isBondMode ? "Bond" : "Warehouse";
          
          const params = {
            mode: "shop" // Always query at shop level for detailed drilldown
          };
          if (d1 && d2) {
            params.start_date = d1;
            params.end_date = d2;
          }
          
          // Fetch backend report data and load bond mapping content simultaneously
          const [res, bondMappingRes] = await Promise.all([
            getReport(id, null, view, params),
            getJson("bond_mapping")
          ]);
          
          const fullData = (res.data.data || []).filter(d => d.warehouse || d.shop_code || d.bond);
          const bondMapping = bondMappingRes.data || {};
          
          // Build a lookup map of shop_code -> bond name
          const shopToBondMap = {};
          Object.entries(bondMapping).forEach(([bondName, bondData]) => {
            const shops = bondData?.shops || [];
            shops.forEach(s => {
              const shopCode = typeof s === "object" ? s?.shop_code : s;
              if (shopCode) {
                shopToBondMap[String(shopCode)] = bondName;
              }
            });
          });

          // Map rows to include readable fields and date/brand values
          const exportData = fullData.map(d => {
            const shopCodeStr = String(d.shop_code || "");
            
            // Core mapping resolution
            const resolvedBond = shopToBondMap[shopCodeStr] || formatName(d.bond) || "UNKNOWN";

            const rowItem = {
              Bond: resolvedBond,
              Warehouse: formatName(d.warehouse) || "",
              "Shop Code": d.shop_code || "",
              "Shop Name": formatName(d.shop_name) || ""
            };

            if (view === "daywise") {
              labels.forEach(l => {
                rowItem[l] = d[l] || 0;
              });
            } else {
              brandColumns.forEach(bc => {
                rowItem[bc.title] = d[bc.dataIndex] || 0;
              });
            }
            rowItem["Total"] = d.total || 0;
            return rowItem;
          });

          // Pull unique validation options list based on selected mode
          const uniqueList = Array.from(new Set(
            exportData.map(d => isBondMode ? d.Bond : d.Warehouse).filter(Boolean)
          )).sort();

          // Define summation keys matching the mapped columns
          const sumKeys = ["Total"];
          if (view === "daywise") {
            sumKeys.push(...labels);
          } else {
            sumKeys.push(...brandColumns.map(bc => bc.title));
          }

          exportUnifiedWithDropdown({
            data: exportData,
            warehouses: uniqueList,
            reportTitle: `${reportTitle} (Unified - Shop Drilldown)`,
            periodLabel: dateRange.length === 2 ? `${dateRange[0].format("DD-MM-YYYY")} to ${dateRange[1].format("DD-MM-YYYY")}` : "All",
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_unified.xlsx`,
            sheetName: "Shop Drilldown",
            sumCols: sumKeys,
            dropdownLabel: filterField,
            filterColumnName: filterField, // This matches the key in exportData ("Bond" or "Warehouse")
            theme: "navy"
          });
        } catch (e) {
          console.error("Error exporting unified excel:", e);
          message.error("Failed to export unified report");
        } finally {
          setLoading(false);
        }
      } else {
        const exportData = processedData.map(d => ({
          ...d,
          warehouse: formatName(d.warehouse),
          bond: formatName(d.bond)
        }));

        exportToExcel(
          exportData,
          {
            Mode: mode,
            View: view,
            Bond: bondFilter,
            Warehouse: warehouseFilter ? formatName(warehouseFilter) : null,
            "Date Range": dateRange.length === 2 ? `${dateRange[0].format("DD-MM-YYYY")} to ${dateRange[1].format("DD-MM-YYYY")}` : "All",
            "Start Date": config.start_date ? dayjs(config.start_date).format("DD-MM-YYYY") : null,
            "Total Days": config.num_days
          },
          `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_current.xlsx`,
          reportTitle,
          { theme: "navy" }
        );
      }
    } else if (format === "pdf") {
      setLoading(true);
      try {
        const period = dateRange.length === 2 ? `Period: ${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}` : "Period: All";
        
        // Sum cols for PDF (excluding First column and Spacer columns)
        const sumCols = ["Total", "TOT"];
        if (view === "daywise") {
          sumCols.push(...labels);
        } else {
          sumCols.push(...PDF_REPLACEMENT_BRANDS.map(bc => bc.title));
        }

        if (modeType === "current") {
          const title = getTitle();
          const { columns: pdfCols, data: pdfData } = getPdfDataAndColumns(processedData);
          const didParseCell = (cellData) => {
            if (cellData.section === 'body' && cellData.column.dataKey === 'TOT') {
              cellData.cell.styles.fillColor = [255, 255, 240]; // Ivory background
            }
          };

          exportToPdf({
            title: reportTitle,
            periodLabel: period,
            columns: pdfCols,
            data: pdfData,
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_current.pdf`,
            zeroMargin: true,
            didParseCell: view === "cumulative" ? didParseCell : null
          });
        } else if (modeType === "unified" || modeType === "cluster") {
          const params = {
            mode: "shop" // Fetch detailed shop data for drilldown
          };
          const d1 = dateRange[0]?.format("YYYY-MM-DD");
          const d2 = dateRange[1]?.format("YYYY-MM-DD");
          if (d1 && d2) {
            params.start_date = d1;
            params.end_date = d2;
          }

          const isBondMode = mode === "bond";
          const groupByField = isBondMode ? "Bond" : "Warehouse";

          // Fetch backend report data and load bond mapping content simultaneously
          const [res, bondMappingRes] = await Promise.all([
            getReport(id, null, view, params),
            getJson("bond_mapping")
          ]);

          const fullData = (res.data.data || []).filter(d => d.warehouse || d.shop_code || d.bond);
          const bondMapping = bondMappingRes.data || {};
          
          // Build a lookup map of shop_code -> bond name
          const shopToBondMap = {};
          Object.entries(bondMapping).forEach(([bondName, bondData]) => {
            const shops = bondData?.shops || [];
            shops.forEach(s => {
              const shopCode = typeof s === "object" ? s?.shop_code : s;
              if (shopCode) {
                shopToBondMap[String(shopCode)] = bondName;
              }
            });
          });

          // Define PDF columns using "Shop Name" as the row label
          const pdfCols = ["Shop Name"];
          if (view === "daywise") {
            pdfCols.push(...labels);
            pdfCols.push("Total");
          } else {
            PDF_REPLACEMENT_BRANDS.forEach(bc => {
              pdfCols.push(bc.title);
            });
            pdfCols.push("TOT");
          }

          // Map full shop-level data
          const pdfData = fullData.map(d => {
            const shopCodeStr = String(d.shop_code || "");
            const resolvedBond = shopToBondMap[shopCodeStr] || formatName(d.bond) || "UNKNOWN";
            const resolvedWarehouse = formatName(d.warehouse) || "";

            const rowItem = {
              Bond: resolvedBond,
              Warehouse: resolvedWarehouse,
              "Shop Name": d.shop_name ? formatName(d.shop_name) : d.shop_code
            };

            if (view === "daywise") {
              labels.forEach(l => {
                rowItem[l] = d[l] || 0;
              });
              rowItem["Total"] = d.total || 0;
            } else {
              PDF_REPLACEMENT_BRANDS.forEach(bc => {
                rowItem[bc.title] = d[bc.key] || 0;
              });
              rowItem["TOT"] = d.total || 0;
            }
            return rowItem;
          });

          const didParseCell = (cellData) => {
            if (cellData.section === 'body' && cellData.column.dataKey === 'TOT') {
              cellData.cell.styles.fillColor = [255, 255, 240]; // Ivory background
            }
          };

          if (modeType === "unified") {
            exportToPdf({
              title: reportTitle.replace(/\s*\(.*\)/, ""),
              periodLabel: period,
              columns: pdfCols,
              data: pdfData,
              groupByField,
              sumCols: sumCols,
              filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_unified.pdf`,
              zeroMargin: true,
              didParseCell: view === "cumulative" ? didParseCell : null
            });
          } else if (modeType === "cluster") {
            const clusterConfigName = isBondMode ? "clusters" : "warehouse_clusters";
            const clusterRes = await getJson(clusterConfigName);
            const clustersData = clusterRes.data || {};

            exportClusterPdf({
              title: reportTitle.replace(/\s*\(.*\)/, ""),
              periodLabel: period,
              columns: pdfCols,
              data: pdfData,
              groupByField,
              sumCols: sumCols,
              clusters: clustersData,
              filenamePrefix: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}`,
              zeroMargin: true,
              didParseCell: view === "cumulative" ? didParseCell : null
            });
          }
        }
      } catch (e) {
        console.error("Error exporting PDF:", e);
        message.error("Failed to export PDF report");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{isDailyWiseType ? "Daily Secondary Sales" : (isBrandwiseCumType ? "Brandwise Cum Secondary Sales" : "")}</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <DownloadDropdown 
            onDownload={handleDownload} 
            loading={loading} 
            disabled={processedData.length === 0} 
            showPdf={true} 
          />
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button
          type={mode === "bond" ? "primary" : "default"}
          onClick={() => {
            setMode("bond");
            setWarehouseFilter(null);
            setDrilledBond(null);
            setDrilledWarehouse(null);
          }}
        >
          Bond View
        </Button>

        <Button
          type={mode === "warehouse" && !drilledBond ? "primary" : "default"}
          onClick={() => {
            setMode("warehouse");
            setWarehouseFilter(null);
            setDrilledBond(null);
            setDrilledWarehouse(null);
          }}
          style={{ marginLeft: 8 }}
        >
          Warehouse View
        </Button>

        <Button
          type={mode === "shop" ? "primary" : "default"}
          onClick={() => {
            setMode("shop");
            setWarehouseFilter(null);
            setDrilledWarehouse(null);
            setDrilledBond(null);
          }}
          style={{ marginLeft: 8 }}
        >
          Shop View
        </Button>

        {drilledWarehouse && (
          <Button 
            type="dashed" 
            danger 
            onClick={() => setDrilledWarehouse(null)}
            style={{ marginLeft: 8 }}
          >
            Back to {drilledBond ? "Bond Details" : "Warehouse View"} (Exit Drilling: {formatName(drilledWarehouse)})
          </Button>
        )}
        {drilledBond && !drilledWarehouse && (
          <Button 
            type="dashed" 
            danger 
            onClick={() => setDrilledBond(null)}
            style={{ marginLeft: 8 }}
          >
            Back to Bond View (Exit Drilling: {formatName(drilledBond)})
          </Button>
        )}
      </div>

      {/* 🔥 FILTERS */}
      <Space style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <Select
          placeholder="Filter by Bond"
          style={{ width: 200 }}
          value={bondFilter}
          onChange={(val) => {
            setBondFilter(val);
            setWarehouseFilter(null);
          }}
          allowClear
        >
          {uniqueBonds.map(b => (
            <Select.Option key={b} value={b}>{b}</Select.Option>
          ))}
        </Select>

        <Select
          placeholder="Filter by Warehouse"
          style={{ width: 200 }}
          value={warehouseFilter}
          onChange={setWarehouseFilter}
          allowClear
        >
          {uniqueWarehouses.map(w => (
            <Select.Option key={w} value={w}>{formatName(w)}</Select.Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          disabledDate={disabledDate}
        />

        <Button type="primary" onClick={handleApplyDateRange}>
          Apply Date Range
        </Button>

        <Button onClick={resetFilters}>
          Reset All
        </Button>
      </Space>

      {/* 🔥 VIEW TOGGLE */}
      {/* {!isDailyWiseType && !isBrandwiseCumType && (
        <div style={{ marginBottom: 16 }}>
          <Button
            type={view === "daywise" ? "primary" : "default"}
            onClick={() => setView("daywise")}
          >
            Daywise
          </Button>

          <Button
            type={view === "cumulative" ? "primary" : "default"}
            onClick={() => setView("cumulative")}
            style={{ marginLeft: 8 }}
          >
            Cumulative
          </Button>
        </div>
      )} */}

      {/* 🔥 TABLE */}
      <Table
        loading={loading}
        bordered
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={processedData}
        rowKey={(record) => record.key || `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
        pagination={false}
        scroll={{ x: "max-content" }}
        onRow={(record) => {
          if (record.isClusterHeader) {
            return {
              style: { background: "#e6f7ff" }
            };
          }
          if (record.isClusterTotal) {
            return {
              style: { background: "#fafafa" }
            };
          }
          return {};
        }}
        summary={(pageData) => {
          if (!pageData || pageData.length === 0) return null;

          // Filter out cluster headers/totals to get actual data rows for Grand Total
          const actualRows = pageData.filter(d => !d.isClusterHeader && !d.isClusterTotal);

          let totalSum = 0;
          let colSums = {};

          if (view === "cumulative") {
            let brandSums = {};
            brandColumns.forEach(bc => brandSums[bc.dataIndex] = 0);

            actualRows.forEach((d) => {
              totalSum += (Number(d.total) || 0);
              brandColumns.forEach(bc => {
                brandSums[bc.dataIndex] += (Number(d[bc.dataIndex]) || 0);
              });
            });

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ backgroundColor: "#1b365d", borderTop: "2px solid #ffbd31" }}>
                  <Table.Summary.Cell index={0} width={250}><b style={{ color: "#ffbd31" }}>Grand Total</b></Table.Summary.Cell>
                  {brandColumns.map((bc, idx) => (
                    <Table.Summary.Cell index={idx + 1} key={bc.dataIndex} width={120} align="center">
                      <b style={{ color: "#ffbd31" }}>{brandSums[bc.dataIndex]}</b>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={brandColumns.length + 1} width={150}><b style={{ color: "#ffbd31" }}>{totalSum}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          } else {
            labels.forEach((l) => {
              let s = 0;
              actualRows.forEach((d) => (s += (Number(d[l]) || 0)));
              colSums[l] = s;
            });
            actualRows.forEach((d) => (totalSum += (Number(d.total) || 0)));

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ backgroundColor: "#1b365d", borderTop: "2px solid #ffbd31" }}>
                  <Table.Summary.Cell index={0} fixed="left" width={200}><b style={{ color: "#ffbd31" }}>Grand Total</b></Table.Summary.Cell>
                  {labels.map((l, idx) => (
                    <Table.Summary.Cell index={idx + 1} key={l} width={100} align="center">
                      <b style={{ color: "#ffbd31" }}>{colSums[l]}</b>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={labels.length + 1} width={100}>
                    <b style={{ color: "#ffbd31" }}>{totalSum}</b>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }
        }}
      />
    </div>
  );
}
