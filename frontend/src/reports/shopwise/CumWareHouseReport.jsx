import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space } from "antd";
import { useParams, useSearchParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportUtils";

const { RangePicker } = DatePicker;

export default function CumulativeWarehouseReport() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState(searchParams.get("view") || "daywise");

  const [bondFilter, setBondFilter] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState(searchParams.get("mode") || "warehouse");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);

  // 🔹 load data from backend
  const load = async (startIdx = null, endIdx = null, selectedWarehouse = null, selectedMode = mode) => {
    const res = await getReport(id, null, selectedWarehouse ? "shopwise" : view, {
      start_idx: startIdx,
      end_idx: endIdx,
      mode: selectedMode,
      warehouse: selectedWarehouse
    });
    const cleaned = (res.data.data || []).filter(d => d.warehouse || d.shop_code || d.bond);

    setData(cleaned);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});

    if (allLabels.length === 0) {
      setAllLabels(res.data.labels || []);
    }
  };

  // 🔥 Reload when view or date range changes
  useEffect(() => {
    applyFilters();
  }, [view, drilledWarehouse, mode]);

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

  // 🔥 APPLY FILTERS (Reload data from backend for date range)
  const applyFilters = () => {
    let startIdx = null;
    let endIdx = null;

    if (dateRange.length === 2) {
      startIdx = getIndexFromDate(dateRange[0]);
      endIdx = getIndexFromDate(dateRange[1]);
    }

    load(startIdx, endIdx, drilledWarehouse, mode);
  };

  // 🔥 RESET FILTERS
  const resetFilters = () => {
    setBondFilter(null);
    setWarehouseFilter(null);
    setDateRange([]);
    setDrilledWarehouse(null);
    setMode("warehouse");
    load(null, null, null, "warehouse");
  };

  // 🔹 Aggregation and Filtering Logic
  const processedData = useMemo(() => {
    // 1. Apply Filters
    let filtered = data.filter(d => {
      const bondMatch = !bondFilter || d.bond === bondFilter;
      const whMatch = !warehouseFilter || d.warehouse === warehouseFilter;
      return bondMatch && whMatch;
    });

    return filtered;
  }, [data, bondFilter, warehouseFilter]);

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

  // 🔹 columns
  const daywiseColumns = [
    { 
      title: mode === "shop" || drilledWarehouse ? "Shop Name" : (mode === "bond" ? "Bond" : "Warehouse"), 
      dataIndex: mode === "shop" || drilledWarehouse ? "shop_name" : "warehouse", 
      fixed: "left", 
      width: 200,
      render: (text, record) => (
        mode === "warehouse" && !drilledWarehouse ? (
          <a onClick={() => setDrilledWarehouse(record.warehouse)}>{text}</a>
        ) : (
          <span>{record.shop_code ? `${record.shop_code} - ` : ""}{text}</span>
        )
      )
    },
    ...labels.map(l => ({ title: l, dataIndex: l, width: 100 })),
    { title: "Total", dataIndex: "total", width: 100, fixed: "right" }
  ];

  const cumulativeColumns = [
    { 
      title: mode === "shop" || drilledWarehouse ? "Shop Name" : (mode === "bond" ? "Bond" : "Warehouse"), 
      dataIndex: mode === "shop" || drilledWarehouse ? "shop_name" : "warehouse", 
      width: 250,
      render: (text, record) => (
        mode === "warehouse" && !drilledWarehouse ? (
          <a onClick={() => setDrilledWarehouse(record.warehouse)}>{text}</a>
        ) : (
          <span>{record.shop_code ? `${record.shop_code} - ` : ""}{text}</span>
        )
      )
    },
    ...brandColumns,
    { title: "Total Issues", dataIndex: "total", width: 150 },
  ];

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    exportToExcel(
      processedData,
      {
        Mode: mode,
        View: view,
        Bond: bondFilter,
        Warehouse: warehouseFilter,
        "Date Range": dateRange.length === 2 ? `${dateRange[0].format("YYYY-MM-DD")} to ${dateRange[1].format("YYYY-MM-DD")}` : "All",
        "Start Date": config.start_date,
        "Total Days": config.num_days
      },
      `bondwise_offtake_${mode}_${view}.xlsx`,
      "Bondwise + Offtake"
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Bondwise + Offtake</h2>
        <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button
          type={mode === "warehouse" ? "primary" : "default"}
          onClick={() => {
            setMode("warehouse");
            setWarehouseFilter(null);
          }}
        >
          Warehouse View
        </Button>

        <Button
          type={mode === "bond" ? "primary" : "default"}
          onClick={() => {
            setMode("bond");
            setWarehouseFilter(null);
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
            Back to Warehouse View (Exit Drilling: {drilledWarehouse})
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
            <Select.Option key={w} value={w}>{w}</Select.Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          disabledDate={disabledDate}
        />

        <Button type="primary" onClick={applyFilters}>
          Apply Date Range
        </Button>

        <Button onClick={resetFilters}>
          Reset All
        </Button>
      </Space>

      {/* 🔥 VIEW TOGGLE */}
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

      {/* 🔥 TABLE */}
      <Table
        bordered
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={processedData}
        rowKey={(record) => `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
        pagination={false}
        scroll={{ x: "max-content", y: 600 }}
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
