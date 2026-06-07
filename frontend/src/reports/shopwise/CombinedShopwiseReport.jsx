import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button, Checkbox, DatePicker, message } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { PlusSquareOutlined, MinusSquareOutlined } from "@ant-design/icons";
import { getReport, getFilters } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";
import dayjs from "dayjs";
import { disabledFutureMonthDates } from "../../utils/dateUtils";

const { RangePicker } = DatePicker;

export default function CombinedShopwiseReport() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warehouse, setWarehouse] = useState();
  const [shop, setShop] = useState();
  const [bond, setBond] = useState();
  const [view, setView] = useState("case");
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);
  const [collapsedShops, setCollapsedShops] = useState({});
  
  const [filterMode, setFilterMode] = useState("bond"); // "bond" or "warehouse"

  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [shopOptions, setShopOptions] = useState([]);
  const [bondOptions, setBondOptions] = useState([]);
  const [filterMapping, setFilterMapping] = useState({});
  const [bondMapping, setBondMapping] = useState({});
  const [allShops, setAllShops] = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [config, setConfig] = useState({});
  const [dateRange, setDateRange] = useState([]);

  useEffect(() => {
    getFilters(id).then((res) => {
      const { warehouses, shops, bonds, mapping, bond_mapping } = res.data;
      const warehouseOpts = (warehouses || []).map(w => ({ value: w, label: w }));
      setAllWarehouses(warehouseOpts);
      setWarehouseOptions(warehouseOpts);

      setBondOptions((bonds || []).map(b => ({ value: b, label: b })));
      
      const formattedShops = (shops || []).map(s => ({ 
        value: s.shop_code, 
        label: `${s.shop_code} - ${s.shop_name}`,
        shopName: s.shop_name
      }));
      setAllShops(formattedShops);
      setShopOptions(formattedShops);
      setFilterMapping(mapping || {});
      setBondMapping(bond_mapping || {});
    });
  }, [id]);

  // Handle cascading logic for shops based on the filter mode
  useEffect(() => {
    let filteredShops = allShops;

    if (filterMode === 'warehouse' && warehouse) {
      const shopCodes = filterMapping[warehouse] || [];
      filteredShops = allShops.filter(s => shopCodes.includes(s.value));
    } else if (filterMode === 'bond' && bond) {
      let shopsInBond = [];
      const bondData = bondMapping[bond];
      
      if (Array.isArray(bondData)) {
        shopsInBond = bondData;
      } else if (bondData && Array.isArray(bondData.shops)) {
        // Handle both raw string arrays and resolved objects from mapping
        shopsInBond = bondData.shops.map(s => typeof s === 'object' ? s.shop_code : s);
      }
      
      const uniqueShopCodes = [...new Set(shopsInBond)];
      filteredShops = allShops.filter(s => uniqueShopCodes.includes(s.value));
    } else {
      // If no bond or warehouse is selected, show all shops
      if (filterMode === 'bond') {
        // In bond mode, if no bond is selected, show all shops from all bonds
        const allBondShops = Object.values(bondMapping).flat().flatMap(w => (filterMapping[w] || [])).flat();
        const allUniqueShopCodes = [...new Set(allBondShops)];
        filteredShops = allShops.filter(s => allUniqueShopCodes.includes(s.value));
      } else {
        filteredShops = allShops;
      }
    }
    
    setShopOptions(filteredShops);
  }, [bond, warehouse, filterMode, filterMapping, allShops, bondMapping]);


  const load = () => {
    setLoading(true);
    let startIdx = null;
    let endIdx = null;
    let sStr = null;
    let eStr = null;

    if (dateRange && Array.isArray(dateRange) && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      const allDates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
      sStr = dateRange[0].format("YYYY-MM-DD");
      eStr = dateRange[1].format("YYYY-MM-DD");
      
      startIdx = allDates.findIndex(d => d >= sStr);
      if (startIdx === -1) startIdx = null;

      const endDates = allDates.filter(d => d <= eStr);
      if (endDates.length > 0) {
          endIdx = allDates.indexOf(endDates[endDates.length - 1]);
      } else {
          endIdx = null;
      }
    }

    const params = { warehouse, bond, start_idx: startIdx, end_idx: endIdx };
    if (sStr && eStr) {
      params.start_date = sStr;
      params.end_date = eStr;
    }

    getReport(id, shop, view, params).then((res) => {
      setData(res.data.data || []);
      setUploads(res.data.uploads || []);
      setConfig(res.data.config || {});
      
      if (res.data.config?.date1 && res.data.config?.date2 && (!dateRange || dateRange.length === 0)) {
        setDateRange([dayjs(res.data.config.date1), dayjs(res.data.config.date2)]);
      }

      const initialCollapsed = {};
      const uniqueShops = [...new Set((res.data.data || []).map(r => r.shop_code))];
      uniqueShops.forEach(s => initialCollapsed[s] = true);
      setCollapsedShops(initialCollapsed);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    // 🔥 Remove dateRange from dependencies so clearing/picking a date 
    // doesn't trigger an automatic unwanted API call.
    load();
  }, []);

  const handleApply = () => {
    if (dateRange && dateRange.length > 0 && (!dateRange[0] || !dateRange[1])) {
      message.warning("Please select a complete start and end date if applying a date range");
      return;
    }
    load();
  };

  const periodLabel = useMemo(() => {
    if (!uploads.length) return "";
    const dates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
    if (!dates.length) return "";
    
    if (dateRange && dateRange.length === 2) {
        return `COMBINED PERIOD : ${dateRange[0].format("DD-MM-YYYY")} - ${dateRange[1].format("DD-MM-YYYY")}`;
    }

    return `COMBINED PERIOD : ${dayjs(dates[0]).format("DD-MM-YYYY")} - ${dayjs(dates[dates.length - 1]).format("DD-MM-YYYY")}`;
  }, [uploads, dateRange]);

  // const uploadDateLabel = useMemo(() => {
  //   const dates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
  //   if (dates.length) return `UPLOAD DATE : ${dayjs(dates[dates.length - 1]).format("DD-MM-YYYY")}`;
  //   if (config.date) return `UPLOAD DATE : ${dayjs(config.date).format("DD-MM-YYYY")}`;
  //   return "";
  // }, [uploads, config]);

  const toggleShop = (shopCode) => {
    setCollapsedShops(prev => ({
      ...prev,
      [shopCode]: !prev[shopCode]
    }));
  };

  const formatVal = (val) => {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    if (useWholeNumbers) {
      return Math.round(num);
    }
    return num.toFixed(2);
  };

  const tableData = useMemo(() => {
    const rows = [];
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
      const shopInfo = allShops.find(s => s.value === shopCode);
      const displayLabel = shopInfo?.shopName ? `${shopInfo.shopName} (${shopCode})` : shopCode;

      let shopOpening = 0, shopInward = 0, shopOutward = 0, shopClosing = 0;
      Object.values(brands).flat().forEach(item => {
        shopOpening += item.opening || 0;
        shopInward += item.inward || 0;
        shopOutward += item.outward || 0;
        shopClosing += item.closing || 0;
      });

      rows.push({
        key: `shop_${shopCode}`,
        label: displayLabel,
        shopCode: shopCode,
        isShopHeader: true,
        isCollapsed,
        opening: shopOpening,
        inward: shopInward,
        outward: shopOutward,
        closing: shopClosing
      });

      if (!isCollapsed) {
        Object.entries(brands).forEach(([brand, items]) => {
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

        const shopTotal = {
          key: `shop_total_${shopCode}`,
          label: `${displayLabel} Total`,
          opening: shopOpening,
          inward: shopInward,
          outward: shopOutward,
          closing: shopClosing,
          isShopTotal: true
        };

        rows.push(shopTotal);
        rows.push({ key: `shop_spacer_${shopCode}`, isSpacer: true });
      }

      grandTotal.opening += shopOpening;
      grandTotal.inward += shopInward;
      grandTotal.outward += shopOutward;
      grandTotal.closing += shopClosing;
    });

    if (rows.length > 0) {
      rows.push(grandTotal);
    }

    return rows;
  }, [data, collapsedShops, allShops]);

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
    { title: `Opening ${view === 'bottle' ? 'Bottles' : 'Cases'}`, dataIndex: "opening", className: "val-col", render: (v, record) => record.isSpacer || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal || record.isShopHeader ? <b>{formatVal(v)}</b> : formatVal(v)), },
    { title: `Receipt ${view === 'bottle' ? 'Bottles' : 'Cases'}`, dataIndex: "inward", className: "val-col", render: (v, record) => record.isSpacer || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal || record.isShopHeader ? <b>{formatVal(v)}</b> : formatVal(v)), },
    { title: `Sales ${view === 'bottle' ? 'Bottles' : 'Cases'}`, dataIndex: "outward", className: "val-col", render: (v, record) => record.isSpacer || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal || record.isShopHeader ? <b>{formatVal(v)}</b> : formatVal(v)), },
    { title: `Closing ${view === 'bottle' ? 'Bottles' : 'Cases'}`, dataIndex: "closing", className: "val-col", render: (v, record) => record.isSpacer || record.isBrandHeader ? null : (record.isBrandTotal || record.isGrandTotal || record.isShopTotal || record.isShopHeader ? <b>{formatVal(v)}</b> : formatVal(v)), },
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
      const shopInfo = allShops.find(s => s.value === shopCode);
      const displayLabel = shopInfo?.shopName ? `${shopInfo.shopName} (${shopCode})` : `Shop - ${shopCode}`;

      let sOpening = 0, sIn = 0, sOut = 0, sClosing = 0;
      Object.values(brands).flat().forEach(item => {
        sOpening += useWholeNumbers ? Math.round(item.opening) : item.opening;
        sIn += useWholeNumbers ? Math.round(item.inward) : item.inward;
        sOut += useWholeNumbers ? Math.round(item.outward) : item.outward;
        sClosing += useWholeNumbers ? Math.round(item.closing) : item.closing;
      });
      exportData.push({
        "Row Labels": displayLabel,
        "Opening": sOpening,
        "Receipt": sIn,
        "Sales": sOut,
        "Closing": sClosing
      });
      Object.entries(brands).forEach(([brand, items]) => {
        exportData.push({ "Row Labels": brand });
        let bOpening = 0, bIn = 0, bOut = 0, bClosing = 0;
        items.forEach(item => {
          const op = useWholeNumbers ? Math.round(item.opening) : item.opening;
          const i = useWholeNumbers ? Math.round(item.inward) : item.inward;
          const o = useWholeNumbers ? Math.round(item.outward) : item.outward;
          const c = useWholeNumbers ? Math.round(item.closing) : item.closing;
          
          exportData.push({
            "Row Labels": "  " + item.pack,
            "Opening": op,
            "Receipt": i,
            "Sales": o,
            "Closing": c
          });
          bOpening += op; bIn += i; bOut += o; bClosing += c;
        });
        exportData.push({
          "Row Labels": brand + " Total",
          "Opening": bOpening,
          "Receipt": bIn,
          "Sales": bOut,
          "Closing": bClosing
        });
      });

      exportData.push({
        "Row Labels": `${displayLabel} Total`,
        "Opening": sOpening,
        "Receipt": sIn,
        "Sales": sOut,
        "Closing": sClosing
      });
      exportData.push({});
    });

    exportToExcel(exportData, { Period: periodLabel, Bond: bond, Warehouse: warehouse, Shop: shop, View: view, "Round off": useWholeNumbers ? "Yes" : "No" }, "combined_shopwise_report.xlsx", "Combined Shopwise");
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Combined Shopwise Report</h2>
      </div>
      <div style={{ marginBottom: 16 }}>
        {/* Date Filter Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col>
            Date :
            <RangePicker value={dateRange} onChange={setDateRange} style={{ width: 250 }} disabledDate={disabledFutureMonthDates} />
          </Col>
        </Row>

        {/* Main Filters Row */}
        <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Segmented
              options={[{ label: "Filter by Bond", value: "bond" }, { label: "Filter by Warehouse", value: "warehouse" }]}
              value={filterMode}
              onChange={(value) => {
                setFilterMode(value);
                setBond(undefined);
                setWarehouse(undefined);
                setShop(undefined);
              }}
            />
          </Col>

          {filterMode === 'bond' && (
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
                  setShop(undefined); // Reset shop when bond changes
                }}
              />
            </Col>
          )}

          {filterMode === 'warehouse' && (
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
                  setShop(undefined); // Reset shop when warehouse changes
                }}
              />
            </Col>
          )}

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
              options={[{ label: "Case", value: "case" }, { label: "Bottle", value: "bottle" }]}
              value={view}
              onChange={setView}
            />
          </Col>

          <Col>
            <Button type="primary" onClick={handleApply}>Apply Filter</Button>
          </Col>
        </Row>

        {/* Download Button Row */}
        <Row gutter={[16, 16]}>
          <Col>
            <Button onClick={downloadExcel}>Download</Button>
          </Col>
        </Row>
      </div>

      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
         <Checkbox checked={useWholeNumbers} onChange={e => setUseWholeNumbers(e.target.checked)}>
            Round off
          </Checkbox>
        {/* <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{uploadDateLabel}</span> */}
      </div>
      <Table
        loading={loading}
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
        .spacer-row td { padding: 2px 0 !important; background-color: #fff !important; height: 4px; border: none !important; }
        .group-total-row td { background-color: #D6E9C6 !important; border: 1px solid #999 !important; }
        .grand-total-row td { background-color: #ADC9E6 !important; border: 1px solid #999 !important; }
        .shop-header-row td { background-color: #fff !important; border: 1px solid #999 !important; }
        .brand-header-row td { background-color: #fff !important; border: 1px solid #999 !important; }
        .data-row td { border: 1px solid #ccc !important; }
        .val-col { text-align: center !important; width: 150px; }
        .ant-table-thead > tr > th { background-color: #fff !important; border: 1px solid #999 !important; text-align: center !important; font-weight: bold !important; }
        .ant-table-small .ant-table-thead > tr > th { padding: 8px !important; }
      `}</style>
    </>
  );
}
