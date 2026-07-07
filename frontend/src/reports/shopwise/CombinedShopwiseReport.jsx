import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button, Checkbox, DatePicker, message } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { PlusSquareOutlined, MinusSquareOutlined } from "@ant-design/icons";
import { getReport, getFilters, getJson } from "../../api";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportShopDrilldownPdfByBond } from "../../utils/exportUtils";
import dayjs from "dayjs";
import { disabledFutureMonthDates } from "../../utils/dateUtils";
import DownloadDropdown from "../../components/DownloadDropdown";

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
  const [shopcodeMapping, setShopcodeMapping] = useState({});

  useEffect(() => {
    getJson("shopcode_mapping")
      .then((res) => {
        setShopcodeMapping(res.data || {});
      })
      .catch((err) => {
        console.error("Failed to load shopcode mapping:", err);
      });
  }, []);

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


  const load = (d1 = null, d2 = null) => {
    setLoading(true);
    let startIdx = null;
    let endIdx = null;
    let sStr = d1;
    let eStr = d2;

    if (!sStr && !eStr && dateRange && Array.isArray(dateRange) && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      sStr = dateRange[0].format("YYYY-MM-DD");
      eStr = dateRange[1].format("YYYY-MM-DD");
    }

    if (sStr && eStr) {
      const allDates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
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

      const initialCollapsed = {};
      const uniqueShops = [...new Set((res.data.data || []).map(r => r.shop_code))];
      uniqueShops.forEach(s => initialCollapsed[s] = true);
      setCollapsedShops(initialCollapsed);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  // Initialize default date range (1st of month to today) on load
  useEffect(() => {
    getReport(id, null, view, { limit: 1 }).then(res => {
      const reportConfig = res?.data?.config || {};

      let defaultStart = dayjs().startOf("month");
      let defaultEnd = dayjs();

      const startDateStr = reportConfig.start_date || reportConfig.date1;
      const endDateStr = reportConfig.end_date || reportConfig.date2;

      if (startDateStr && endDateStr) {
        const configStart = dayjs(startDateStr);
        const configEnd = dayjs(endDateStr);

        if (defaultEnd.isAfter(configEnd)) defaultEnd = configEnd;
        if (defaultEnd.isBefore(configStart)) defaultEnd = configEnd;

        defaultStart = defaultEnd.startOf("month");
        if (defaultStart.isBefore(configStart)) defaultStart = configStart;
      }

      setDateRange([defaultStart, defaultEnd]);
      load(defaultStart.format("YYYY-MM-DD"), defaultEnd.format("YYYY-MM-DD"));
    }).catch(() => { });
  }, [id]);

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
      return `COMBINED PERIOD : ${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}`;
    }

    return `COMBINED PERIOD : ${dayjs(dates[0]).format("D MMMM YYYY")} - ${dayjs(dates[dates.length - 1]).format("D MMMM YYYY")}`;
  }, [uploads, dateRange]);

  const disabledDate = (current) => {
    if (!current) return false;
    if (current.isAfter(dayjs().add(1, "day"), "day")) return true;
    const minDate = config.start_date || config.date1 ? dayjs(config.start_date || config.date1) : null;
    const maxDate = config.end_date || config.date2 ? dayjs(config.end_date || config.date2) : null;
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
  };

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
      const shopInfo = allShops.find(s => String(s.value) === String(shopCode));
      const displayLabel = shopInfo?.shopName ? shopInfo.shopName : shopCode;

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
      const shopInfo = allShops.find(s => String(s.value) === String(shopCode));
      const displayLabel = shopInfo?.shopName ? shopInfo.shopName : shopCode;

      let sOpening = 0, sIn = 0, sOut = 0, sClosing = 0;
      Object.values(brands).flat().forEach(item => {
        sOpening += useWholeNumbers ? Math.round(item.opening || 0) : item.opening || 0;
        sIn += useWholeNumbers ? Math.round(item.inward || 0) : item.inward || 0;
        sOut += useWholeNumbers ? Math.round(item.outward || 0) : item.outward || 0;
        sClosing += useWholeNumbers ? Math.round(item.closing || 0) : item.closing || 0;
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
          const op = useWholeNumbers ? Math.round(item.opening || 0) : item.opening || 0;
          const i = useWholeNumbers ? Math.round(item.inward || 0) : item.inward || 0;
          const o = useWholeNumbers ? Math.round(item.outward || 0) : item.outward || 0;
          const c = useWholeNumbers ? Math.round(item.closing || 0) : item.closing || 0;

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

    exportToExcel(exportData, { Period: periodLabel, Bond: bond, Warehouse: warehouse, Shop: shop, View: view, "Round off": useWholeNumbers ? "Yes" : "No" }, "cum_shopsales_report.xlsx", "Shop Sales Cumulative", { theme: "navy" });
  };

  const handleDownload = async (format, modeType) => {
    const reportTitle = "Shop Sales Cumulative";

    if (format === "xlsx") {
      if (modeType === "unified") {
        setLoading(true);
        try {
          const sStr = dateRange[0]?.format("YYYY-MM-DD");
          const eStr = dateRange[1]?.format("YYYY-MM-DD");
          let startIdx = null;
          let endIdx = null;

          if (sStr && eStr) {
            const allDates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
            startIdx = allDates.findIndex(d => d >= sStr);
            const endDates = allDates.filter(d => d <= eStr);
            if (endDates.length > 0) {
              endIdx = allDates.indexOf(endDates[endDates.length - 1]);
            }
          }

          const params = { start_idx: startIdx, end_idx: endIdx };
          if (sStr && eStr) {
            params.start_date = sStr;
            params.end_date = eStr;
          }

          // Fetch all data for all shops
          const res = await getReport(id, null, view, params);
          const fullData = res.data.data || [];

          const exportData = fullData.map(d => {
            const shopCodeStr = String(d.shop_code || "");
            const shopInfo = allShops.find(s => String(s.value) === shopCodeStr);
            const shopName = shopInfo?.shopName || d.shop_name || "";

            // Find Bond
            let resolvedBond = "";
            for (const [bondName, bData] of Object.entries(bondMapping)) {
              const list = Array.isArray(bData) ? bData : (bData?.shops || []);
              const found = list.some(s => String(typeof s === 'object' ? s.shop_code : s) === shopCodeStr);
              if (found) {
                resolvedBond = bondName;
                break;
              }
            }
            if (!resolvedBond && shopcodeMapping) {
              for (const [bondName, shopsList] of Object.entries(shopcodeMapping)) {
                if (shopsList.some(s => String(s.shop_code) === shopCodeStr)) {
                  resolvedBond = bondName;
                  break;
                }
              }
            }

            // Find Warehouse
            let resolvedWarehouse = "";
            for (const [whName, shopCodes] of Object.entries(filterMapping)) {
              if (shopCodes.includes(shopCodeStr)) {
                resolvedWarehouse = whName;
                break;
              }
            }

            return {
              Bond: resolvedBond,
              Warehouse: resolvedWarehouse,
              "Shop Code": shopCodeStr,
              "Shop Name": shopName,
              Brand: d.brand || "",
              Pack: d.pack || "",
              Opening: useWholeNumbers ? Math.round(d.opening || 0) : Number((d.opening || 0).toFixed(2)),
              Receipt: useWholeNumbers ? Math.round(d.inward || 0) : Number((d.inward || 0).toFixed(2)),
              Sales: useWholeNumbers ? Math.round(d.outward || 0) : Number((d.outward || 0).toFixed(2)),
              Closing: useWholeNumbers ? Math.round(d.closing || 0) : Number((d.closing || 0).toFixed(2))
            };
          });

          const uniqueList = Array.from(new Set(
            exportData.map(d => filterMode === "bond" ? d.Bond : d.Warehouse).filter(Boolean)
          )).sort();

          const period = dateRange.length === 2 ? `${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}` : "All";

          exportUnifiedWithDropdown({
            data: exportData,
            warehouses: uniqueList,
            reportTitle: `${reportTitle} (Unified - Shop Drilldown)`,
            periodLabel: period,
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${filterMode}_unified.xlsx`,
            sheetName: "Shop Drilldown",
            sumCols: ["Opening", "Receipt", "Sales", "Closing"],
            dropdownLabel: filterMode === "bond" ? "Bond" : "Warehouse",
            filterColumnName: filterMode === "bond" ? "Bond" : "Warehouse",
            theme: "navy"
          });
        } catch (e) {
          console.error("Error exporting unified excel:", e);
          message.error("Failed to export unified report");
        } finally {
          setLoading(false);
        }
      } else {
        // current view excel
        downloadExcel();
      }
    } else if (format === "pdf") {
      if (modeType === "current") {
        setLoading(true);
        try {
          const period = dateRange.length === 2 ? `${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}` : "All";

          const bondName = bond || "Current View";
          const shopsForPdf = (shop ? [allShops.find(s => s.value === shop)] : shopOptions)
            .filter(Boolean)
            .map(s => ({
              shop_code: s.value,
              shop_name: s.shopName
            }));

          exportShopDrilldownPdfByBond({
            title: reportTitle,
            periodLabel: period,
            data: data,
            bondName: bondName,
            bondShops: shopsForPdf,
            allShops: allShops,
            useWholeNumbers: useWholeNumbers,
            view: view,
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_current.pdf`
          });
        } catch (e) {
          console.error("Error exporting current view PDF:", e);
          message.error("Failed to export current view PDF");
        } finally {
          setLoading(false);
        }
      } else {
        // Download by bonds
        setLoading(true);
        try {
          const period = dateRange.length === 2 ? `${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}` : "All";

          const sStr = dateRange[0]?.format("YYYY-MM-DD");
          const eStr = dateRange[1]?.format("YYYY-MM-DD");
          let startIdx = null;
          let endIdx = null;

          if (sStr && eStr) {
            const allDates = uploads.filter(u => u.status === 'uploaded').map(u => u.date).sort();
            startIdx = allDates.findIndex(d => d >= sStr);
            const endDates = allDates.filter(d => d <= eStr);
            if (endDates.length > 0) {
              endIdx = allDates.indexOf(endDates[endDates.length - 1]);
            }
          }

          const params = { start_idx: startIdx, end_idx: endIdx };
          if (sStr && eStr) {
            params.start_date = sStr;
            params.end_date = eStr;
          }

          // Fetch all data for all shops
          const res = await getReport(id, null, view, params);
          const fullData = res.data.data || [];

          const activeBonds = bond ? [bond] : Object.keys(shopcodeMapping);
          for (const bondName of activeBonds) {
            const bondShops = shopcodeMapping[bondName] || [];

            // Check if there is any data for shops in this bond
            const bondShopCodes = bondShops.map(s => String(s.shop_code));
            const bondHasData = fullData.some(d => bondShopCodes.includes(String(d.shop_code)));

            if (bondHasData) {
              await exportShopDrilldownPdfByBond({
                title: reportTitle,
                periodLabel: period,
                data: fullData,
                bondName: bondName,
                bondShops: bondShops,
                allShops: allShops,
                useWholeNumbers: useWholeNumbers,
                view: view,
                filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_bond_${bondName.toLowerCase().replace(/\s+/g, '_')}.pdf`
              });
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
          message.success("Bonds PDF export completed!");
        } catch (e) {
          console.error("Error exporting bonds PDF:", e);
          message.error("Failed to export PDF by bonds");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Shop sales - Cumulative</h2>
      </div>
      <div style={{ marginBottom: 16 }}>
        {/* Date Filter Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col>
            Date :
            <RangePicker value={dateRange} onChange={setDateRange} style={{ width: 250 }} disabledDate={disabledDate} />
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
            <DownloadDropdown
              onDownload={handleDownload}
              loading={loading}
              disabled={tableData.length === 0}
              showPdf={true}
              pdfOptions={["current", "cluster"]}
              clusterLabel="Bond"
            />
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
