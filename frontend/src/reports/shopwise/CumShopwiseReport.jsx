import { useEffect, useState } from "react";
import { Table, Button, Select, DatePicker, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

export default function CumulativeShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("daywise_opening");

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("warehouse");

  // 🔹 load
  const load = async (startIdx = null, endIdx = null) => {
    const res = await getReport(id, null, view, {
      start_idx: startIdx,
      end_idx: endIdx,
      mode
    });

    const cleaned = (res.data.data || []).filter(d => d.warehouse);

    setData(cleaned);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});

    if (allLabels.length === 0) {
      setAllLabels(res.data.labels || []);
    }
  };

  // 🔥 retain filters on view switch
useEffect(() => {
  applyFilters();
}, [view, mode]);

  const labelToDate = (label) => dayjs(label.split(" ")[0], "DD-MMM");

  const getIndexFromDate = (date) => {
    return allLabels.findIndex(l =>
      labelToDate(l).isSame(date, "day")
    );
  };

  // 🔥 APPLY
  const applyFilters = () => {
    let startIdx = null;
    let endIdx = null;

    if (dateRange.length === 2) {
      startIdx = getIndexFromDate(dateRange[0]);
      endIdx = getIndexFromDate(dateRange[1]);
    }

    load(startIdx, endIdx);
  };

  // 🔥 RESET
  const resetFilters = () => {
    setWarehouseFilter(null);
    setDateRange([]);
    load();
  };

  const filteredData = warehouseFilter
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  // 🔒 strict date range
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
  };

  // 🔹 daywise + total
  const daywiseColumns = [
    { title: "Warehouse", dataIndex: "warehouse", fixed: "left" },
    ...labels.map(l => ({ title: l, dataIndex: l })),
    {
      title: "Total",
      dataIndex: "total",
      render: (_, row) => {
        let total = 0;
        labels.forEach(l => total += row[l] || 0);
        return total;
      }
    }
  ];

  const cumulativeColumns = [
    { title: "Warehouse", dataIndex: "warehouse" },
    { title: "Opening", dataIndex: "opening" },
    { title: "Receipt", dataIndex: "receipt" },
    { title: "Sales", dataIndex: "sales" },
    { title: "Closing", dataIndex: "closing" },
    { title: "Difference", dataIndex: "difference" },
    { title: "Avg Sales / Day", dataIndex: "avg_sales_per_day" }
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2>Cumulative Shopwise Report</h2>

      <div style={{ marginBottom: 16 }}>
  <Button
    type={mode === "warehouse" ? "primary" : "default"}
    onClick={() => setMode("warehouse")}
  >
    Warehouse
  </Button>

  <Button
    type={mode === "bond" ? "primary" : "default"}
    onClick={() => setMode("bond")}
    style={{ marginLeft: 8 }}
  >
    Bond
  </Button>
</div>

      <div style={{ marginBottom: 12 }}>
        <b>Start Date:</b> {config.start_date} &nbsp;&nbsp;
        <b>Days:</b> {config.num_days}
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
            <Select.Option key={w} value={w}>{w}</Select.Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          disabledDate={disabledDate}
        />

        <Button type="primary" onClick={applyFilters}>
          Apply
        </Button>

        <Button onClick={resetFilters}>
          Reset
        </Button>
      </Space>

      {/* 🔥 VIEW PILLS */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type={view === "daywise_opening" ? "primary" : "default"}
          onClick={() => setView("daywise_opening")}
        >
          Opening
        </Button>

        <Button
          type={view === "daywise_receipt" ? "primary" : "default"}
          onClick={() => setView("daywise_receipt")}
          style={{ marginLeft: 8 }}
        >
          Receipt
        </Button>

        <Button
          type={view === "daywise_sales" ? "primary" : "default"}
          onClick={() => setView("daywise_sales")}
          style={{ marginLeft: 8 }}
        >
          Sales
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
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={filteredData}
        rowKey="warehouse"
        scroll={{ x: true }}
      />
    </div>
  );
}