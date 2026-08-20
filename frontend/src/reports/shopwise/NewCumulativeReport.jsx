import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, Typography, message, Checkbox } from "antd";

const { Text } = Typography;
import { useParams, useNavigate } from "react-router-dom";
import { getReport, processReport, getJson, listReports, getFilters } from "../../api";
import dayjs from "dayjs";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportClusterPdf, exportShopDrilldownPdfByBond, exportNewCumulativeExcel, exportComparativeShopSalesPdf } from "../../utils/exportUtils";
import { disabledFutureMonthDates } from "../../utils/dateUtils";
import DownloadDropdown from "../../components/DownloadDropdown";
import { getSellThroughColorConfig } from "../../utils/colorUtils";

import SourceReportsPopover from "../../components/SourceReportsPopover";

const { RangePicker } = DatePicker;

const formatDateWithOrdinal = (dateVal) => {
  if (!dateVal) return "";
  const d = dayjs(dateVal);
  if (!d.isValid()) return String(dateVal);
  return d.format("D MMM YYYY");
};

export default function CumulativeShopwiseReport() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [uploads, setUploads] = useState([]);
  const [view, setView] = useState("cumulative");

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("bond");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);
  const [drilledBond, setDrilledBond] = useState(null);
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);

  const [shopLeaves, setShopLeaves] = useState([]);
  const [warehouseClusters, setWarehouseClusters] = useState({});
  const [bondClusters, setBondClusters] = useState({});

  const [lastMonthSalesMap, setLastMonthSalesMap] = useState({});
  const [loadingLastMonth, setLoadingLastMonth] = useState(false);

  useEffect(() => {
    getJson("leaves").then(res => {
      setShopLeaves(res.data?.shop || []);
    }).catch(() => { });

    getJson("warehouse_clusters").then(res => {
      setWarehouseClusters(res.data || {});
    }).catch(() => { });

    getJson("clusters").then(res => {
      setBondClusters(res.data || {});
    }).catch(() => { });
  }, []);

  // Initialize default date range from report config on load
  useEffect(() => {
    getReport(id, null, view, { mode }).then((res) => {
      const repConfig = res.data.config || {};
      let defaultStart = dayjs().startOf("month");
      let defaultEnd = dayjs();

      const startDateStr = repConfig.date1 || repConfig.start_date;
      const endDateStr = repConfig.date2 || repConfig.end_date;

      if (startDateStr && endDateStr) {
        defaultStart = dayjs(startDateStr);
        defaultEnd = dayjs(endDateStr);
      }

      setDateRange([defaultStart, defaultEnd]);
      load(null, null, null, null, "bond", defaultStart.format("YYYY-MM-DD"), defaultEnd.format("YYYY-MM-DD"));
    }).catch(() => {
      const defaultStart = dayjs().startOf("month");
      const defaultEnd = dayjs();
      setDateRange([defaultStart, defaultEnd]);
      load(null, null, null, null, "bond", defaultStart.format("YYYY-MM-DD"), defaultEnd.format("YYYY-MM-DD"));
    });
  }, [id]);

  // 🔹 triggerLastMonthLoad
  const triggerLastMonthLoad = async (activeD1, activeD2, selectedMode) => {
    if (!activeD1 || !activeD2) return;
    setLoadingLastMonth(true);
    try {
      const prevD1 = dayjs(activeD1).subtract(1, "month");
      const prevD2 = dayjs(activeD2).subtract(1, "month");

      // Fetch the cumulative totals of the previous month's combined report using main report id
      const prevRes = await getReport(id, null, "cumulative", {
        mode: selectedMode,
        start_date: prevD1.format("YYYY-MM-DD"),
        end_date: prevD2.format("YYYY-MM-DD")
      });
      const lastMonthData = prevRes.data?.data || prevRes.data || [];
      const prevUploads = prevRes.data?.uploads || [];

      if (prevUploads.length > 0) {
        setUploads(current => {
          const combined = [...(current || []), ...prevUploads];
          const unique = [];
          const seen = new Set();
          combined.forEach(u => {
            const k = u.file || u.range_key || u.date;
            if (k && !seen.has(k)) {
              seen.add(k);
              unique.push(u);
            }
          });
          return unique;
        });
      }

      console.log("[triggerLastMonthLoad] Loaded last month data for report:", id, {
        mode: selectedMode,
        rawRowsCount: lastMonthData.length,
        rawRows: lastMonthData,
        prevUploadsCount: prevUploads.length
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

      // Fetch current month data directly using main report id
      const currentResPromise = getReport(id, null, view, params);

      const res = await currentResPromise;
      console.log("[NewCumulativeReport] Loaded raw data for current view:", {
        reportIdUsed: id,
        view,
        params,
        responseLabels: res.data.labels,
        responseConfig: res.data.config,
        rawRowsCount: (res.data.data || []).length,
        rawRows: res.data.data || []
      });
      const rawData = res.data.data || [];

      const cleaned = rawData.filter(d => {
        const isValid = d.warehouse || d.shop_code || d.bond || d.warehouse === "";
        return isValid;
      });

      setData(cleaned);
      setLabels(res.data.labels || []);
      setConfig(res.data.config || {});
      setUploads(res.data.uploads || []);

      if (res.data.config?.date1 && res.data.config?.date2 && dateRange.length === 0) {
        setDateRange([dayjs(res.data.config.date1), dayjs(res.data.config.date2)]);
      }

      if (allLabels.length === 0) {
        setAllLabels(res.data.labels || []);
      }

      // Trigger lazy load of prior month baseline data
      triggerLastMonthLoad(activeD1, activeD2, selectedMode);
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

  const activeStartStr = dateRange.length === 2 && dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : (config.date1 || config.start_date);
  const activeEndStr = dateRange.length === 2 && dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : (config.date2 || config.end_date);

  const currentPeriodLabel = activeStartStr && activeEndStr
    ? `${dayjs(activeStartStr).format("DD MMM")} - ${dayjs(activeEndStr).format("DD MMM")}`
    : "Current Month";

  const lastMonthPeriodLabel = activeStartStr && activeEndStr
    ? `${dayjs(activeStartStr).subtract(1, 'month').format("DD MMM")} - ${dayjs(activeEndStr).subtract(1, 'month').format("DD MMM")}`
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
    if (activeStartStr && activeEndStr) {
      const s = dayjs(activeStartStr).subtract(1, 'month');
      const e = dayjs(activeEndStr).subtract(1, 'month');
      const diff = e.diff(s, 'day') + 1;
      const totalDays = diff > 0 ? diff : 0;
      let count = 0;
      for (let i = 0; i < totalDays; i++) {
        const dStr = s.add(i, 'day').format('YYYY-MM-DD');
        if (!shopLeaves.includes(dStr)) count++;
      }
      return count > 0 ? count : totalDays;
    }
    return 30; // fallback
  }, [activeStartStr, activeEndStr, shopLeaves]);

  const disabledDate = (current) => {
    return disabledFutureMonthDates(current);
  };

  const normalizeName = (name) => {
    if (!name) return "";
    return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim().toUpperCase();
  };

  const isInCluster = (name, clusterList) => {
    if (!name || !clusterList) return false;
    const normalized = normalizeName(name);
    return clusterList.some(item => normalizeName(item) === normalized);
  };

  // 🔥 Calculate missing columns locally in the frontend
  const processedData = useMemo(() => {
    const baseItems = filteredData.map(d => {
      const opening = d.opening || 0;
      const receipt = d.inward || d.receipt || 0;
      const sales = d.outward || d.sales || 0;
      const closing = d.closing || 0;

      const difference = closing - opening;
      const closing_stock_at_sales_perc = (sales && (opening + receipt)) ? (sales * 100) / (opening + receipt) : 0;
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

    const activeClusters = mode === "bond" ? bondClusters : (mode === "warehouse" ? warehouseClusters : {});
    const activeDrill = mode === "bond" ? drilledBond : drilledWarehouse;
    const isGroupingEnabled = (mode === "bond" || mode === "warehouse") && !activeDrill && Object.keys(activeClusters).length > 0;

    if (isGroupingEnabled) {
      const groupedData = [];
      const unclustered = [...baseItems];

      Object.entries(activeClusters).forEach(([clusterName, nameList]) => {
        const clusterItems = [];
        for (let i = unclustered.length - 1; i >= 0; i--) {
          const d = unclustered[i];
          const checkName = mode === "bond" ? (d.bond || d.warehouse) : d.warehouse;
          if (isInCluster(checkName, nameList)) {
            clusterItems.push(d);
            unclustered.splice(i, 1);
          }
        }

        if (clusterItems.length > 0) {
          clusterItems.sort((a, b) => {
            const valA = mode === "bond" ? (a.bond || a.warehouse || "") : (a.warehouse || "");
            const valB = mode === "bond" ? (b.bond || b.warehouse || "") : (b.warehouse || "");
            return valA.localeCompare(valB);
          });
          groupedData.push(...clusterItems);

          let totalOpening = 0;
          let totalReceipt = 0;
          let totalSales = 0;
          let totalClosing = 0;
          let totalLastMonthSales = 0;

          const daywiseSums = {};
          if (view === "daywise") {
            labels.forEach(l => daywiseSums[l] = 0);
          }

          clusterItems.forEach(d => {
            totalOpening += d.opening || 0;
            totalReceipt += d.receipt || 0;
            totalSales += d.sales || 0;
            totalClosing += d.closing || 0;
            totalLastMonthSales += d.last_month_sales || 0;

            if (view === "daywise") {
              labels.forEach(l => {
                daywiseSums[l] += (Number(d[l]) || 0);
              });
            }
          });

          const totalDiff = totalClosing - totalOpening;
          const totalClosingStockAtSalesPerc = (totalSales && (totalOpening + totalReceipt)) ? (totalSales * 100) / (totalOpening + totalReceipt) : 0;
          const totalPerc = totalOpening ? (totalDiff * 100) / totalOpening : 0;
          const totalAvgSalesPerDay = netDays ? totalSales / netDays : 0;
          const totalLastMonthAvg = lastMonthNetDays ? totalLastMonthSales / lastMonthNetDays : 0;
          const totalAvgDiff = totalAvgSalesPerDay - totalLastMonthAvg;
          const totalDaywiseSum = Object.values(daywiseSums).reduce((a, b) => a + b, 0);

          groupedData.push({
            isClusterTotal: true,
            clusterName: clusterName,
            warehouse: `${clusterName} Total`,
            opening: totalOpening,
            receipt: totalReceipt,
            sales: totalSales,
            closing: totalClosing,
            difference: totalDiff,
            closing_stock_at_sales_perc: totalClosingStockAtSalesPerc,
            perc: totalPerc,
            avg_sales_per_day: totalAvgSalesPerDay,
            last_month_sales: totalLastMonthSales,
            last_month_avg: totalLastMonthAvg,
            avg_diff: totalAvgDiff,
            total: totalDaywiseSum,
            ...daywiseSums,
            key: `total-${clusterName}`
          });
        }
      });

      if (unclustered.length > 0) {
        unclustered.sort((a, b) => {
          const valA = mode === "bond" ? (a.bond || a.warehouse || "") : (a.warehouse || "");
          const valB = mode === "bond" ? (b.bond || b.warehouse || "") : (b.warehouse || "");
          return valA.localeCompare(valB);
        });
        groupedData.push(...unclustered);

        let totalOpening = 0;
        let totalReceipt = 0;
        let totalSales = 0;
        let totalClosing = 0;
        let totalLastMonthSales = 0;

        const daywiseSums = {};
        if (view === "daywise") {
          labels.forEach(l => daywiseSums[l] = 0);
        }

        unclustered.forEach(d => {
          totalOpening += d.opening || 0;
          totalReceipt += d.receipt || 0;
          totalSales += d.sales || 0;
          totalClosing += d.closing || 0;
          totalLastMonthSales += d.last_month_sales || 0;

          if (view === "daywise") {
            labels.forEach(l => {
              daywiseSums[l] += (Number(d[l]) || 0);
            });
          }
        });

        const totalDiff = totalClosing - totalOpening;
        const totalClosingStockAtSalesPerc = (totalSales && (totalOpening + totalReceipt)) ? (totalSales * 100) / (totalOpening + totalReceipt) : 0;
        const totalPerc = totalOpening ? (totalDiff * 100) / totalOpening : 0;
        const totalAvgSalesPerDay = netDays ? totalSales / netDays : 0;
        const totalLastMonthAvg = lastMonthNetDays ? totalLastMonthSales / lastMonthNetDays : 0;
        const totalAvgDiff = totalAvgSalesPerDay - totalLastMonthAvg;
        const totalDaywiseSum = Object.values(daywiseSums).reduce((a, b) => a + b, 0);

        groupedData.push({
          isClusterTotal: true,
          clusterName: "UNCLUSTERED ITEMS",
          warehouse: "UNCLUSTERED Total",
          opening: totalOpening,
          receipt: totalReceipt,
          sales: totalSales,
          closing: totalClosing,
          difference: totalDiff,
          closing_stock_at_sales_perc: totalClosingStockAtSalesPerc,
          perc: totalPerc,
          avg_sales_per_day: totalAvgSalesPerDay,
          last_month_sales: totalLastMonthSales,
          last_month_avg: totalLastMonthAvg,
          avg_diff: totalAvgDiff,
          total: totalDaywiseSum,
          ...daywiseSums,
          key: "total-unclustered"
        });
      }

      return groupedData;
    }

    return baseItems;
  }, [filteredData, netDays, lastMonthSalesMap, lastMonthNetDays, mode, warehouseClusters, bondClusters, labels, view]);

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
    if (record.isClusterTotal) {
      return <strong>{record.warehouse}</strong>;
    }
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
    ...labels.map(l => ({
      title: l,
      dataIndex: l,
      width: 100,
      align: "center",
      render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v)
    })),
    {
      title: "Total",
      dataIndex: "total",
      fixed: "right",
      width: 120,
      align: "right",
      render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v)
    }
  ];

  const cumulativeColumns = [
    { title: getTitle(), dataIndex: getDataIndex(), width: 180, render: renderFirstCol },
    { title: "Opening", dataIndex: "opening", width: 100, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v) },
    { title: "Receipt", dataIndex: "receipt", width: 100, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v) },
    { title: "Sales", dataIndex: "sales", width: 100, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v) },
    { title: "Closing", dataIndex: "closing", width: 100, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v) },
    { title: "Stock Net", dataIndex: "difference", width: 100, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v) },
    { title: "Stock Net %", dataIndex: "perc", width: 100, align: "right", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}%</strong> : (v !== undefined && v !== null && v !== "" ? `${formatVal(v)}%` : "-") },
    {
      title: "Sell-Through %",
      dataIndex: "closing_stock_at_sales_perc",
      width: 150,
      align: "center",
      render: (v, record) => {
        const formatted = formatVal(v);
        const colors = getSellThroughColorConfig(v);
        if (record.isClusterTotal) {
          const isZero = v === 0 || v === "0" || v === null || v === undefined || v === "";
          return <strong style={{ color: isZero ? "#8c8c8c" : `#${colors.font}` }}>{formatted}%</strong>;
        }
        if (v === null || v === undefined || v === "") {
          return "-";
        }
        return (
          <div style={{
            backgroundColor: `#${colors.fill}`,
            color: `#${colors.font}`,
            padding: "4px 8px",
            borderRadius: "4px",
            fontWeight: "600",
            display: "inline-block",
            minWidth: "60px",
            textAlign: "center"
          }}>
            {formatted}%
          </div>
        );
      }
    },
    { title: "", dataIndex: "spacer", width: 40, render: () => null }, // Spacer column
    {
      title: "Average (Cases)",
      children: [
        { title: `Current Month Avg (${currentPeriodLabel})`, dataIndex: "avg_sales_per_day", width: 160, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v)}</strong> : formatVal(v) },
        { title: `Last Month Avg (${lastMonthPeriodLabel})`, dataIndex: "last_month_avg", width: 160, align: "center", render: (v, record) => record.isClusterTotal ? <strong>{formatVal(v, true)}</strong> : formatVal(v, true) },
        {
          title: "Difference",
          dataIndex: "avg_diff",
          width: 120,
          align: "center",
          render: (v, record) => {
            const num = Number(v);
            const formatted = formatVal(v, true);
            if (v === null || v === undefined || v === "" || isNaN(num) || num === 0) {
              return record.isClusterTotal ? <strong>{formatted}</strong> : formatted;
            }
            const isPositive = num > 0;
            const color = isPositive ? "#3f8600" : "#cf1322";
            const arrow = mode === "warehouse" ? "" : (isPositive ? "▲" : "▼");
            const content = `${arrow}${formatted}`;
            return record.isClusterTotal ? <strong style={{ color }}>{content}</strong> : <span style={{ color, fontWeight: "600" }}>{content}</span>;
          }
        }
      ]
    }
  ];

  const getOverallTotalRow = () => {
    let overallOpening = 0;
    let overallReceipt = 0;
    let overallSales = 0;
    let overallClosing = 0;
    let overallLastMonthSales = 0;

    processedData.forEach(d => {
      if (!d.isClusterTotal) {
        overallOpening += Number(d.opening || 0);
        overallReceipt += Number(d.receipt || 0);
        overallSales += Number(d.sales || 0);
        overallClosing += Number(d.closing || 0);
        overallLastMonthSales += Number(d.last_month_sales || 0);
      }
    });

    const overallDiff = overallClosing - overallOpening;
    const overallClosingStockAtSalesPerc = (overallSales && (overallOpening + overallReceipt)) ? (overallSales * 100) / (overallOpening + overallReceipt) : 0;
    const overallPerc = overallOpening ? (overallDiff * 100) / overallOpening : 0;
    const overallAvgSalesPerDay = netDays ? overallSales / netDays : 0;
    const overallLastMonthAvg = lastMonthNetDays ? overallLastMonthSales / lastMonthNetDays : 0;
    const overallAvgDiff = overallAvgSalesPerDay - overallLastMonthAvg;

    return {
      isTotal: true,
      isClusterTotal: true,
      [getDataIndex()]: "OVERALL TOTAL",
      opening: overallOpening,
      receipt: overallReceipt,
      sales: overallSales,
      closing: overallClosing,
      difference: overallDiff,
      perc: overallPerc,
      closing_stock_at_sales_perc: overallClosingStockAtSalesPerc,
      avg_sales_per_day: overallAvgSalesPerDay,
      last_month_sales: overallLastMonthSales,
      last_month_avg: overallLastMonthAvg,
      avg_diff: overallAvgDiff
    };
  };

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    if (view === "cumulative") {
      exportNewCumulativeExcel({
        data: [...processedData, getOverallTotalRow()],
        metadata: {
          Mode: mode,
          View: view,
          Warehouse: warehouseFilter ? formatName(warehouseFilter) : null,
          "Date Range": dateRange.length === 2 ? `${formatDateWithOrdinal(dateRange[0])} to ${formatDateWithOrdinal(dateRange[1])}` : "All",
          "Start Date": activeStartStr ? formatDateWithOrdinal(activeStartStr) : null,
          "End Date": activeEndStr ? formatDateWithOrdinal(activeEndStr) : null,
          "Net Days": netDays,
          "Round off": useWholeNumbers ? "Yes" : "No"
        },
        filename: "cumulative_shopwise_report.xlsx",
        sheetName: "Cumulative Shopwise",
        firstColHeader: getTitle(),
        firstColKey: "warehouse",
        useWholeNumbers,
        currentPeriodLabel,
        lastMonthPeriodLabel,
        loadingLastMonth
      });
    } else {
      const exportData = processedData.map(row => {
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

      exportToExcel(
        exportData,
        {
          Mode: mode,
          View: view,
          Warehouse: warehouseFilter ? formatName(warehouseFilter) : null,
          "Date Range": dateRange.length === 2 ? `${formatDateWithOrdinal(dateRange[0])} to ${formatDateWithOrdinal(dateRange[1])}` : "All",
          "Start Date": activeStartStr ? formatDateWithOrdinal(activeStartStr) : null,
          "End Date": activeEndStr ? formatDateWithOrdinal(activeEndStr) : null,
          "Net Days": netDays,
          "Round off": useWholeNumbers ? "Yes" : "No"
        },
        "cumulative_shopwise_report.xlsx",
        "Cumulative Shopwise"
      );
    }
  };

  const downloadPdf = () => {
    const reportTitle = "Shopsales Comparative";
    const period = dateRange.length === 2 ? `${formatDateWithOrdinal(dateRange[0])} to ${formatDateWithOrdinal(dateRange[1])}` : "All";

    if (view === "cumulative") {
      exportComparativeShopSalesPdf({
        title: reportTitle,
        periodLabel: period,
        data: [...processedData, getOverallTotalRow()],
        filename: `comparative_shopsales_current.pdf`,
        useWholeNumbers,
        firstColHeader: getTitle(),
        loadingLastMonth
      });
      return;
    }

    let exportData = [];
    let cols = [];
    let sumCols = [];

    cols = [getTitle(), ...labels, "Total"];
    sumCols = [...labels, "Total"];
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

    exportToPdf({
      title: reportTitle,
      periodLabel: period,
      columns: cols,
      data: exportData,
      sumCols: sumCols,
      filename: `comparative_shopsales_current.pdf`,
      orientation: "landscape",
      zeroMargin: true,
      head: null
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Shopsales Comparative</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <Button type="primary" onClick={downloadExcel} disabled={processedData.length === 0}>Download Excel</Button>
          <Button type="primary" onClick={downloadPdf} disabled={processedData.length === 0}>Download PDF</Button>
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
        <b>Start Date:</b> {activeStartStr ? formatDateWithOrdinal(activeStartStr) : "-"} &nbsp;&nbsp;
        <b>End Date:</b> {activeEndStr ? formatDateWithOrdinal(activeEndStr) : "-"} &nbsp;&nbsp;
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
          disabled={loading || !dateRange || dateRange.length < 2}
        />

        <Button
          type="primary"
          onClick={handleApplyDateRange}
          disabled={loading || !dateRange || dateRange.length < 2}
        >
          Apply Date Range
        </Button>

        <Button onClick={resetFilters} disabled={loading || !dateRange || dateRange.length < 2}>
          Reset
        </Button>

        <Checkbox
          checked={useWholeNumbers}
          onChange={e => setUseWholeNumbers(e.target.checked)}
          style={{ marginLeft: 12 }}
        >
          Round off
        </Checkbox>
        {(loading || !dateRange || dateRange.length < 2) && (
          <span style={{ color: '#8c8c8c', fontSize: '12px', fontStyle: 'italic' }}>
            Loading default dates...
          </span>
        )}
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
        rowKey={(record) => record.key || `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
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
            pageData.filter(d => !d.isClusterTotal).forEach(({ opening, receipt, sales, closing }) => {
              totalOpening += opening || 0;
              totalReceipt += receipt || 0;
              totalSales += sales || 0;
              totalClosing += closing || 0;
            });

            const totalDiff = totalClosing - totalOpening;
            const totalClosingStockAtSalesPerc = (totalSales && (totalOpening + totalReceipt)) ? (totalSales * 100) / (totalOpening + totalReceipt) : 0;
            const totalPerc = totalOpening ? (totalDiff * 100) / totalOpening : 0;
            const totalAvgSalesPerDay = netDays ? totalSales / netDays : 0;

            let totalLastMonthSales = 0;
            pageData.filter(d => !d.isClusterTotal).forEach(({ last_month_sales }) => {
              totalLastMonthSales += last_month_sales || 0;
            });
            const totalLastMonthAvg = lastMonthNetDays ? totalLastMonthSales / lastMonthNetDays : 0;
            const totalAvgDiff = totalAvgSalesPerDay - totalLastMonthAvg;

            const stColors = getSellThroughColorConfig(totalClosingStockAtSalesPerc);

            const diffNum = Number(totalAvgDiff);
            const formattedDiff = formatVal(totalAvgDiff, true);
            let diffContent = formattedDiff;
            let diffColor = undefined;
            if (totalAvgDiff !== null && totalAvgDiff !== undefined && totalAvgDiff !== "" && !isNaN(diffNum) && diffNum !== 0) {
              const isPositive = diffNum > 0;
              diffColor = isPositive ? "#3f8600" : "#cf1322";
              const arrow = mode === "warehouse" ? "" : (isPositive ? "▲" : "▼");
              diffContent = `${arrow}${formattedDiff}`;
            }

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                  <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalOpening)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalReceipt)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalSales)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalClosing)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalDiff)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalPerc)}%</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="center" style={{ padding: "12px 8px" }}>
                    <div style={{
                      backgroundColor: `#${stColors.fill}`,
                      color: `#${stColors.font}`,
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontWeight: "bold",
                      display: "inline-block",
                      minWidth: "60px",
                      textAlign: "center",
                      fontSize: "14px"
                    }}>
                      {formatVal(totalClosingStockAtSalesPerc)}%
                    </div>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} style={{ padding: "12px 8px" }}></Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalAvgSalesPerDay)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalLastMonthAvg, true)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap", color: diffColor }}>{diffContent}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          } else {
            // Daywise view
            const colTotals = {};
            let grandTotal = 0;

            labels.forEach(l => colTotals[l] = 0);

            pageData.filter(d => !d.isClusterTotal).forEach(row => {
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
      <SourceReportsPopover uploads={uploads} labels={labels} config={config} dateRange={dateRange} />
    </div>
  );
}