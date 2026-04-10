import { useEffect, useState } from "react";
import { Table, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";

export default function CumulativeShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("daywise_opening");

  const load = async () => {
    const res = await getReport(id, null, view);
    setData(res.data.data || []);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});
  };

  useEffect(() => {
    load();
  }, [view]);

  const daywiseColumns = [
    { title: "Warehouse", dataIndex: "warehouse", fixed: "left" },
    ...labels.map((l) => ({
      title: l,
      dataIndex: l
    }))
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

      <div style={{ marginBottom: 12 }}>
        <b>Start Date:</b> {config.start_date} &nbsp;&nbsp;
        <b>Days:</b> {config.num_days}
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button onClick={() => setView("daywise_opening")}>Opening</Button>
        <Button onClick={() => setView("daywise_receipt")} style={{ marginLeft: 8 }}>Receipt</Button>
        <Button onClick={() => setView("daywise_sales")} style={{ marginLeft: 8 }}>Sales</Button>
        <Button onClick={() => setView("cumulative")} style={{ marginLeft: 8 }}>Cumulative</Button>
      </div>

      <Table
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={data}
        rowKey="warehouse"
        scroll={{ x: true }}
      />
    </div>
  );
}