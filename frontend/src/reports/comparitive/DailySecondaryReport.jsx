import { useEffect, useState } from "react";
import { Table, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function DailySecondaryReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);

  useEffect(() => {
    getReport(id).then(res => {
      setData(res.data.data || []);
    });
  }, [id]);

  const columns = [
    { title: "Warehouse", dataIndex: "warehouse" },
    { title: "STN", dataIndex: "STN" },
    { title: "GTN", dataIndex: "GTN" },
    { title: "TOTAL", dataIndex: "TOTAL" },
    { title: "CFED", dataIndex: "CFED" },
    { title: "BAR", dataIndex: "BAR" },
  ];

  // ✅ DOWNLOAD
  const downloadExcel = () => {
    exportToExcel(
      data,
      {},
      "daily_secondary_sales_report.xlsx",
      "Daily Secondary Sales"
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Daily Secondary Sales Report</h2>
        <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="warehouse" />
    </div>
  );
}