import { useEffect, useState } from "react";
import { Table, Button, Space, message } from "antd";
import { useParams } from "react-router-dom";
import { getReport, processReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";
import dayjs from "dayjs";

export default function MonthlyStockSales() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [config, setConfig] = useState({});

  const loadData = () => {
    getReport(id).then((res) => {
      setData(res.data.data || []);
      setConfig(res.data.config || {});
    });
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const formatName = (name) => {
    if (name && typeof name === "string") {
      return name.replace(/^WH-/i, "").trim();
    }
    return name;
  };

  const totals = data.reduce(
    (acc, d) => {
      acc.op += d.op || 0;
      acc.inward += d.inward || 0;
      acc.total += d.total || 0;
      acc.sales += d.sales || 0;
      acc.cl += d.cl || 0;
      return acc;
    },
    { op: 0, inward: 0, total: 0, sales: 0, cl: 0 }
  );

  const columns = [
    { title: "ITEM", dataIndex: "warehouse", render: (text) => formatName(text) },
    { title: "OP STOCK", dataIndex: "op" },
    { title: "INWARD", dataIndex: "inward" },
    { title: "TOTAL", dataIndex: "total" },
    { title: "SALES", dataIndex: "sales" },
    { title: "CL STOCK", dataIndex: "cl" },
  ];

  // ✅ DOWNLOAD
  const downloadExcel = () => {
    const exportData = data.map(d => ({
      ITEM: formatName(d.warehouse),
      "OP STOCK": d.op,
      "INWARD": d.inward,
      "TOTAL": d.total,
      "SALES": d.sales,
      "CL STOCK": d.cl
    }));

    // Add total row
    exportData.push({
      ITEM: "Grand Total",
      "OP STOCK": totals.op,
      "INWARD": totals.inward,
      "TOTAL": totals.total,
      "SALES": totals.sales,
      "CL STOCK": totals.cl
    });

    const monthStr = config.month ? dayjs(config.month).format("MMM YYYY") : "";
    exportToExcel(
      exportData,
      monthStr ? { "Month": monthStr } : {},
      `monthly_stock_sales_${config.month || "report"}.xlsx`,
      monthStr ? `Monthly Stock Sales - ${monthStr}` : "Monthly Stock Sales"
    );
  };

  // ✅ REFRESH DATA
  const handleRefresh = async () => {
    try {
      const hide = message.loading("Refreshing report data...", 0);
      await processReport(id);
      hide();
      message.success("Report refreshed successfully!");
      loadData();
    } catch (error) {
      message.error("Failed to refresh report");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Monthly Stock Sales Report {config.month ? `- ${dayjs(config.month).format("MMM YYYY")}` : ""}</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="warehouse"
        pagination={false}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell>Grand Total</Table.Summary.Cell>
            <Table.Summary.Cell>{totals.op}</Table.Summary.Cell>
            <Table.Summary.Cell>{totals.inward}</Table.Summary.Cell>
            <Table.Summary.Cell>{totals.total}</Table.Summary.Cell>
            <Table.Summary.Cell>{totals.sales}</Table.Summary.Cell>
            <Table.Summary.Cell>{totals.cl}</Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
}