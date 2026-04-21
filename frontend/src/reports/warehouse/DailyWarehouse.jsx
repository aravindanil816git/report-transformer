import { useEffect, useState } from "react";
import { Table, Select } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";

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

  return (
    <div>
      {/* 🔥 Warehouse dropdown */}
      <Select
        placeholder="Select Warehouse"
        style={{ width: 300, marginBottom: 20 }}
        onChange={setSelectedWarehouse}
        options={warehouses.map((w) => ({
          label: w,
          value: w,
        }))}
      />

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