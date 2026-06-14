import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, Typography, message, Checkbox } from "antd";

const { Text } = Typography;
import { useParams, useNavigate } from "react-router-dom";
import { getReport, processReport, getJson } from "../../api";
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

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("warehouse");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);
  const [drilledBond, setDrilledBond] = useState(null);
  const [roundOff, setRoundOff] = useState(false);

  const [shopLeaves, setShopLeaves] = useState([]);
  const [prevMonthData, setPrevMonthData] = useState([]);
  const [prevNetDays, setPrevNetDays] = useState(0);

  useEffect(() => {
    getJson("leaves").then(res => {
      setShopLeaves(res.data?.shop || []);
    }).catch(() => {});
  }, []);

  // 🔹 load
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
      const res = await getReport(id, null, "cumulative", params);
  
      const cleaned = (res.data.data || []).filter(d => d.warehouse);
  
      setData(cleaned);
      setLabels(res.data.labels || []);
      setConfig(res.data.config || {});
  
      if (res.data.config?.date1 && res.data.config?.date2 && dateRange.length === 0) {
        setDateRange([dayjs(res.data.config.date1), dayjs(res.data.config.date2)]);
      }
  
      if (allLabels.length === 0) {
        setAllLabels(res.data.labels || []);
      }

      // 🔥 Fetch previous month data silently for comparative metrics
      const activeStart = d1 || res.data.config?.date1 || res.data.config?.start_date;
      const activeEnd = d2 || res.data.config?.date2 || res.data.config?.end_date;

      if (activeStart && activeEnd) {
        const prevD1 = dayjs(activeStart).subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
        const prevD2 = dayjs(activeStart).subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
        
        const s = dayjs(prevD1);
        const e = dayjs(prevD2);
        const diffDays = e.diff(s, 'day') + 1;
        let count = 0;
        for (let i = 0; i < diffDays; i++) {
          if (!shopLeaves.includes(s.add(i, 'day').format('YYYY-MM-DD'))) count++;
        }
        setPrevNetDays(count);

        getReport(id, null, "cumulative", { 
          ...params, 
          start_date: prevD1, 
          end_date: prevD2 
        }).then(prevRes => {
          setPrevMonthData((prevRes.data.data || []).filter(d => d.warehouse));
        }).catch(() => setPrevMonthData([]));
      } else {
        setPrevMonthData([]);
        setPrevNetDays(0);
      }
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Reload when view or data parameters change
  useEffect(() => {
    fetchCurrentView();
  }, [mode, drilledWarehouse, drilledBond]);

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

    await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode);
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

  const filteredData = warehouseFilter
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  const activeStartStr = config.date1 || config.start_date;
  const activeEndStr = config.date2 || config.end_date;

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

  // 🔒 strict date range
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
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

      const difference = closing - opening;
      const closing_stock_at_sales_perc = sales ? (closing * 100) / sales : 0;
      const perc = opening ? (difference * 100) / opening : 0;
      const avg_this_month = netDays ? sales / netDays : 0;

      // Find comparative previous row
      const prevRow = prevMonthData.find(p => p.warehouse === d.warehouse && p.shop_code === d.shop_code && p.bond === d.bond);
      const prevSales = prevRow ? (prevRow.sales || prevRow.outward || 0) : 0;
      const avg_prev_month = prevNetDays ? prevSales / prevNetDays : 0;
      const diff_avg = avg_this_month - avg_prev_month;

      let row = {
        ...d,
        opening,
        receipt,
        sales,
        closing,
        difference,
        closing_stock_at_sales_perc,
        perc,
        avg_this_month,
        avg_prev_month,
        diff_avg
      };

      if (roundOff) {
        row.opening = Math.round(row.opening);
        row.receipt = Math.round(row.receipt);
        row.sales = Math.round(row.sales);
        row.closing = Math.round(row.closing);
        row.difference = Math.round(row.difference);
        row.closing_stock_at_sales_perc = Math.round(row.closing_stock_at_sales_perc);
        row.perc = Math.round(row.perc);
        row.avg_this_month = Math.round(row.avg_this_month);
        row.avg_prev_month = Math.round(row.avg_prev_month);
        row.diff_avg = Math.round(row.diff_avg);
        
        labels.forEach(l => {
          if (row[l] !== undefined) row[l] = Math.round(row[l]);
        });
        if (row.total !== undefined) row.total = Math.round(row.total);
      }

      return row;
    });
  }, [filteredData, netDays, prevMonthData, prevNetDays, roundOff, labels]);

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
      return <a onClick={() => setDrilledBond(record.warehouse)}>{displayText}</a>;
    }
    return <span>{record.shop_code ? `${displayText} (${record.shop_code})` : displayText}</span>;
  };


  const cumulativeColumns = [
    { title: getTitle(), dataIndex: getDataIndex(), width: 220, render: renderFirstCol },
    { title: "Opening", dataIndex: "opening", width: 200, align: "center" },
    { title: "Receipt", dataIndex: "receipt", width: 200, align: "center" },
    { title: "Sales", dataIndex: "sales", width: 200, align: "center" },
    { title: "Closing", dataIndex: "closing", width: 200, align: "center" },
    { title: "Difference", dataIndex: "difference", width: 200, align: "center" },
    { title: "ClosingStock@Sales%", dataIndex: "closing_stock_at_sales_perc", width: 220, align: "center" },
    { title: "Perc(%)", dataIndex: "perc", width: 160, align: "right" },
    
    { title: "", dataIndex: "spacer", width: 40, render: () => "", onCell: () => ({ style: { background: "#fafafa", borderTop: "none", borderBottom: "none" } }) },
    
    { title: "Avg / Day (This Month)", dataIndex: "avg_this_month", width: 180, align: "center" },
    { title: "Avg / Day (Prev Month)", dataIndex: "avg_prev_month", width: 180, align: "center" },
    { title: "Difference (Avg)", dataIndex: "diff_avg", width: 160, align: "center" }
  ];

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    const exportData = processedData.map(d => ({
      [getTitle()]: d.shop_code ? `${d.shop_name} (${d.shop_code})` : formatName(d.warehouse),
      Opening: d.opening,
      Receipt: d.receipt,
      Sales: d.sales,
      Closing: d.closing,
      Difference: d.difference,
      "ClosingStock@Sales%": d.closing_stock_at_sales_perc,
      "Perc(%)": d.perc,
      " ": "",
      "Avg / Day (This Month)": d.avg_this_month,
      "Avg / Day (Prev Month)": d.avg_prev_month,
      "Difference (Avg)": d.diff_avg
    }));

    exportToExcel(
      exportData,
      {
        Mode: mode,
        Warehouse: warehouseFilter ? formatName(warehouseFilter) : null,
        "Date Range": dateRange.length === 2 ? `${dateRange[0].format("DD-MM-YYYY")} to ${dateRange[1].format("DD-MM-YYYY")}` : "All",
        "Start Date": activeStartStr ? dayjs(activeStartStr).format("DD-MM-YYYY") : null,
        "End Date": activeEndStr ? dayjs(activeEndStr).format("DD-MM-YYYY") : null,
        "Net Days": netDays
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
    type={mode === "warehouse" && !drilledBond ? "primary" : "default"}
    onClick={() => { setMode("warehouse"); setDrilledBond(null); setDrilledWarehouse(null); }}
  >
    Warehouse
  </Button>

  <Button
    type={mode === "bond" ? "primary" : "default"}
    onClick={() => { setMode("bond"); setDrilledBond(null); setDrilledWarehouse(null); }}
    style={{ marginLeft: 8 }}
  >
    Bond
  </Button>
  
  <Button
    type={mode === "shop" ? "primary" : "default"}
    onClick={() => { setMode("shop"); setDrilledBond(null); setDrilledWarehouse(null); }}
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
        <Checkbox checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)}>
          Round off
        </Checkbox>
      </Space>

      {/* 🔥 TABLE */}
      <Table
        loading={loading}
        columns={cumulativeColumns}
        dataSource={processedData}
        rowKey={(record) => `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
        scroll={{ x: "max-content" }}
        pagination={false}
        summary={(pageData) => {
          if (pageData.length === 0) return null;

          let totalOpening = 0;
          let totalReceipt = 0;
          let totalSales = 0;
          let totalClosing = 0;
          let totalPrevSales = 0;

          // Compute accurate overall mathematically-correct percentage & variance totals
          pageData.forEach(({ opening, receipt, sales, closing, avg_prev_month }) => {
            totalOpening += opening || 0;
            totalReceipt += receipt || 0;
            totalSales += sales || 0;
            totalClosing += closing || 0;
            totalPrevSales += (avg_prev_month * prevNetDays) || 0;
          });
          
          const totalDiff = totalClosing - totalOpening;
          const totalClosingStockAtSalesPerc = totalSales ? (totalClosing * 100) / totalSales : 0;
          const totalPerc = totalOpening ? (totalDiff * 100) / totalOpening : 0;
          const totalAvgThisMonth = netDays ? totalSales / netDays : 0;
          const totalAvgPrevMonth = prevNetDays ? totalPrevSales / prevNetDays : 0;
          const totalDiffAvg = totalAvgThisMonth - totalAvgPrevMonth;
          
          const formatNumber = (val) => roundOff ? Math.round(val) : val.toFixed(2);

          return (
            <Table.Summary fixed="bottom">
              <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalOpening)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalReceipt)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalSales)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalClosing)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalDiff)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalClosingStockAtSalesPerc)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalPerc)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={8} style={{ padding: "12px 8px", background: "#fafafa" }}></Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalAvgThisMonth)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalAvgPrevMonth)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={11} align="center" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatNumber(totalDiffAvg)}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
    </div>
  );
}