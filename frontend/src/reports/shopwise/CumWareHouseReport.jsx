import { useEffect, useState } from "react";
import { Table, Button, Select, DatePicker, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

export default function CumulativeWarehouseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("daywise");

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  // 🔹 load data from backend
  const load = async (startIdx = null, endIdx = null) => {
    const res = await getReport(id, null, view, {
      start_idx: startIdx,
      end_idx: endIdx
    });

    const cleaned = (res.data.data || []).filter(d => d.warehouse);

    setData(cleaned);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});

    if (allLabels.length === 0) {
      setAllLabels(res.data.labels || []);
    }
  };

  // 🔥 auto apply filters when view changes
  useEffect(() => {
    applyFilters();
  }, [view]);

  // 🔹 convert label → date
  const labelToDate = (label) => {
    return dayjs(label.split(" ")[0], "DD-MMM");
  };

  // 🔹 get index from date
  const getIndexFromDate = (date) => {
    return allLabels.findIndex(l =>
      labelToDate(l).isSame(date, "day")
    );
  };

  // 🔥 APPLY FILTERS
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
    setWarehouseFilter(null);
    setDateRange([]);
    load();
  };

  // 🔹 warehouse filter
  const filteredData = warehouseFilter
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  // 🔹 strict date limits
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
  };

  // 🔹 columns
  const daywiseColumns = [
    { title: "Warehouse", dataIndex: "warehouse", fixed: "left" },
    ...labels.map(l => ({ title: l, dataIndex: l })),
    { title: "Total", dataIndex: "total" }
  ];

  const cumulativeColumns = [
    { title: "Warehouse", dataIndex: "warehouse" },
    { title: "Total Issues", dataIndex: "total" },
    { title: "Avg / Day", dataIndex: "avg" }
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2>Warehouse Daily Offtake Report</h2>

      {/* 🔥 FILTERS */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Warehouse"
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
          Apply
        </Button>

        <Button onClick={resetFilters}>
          Reset
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
        dataSource={filteredData}
        rowKey="warehouse"
        pagination={false}
        scroll={{ x: true }}
      />
    </div>
  );
}