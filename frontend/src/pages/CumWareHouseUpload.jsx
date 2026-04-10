import { useEffect, useState } from "react";
import { Table, Button, Select } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";

export default function CumulativeWarehouseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("daywise");
  const [warehouseFilter, setWarehouseFilter] = useState(null);

  const load = async () => {
    const res = await getReport(id, null, view);
    setData(res.data.data || []);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});
  };

  useEffect(() => {
    load();
  }, [view]);

  const filteredData = warehouseFilter
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  const daywiseColumns = [
    {
      title: "Warehouse",
      dataIndex: "warehouse",
      fixed: "left",
      width: 180
    },
    ...labels.map((label) => ({
      title: label,
      dataIndex: label,
      align: "center",
      width: 100
    }))
  ];

  const cumulativeColumns = [
    { title: "Warehouse", dataIndex: "warehouse" },
    { title: "Total Issues", dataIndex: "total" },
    { title: "Avg / Day", dataIndex: "avg" }
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2>Warehouse Daily Offtake Report</h2>

      <div style={{ marginBottom: 12 }}>
        <b>Start Date:</b> {config.start_date} &nbsp;&nbsp;
        <b>Days:</b> {config.num_days}
      </div>

      {/* ✅ Warehouse Filter */}
      <Select
        placeholder="Filter Warehouse"
        style={{ width: 300, marginBottom: 16 }}
        onChange={(val) => setWarehouseFilter(val)}
        allowClear
      >
        {uniqueWarehouses.map(w => (
          <Select.Option key={w} value={w}>{w}</Select.Option>
        ))}
      </Select>

      <div style={{ marginBottom: 16 }}>
        <Button onClick={() => setView("daywise")}>Daywise</Button>
        <Button
          onClick={() => setView("cumulative")}
          style={{ marginLeft: 8 }}
        >
          Cumulative
        </Button>
      </div>

      <Table
        bordered
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={filteredData}
        rowKey="warehouse"
        pagination={false}
        scroll={{ x: true }}
        size="small"
      />
    </div>
  );
}