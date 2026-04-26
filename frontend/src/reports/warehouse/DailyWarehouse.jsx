import { useEffect, useState } from "react";
import { Table, Select, Button, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function CleanupReport() {
  const { id } = useParams();

  const [report, setReport] = useState(null);
  const [selectedBond, setSelectedBond] = useState("all");
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [selectedPack, setSelectedPack] = useState("all");
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

    let items = found?.items || [];

    if (selectedPack !== "all") {
      items = items.filter(item => item.pack === selectedPack);
    }

    setData(items);
  }, [selectedWarehouse, selectedPack, report]);

  const bonds = Array.from(new Set(
    (report?.uploads || []).map(u => u.bond).filter(Boolean)
  )).sort();

  const warehouses = (report?.uploads || [])
    .filter(u => selectedBond === "all" || u.bond === selectedBond)
    .map((u) => u.warehouse);

  // Clear selected warehouse if it's no longer in the filtered list
  useEffect(() => {
    if (selectedWarehouse && !warehouses.includes(selectedWarehouse)) {
      setSelectedWarehouse(null);
    }
  }, [selectedBond]);

  const packs = Array.from(new Set(
    (report?.data?.find(d => d.warehouse === selectedWarehouse)?.items || [])
      .map(item => item.pack)
      .filter(Boolean)
  )).sort();

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
      title: "Pack",
      dataIndex: "pack",
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
      "Pack": item.pack,
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
            placeholder="Select Bond"
            style={{ width: 180 }}
            value={selectedBond}
            onChange={setSelectedBond}
            options={[
              { label: "All Bonds", value: "all" },
              ...bonds.map(b => ({ label: b, value: b }))
            ]}
          />
          <Select
            placeholder="Select Warehouse"
            style={{ width: 250 }}
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            options={warehouses.map((w) => ({
              label: w,
              value: w,
            }))}
          />
          <Select
            placeholder="Select Pack"
            style={{ width: 150 }}
            value={selectedPack}
            onChange={setSelectedPack}
            options={[
              { label: "All Packs", value: "all" },
              ...packs.map(p => ({ label: p, value: p }))
            ]}
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
        summary={(pageData) => {
          let totalPhysical = 0;
          let totalAllotted = 0;
          let totalPending = 0;
          let totalWHPrice = 0;
          let totalLandedCost = 0;

          pageData.forEach(({ physical, allotted, pending, wh_price, landed_cost }) => {
            totalPhysical += Number(physical || 0);
            totalAllotted += Number(allotted || 0);
            totalPending += Number(pending || 0);
            totalWHPrice += Number(wh_price || 0);
            totalLandedCost += Number(landed_cost || 0);
          });

          return (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ backgroundColor: "#fafafa", fontWeight: "bold" }}>
                <Table.Summary.Cell index={0} colSpan={3}>GRAND TOTAL</Table.Summary.Cell>
                <Table.Summary.Cell index={1}>{totalPhysical}</Table.Summary.Cell>
                <Table.Summary.Cell index={2}>{totalAllotted}</Table.Summary.Cell>
                <Table.Summary.Cell index={3}>{totalPending}</Table.Summary.Cell>
                <Table.Summary.Cell index={4}>{totalWHPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Table.Summary.Cell>
                <Table.Summary.Cell index={5}>{totalLandedCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
    </div>
  );
}
