import { useEffect, useState, useMemo } from "react";
import { Table, Select, Row, Col, Button, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getWarehouses, getShops } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function CleanupReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [warehouse, setWarehouse] = useState();
  const [warehouseOptions, setWarehouseOptions] = useState([]);

  // ===== LOAD DATA =====
  useEffect(() => {
    getReport(id).then((res) => {
      setData(res.data.data || []);
    });
    
    getWarehouses(id).then(res => {
      setWarehouseOptions((res.data || []).map(wh => ({ value: wh, label: wh })));
    });
  }, [id]);

  // ===== FLATTEN DATA =====
  const flattened = useMemo(() => {
    return data.flatMap((w) =>
      (w.items || []).map((item) => ({
        ...item,
        warehouse_name: w.warehouse,
      }))
    );
  }, [data]);

  // ===== FILTER =====
  const filtered = useMemo(() => {
    if (!warehouse) return flattened;

    return flattened.filter((d) => {
      const dw = (d.warehouse_name || "").toUpperCase();
      const fw = warehouse.toUpperCase();
      return dw.includes(fw) || fw.includes(dw);
    });
  }, [flattened, warehouse]);

  // ===== COLUMNS =====
  const columns = [
    {
      title: "Warehouse",
      dataIndex: "warehouse_name",
      width: 150,
    },
    {
      title: "Item Name",
      dataIndex: "item_name",
      sorter: (a, b) => a.item_name.localeCompare(b.item_name),
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
      render: (v) => v?.toLocaleString(undefined, { minimumFractionDigits: 2 })
    },
    { 
      title: "Landed Cost", 
      dataIndex: "landed_cost",
      render: (v) => v?.toLocaleString(undefined, { minimumFractionDigits: 2 })
    },
  ];

  // ===== DOWNLOAD =====
  const downloadExcel = () => {
    const exportData = filtered.map(item => ({
      Warehouse: item.warehouse_name,
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
        Warehouse: warehouse || "All"
      },
      "cleanup_report.xlsx",
      "Cleanup Report"
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <Select
            placeholder="Select Warehouse"
            showSearch
            allowClear
            style={{ width: 300 }}
            options={warehouseOptions}
            value={warehouse}
            onChange={setWarehouse}
          />
        </Col>
        <Col>
          <Button type="primary" onClick={downloadExcel}>
            Download Excel
          </Button>
        </Col>
      </Row>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(r, i) => `${r.product_code}_${i}`}
        pagination={false}
        size="small"
        bordered
      />
    </div>
  );
}
