import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, Typography, message, Checkbox } from "antd";

const { Text } = Typography;
import { useParams, useNavigate } from "react-router-dom";
import { getReport, processReport, getJson, listReports, getFilters } from "../../api";
import dayjs from "dayjs";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportClusterPdf, exportShopDrilldownPdfByBond } from "../../utils/exportUtils";
import { disabledFutureMonthDates } from "../../utils/dateUtils";
import DownloadDropdown from "../../components/DownloadDropdown";

const { RangePicker } = DatePicker;

export default function CumulativeShopwiseReport() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("cumulative");

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("bond");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);
  const [drilledBond, setDrilledBond] = useState(null);
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);

  const [shopLeaves, setShopLeaves] = useState([]);

  // States for lazy loading the previous month's baseline
  const [lastMonthSalesMap, setLastMonthSalesMap] = useState({});
  const [loadingLastMonth, setLoadingLastMonth] = useState(false);
  const [currentCombined, setCurrentCombined] = useState(null);

  useEffect(() => {
    getJson("leaves").then(res => {
      setShopLeaves(res.data?.shop || []);
    }).catch(() => { });
  }, []);

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

      // The default mode is now 'bond', so we pass that to the initial load
      load(null, null, null, null, "bond", defaultStart.format("YYYY-MM-DD"), defaultEnd.format("YYYY-MM-DD"));
    }).catch(() => { });
  }, [id]);

  // 🔹 triggerLastMonthLoad
  const triggerLastMonthLoad = async (activeD1, selectedMode, combinedReps) => {
    if (!activeD1 || !combinedReps || combinedReps.length === 0) return;
    setLoadingLastMonth(true);
    try {
      const prevD1 = dayjs(activeD1).subtract(1, "month").startOf("month");
      const prevMonthPrefix = prevD1.format("YYYY-MM");

      // Find the combined shopwise report for the previous month
      const prevCombined = combinedReps.find(r =>
        (r.config?.start_date && r.config.start_date.startsWith(prevMonthPrefix)) ||
        (r.config?.date1 && r.config.date1.startsWith(prevMonthPrefix)) ||
        (r.created_at && r.created_at.startsWith(prevMonthPrefix)) ||
        (r.name && r.name.toLowerCase().includes(prevD1.format("MMMM").toLowerCase()))
      );

      if (!prevCombined) {
        setLastMonthSalesMap({});
        return;
      }

      // Fetch the cumulative totals of the previous month's combined report
      // No date parameters are passed, so the backend reads directly from the cache
      const prevRes = await getReport(prevCombined.id, null, "cumulative", {
        mode: selectedMode
      });
      const lastMonthData = prevRes.data?.data || prevRes.data || [];
      console.log("[triggerLastMonthLoad] Loaded last month data for report:", prevCombined.name || prevCombined.id, {
        mode: selectedMode,
        rawRowsCount: lastMonthData.length,
        rawRows: lastMonthData
      });

      const salesMap = {};
      lastMonthData.forEach(row => {
        const pk = selectedMode === "bond" ? row.bond : (selectedMode === "shop" ? row.shop_code : row.warehouse);
        if (pk) {
          salesMap[pk] = (salesMap[pk] || 0) + (row.outward || row.sales || 0);
        }
      });
      console.log("[triggerLastMonthLoad] Calculated salesMap:", salesMap);
      setLastMonthSalesMap(salesMap);
    } catch (e) {
      console.error("Failed to load last month comparative data:", e);
      setLastMonthSalesMap({});
    } finally {
      setLoadingLastMonth(false);
    }
  };

  // 🔹 load
  const load = async (startIdx = null, endIdx = null, selectedWarehouse = warehouseFilter, selectedBond = null, selectedMode = mode, d1 = null, d2 = null) => {
    setLoading(true);
    try {
      let activeD1 = d1 !== "RESET" ? d1 : null;
      let activeD2 = d2 !== "RESET" ? d2 : null;

      if (!activeD1 && dateRange && dateRange.length === 2) {
        activeD1 = dateRange[0].format("YYYY-MM-DD");
        activeD2 = dateRange[1].format("YYYY-MM-DD");
      }

      const params = {
        start_idx: startIdx,
        end_idx: endIdx,
        mode: selectedMode,
        warehouse: selectedWarehouse,
        bond: selectedBond
      };

      if (d1 && d2 && d1 !== "RESET") {
        params.start_date = d1;
        params.end_date = d2;
      }

      // Fetch both combined_shopwise and shop_sales_cumulative reports to cover all cumulative datasets
      const [combinedRes, shopSalesRes] = await Promise.all([
        listReports({ type: "combined_shopwise", limit: 100 }),
        listReports({ type: "shop_sales_cumulative", limit: 100 })
      ]);
      const combinedReps = [
        ...(combinedRes.data?.items || combinedRes.data || []),
        ...(shopSalesRes.data?.items || shopSalesRes.data || [])
      ];

      const currentMonthPrefix = activeD1 ? activeD1.substring(0, 7) : dayjs().format("YYYY-MM");
      
      console.log("[DEBUG] activeD1:", activeD1, "currentMonthPrefix:", currentMonthPrefix, "combinedReps count:", combinedReps.length);
      console.log("[DEBUG] combinedReps list:", combinedReps.map(r => ({ id: r.id, name: r.name, type: r.type, config: r.config, created_at: r.created_at })));

      const currentCombined = combinedReps.find(r =>
        (r.config?.start_date && r.config.start_date.startsWith(currentMonthPrefix)) ||
        (r.config?.date1 && r.config.date1.startsWith(currentMonthPrefix)) ||
        (r.created_at && r.created_at.startsWith(currentMonthPrefix)) ||
        (r.name && r.name.toLowerCase().includes(dayjs(activeD1).format("MMMM").toLowerCase()))
      );

      setCurrentCombined(currentCombined);

      console.log("[DEBUG] matched currentCombined:", currentCombined ? { id: currentCombined.id, name: currentCombined.name } : "undefined");

      // Fetch current month data
      let currentResPromise;
      if (view === "cumulative" && currentCombined) {
        currentResPromise = getReport(currentCombined.id, null, "cumulative", params);
      } else {
        currentResPromise = getReport(id, null, view, params);
      }

      const res = await currentResPromise;
      const rawData = res.data.data || [];

      const cleaned = rawData.filter(d => {
        const isValid = d.warehouse || d.shop_code || d.bond || d.warehouse === "";
        return isValid;
      });

      setData(cleaned);
      setLabels(res.data.labels || []);
      setConfig(res.data.config || {});

      if (res.data.config?.date1 && res.data.config?.date2 && dateRange.length === 0) {
        setDateRange([dayjs(res.data.config.date1), dayjs(res.data.config.date2)]);
      }

      if (allLabels.length === 0) {
        setAllLabels(res.data.labels || []);
      }

      // Trigger lazy load of prior month baseline data
      triggerLastMonthLoad(activeD1, selectedMode, combinedReps);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Reload when view or data parameters change
  useEffect(() => {
    fetchCurrentView();
  }, [view, mode, drilledWarehouse, drilledBond]);

  const labelToDate = (label) => dayjs(label.split(" ")[0], "DD-MMM");

  const getIndexFromDate = (date) => {
    return allLabels.findIndex(l =>
      labelToDate(l).isSame(date, "day")
    );
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

  // 🔥 RESET
  const resetFilters = async () => {
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
      await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode);
    } catch (error) {
      message.error("Failed to refresh report");
      setLoading(false);
    }
  };

  // Backend already filters by warehouse, but we keep this for drilled views or fast-filtering if needed
  // We restrict this frontend filter only to 'warehouse' mode so it doesn't break 'bond' mode where the backend re-uses the warehouse key.
  const filteredData = (warehouseFilter && mode === "warehouse")
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  const activeStartStr = config.date1 || config.start_date;
  const activeEndStr = config.date2 || config.end_date;

  const currentPeriodLabel = activeStartStr && activeEndStr
    ? `${dayjs(activeStartStr).format("DD MMM")} - ${dayjs(activeEndStr).format("DD MMM")}`
    : "Current Month";

  const lastMonthPeriodLabel = activeStartStr
    ? `${dayjs(activeStartStr).subtract(1, 'month').startOf('month').format("DD MMM")} - ${dayjs(activeStartStr).subtract(1, 'month').endOf('month').format("DD MMM")}`
    : "Last Month";

  const netDays = useMemo(() => {
    if (activeStartStr && activeEndStr) {
      const s = dayjs(activeStartStr);
      const e = dayjs(activeEndStr);
      const diff = e.diff(s, 'day') + 1;
      const totalDays = diff > 0 ? diff : 0;
      let count = 0;
      for (let i = 0; i < totalDays; i++) {
        const dStr = s.add(i, 'day').format('YYYY-MM-DD');
        if (!shopLeaves.includes(dStr)) count++;
      }
      return count;
    }
    return config.num_days || 0;
  }, [activeStartStr, activeEndStr, shopLeaves, config.num_days]);

  const lastMonthNetDays = useMemo(() => {
    if (activeStartStr) {
      const s = dayjs(activeStartStr).subtract(1, 'month').startOf('month');
      const e = dayjs(activeStartStr).subtract(1, 'month').endOf('month');
      const totalDays = e.date();
      let count = 0;
      for (let i = 0; i < totalDays; i++) {
        const dStr = s.add(i, 'day').format('YYYY-MM-DD');
        if (!shopLeaves.includes(dStr)) count++;
      }
      return count > 0 ? count : totalDays;
    }
    return 30; // fallback
  }, [activeStartStr, shopLeaves]);

  const disabledDate = (current) => {
    return disabledFutureMonthDates(current);
  };

  // 🔥 Calculate missing columns locally in the frontend
  const processedData = useMemo(() => {
    return filteredData.map(d => {
      const opening = d.opening || 0;
      const receipt = d.inward || d.receipt || 0;
      const sales = d.outward || d.sales || 0;
      const closing = d.closing || 0;

      const difference = opening - closing;
      const closing_stock_at_sales_perc = sales ? (closing * 100) / sales : 0;
      const perc = opening ? (difference * 100) / opening : 0;
      const avg_sales_per_day = netDays ? sales / netDays : 0;

      const pk = mode === "bond" ? d.bond : (mode === "shop" ? d.shop_code : d.warehouse);
      const last_month_sales = lastMonthSalesMap[pk] || 0;
      const last_month_avg = lastMonthNetDays ? last_month_sales / lastMonthNetDays : 0;
      const avg_diff = avg_sales_per_day - last_month_avg;

      return {
        ...d,
        opening,
        receipt,
        sales,
        closing,
        difference,
        closing_stock_at_sales_perc,
        perc,
        avg_sales_per_day,
        last_month_sales,
        last_month_avg,
        avg_diff
      };
    });
  }, [filteredData, netDays, lastMonthSalesMap, lastMonthNetDays, mode]);

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
    const displayText = formatName(text);
    if (mode === "warehouse" && !drilledWarehouse) {
      return <a onClick={() => setDrilledWarehouse(record.warehouse)}>{displayText}</a>;
    }
    if (mode === "bond" && !drilledBond) {
      return <a onClick={() => setDrilledBond(record.bond || record.warehouse)}>{displayText}</a>;
    }
    return <span>{displayText}</span>;
  };

  const formatVal = (val, isLoadingField = false) => {
    if (isLoadingField && loadingLastMonth) {
      return <span style={{ color: "#bfbfbf", fontStyle: "italic" }}>loading...</span>;
    }
    if (val === null || val === undefined) return "";
    const num = Number(val);
    if (isNaN(num)) return val;
    return useWholeNumbers ? Math.round(num) : num.toFixed(2);
  };

  // 🔹 daywise + total
  const daywiseColumns = [
    { title: getTitle(), dataIndex: getDataIndex(), fixed: "left", width: 180, render: renderFirstCol },
    ...labels.map(l => ({ title: l, dataIndex: l, width: 100, align: "center", render: (v) => formatVal(v) })),
    {
      title: "Total",
      dataIndex: "total",
      fixed: "right",
      width: 120,
      align: "right",
      render: (v) => formatVal(v)
    }
  ];

  const cumulativeColumns = [
    { title: getTitle(), dataIndex: getDataIndex(), width: 180, render: renderFirstCol },
    { title: "Opening", dataIndex: "opening", width: 100, align: "center", render: (v) => formatVal(v) },
    { title: "Receipt", dataIndex: "receipt", width: 100, align: "center", render: (v) => formatVal(v) },
    { title: "Sales", dataIndex: "sales", width: 100, align: "center", render: (v) => formatVal(v) },
    { title: "Closing", dataIndex: "closing", width: 100, align: "center", render: (v) => formatVal(v) },
    { title: "Difference", dataIndex: "difference", width: 100, align: "center", render: (v) => formatVal(v) },
    { title: "ClosingStock@Sales%", dataIndex: "closing_stock_at_sales_perc", width: 150, align: "center", render: (v) => formatVal(v) },
    { title: "Perc(%)", dataIndex: "perc", width: 100, align: "right", render: (v) => formatVal(v) },
    { title: "", dataIndex: "spacer", width: 40, render: () => null }, // Spacer column
    {
      title: "Average (Cases)",
      children: [
        { title: `Current Month Avg (${currentPeriodLabel})`, dataIndex: "avg_sales_per_day", width: 160, align: "center", render: (v) => formatVal(v) },
        { title: `Last Month Avg (${lastMonthPeriodLabel})`, dataIndex: "last_month_avg", width: 160, align: "center", render: (v) => formatVal(v, true) },
        { title: "Difference", dataIndex: "avg_diff", width: 120, align: "center", render: (v) => formatVal(v, true) }
      ]
    }
  ];

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    let exportData = [];
    if (view === "cumulative") {
      exportData = processedData.map(d => ({
        [getTitle()]: d.shop_code ? d.shop_name : formatName(d.warehouse),
        Opening: useWholeNumbers ? Math.round(d.opening || 0) : d.opening,
        Receipt: useWholeNumbers ? Math.round(d.receipt || 0) : d.receipt,
        Sales: useWholeNumbers ? Math.round(d.sales || 0) : d.sales,
        Closing: useWholeNumbers ? Math.round(d.closing || 0) : d.closing,
        Difference: useWholeNumbers ? Math.round(d.difference || 0) : d.difference,
        "ClosingStock@Sales%": useWholeNumbers ? Math.round(d.closing_stock_at_sales_perc || 0) : d.closing_stock_at_sales_perc,
        "Perc(%)": useWholeNumbers ? Math.round(d.perc || 0) : d.perc,
        " ": "", // spacer
        [`Current Month Avg (${currentPeriodLabel})`]: useWholeNumbers ? Math.round(d.avg_sales_per_day || 0) : d.avg_sales_per_day,
        [`Last Month Avg (${lastMonthPeriodLabel})`]: loadingLastMonth ? "Loading..." : (useWholeNumbers ? Math.round(d.last_month_avg || 0) : d.last_month_avg),
        "Avg Difference": loadingLastMonth ? "Loading..." : (useWholeNumbers ? Math.round(d.avg_diff || 0) : d.avg_diff)
      }));
    } else {
      exportData = processedData.map(row => {
        const obj = { [getTitle()]: row.shop_code ? row.shop_name : formatName(row.warehouse) };
        let total = 0;
        labels.forEach(l => {
          const v = row[l] || 0;
          obj[l] = useWholeNumbers ? Math.round(v) : v;
          total += v;
        });
        obj["Total"] = useWholeNumbers ? Math.round(total) : total;
        return obj;
      });
    }

    exportToExcel(
      exportData,
      {
        Mode: mode,
        View: view,
        Warehouse: warehouseFilter ? formatName(warehouseFilter) : null,
        "Date Range": dateRange.length === 2 ? `${dateRange[0].format("DD-MM-YYYY")} to ${dateRange[1].format("DD-MM-YYYY")}` : "All",
        "Start Date": activeStartStr ? dayjs(activeStartStr).format("DD-MM-YYYY") : null,
        "End Date": activeEndStr ? dayjs(activeEndStr).format("DD-MM-YYYY") : null,
        "Net Days": netDays,
        "Round off": useWholeNumbers ? "Yes" : "No"
      },
      "cumulative_shopwise_report.xlsx",
      "Cumulative Shopwise"
    );
  };

  const handleDownload = async (format, modeType) => {
    if (!currentCombined) {
      message.error("Combined Shopwise Report not found for this month");
      return;
    }
    const reportTitle = "Shop Sales Cumulative";
    const period = dateRange.length === 2 ? `${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}` : "All";
    
    setLoading(true);
    try {
      // 1. Fetch all required mappings dynamically
      const [filtersRes, mappingRes] = await Promise.all([
        getFilters(currentCombined.id), // Fetch warehouse/bond/shop mappings
        getJson("shopcode_mapping") // Fetch shopcode to bond/warehouse list mapping
      ]);
      
      const { shops, mapping, bond_mapping } = filtersRes.data || {};
      const shopcodeMapping = mappingRes.data || {};
      const filterMapping = mapping || {};
      const bondMapping = bond_mapping || {};
      const allShops = (shops || []).map(s => ({
        value: s.shop_code,
        label: `${s.shop_code} - ${s.shop_name}`,
        shopName: s.shop_name
      }));
      
      // 2. Fetch the raw brand/pack data for the combined report
      const sStr = dateRange[0]?.format("YYYY-MM-DD");
      const eStr = dateRange[1]?.format("YYYY-MM-DD");
      let startIdx = null;
      let endIdx = null;
      
      // For combined report uploads
      const uploads = currentCombined.uploads || [];
      if (sStr && eStr) {
        const allDates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
        startIdx = allDates.findIndex(d => d >= sStr);
        const endDates = allDates.filter(d => d <= eStr);
        if (endDates.length > 0) {
          endIdx = allDates.indexOf(endDates[endDates.length - 1]);
        }
      }
      
      const params = { start_idx: startIdx, end_idx: endIdx };
      if (sStr && eStr) {
        params.start_date = sStr;
        params.end_date = eStr;
      }
      
      // Fetch shopwise drilldown view (using "case" view)
      const res = await getReport(currentCombined.id, null, "case", params);
      const fullData = res.data.data || [];
      
      // 3. Perform identical grouping and mapping to CombinedShopwiseReport.jsx
      const exportData = [];
      const shopGrouped = {};
      fullData.forEach((row) => {
        const shopCode = row["shop_code"];
        const brand = row["brand"];
        if (!shopGrouped[shopCode]) shopGrouped[shopCode] = {};
        if (!shopGrouped[shopCode][brand]) shopGrouped[shopCode][brand] = [];
        shopGrouped[shopCode][brand].push(row);
      });
      
      Object.entries(shopGrouped).forEach(([shopCode, brands]) => {
        const shopCodeStr = String(shopCode || "");
        const shopInfo = allShops.find(s => String(s.value) === shopCodeStr);
        const firstRowInShop = Object.values(brands)[0]?.[0];
        const rawShopName = firstRowInShop?.shop_name;
        const displayLabel = rawShopName || (shopInfo?.shopName ? shopInfo.shopName : shopCodeStr);

        // Find Bond
        let resolvedBond = "";
        for (const [bondName, bData] of Object.entries(bondMapping)) {
          const list = Array.isArray(bData) ? bData : (bData?.shops || []);
          const found = list.some(s => String(typeof s === 'object' ? s.shop_code : s) === shopCodeStr);
          if (found) {
            resolvedBond = bondName;
            break;
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

        // Find Warehouse
        let resolvedWarehouse = "";
        for (const [whName, shopCodes] of Object.entries(filterMapping)) {
          if (shopCodes.includes(shopCodeStr)) {
            resolvedWarehouse = whName;
            break;
          }
        }

        let sOpening = 0, sIn = 0, sOut = 0, sClosing = 0;
        Object.values(brands).flat().forEach(item => {
          sOpening += item.opening || 0;
          sIn += item.inward || 0;
          sOut += item.outward || 0;
          sClosing += item.closing || 0;
        });
        const sOpeningVal = useWholeNumbers ? Math.round(sOpening) : Number(sOpening.toFixed(2));
        const sInVal = useWholeNumbers ? Math.round(sIn) : Number(sIn.toFixed(2));
        const sOutVal = useWholeNumbers ? Math.round(sOut) : Number(sOut.toFixed(2));
        const sClosingVal = useWholeNumbers ? Math.round(sClosing) : Number(sClosing.toFixed(2));

        // Shop Header Row
        exportData.push({
          Bond: resolvedBond,
          Warehouse: resolvedWarehouse,
          "Row Labels": displayLabel,
          "Opening": sOpeningVal,
          "Receipt": sInVal,
          "Sales": sOutVal,
          "Closing": sClosingVal
        });

        Object.entries(brands).forEach(([brand, items]) => {
          // Brand Header Row
          exportData.push({
            Bond: resolvedBond,
            Warehouse: resolvedWarehouse,
            "Row Labels": brand,
            "Opening": "",
            "Receipt": "",
            "Sales": "",
            "Closing": ""
          });

          let bOpening = 0, bIn = 0, bOut = 0, bClosing = 0;
          items.forEach(item => {
            const op = item.opening || 0;
            const i = item.inward || 0;
            const o = item.outward || 0;
            const c = item.closing || 0;

            const opVal = useWholeNumbers ? Math.round(op) : Number(op.toFixed(2));
            const iVal = useWholeNumbers ? Math.round(i) : Number(i.toFixed(2));
            const oVal = useWholeNumbers ? Math.round(o) : Number(o.toFixed(2));
            const cVal = useWholeNumbers ? Math.round(c) : Number(c.toFixed(2));

            exportData.push({
              Bond: resolvedBond,
              Warehouse: resolvedWarehouse,
              "Row Labels": "  " + item.pack,
              "Opening": opVal,
              "Receipt": iVal,
              "Sales": oVal,
              "Closing": cVal
            });

            bOpening += op;
            bIn += i;
            bOut += o;
            bClosing += c;
          });

          const bOpeningVal = useWholeNumbers ? Math.round(bOpening) : Number(bOpening.toFixed(2));
          const bInVal = useWholeNumbers ? Math.round(bIn) : Number(bIn.toFixed(2));
          const bOutVal = useWholeNumbers ? Math.round(bOut) : Number(bOut.toFixed(2));
          const bClosingVal = useWholeNumbers ? Math.round(bClosing) : Number(bClosing.toFixed(2));

          // Brand Total Row
          exportData.push({
            Bond: resolvedBond,
            Warehouse: resolvedWarehouse,
            "Row Labels": `${brand} Total`,
            "Opening": bOpeningVal,
            "Receipt": bInVal,
            "Sales": bOutVal,
            "Closing": bClosingVal
          });
        });

        // Shop Total Row
        exportData.push({
          Bond: resolvedBond,
          Warehouse: resolvedWarehouse,
          "Row Labels": `${displayLabel} Total`,
          "Opening": sOpeningVal,
          "Receipt": sInVal,
          "Sales": sOutVal,
          "Closing": sClosingVal
        });

        // Spacer Row
        exportData.push({
          Bond: resolvedBond,
          Warehouse: resolvedWarehouse,
          "Row Labels": "",
          "Opening": "",
          "Receipt": "",
          "Sales": "",
          "Closing": ""
        });
      });

      // 4. Run export based on format/type
      if (format === "xlsx") {
        if (modeType === "current") {
          // Current view xlsx is still the original flat table download
          downloadExcel();
        } else if (modeType === "unified") {
          const uniqueList = Array.from(new Set(
            exportData.map(d => mode === "bond" ? d.Bond : d.Warehouse).filter(Boolean)
          )).sort();

          exportUnifiedWithDropdown({
            data: exportData,
            warehouses: uniqueList,
            reportTitle: `${reportTitle} (Unified - Shop Drilldown)`,
            periodLabel: period,
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_unified.xlsx`,
            sheetName: "Shop Drilldown",
            sumCols: ["Opening", "Receipt", "Sales", "Closing"],
            dropdownLabel: mode === "bond" ? "Bond" : "Warehouse",
            filterColumnName: mode === "bond" ? "Bond" : "Warehouse",
            theme: "navy",
            reportColumns: ["Row Labels", "Opening", "Receipt", "Sales", "Closing"]
          });
        }
      } else if (format === "pdf") {
        if (modeType === "current") {
          // Export current view PDF (same as flat table view PDF)
          let flatCols = [];
          let flatSumCols = [];
          let flatExportData = [];
          
          if (view === "cumulative") {
            flatCols = ["Row Labels", "Opening", "Receipt", "Sales", "Closing", "Difference", "ClosingStock@Sales%", "Perc(%)"];
            flatSumCols = ["Opening", "Receipt", "Sales", "Closing", "Difference"];
            flatExportData = processedData.map(d => ({
              "Row Labels": d.shop_code ? d.shop_name : formatName(d.warehouse),
              Opening: useWholeNumbers ? Math.round(d.opening || 0) : d.opening,
              Receipt: useWholeNumbers ? Math.round(d.receipt || 0) : d.receipt,
              Sales: useWholeNumbers ? Math.round(d.sales || 0) : d.sales,
              Closing: useWholeNumbers ? Math.round(d.closing || 0) : d.closing,
              Difference: useWholeNumbers ? Math.round(d.difference || 0) : d.difference,
              "ClosingStock@Sales%": useWholeNumbers ? Math.round(d.closing_stock_at_sales_perc || 0) : d.closing_stock_at_sales_perc,
              "Perc(%)": useWholeNumbers ? Math.round(d.perc || 0) : d.perc
            }));
          } else {
            flatCols = ["Row Labels", ...labels, "Total"];
            flatSumCols = [...labels, "Total"];
            flatExportData = processedData.map(row => {
              const obj = { "Row Labels": row.shop_code ? row.shop_name : formatName(row.warehouse) };
              let total = 0;
              labels.forEach(l => {
                const v = row[l] || 0;
                obj[l] = useWholeNumbers ? Math.round(v) : v;
                total += v;
              });
              obj["Total"] = useWholeNumbers ? Math.round(total) : total;
              return obj;
            });
          }
          
          exportToPdf({
            title: "Comparative Shopsales",
            periodLabel: period,
            columns: flatCols,
            data: flatExportData,
            sumCols: flatSumCols,
            filename: `comparative_shopsales_current.pdf`,
            orientation: view === "cumulative" ? "portrait" : "landscape",
            zeroMargin: true
          });
        } else if (modeType === "cluster") {
          // Export PDF shop drilldown by Bond (just like CombinedShopwiseReport.jsx does!)
          const activeBonds = mode === "bond" && drilledBond ? [drilledBond] : Object.keys(shopcodeMapping);
          for (const bondName of activeBonds) {
            const bondShops = shopcodeMapping[bondName] || [];
            const bondShopCodes = bondShops.map(s => String(s.shop_code));
            const bondHasData = fullData.some(d => bondShopCodes.includes(String(d.shop_code)));

            if (bondHasData) {
              await exportShopDrilldownPdfByBond({
                title: reportTitle,
                periodLabel: period,
                data: fullData,
                bondName: bondName,
                bondShops: bondShops,
                allShops: allShops,
                useWholeNumbers: useWholeNumbers,
                view: "case",
                filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_bond_${bondName.toLowerCase().replace(/\s+/g, '_')}.pdf`
              });
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
          message.success("Bonds PDF export completed!");
        }
      }
    } catch (e) {
      console.error("Error exporting PDF:", e);
      message.error("Failed to export PDF: " + (e.message || String(e)));
    } finally {
      setLoading(false);
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
        <h2>Comparitive Shopsales</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <DownloadDropdown
            onDownload={handleDownload}
            loading={loading}
            disabled={processedData.length === 0}
            showPdf={true}
            pdfOptions={["current", "cluster"]}
            clusterLabel="Bond"
          />
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button
          type={mode === "bond" ? "primary" : "default"}
          onClick={() => { setMode("bond"); setDrilledBond(null); setDrilledWarehouse(null); setWarehouseFilter(null); }}
        >
          Bond
        </Button>

        <Button
          type={mode === "warehouse" && !drilledBond ? "primary" : "default"}
          onClick={() => { setMode("warehouse"); setDrilledBond(null); setDrilledWarehouse(null); setWarehouseFilter(null); }}
          style={{ marginLeft: 8 }}
        >
          Warehouse
        </Button>

        <Button
          type={mode === "shop" ? "primary" : "default"}
          onClick={() => { setMode("shop"); setDrilledBond(null); setDrilledWarehouse(null); setWarehouseFilter(null); }}
          style={{ marginLeft: 8 }}
        >
          Shop
        </Button>

        {drilledWarehouse && (
          <Button type="dashed" danger onClick={() => setDrilledWarehouse(null)} style={{ marginLeft: 8 }}>
            Back to Warehouse View (Exit Drilling: {formatName(drilledWarehouse)})
          </Button>
        )}
        {drilledBond && (
          <Button type="dashed" danger onClick={() => setDrilledBond(null)} style={{ marginLeft: 8 }}>
            Back to Bond View (Exit Drilling: {formatName(drilledBond)})
          </Button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <b>Start Date:</b> {activeStartStr ? dayjs(activeStartStr).format("DD-MM-YYYY") : "-"} &nbsp;&nbsp;
        <b>End Date:</b> {activeEndStr ? dayjs(activeEndStr).format("DD-MM-YYYY") : "-"} &nbsp;&nbsp;
        <b>Days (Excl. Leaves):</b> {netDays}
      </div>

      {/* 🔥 FILTERS */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Warehouse"
          style={{ width: 250 }}
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
          Reset
        </Button>
      </Space>

      {/* 🔥 VIEW PILLS */}
      {/* <Space style={{ marginBottom: 16 }}>
        <Button
          type={view === "cumulative" ? "primary" : "default"}
          onClick={() => setView("cumulative")}
          style={{ marginLeft: 8 }}
        >
          Cumulative
        </Button>
        <Checkbox
          checked={useWholeNumbers}
          onChange={e => setUseWholeNumbers(e.target.checked)}
          style={{ marginLeft: 16 }}
        >
          Round off
        </Checkbox>
      </Space> */}

      {/* 🔥 TABLE */}
      <Table
        loading={loading}
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={processedData}
        rowKey={(record) => `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
        scroll={{ x: "max-content" }}
        pagination={false}
        summary={(pageData) => {
          if (pageData.length === 0) return null;

          if (view === "cumulative") {
            let totalOpening = 0;
            let totalReceipt = 0;
            let totalSales = 0;
            let totalClosing = 0;

            // Compute accurate overall mathematically-correct percentage & variance totals
            pageData.forEach(({ opening, receipt, sales, closing }) => {
              totalOpening += opening || 0;
              totalReceipt += receipt || 0;
              totalSales += sales || 0;
              totalClosing += closing || 0;
            });

            const totalDiff = totalOpening - totalClosing;
            const totalClosingStockAtSalesPerc = totalSales ? (totalClosing * 100) / totalSales : 0;
            const totalPerc = totalOpening ? (totalDiff * 100) / totalOpening : 0;
            const totalAvgSalesPerDay = netDays ? totalSales / netDays : 0;

            let totalLastMonthSales = 0;
            pageData.forEach(({ last_month_sales }) => {
              totalLastMonthSales += last_month_sales || 0;
            });
            const totalLastMonthAvg = lastMonthNetDays ? totalLastMonthSales / lastMonthNetDays : 0;
            const totalAvgDiff = totalAvgSalesPerDay - totalLastMonthAvg;

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                  <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalOpening)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalReceipt)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalSales)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalClosing)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalDiff)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalClosingStockAtSalesPerc)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalPerc)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={8} style={{ padding: "12px 8px" }}></Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalAvgSalesPerDay)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalLastMonthAvg, true)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalAvgDiff, true)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          } else {
            // Daywise view
            const colTotals = {};
            let grandTotal = 0;

            labels.forEach(l => colTotals[l] = 0);

            pageData.forEach(row => {
              labels.forEach(l => {
                colTotals[l] += row[l] || 0;
              });
              grandTotal += row.total || 0;
            });

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                  <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                  {labels.map((l, index) => (
                    <Table.Summary.Cell key={l} index={index + 1} align="center" style={{ padding: "12px 8px" }}>
                      <Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(colTotals[l])}</Text>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={labels.length + 1} align="right" style={{ padding: "12px 8px" }}>
                    <Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(grandTotal)}</Text>
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