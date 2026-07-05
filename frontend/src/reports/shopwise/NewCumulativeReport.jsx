import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, Typography, message, Checkbox } from "antd";

const { Text } = Typography;
import { useParams, useNavigate } from "react-router-dom";
import { getReport, processReport, getJson, listReports } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportUtils";

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

      // Fetch combined reports to map to the correct 2-file datasets
      const reportsRes = await listReports({ type: "combined_shopwise", limit: 100 });
      const combinedReps = reportsRes.data?.items || reportsRes.data || [];

      const currentMonthPrefix = activeD1 ? activeD1.substring(0, 7) : dayjs().format("YYYY-MM");
      const currentCombined = combinedReps.find(r =>
        (r.config?.start_date && r.config.start_date.startsWith(currentMonthPrefix)) ||
        (r.config?.date1 && r.config.date1.startsWith(currentMonthPrefix))
      );

      // 1. Fetch current month data
      let currentResPromise;
      if (view === "cumulative" && currentCombined) {
        currentResPromise = getReport(currentCombined.id, null, "cumulative", params);
      } else {
        currentResPromise = getReport(id, null, view, params);
      }

      // 2. Concurrently fetch last month's data using pure date mapping
      let prevResPromise = Promise.resolve({ data: { data: [] } });
      if (activeD1 && activeD2) {
        const prevD1Str = dayjs(activeD1).subtract(1, 'month').startOf('month').format("YYYY-MM-DD");
        const prevD2Str = dayjs(activeD1).subtract(1, 'month').endOf('month').format("YYYY-MM-DD");
        const prevMonthPrefix = prevD1Str.substring(0, 7);
        const prevParams = { ...params, start_date: prevD1Str, end_date: prevD2Str };

        const prevCombined = combinedReps.find(r =>
          (r.config?.start_date && r.config.start_date.startsWith(prevMonthPrefix)) ||
          (r.config?.date1 && r.config.date1.startsWith(prevMonthPrefix))
        );

        if (prevCombined) {
          prevResPromise = getReport(prevCombined.id, null, "cumulative", prevParams).catch(() => ({ data: { data: [] } }));
        } else {
          prevResPromise = getReport(id, null, "cumulative", prevParams).catch(() => ({ data: { data: [] } }));
        }
      }

      const [res, prevRes] = await Promise.all([currentResPromise, prevResPromise]);

      const rawData = res.data.data || [];
      const lastMonthData = prevRes.data.data || [];

      const lastMonthSalesMap = {};
      lastMonthData.forEach(row => {
        const pk = selectedMode === "bond" ? row.bond : (selectedMode === "shop" ? row.shop_code : row.warehouse);
        if (pk) {
          lastMonthSalesMap[pk] = (lastMonthSalesMap[pk] || 0) + (row.outward || row.sales || 0);
        }
      });

      const cleaned = rawData.filter(d => {
        const isValid = d.warehouse || d.shop_code || d.bond || d.warehouse === "";
        return isValid;
      }).map(row => {
        const pk = selectedMode === "bond" ? row.bond : (selectedMode === "shop" ? row.shop_code : row.warehouse);
        return {
          ...row,
          last_month_sales: pk ? (lastMonthSalesMap[pk] || 0) : 0
        };
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

  // 🔒 strict date range
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
    if (!current) return false;
    if (current.isAfter(dayjs().add(1, "day"), "day")) return true;
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
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
      const last_month_sales = d.last_month_sales || 0;
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
        last_month_avg
      };
    });
  }, [filteredData, netDays]);

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

  const formatVal = (val) => {
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
        { title: `Last Month Avg (${lastMonthPeriodLabel})`, dataIndex: "last_month_avg", width: 160, align: "center", render: (v) => formatVal(v) },
        { title: "Difference", dataIndex: "avg_diff", width: 120, align: "center", render: (v) => formatVal(v) }
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
        [`Last Month Avg (${lastMonthPeriodLabel})`]: useWholeNumbers ? Math.round(d.last_month_avg || 0) : d.last_month_avg,
        "Avg Difference": useWholeNumbers ? Math.round(d.avg_diff || 0) : d.avg_diff
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
          <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
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
                  <Table.Summary.Cell index={10} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalLastMonthAvg)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalAvgDiff)}</Text></Table.Summary.Cell>
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