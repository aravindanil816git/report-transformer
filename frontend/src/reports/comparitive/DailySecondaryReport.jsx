import { useEffect, useState, useMemo } from "react";
import { Table, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function DailySecondaryReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    getReport(id).then(res => {
      setData(res.data.data || []);
      setUploads(res.data.uploads || []);
      setConfig(res.data.config || {});
    });
  }, [id]);

  const periodLabel = useMemo(() => {
    const froms = uploads.map(u => u.from).filter(Boolean);
    const tos = uploads.map(u => u.to).filter(Boolean);
    
    if (froms.length && tos.length) {
      return `PERIOD : ${froms[0]} - ${tos[0]}`;
    }
    
    if (config.date) {
      return `PERIOD : ${config.date} - ${config.date}`;
    }
    
    return "";
  }, [uploads, config]);

  const uploadDateLabel = useMemo(() => {
    const dates = uploads.map(u => u.from).filter(Boolean);
    if (dates.length) return `UPLOAD DATE : ${dates[0]}`;
    if (config.date) return `UPLOAD DATE : ${config.date}`;
    return "";
  }, [uploads, config]);

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
      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{uploadDateLabel}</span>
      </div>
      <Table columns={columns} dataSource={data} rowKey="warehouse" />
    </div>
  );
}