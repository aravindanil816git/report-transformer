import { useEffect, useState, useMemo } from "react";
import { Table, Button, Space, message } from "antd";
import dayjs from "dayjs";
import { useParams } from "react-router-dom";
import { getReport, processReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function DailySecondaryReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [config, setConfig] = useState({});

  const load = () => {
    getReport(id).then(res => {
      setData(res.data.data || []);
      setUploads(res.data.uploads || []);
      setConfig(res.data.config || {});
    });
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleRefresh = async () => {
    try {
      const hide = message.loading("Refreshing report data...", 0);
      await processReport(id);
      hide();
      message.success("Report refreshed successfully!");
      load();
    } catch (error) {
      message.error("Failed to refresh report");
    }
  };

  const periodLabel = useMemo(() => {
    if (config.date1 && config.date2) {
      return `PERIOD : ${dayjs(config.date1).format('DD-MMM-YYYY')} to ${dayjs(config.date2).format('DD-MMM-YYYY')}`;
    }

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
    if (config.date1 && config.date2) {
      return `UPLOAD DATES : ${dayjs(config.date1).format('DD-MMM-YYYY')} & ${dayjs(config.date2).format('DD-MMM-YYYY')}`;
    }

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
      "item_issue_consolidation.xlsx",
      "Item Issue Consolidation"
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Item Issue Consolidation Report</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
        </Space>
      </div>
      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{uploadDateLabel}</span>
      </div>
      <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="warehouse" 
        scroll={{ y: 'calc(100vh - 220px)' }}
        pagination={false}
        size="small"
        bordered
      />
    </div>
  );
}