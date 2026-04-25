import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getFilters } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function ShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [bond, setBond] = useState();
  const [warehouse, setWarehouse] = useState();
  const [shop, setShop] = useState();
  const [view, setView] = useState("case");

  const [bondOptions, setBondOptions] = useState([]);
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [shopOptions, setShopOptions] = useState([]);
  const [filterMapping, setFilterMapping] = useState({});
  const [allShops, setAllShops] = useState([]);

  useEffect(() => {
    getFilters(id).then((res) => {
      const { bonds, warehouses, shops, mapping } = res.data;
      setBondOptions((bonds || []).map(b => ({ value: b, label: b })));
      setWarehouseOptions((warehouses || []).map(w => ({ value: w, label: w })));
      const formattedShops = (shops || []).map(s => ({ 
        value: s.shop_code, 
        label: `${s.shop_code} - ${s.shop_name}` 
      }));
      setAllShops(formattedShops);
      setShopOptions(formattedShops);
      setFilterMapping(mapping || {});
    });
  }, [id]);

  // Handle cascading logic
  useEffect(() => {
    let filteredWarehouses = [];
    let filteredShops = [];

    if (bond) {
      const whs = Object.keys(filterMapping[bond] || {});
      filteredWarehouses = whs.map(w => ({ value: w, label: w }));
      
      if (warehouse) {
        const shopCodes = filterMapping[bond][warehouse] || [];
        filteredShops = allShops.filter(s => shopCodes.includes(s.value));
      } else {
        const allShopCodes = Object.values(filterMapping[bond]).flat();
        filteredShops = allShops.filter(s => allShopCodes.includes(s.value));
      }
    } else {
      filteredWarehouses = Object.keys(
        Object.values(filterMapping).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      ).map(w => ({ value: w, label: w }));
      
      if (warehouse) {
        const shopCodes = [];
        Object.values(filterMapping).forEach(whMap => {
          if (whMap[warehouse]) shopCodes.push(...whMap[warehouse]);
        });
        filteredShops = allShops.filter(s => shopCodes.includes(s.value));
      } else {
        filteredShops = allShops;
      }
    }

    setWarehouseOptions(filteredWarehouses);
    setShopOptions(filteredShops);
  }, [bond, warehouse, filterMapping, allShops]);

  const load = () => {
    getReport(id, shop, view, { warehouse, bond }).then((res) =>
      setData(res.data.data || [])
    );
  };

  useEffect(() => {
    load();
  }, []);

  // ===== FLAT DATA WITH TOTALS =====
  const tableData = useMemo(() => {
    const rows = [];
    const grouped = {};

    data.forEach((row) => {
      const brand = row["brand"];
      if (!grouped[brand]) grouped[brand] = [];
      grouped[brand].push(row);
    });

    const grandTotal = {
      key: "grand-total",
      brand: "GRAND TOTAL",
      pack: "",
      opening: 0,
      inward: 0,
      outward: 0,
      closing: 0,
      isTotal: true
    };

    Object.entries(grouped).forEach(([brand, items]) => {
      const groupTotal = {
        key: brand + "_total",
        brand: brand + " TOTAL",
        pack: "",
        opening: 0,
        inward: 0,
        outward: 0,
        closing: 0,
        isTotal: true
      };

      items.forEach((item, i) => {
        const row = {
          ...item,
          key: brand + "_" + i,
        };
        rows.push(row);

        groupTotal.opening += item.opening || 0;
        groupTotal.inward += item.inward || 0;
        groupTotal.outward += item.outward || 0;
        groupTotal.closing += item.closing || 0;

        grandTotal.opening += item.opening || 0;
        grandTotal.inward += item.inward || 0;
        grandTotal.outward += item.outward || 0;
        grandTotal.closing += item.closing || 0;
      });

      rows.push(groupTotal);
      rows.push({ key: brand + "_spacer", isSpacer: true });
    });

    if (rows.length > 0) {
      rows.push(grandTotal);
    }

    return rows;
  }, [data]);

  const columns = [
    {
      title: "Item Name",
      dataIndex: "brand",
      render: (text, record) => {
        if (record.isSpacer) return null;
        return record.isTotal ? <b>{text}</b> : text;
      },
    },
    {
      title: "Pack",
      dataIndex: "pack",
    },
    {
      title: "Opening",
      dataIndex: "opening",
      render: (v, record) => record.isSpacer ? null : (record.isTotal ? <b>{v}</b> : v),
    },
    {
      title: "Inward",
      dataIndex: "inward",
      render: (v, record) => record.isSpacer ? null : (record.isTotal ? <b>{v}</b> : v),
    },
    {
      title: "Outward",
      dataIndex: "outward",
      render: (v, record) => record.isSpacer ? null : (record.isTotal ? <b>{v}</b> : v),
    },
    {
      title: "Closing",
      dataIndex: "closing",
      render: (v, record) => record.isSpacer ? null : (record.isTotal ? <b>{v}</b> : v),
    },
  ];

  const downloadExcel = () => {
    const exportData = tableData
      .filter(r => !r.isSpacer)
      .map(r => ({
        "Item Name": r.brand,
        "Pack": r.pack,
        "Opening": r.opening,
        "Inward": r.inward,
        "Outward": r.outward,
        "Closing": r.closing
      }));

    exportToExcel(
      exportData,
      {
        Bond: bond,
        Warehouse: warehouse,
        Shop: shop,
        View: view,
      },
      "daily_shopwise_report.xlsx",
      "Daily Shopwise"
    );
  };

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Bond"
            allowClear
            showSearch
            style={{ width: 180 }}
            options={bondOptions}
            value={bond}
            onChange={(v) => {
              setBond(v);
              setWarehouse(undefined);
              setShop(undefined);
            }}
          />
        </Col>

        <Col>
          <Select
            placeholder="Warehouse"
            allowClear
            showSearch
            style={{ width: 250 }}
            options={warehouseOptions}
            value={warehouse}
            onChange={(v) => {
              setWarehouse(v);
              setShop(undefined);
            }}
          />
        </Col>

        <Col>
          <Select
            placeholder="Shop"
            allowClear
            showSearch
            style={{ width: 300 }}
            value={shop}
            options={shopOptions}
            onChange={setShop}
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
          <Button type="primary" onClick={load}>Apply</Button>
        </Col>

        <Col>
          <Button onClick={downloadExcel}>
            Download
          </Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={tableData}
        pagination={false}
        rowClassName={(record) => {
          if (record.isSpacer) return "spacer-row";
          if (record.brand === "GRAND TOTAL") return "grand-total-row";
          if (record.isTotal) return "group-total-row";
          return "";
        }}
      />
      <style>{`
        .spacer-row td {
          padding: 4px 0 !important;
          background-color: #f5f5f5 !important;
          height: 8px;
        }
        .group-total-row {
          background-color: #fafafa;
        }
        .grand-total-row {
          background-color: #e6f7ff;
        }
      `}</style>
    </>
  );
}
