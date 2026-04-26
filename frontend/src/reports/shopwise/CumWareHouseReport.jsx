import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportUtils";

const { RangePicker } = DatePicker;

export default function CumulativeWarehouseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("daywise");

  const [bondFilter, setBondFilter] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("warehouse");

  // 🔹 load data from backend
  const load = async (startIdx = null, endIdx = null) => {
    const res = await getReport(id, null, view, {
      start_idx: startIdx,
      end_idx: endIdx,
      mode: "warehouse" // 🔥 Always fetch warehouse level to allow frontend aggregation
    });
    const cleaned = (res.data.data || []).filter(d => d.warehouse);

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
  }, [view]);

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

    load(startIdx, endIdx);
  };

  // 🔥 RESET FILTERS
  const resetFilters = () => {
    setBondFilter(null);
    setWarehouseFilter(null);
    setDateRange([]);
    load();
  };

  // 🔹 Aggregation and Filtering Logic
  const processedData = useMemo(() => {
    // 1. Apply Filters
    let filtered = data.filter(d => {
      const bondMatch = !bondFilter || d.bond === bondFilter;
      const whMatch = !warehouseFilter || d.warehouse === warehouseFilter;
      return bondMatch && whMatch;
    });

    // 2. Aggregate if in bond mode
    if (mode === "bond") {
      const bondMap = {};
      filtered.forEach(row => {
        const b = row.bond || "UNKNOWN";
        if (!bondMap[b]) {
          bondMap[b] = { warehouse: b, bond: b, total: 0 };
          labels.forEach(l => bondMap[b][l] = 0);
          if (view === "cumulative") bondMap[b].avg = 0;
        }
        
        bondMap[b].total += (Number(row.total) || 0);
        labels.forEach(l => bondMap[b][l] += (Number(row[l]) || 0));
      });
      
      return Object.values(bondMap).map(b => {
        if (view === "cumulative") {
          const days = labels.length || 1;
          b.avg = Math.round(b.total / days);
        }
        return b;
      });
    }

    return filtered;
  }, [data, bondFilter, warehouseFilter, mode, labels, view]);

  const uniqueBonds = useMemo(() => {
    return [...new Set(data.map(d => d.bond).filter(Boolean))].sort();
  }, [data]);

  const uniqueWarehouses = useMemo(() => {
    return [...new Set(
      data
        .filter(d => !bondFilter || d.bond === bondFilter)
        .map(d => d.warehouse)
    )].sort();
  }, [data, bondFilter]);

  // 🔹 strict date limits
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
  };

  // 🔹 columns
  const daywiseColumns = [
    { title: "Warehouse", dataIndex: "warehouse", fixed: "left", width: 200 },
    ...labels.map(l => ({ title: l, dataIndex: l, width: 100 })),
    { title: "Total", dataIndex: "total", width: 100 }
  ];

  const cumulativeColumns = [
    { title: "Warehouse", dataIndex: "warehouse", width: 250 },
    { title: "Total Issues", dataIndex: "total", width: 150 },
    { title: "Avg / Day", dataIndex: "avg", width: 150 }
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
      `warehouse_offtake_${mode}_${view}.xlsx`,
      "Warehouse Daily Offtake"
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Warehouse Daily Offtake Report</h2>
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
        rowKey={(record) => `${record.warehouse}-${record.bond || "none"}`}
        pagination={false}
        scroll={{ x: "max-content", y: 600 }}
        summary={(pageData) => {
          if (!pageData || pageData.length === 0) return null;

          let totalSum = 0;
          let colSums = {};

          if (view === "cumulative") {
            let sumAvg = 0;
            pageData.forEach((d) => {
              totalSum += (Number(d.total) || 0);
              sumAvg += (Number(d.avg) || 0);
            });

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#fafafa" }}>
                  <Table.Summary.Cell index={0} width={250}><b>Grand Total</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} width={150}><b>{totalSum}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} width={150}><b>{sumAvg}</b></Table.Summary.Cell>
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
