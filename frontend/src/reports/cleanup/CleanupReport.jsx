import { useEffect, useState, useMemo } from "react";
import { Table, Select, Row, Col } from "antd";
import { useParams } from "react-router-dom";
import mapping from "../../data/mapping.json";

export default function CleanupReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [warehouse, setWarehouse] = useState();
  const [shop, setShop] = useState();

  // ===== LOAD DATA =====
  useEffect(() => {
    fetch(`http://localhost:8000/report/${id}`)
      .then((r) => r.json())
      .then((r) => setData(r.data || []));
  }, [id]);

  // ===== WAREHOUSE OPTIONS =====
  const warehouseOptions = Object.keys(mapping).map((w) => ({
    value: w,
    label: w,
  }));

  // ===== SHOP OPTIONS =====
  const shopOptions = useMemo(() => {
    if (!warehouse) return [];

    const shops = mapping[warehouse]?.shops || {};

    return Object.entries(shops).map(([code, s]) => ({
      value: code,
      label: `${s.shop_name} (${code})`,
    }));
  }, [warehouse]);

  // ===== FILTER =====
  const filtered = useMemo(() => {
    let rows = data;

    if (warehouse) {
      rows = rows.filter((d) => d.warehouse === warehouse);
    }

    if (shop) {
      rows = rows.filter((d) => d.shop_code === shop);
    }

    return rows;
  }, [data, warehouse, shop]);

  // ===== COLUMNS =====
  const columns = [
  {
    title: "Item Name",
    dataIndex: "Item Name",
  },
  {
    title: "Product Code",
    dataIndex: "Product Code",
  },
    {
      title: "Physical Stock",
      children: [
        { title: "Case", dataIndex: "Physical Case" },
        // { title: "Bottle", dataIndex: "Physical Bottle" },
      ],
    },
    {
      title: "Allotted Stock",
      children: [
        { title: "Case", dataIndex: "Allotted Case" },
        // { title: "Bottle", dataIndex: "Allotted Bottle" },
      ],
    },
    {
      title: "Pending Stock",
      children: [
        { title: "Case", dataIndex: "Pending Case" },
        // { title: "Bottle", dataIndex: "Pending Bottle" },
      ],
    },
    { title: "WH Price", dataIndex: "WH Price" },
    { title: "Landed Cost", dataIndex: "Landed Cost" },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {/* ===== WAREHOUSE ===== */}
        <Col>
          <Select
            placeholder="Warehouse"
            showSearch
            style={{ width: 260 }}
            options={warehouseOptions}
            onChange={(v) => {
              setWarehouse(v);
              setShop(undefined);
            }}
          />
        </Col>

        {/* ===== SHOP ===== */}
        {/* <Col>
          <Select
            placeholder="Shop"
            showSearch
            style={{ width: 300 }}
            value={shop}
            options={shopOptions}
            onChange={setShop}
            disabled={!warehouse}
          />
        </Col> */}
      </Row>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(r, i) => i}
        pagination={false}
      />
    </>
  );
}