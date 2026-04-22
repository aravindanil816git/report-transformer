import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getWarehouses, getShops } from "../../api";
import mapping from "../../data/mapping.json";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function ShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [warehouse, setWarehouse] = useState();
  const [shop, setShop] = useState();
  const [view, setView] = useState("case");

  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [shopOptions, setShopOptions] = useState([]);

  useEffect(() => {
    getWarehouses(id).then((res) => {
      setWarehouseOptions(
        (res.data || []).map((wh) => ({ value: wh, label: wh }))
      );
    });
  }, [id]);

  useEffect(() => {
    if (warehouse) {
      // Re-fetch with warehouse param for better accuracy
      fetch(
        `http://localhost:8000/shops/${id}?warehouse=${encodeURIComponent(
          warehouse
        )}`
      )
        .then((r) => r.json())
        .then((data) => setShopOptions(data));
    } else {
      setShopOptions([]);
    }
  }, [id, warehouse]);


  // ===== LOAD =====
  const load = () => {
    getReport(id, shop, view).then((res) =>
      setData(res.data.data || [])
    );
  };

  useEffect(() => {
    load();
  }, []);

  // ===== GROUP DATA =====
  const groupedData = useMemo(() => {
    const grouped = {};

    data.forEach((row) => {
      const item = row["brand"];
      if (!grouped[item]) grouped[item] = [];
      grouped[item].push(row);
    });

    return Object.entries(grouped).map(([item, rows]) => {
      const total = {};

      rows.forEach((r) => {
        Object.keys(r).forEach((k) => {
          if (typeof r[k] === "number") {
            total[k] = (total[k] || 0) + r[k];
          }
        });
      });

      return {
        key: item,
        "Item Name": item,
        ...total,
        children: rows.map((r, i) => ({
          ...r,
          key: item + "_" + i,
        })),
      };
    });
  }, [data]);

  // ===== COLUMNS =====
  const columns = [
    {
      title: "Item Name",
      dataIndex: "Item Name",
      render: (text) => <b>{text}</b>,
    },
    ...(
      data[0]
        ? Object.keys(data[0])
            .filter((k) => k !== "Item Name")
            .map((k) => ({
              title: k,
              dataIndex: k,
            }))
        : []
    ),
  ];

  // ===== DOWNLOAD =====
  const downloadExcel = () => {
    const flat = [];

    groupedData.forEach((group) => {
      flat.push({ "Item Name": group["Item Name"] });

      group.children.forEach((child) => {
        flat.push(child);
      });

      flat.push({
        "Item Name": group["Item Name"] + " Total",
        ...group,
      });
    });

    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shopwise");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), "shopwise_report.xlsx");
  };

  return (
    <>
      {/* ===== FILTER BAR ===== */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Warehouse"
            showSearch
            style={{ width: 250 }}
            options={warehouseOptions}
            onChange={(v) => {
              setWarehouse(v);
              setShop(undefined);
            }}
          />
        </Col>

        <Col>
          <Select
            placeholder="Shop"
            showSearch
            style={{ width: 300 }}
            value={shop}
            options={shopOptions}
            onChange={setShop}
            disabled={!warehouse}
          />
        </Col>

        <Col>
          <Segmented
            options={[
              { label: "Case", value: "case" },
              { label: "Bottle", value: "bottle" },
            ]}
            value={view}
            onChange={setView}
          />
        </Col>

        <Col>
          <Button onClick={load}>Apply</Button>
        </Col>

        <Col>
          <Button type="primary" onClick={downloadExcel}>
            Download
          </Button>
        </Col>
      </Row>

      {/* ===== TABLE ===== */}
      <Table
        columns={columns}
        dataSource={groupedData}
        pagination={false}
        expandable={{
          defaultExpandAllRows: false,
        }}
      />
    </>
  );
}