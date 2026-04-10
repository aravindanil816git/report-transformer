import { useEffect, useState } from "react";
import { Table, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";

export default function CumulativeWarehouseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("daywise");

  const load = async () => {
    const res = await getReport(id, null, view);
    setData(res.data.data || []);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});
  };

  useEffect(() => {
    load();
  }, [view]);

  // 🔹 Daywise matrix columns (dynamic like your image)
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

  // 🔹 Cumulative summary
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
        dataSource={data}
        rowKey="warehouse"
        pagination={false}
        scroll={{ x: true }}
        size="small"
      />
    </div>
  );
}