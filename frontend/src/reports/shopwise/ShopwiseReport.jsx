import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button, Checkbox } from "antd";
import { useParams } from "react-router-dom";
import { PlusSquareOutlined, MinusSquareOutlined } from "@ant-design/icons";
import { getReport, getFilters } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function ShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [warehouse, setWarehouse] = useState();
  const [shop, setShop] = useState();
  const [view, setView] = useState("case");
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);
  const [collapsedShops, setCollapsedShops] = useState({});

  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [shopOptions, setShopOptions] = useState([]);
  const [filterMapping, setFilterMapping] = useState({});
  const [allShops, setAllShops] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    getFilters(id).then((res) => {
      const { warehouses, shops, mapping } = res.data;
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
    let filteredShops = [];

    if (warehouse) {
      const shopCodes = filterMapping[warehouse] || [];
      filteredShops = allShops.filter(s => shopCodes.includes(s.value));
    } else {
      filteredShops = allShops;
    }

    setShopOptions(filteredShops);
  }, [warehouse, filterMapping, allShops]);

  const load = () => {
    getReport(id, shop, view, { warehouse }).then((res) => {
      setData(res.data.data || []);
      setUploads(res.data.uploads || []);
      setConfig(res.data.config || {});
      
      // Reset collapsed state on load - all shops collapsed by default
      const initialCollapsed = {};
      const uniqueShops = [...new Set((res.data.data || []).map(r => r.shop_code))];
      uniqueShops.forEach(s => initialCollapsed[s] = true);
      setCollapsedShops(initialCollapsed);
    });
  };

  useEffect(() => {
    load();
  }, []);

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

  const toggleShop = (shopCode) => {
    setCollapsedShops(prev => ({
      ...prev,
      [shopCode]: !prev[shopCode]
    }));
  };

  // Helper to format numbers based on whole number toggle
  const formatVal = (val) => {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    if (useWholeNumbers) {
      return Math.floor(num);
    }
    return num.toFixed(2);
  };

  // ===== HIERARCHICAL DATA WITH TOTALS =====
  const tableData = useMemo(() => {
    const rows = [];
    
    // Group by Shop -> Brand
    const shopGrouped = {};
    data.forEach((row) => {
      const shopCode = row["shop_code"];
      const brand = row["brand"];
      if (!shopGrouped[shopCode]) shopGrouped[shopCode] = {};
      if (!shopGrouped[shopCode][brand]) shopGrouped[shopCode][brand] = [];
      shopGrouped[shopCode][brand].push(row);
    });

    const grandTotal = {
      key: "grand-total",
      label: "GRAND TOTAL",
      opening: 0,
      inward: 0,
      outward: 0,
      closing: 0,
      isGrandTotal: true
    };

    Object.entries(shopGrouped).forEach(([shopCode, brands]) => {
      const isCollapsed = collapsedShops[shopCode];

      // Shop Header Row
      rows.push({
        key: `shop_${shopCode}`,
        label: shopCode,
        shopCode: shopCode,
        isShopHeader: true,
        isCollapsed
      });

      if (!isCollapsed) {
      Object.entries(brands).forEach(([brand, items]) => {
        // Brand Header Row
        rows.push({
          key: `brand_${shopCode}_${brand}`,
          label: brand,
          isBrandHeader: true
        });

        const brandTotal = {
          key: `total_${shopCode}_${brand}`,
          label: `${brand} Total`,
          opening: 0,
          inward: 0,
          outward: 0,
          closing: 0,
          isBrandTotal: true
        };

        items.forEach((item, i) => {
          const row = {
            ...item,
            key: `item_${shopCode}_${brand}_${i}`,
            label: item.pack
          };
          rows.push(row);

          brandTotal.opening += item.opening || 0;
          brandTotal.inward += item.inward || 0;
          brandTotal.outward += item.outward || 0;
          brandTotal.closing += item.closing || 0;
        });

        rows.push(brandTotal);
        rows.push({ key: `spacer_${shopCode}_${brand}`, isSpacer: true });
      });

      // Shop Total Row
      const shopTotal = {
        key: `shop_total_${shopCode}`,
        label: `Shop ${shopCode} Total`,
        opening: 0,
        inward: 0,
        outward: 0,
        closing: 0,
        isShopTotal: true
      };

      Object.values(brands).flat().forEach(item => {
        shopTotal.opening += item.opening || 0;
        shopTotal.inward += item.inward || 0;
        shopTotal.outward += item.outward || 0;
        shopTotal.closing += item.closing || 0;

        // Add to grand total regardless of collapse
        grandTotal.opening += item.opening || 0;
        grandTotal.inward += item.inward || 0;
        grandTotal.outward += item.outward || 0;
        grandTotal.closing += item.closing || 0;
      });

      rows.push(shopTotal);
      rows.push({ key: `shop_spacer_${shopCode}`, isSpacer: true });
    } else {
      // Add to grand total even if collapsed
      Object.values(brands).flat().forEach(item => {
        grandTotal.opening += item.opening || 0;
        grandTotal.inward += item.inward || 0;
        grandTotal.outward += item.outward || 0;
        grandTotal.closing += item.closing || 0;
      });
    }
  });

    if (rows.length > 0) {
      rows.push(grandTotal);
    }

    return rows;
  }, [data, collapsedShops]);

  const columns = [
    {
      title: "Row Labels",
      dataIndex: "label",
      render: (text, record) => {
        if (record.isSpacer) return null;
        if (record.isShopHeader) {
          const Icon = record.isCollapsed ? PlusSquareOutlined : MinusSquareOutlined;
          return (
            <div onClick={() => toggleShop(record.shopCode)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon style={{ color: '#888' }} />
              <b style={{ color: "#a52a2a" }}>{text}</b>
            </div>
          );
        }
        if (record.isBrandHeader) return <span>{text}</span>;
        if (record.isBrandTotal) return <b>{text}</b>;
        if (record.isShopTotal) return <b style={{ color: "#a52a2a" }}>{text}</b>;
        if (record.isGrandTotal) return <b>{text}</b>;
        return <span style={{ paddingLeft: 24 }}>{text}</span>;
      },
    },
    {
      title: "Sum of Shop Opening Cases",
      dataIndex: "opening",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
    {
      title: "Sum of Shop In Cases",
      dataIndex: "inward",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
    {
      title: "Sum of Shop Out Cases",
      dataIndex: "outward",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
    {
      title: "Sum of Shop Closing Cases",
      dataIndex: "closing",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
  ];

  const downloadExcel = () => {
    const exportData = [];
    const shopGrouped = {};
    data.forEach((row) => {
      const shopCode = row["shop_code"];
      const brand = row["brand"];
      if (!shopGrouped[shopCode]) shopGrouped[shopCode] = {};
      if (!shopGrouped[shopCode][brand]) shopGrouped[shopCode][brand] = [];
      shopGrouped[shopCode][brand].push(row);
    });

    Object.entries(shopGrouped).forEach(([shopCode, brands]) => {
      exportData.push({ "Row Labels": "Shop - " + shopCode });
      Object.entries(brands).forEach(([brand, items]) => {
        exportData.push({ "Row Labels": brand });
        let bOpening = 0, bIn = 0, bOut = 0, bClosing = 0;
        items.forEach(item => {
          const op = useWholeNumbers ? Math.floor(item.opening) : item.opening;
          const i = useWholeNumbers ? Math.floor(item.inward) : item.inward;
          const o = useWholeNumbers ? Math.floor(item.outward) : item.outward;
          const c = useWholeNumbers ? Math.floor(item.closing) : item.closing;
          
          exportData.push({
            "Row Labels": "  " + item.pack,
            "Sum of Shop Opening Cases": op,
            "Sum of Shop In Cases": i,
            "Sum of Shop Out Cases": o,
            "Sum of Shop Closing Cases": c
          });
          bOpening += op; bIn += i; bOut += o; bClosing += c;
        });
        exportData.push({
          "Row Labels": brand + " Total",
          "Sum of Shop Opening Cases": bOpening,
          "Sum of Shop In Cases": bIn,
          "Sum of Shop Out Cases": bOut,
          "Sum of Shop Closing Cases": bClosing
        });
      });

      // Shop Total in Excel
      let sOpening = 0, sIn = 0, sOut = 0, sClosing = 0;
      Object.values(brands).flat().forEach(item => {
        sOpening += useWholeNumbers ? Math.floor(item.opening) : item.opening;
        sIn += useWholeNumbers ? Math.floor(item.inward) : item.inward;
        sOut += useWholeNumbers ? Math.floor(item.outward) : item.outward;
        sClosing += useWholeNumbers ? Math.floor(item.closing) : item.closing;
      });
      exportData.push({
        "Row Labels": `Shop ${shopCode} Total`,
        "Sum of Shop Opening Cases": sOpening,
        "Sum of Shop In Cases": sIn,
        "Sum of Shop Out Cases": sOut,
        "Sum of Shop Closing Cases": sClosing
      });
      exportData.push({}); // Spacer row
    });

    exportToExcel(
      exportData,
      {
        "Upload Date": uploadDateLabel.replace("UPLOAD DATE : ", ""),
        Period: periodLabel,
        Warehouse: warehouse,
        Shop: shop,
        View: view,
        WholeNumbers: useWholeNumbers ? "Yes" : "No"
      },
      "daily_shopwise_report.xlsx",
      "Daily Shopwise"
    );
  };

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <Select
            placeholder="Warehouse"
            allowClear
            showSearch
            style={{ width: 220 }}
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
            style={{ width: 280 }}
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
          <Checkbox 
            checked={useWholeNumbers} 
            onChange={e => setUseWholeNumbers(e.target.checked)}
          >
            Whole Numbers
          </Checkbox>
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

      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{uploadDateLabel}</span>
      </div>
      <Table
        columns={columns}
        dataSource={tableData}
        pagination={false}
        bordered
        size="small"
        rowClassName={(record) => {
          if (record.isSpacer) return "spacer-row";
          if (record.isGrandTotal) return "grand-total-row";
          if (record.isBrandTotal) return "group-total-row";
          if (record.isShopHeader) return "shop-header-row";
          if (record.isBrandHeader) return "brand-header-row";
          return "data-row";
        }}
      />
      <style>{`
        .spacer-row td {
          padding: 2px 0 !important;
          background-color: #fff !important;
          height: 4px;
          border: none !important;
        }
        .group-total-row td {
          background-color: #D6E9C6 !important;
          border: 1px solid #999 !important;
        }
        .grand-total-row td {
          background-color: #ADC9E6 !important;
          border: 1px solid #999 !important;
        }
        .shop-header-row td {
          background-color: #fff !important;
          border: 1px solid #999 !important;
        }
        .brand-header-row td {
          background-color: #fff !important;
          border: 1px solid #999 !important;
        }
        .data-row td {
          border: 1px solid #ccc !important;
        }
        .val-col {
          text-align: right !important;
          width: 150px;
        }
        .ant-table-thead > tr > th {
          background-color: #fff !important;
          border: 1px solid #999 !important;
          text-align: center !important;
          font-weight: bold !important;
        }
        .ant-table-small .ant-table-thead > tr > th {
           padding: 8px !important;
        }
      `}</style>
    </>
  );
}
