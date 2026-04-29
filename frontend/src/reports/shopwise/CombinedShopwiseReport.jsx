import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button, Checkbox, DatePicker } from "antd";
import { useParams } from "react-router-dom";
import { PlusSquareOutlined, MinusSquareOutlined } from "@ant-design/icons";
import { getReport, getFilters } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

export default function CombinedShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [bond, setBond] = useState();
  const [warehouse, setWarehouse] = useState();
  const [shop, setShop] = useState();
  const [view, setView] = useState("case");
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);
  const [collapsedShops, setCollapsedShops] = useState({});

  const [bondOptions, setBondOptions] = useState([]);
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [shopOptions, setShopOptions] = useState([]);
  const [filterMapping, setFilterMapping] = useState({});
  const [allShops, setAllShops] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [config, setConfig] = useState({});
  const [dateRange, setDateRange] = useState([]);

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
    let startIdx = null;
    let endIdx = null;

    if (dateRange && dateRange.length === 2) {
      const allDates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
      const sStr = dateRange[0].format("YYYY-MM-DD");
      const eStr = dateRange[1].format("YYYY-MM-DD");
      
      startIdx = allDates.findIndex(d => d >= sStr);
      if (startIdx === -1) startIdx = null;

      const endDates = allDates.filter(d => d <= eStr);
      if (endDates.length > 0) {
          endIdx = allDates.indexOf(endDates[endDates.length - 1]);
      } else {
          endIdx = null;
      }
    }

    getReport(id, shop, view, { warehouse, bond, start_idx: startIdx, end_idx: endIdx }).then((res) => {
      setData(res.data.data || []);
      setUploads(res.data.uploads || []);
      
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
    if (!uploads.length) return "";
    // For combined report, uploads have 'date' field
    const dates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
    if (!dates.length) return "";
    
    if (dateRange && dateRange.length === 2) {
        return `COMBINED PERIOD : ${dateRange[0].format("YYYY-MM-DD")} - ${dateRange[1].format("YYYY-MM-DD")}`;
    }

    return `COMBINED PERIOD : ${dates[0]} - ${dates[dates.length - 1]}`;
  }, [uploads, dateRange]);

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
      }

      // Add to grand total regardless of collapse
      Object.values(brands).flat().forEach(item => {
        grandTotal.opening += item.opening || 0;
        grandTotal.inward += item.inward || 0;
        grandTotal.outward += item.outward || 0;
        grandTotal.closing += item.closing || 0;
      });
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
        if (record.isGrandTotal) return <b>{text}</b>;
        return <span style={{ paddingLeft: 24 }}>{text}</span>;
      },
    },
    {
      title: "Sum of Shop Opening Cases",
      dataIndex: "opening",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
    {
      title: "Sum of Shop In Cases",
      dataIndex: "inward",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
    {
      title: "Sum of Shop Out Cases",
      dataIndex: "outward",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
    },
    {
      title: "Sum of Shop Closing Cases",
      dataIndex: "closing",
      className: "val-col",
      render: (v, record) => record.isSpacer || record.isShopHeader || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal ? <b>{formatVal(v)}</b> : formatVal(v)),
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
      exportData.push({ "Row Labels": shopCode });
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
    });

    exportToExcel(
      exportData,
      {
        Bond: bond,
        Warehouse: warehouse,
        Shop: shop,
        View: view,
        WholeNumbers: useWholeNumbers ? "Yes" : "No"
      },
      "combined_shopwise_report.xlsx",
      "Combined Shopwise"
    );
  };

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            style={{ width: 250 }}
          />
        </Col>

        <Col>
          <Select
            placeholder="Bond"
            allowClear
            showSearch
            style={{ width: 150 }}
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

      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
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
