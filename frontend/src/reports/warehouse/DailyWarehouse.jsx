import { useEffect, useState } from "react";
import { Table, Select, Button, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function CleanupReport() {
  const { id } = useParams();

  const [report, setReport] = useState(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [data, setData] = useState([]);

  // ✅ ALWAYS RUN
  useEffect(() => {
    getReport(id).then((res) => {
      setReport(res.data || {});
    });
  }, [id]);

  // ✅ ALWAYS RUN
  useEffect(() => {
    if (!report || !selectedWarehouse) {
      setData([]);
      return;
    }

    const found = (report.data || []).find(
      (d) => d.warehouse === selectedWarehouse
    );

    setData(found?.items || []);
  }, [selectedWarehouse, report]);

  const warehouses =
    report?.uploads?.map((u) => u.warehouse) || [];

  const columns = [
    {
      title: "Item Name",
      dataIndex: "item_name",
    },
    {
      title: "Product Code",
      dataIndex: "product_code",
    },
    {
      title: "Physical Stock",
      children: [{ title: "Case", dataIndex: "physical" }],
    },
    {
      title: "Allotted Stock",
      children: [{ title: "Case", dataIndex: "allotted" }],
    },
    {
      title: "Pending Stock",
      children: [{ title: "Case", dataIndex: "pending" }],
    },
    {
      title: "WH Price",
      dataIndex: "wh_price",
    },
    {
      title: "Landed Cost",
      dataIndex: "landed_cost",
    },
  ];

  // ✅ DOWNLOAD
  const downloadExcel = () => {
    if (!selectedWarehouse) return;

    const exportData = data.map(item => ({
      "Item Name": item.item_name,
      "Product Code": item.product_code,
      "Physical Stock (Case)": item.physical,
      "Allotted Stock (Case)": item.allotted,
      "Pending Stock (Case)": item.pending,
      "WH Price": item.wh_price,
      "Landed Cost": item.landed_cost
    }));

    exportToExcel(
      exportData,
      {
        Warehouse: selectedWarehouse
      },
      `daily_warehouse_report_${selectedWarehouse}.xlsx`,
      "Daily Warehouse"
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2>Daily Warehouse Report</h2>
        <Space>
          <Select
            placeholder="Select Warehouse"
            style={{ width: 300 }}
            onChange={setSelectedWarehouse}
            options={warehouses.map((w) => ({
              label: w,
              value: w,
            }))}
          />
          <Button type="primary" onClick={downloadExcel} disabled={!selectedWarehouse}>
            Download Excel
          </Button>
        </Space>
      </div>

      {/* 🔥 Table */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey={(r) => r.product_code}
        pagination={false}
      />
    </div>
  );
}