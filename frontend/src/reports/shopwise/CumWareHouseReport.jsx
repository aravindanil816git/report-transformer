import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, message } from "antd";
import { useParams, useSearchParams } from "react-router-dom";
import { getReport, processReport } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportUtils";

const { RangePicker } = DatePicker;

export default function CumulativeWarehouseReport() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState(searchParams.get("view") || "daywise");

  const [bondFilter, setBondFilter] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState(searchParams.get("mode") || "warehouse");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);
  const [drilledBond, setDrilledBond] = useState(null);

  const isDailyWiseType = config?.type === "dailywise_secondary_sales_cum";
  const isBrandwiseCumType = config?.type === "brandwise_cum_secondary_sales";

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

    return filtered;
  }, [data, bondFilter, warehouseFilter, drilledBond, drilledWarehouse]);

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
      render: v => v || 0
    }));
  }, [data]);

  // 🔹 strict date limits
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
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
    const displayText = formatName(text);
    if (mode === "warehouse" && !drilledWarehouse) {
      return <a onClick={() => setDrilledWarehouse(record.warehouse)}>{displayText}</a>;
    }
    if (mode === "bond" && !drilledBond) {
      return <a onClick={() => setDrilledBond(record.warehouse)}>{displayText}</a>;
    }
    return <span>{record.shop_code ? `${record.shop_code} - ` : ""}{displayText}</span>;
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
    ...labels.map(l => ({ title: l, dataIndex: l, width: 100 })),
    { title: "Total", dataIndex: "total", width: 100, fixed: "right" }
  ];

  const cumulativeColumns = [
    { 
      title: getTitle(), 
      dataIndex: getDataIndex(), 
      width: 250,
      render: renderFirstCol
    },
    ...brandColumns,
    { title: "Total Issues", dataIndex: "total", width: 150 },
  ];

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    const reportTitle = isDailyWiseType 
      ? "DailyWise Secondary Sales" 
      : (isBrandwiseCumType ? "Brandwise Cum Secondary Sales" : "Consolidated Secondary Sales (Legacy)");

    const exportData = processedData.map(d => ({
      ...d,
      warehouse: formatName(d.warehouse)
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
      `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}.xlsx`,
      reportTitle
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{isDailyWiseType ? "Daily Secondary Sales" : (isBrandwiseCumType ? "Brandwise Cum Secondary Sales" : "Consolidated Secondary Sales (Legacy)")}</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button
          type={mode === "warehouse" && !drilledBond ? "primary" : "default"}
          onClick={() => {
            setMode("warehouse");
            setWarehouseFilter(null);
            setDrilledBond(null);
            setDrilledWarehouse(null);
          }}
        >
          Warehouse View
        </Button>

        <Button
          type={mode === "bond" ? "primary" : "default"}
          onClick={() => {
            setMode("bond");
            setWarehouseFilter(null);
            setDrilledBond(null);
            setDrilledWarehouse(null);
          }}
          style={{ marginLeft: 8 }}
        >
          Bond View
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
      {!isDailyWiseType && !isBrandwiseCumType && (
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
      )}

      {/* 🔥 TABLE */}
      <Table
        loading={loading}
        bordered
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={processedData}
        rowKey={(record) => `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
        pagination={false}
        scroll={{ x: "max-content" }}
        summary={(pageData) => {
          if (!pageData || pageData.length === 0) return null;

          let totalSum = 0;
          let colSums = {};

          if (view === "cumulative") {
            let brandSums = {};
            brandColumns.forEach(bc => brandSums[bc.dataIndex] = 0);

            pageData.forEach((d) => {
              totalSum += (Number(d.total) || 0);
              brandColumns.forEach(bc => {
                brandSums[bc.dataIndex] += (Number(d[bc.dataIndex]) || 0);
              });
            });

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#fafafa" }}>
                  <Table.Summary.Cell index={0} width={250}><b>Grand Total</b></Table.Summary.Cell>
                  {brandColumns.map((bc, idx) => (
                    <Table.Summary.Cell index={idx + 1} key={bc.dataIndex} width={120}>
                      <b>{brandSums[bc.dataIndex]}</b>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={brandColumns.length + 1} width={150}><b>{totalSum}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          } else {
            labels.forEach((l) => {
              let s = 0;
              pageData.forEach((d) => (s += (Number(d[l]) || 0)));
              colSums[l] = s;
            });
            pageData.forEach((d) => (totalSum += (Number(d.total) || 0)));

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#fafafa" }}>
                  <Table.Summary.Cell index={0} fixed="left" width={200}><b>Grand Total</b></Table.Summary.Cell>
                  {labels.map((l, idx) => (
                    <Table.Summary.Cell index={idx + 1} key={l} width={100}>
                      <b>{colSums[l]}</b>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={labels.length + 1} width={100}>
                    <b>{totalSum}</b>
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
