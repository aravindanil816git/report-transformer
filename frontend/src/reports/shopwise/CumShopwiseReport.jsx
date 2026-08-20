import { useEffect, useState, useMemo } from "react";
import { Table, Button, Select, DatePicker, Space, Typography, message, Checkbox } from "antd";

const { Text } = Typography;
import { useParams, useNavigate } from "react-router-dom";
import { FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import { getReport, processReport, getJson } from "../../api";
import dayjs from "dayjs";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportClusterPdf, exportDailySecondaryExcel, exportShopSalesExcel } from "../../utils/exportUtils";
import DownloadDropdown from "../../components/DownloadDropdown";
import { disabledFutureMonthDates } from "../../utils/dateUtils";
import SourceReportsPopover from "../../components/SourceReportsPopover";

const { RangePicker } = DatePicker;

export default function CumulativeShopwiseReport() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [uploads, setUploads] = useState([]);
  const [view, setView] = useState("daywise_sales");

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("bond");
  const [drilledWarehouse, setDrilledWarehouse] = useState(null);
  const [drilledBond, setDrilledBond] = useState(null);

  const [shopLeaves, setShopLeaves] = useState([]);
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);
  const [clusters, setClusters] = useState({});
  const [warehouseClusters, setWarehouseClusters] = useState({});

  const formatVal = (v) => {
    if (v === undefined || v === null) return "";
    const num = Number(v);
    if (useWholeNumbers) {
      return Math.round(num);
    }
    return num.toFixed(2);
  };

  const normalizeWhName = (name) => {
    if (!name) return "";
    return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim().toUpperCase();
  };

  const isWarehouseInCluster = (whName, clusterList) => {
    if (!whName || !clusterList) return false;
    const normalizedWh = normalizeWhName(whName);
    return clusterList.some(item => normalizeWhName(item) === normalizedWh);
  };

  useEffect(() => {
    getJson("leaves").then(res => {
      setShopLeaves(res.data?.shop || []);
    }).catch(() => { });

    getJson("clusters").then(res => {
      setClusters(res.data || {});
    }).catch(() => { });

    getJson("warehouse_clusters").then(res => {
      setWarehouseClusters(res.data || {});
    }).catch(() => { });
  }, []);

  // 🔹 load
  const load = async (startIdx = null, endIdx = null, selectedWarehouse = warehouseFilter, selectedBond = null, selectedMode = mode, d1 = null, d2 = null) => {
    setLoading(true);
    try {
      const params = {
        start_idx: startIdx,
        end_idx: endIdx,
        mode: selectedMode,
        warehouse: selectedWarehouse,
        bond: selectedBond
      };
      if (d1 && d2) {
        params.start_date = d1;
        params.end_date = d2;
      }
      const res = await getReport(id, null, view, params);

      const cleaned = (res.data.data || []).filter(d => d.warehouse);

      setData(cleaned);
      setLabels(res.data.labels || []);
      setConfig(res.data.config || {});
      setUploads(res.data.uploads || []);

      if (allLabels.length === 0) {
        setAllLabels(res.data.labels || []);
      }
    } finally {
      setLoading(false);
    }
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

      let currentMode = mode;
      if (drilledWarehouse) currentMode = "shop";
      else if (drilledBond) currentMode = "shop";

      load(null, null, warehouseFilter, drilledBond, currentMode, defaultStart.format("YYYY-MM-DD"), defaultEnd.format("YYYY-MM-DD"));
    }).catch(() => { });
  }, [id]);

  // 🔥 Reload when view or data parameters change
  useEffect(() => {
    fetchCurrentView();
  }, [view, mode, drilledWarehouse, drilledBond]);

  const labelToDate = (label) => dayjs(label.split(" ")[0], "DD-MMM");

  const getIndexFromDate = (date) => {
    return allLabels.findIndex(l =>
      labelToDate(l).isSame(date, "day")
    );
  };

  const fetchCurrentView = async () => {
    // 🔥 STRICT BLOCK: Do not initiate any network calls if dates are not completely selected.
    if (!dateRange || !Array.isArray(dateRange) || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) {
      return;
    }

    let currentMode = mode;
    if (drilledWarehouse) currentMode = "shop";
    else if (drilledBond) currentMode = "shop";

    await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode, dateRange[0].format("YYYY-MM-DD"), dateRange[1].format("YYYY-MM-DD"));
  };

  // 🔥 APPLY FILTERS (Reload data from backend for date range)
  const handleApplyDateRange = async () => {
    if (!dateRange || !Array.isArray(dateRange) || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) {
      message.warning("Please select a complete start and end date");
      return;
    }

    let currentMode = mode;
    if (drilledWarehouse) currentMode = "shop";
    else if (drilledBond) currentMode = "shop";

    const d1 = dateRange[0].format("YYYY-MM-DD");
    const d2 = dateRange[1].format("YYYY-MM-DD");

    try {
      await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode, d1, d2);
      message.success("Report date range applied successfully");
    } catch (e) {
      message.error("Failed to process date range");
    }
  };

  // 🔥 RESET
  const resetFilters = async () => {
    setWarehouseFilter(null);
    setDateRange([]);
    setDrilledWarehouse(null);
    setDrilledBond(null);
    setMode("warehouse");

    try {
      await load(null, null, null, null, "warehouse", "RESET", "RESET");
    } catch (e) {
      message.error("Failed to reset filters");
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      await processReport(id);
      message.success("Report refreshed successfully!");
      let currentMode = mode;
      if (drilledWarehouse) currentMode = "shop";
      else if (drilledBond) currentMode = "shop";
      await load(null, null, drilledWarehouse || warehouseFilter, drilledBond, currentMode);
    } catch (error) {
      message.error("Failed to refresh report");
      setLoading(false);
    }
  };

  const filteredData = warehouseFilter
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  const activeStartStr = dateRange.length === 2 && dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : (config.start_date || config.date1);
  const activeEndStr = dateRange.length === 2 && dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : (config.end_date || config.date2);

  const netDays = useMemo(() => {
    if (activeStartStr && activeEndStr) {
      const s = dayjs(activeStartStr);
      const e = dayjs(activeEndStr);
      const diff = e.diff(s, 'day') + 1;
      const totalDays = diff > 0 ? diff : 0;
      let count = 0;
      for (let i = 0; i < totalDays; i++) {
        const dStr = s.add(i, 'day').format('YYYY-MM-DD');
        if (!shopLeaves.includes(dStr)) count++;
      }
      return count;
    }
    return config.num_days || 0;
  }, [activeStartStr, activeEndStr, shopLeaves, config.num_days]);

  const processedData = useMemo(() => {
    const baseData = filteredData.map(d => {
      const sales = d.sales || d.outward || 0;
      const avg_sales_per_day = netDays ? sales / netDays : 0;

      return {
        ...d,
        avg_sales_per_day
      };
    });

    if (mode === "bond" && !drilledBond && Object.keys(clusters).length > 0) {
      const groupedData = [];
      const unclustered = [...baseData];

      Object.entries(clusters).forEach(([clusterName, bondList]) => {
        const clusterRows = [];
        const normBondList = (bondList || []).map(b => b.toUpperCase().replace(/\s*-\s*/g, " ").trim());

        for (let i = unclustered.length - 1; i >= 0; i--) {
          const d = unclustered[i];
          const rawBond = (d.warehouse || d.bond || "").toUpperCase().replace(/\s*-\s*/g, " ").trim();
          if (normBondList.includes(rawBond)) {
            clusterRows.push(d);
            unclustered.splice(i, 1);
          }
        }

        if (clusterRows.length > 0) {
          clusterRows.sort((a, b) => (a.warehouse || a.bond || "").localeCompare(b.warehouse || b.bond || ""));
          groupedData.push(...clusterRows);

          let clusterTotal = 0;
          let clusterOpening = 0, clusterReceipt = 0, clusterSales = 0, clusterClosing = 0, clusterDiff = 0, clusterAvgSales = 0;
          let clusterSums = {};
          labels.forEach(l => clusterSums[l] = 0);

          clusterRows.forEach(d => {
            clusterTotal += (Number(d.total) || 0);
            clusterOpening += (Number(d.opening) || 0);
            clusterReceipt += (Number(d.receipt) || 0);
            clusterSales += (Number(d.sales || d.outward) || 0);
            clusterClosing += (Number(d.closing) || 0);
            clusterDiff += (Number(d.difference) || 0);
            clusterAvgSales += (Number(d.avg_sales_per_day) || 0);

            labels.forEach(l => {
              clusterSums[l] += (Number(d[l]) || 0);
            });
          });

          const cleanClusterLabel = clusterName.toUpperCase().replace(/CLUSTER\s*-\s*/gi, "CLUSTER ");

          groupedData.push({
            isClusterTotal: true,
            clusterName: cleanClusterLabel,
            warehouse: `${cleanClusterLabel} TOTAL`,
            bond: `${cleanClusterLabel} TOTAL`,
            total: clusterTotal,
            opening: clusterOpening,
            receipt: clusterReceipt,
            sales: clusterSales,
            closing: clusterClosing,
            difference: clusterDiff,
            avg_sales_per_day: clusterAvgSales,
            ...clusterSums,
            key: `total-${clusterName}`
          });
        }
      });

      if (unclustered.length > 0) {
        unclustered.sort((a, b) => (a.warehouse || a.bond || "").localeCompare(b.warehouse || b.bond || ""));
        groupedData.push(...unclustered);

        let unclusteredTotal = 0;
        let unclusteredOpening = 0, unclusteredReceipt = 0, unclusteredSales = 0, unclusteredClosing = 0, unclusteredDiff = 0, unclusteredAvgSales = 0;
        let unclusteredSums = {};
        labels.forEach(l => unclusteredSums[l] = 0);

        unclustered.forEach(d => {
          unclusteredTotal += (Number(d.total) || 0);
          unclusteredOpening += (Number(d.opening) || 0);
          unclusteredReceipt += (Number(d.receipt) || 0);
          unclusteredSales += (Number(d.sales || d.outward) || 0);
          unclusteredClosing += (Number(d.closing) || 0);
          unclusteredDiff += (Number(d.difference) || 0);
          unclusteredAvgSales += (Number(d.avg_sales_per_day) || 0);

          labels.forEach(l => {
            unclusteredSums[l] += (Number(d[l]) || 0);
          });
        });

        groupedData.push({
          isClusterTotal: true,
          clusterName: "UNCLUSTERED BONDS",
          warehouse: "UNCLUSTERED TOTAL",
          bond: "UNCLUSTERED TOTAL",
          total: unclusteredTotal,
          opening: unclusteredOpening,
          receipt: unclusteredReceipt,
          sales: unclusteredSales,
          closing: unclusteredClosing,
          difference: unclusteredDiff,
          avg_sales_per_day: unclusteredAvgSales,
          ...unclusteredSums,
          key: "total-unclustered"
        });
      }

      return groupedData;
    }

    if (mode === "warehouse" && !drilledWarehouse && Object.keys(warehouseClusters).length > 0) {
      const groupedData = [];
      const unclustered = [...baseData];

      Object.entries(warehouseClusters).forEach(([clusterName, whList]) => {
        const clusterRows = [];

        for (let i = unclustered.length - 1; i >= 0; i--) {
          const d = unclustered[i];
          if (isWarehouseInCluster(d.warehouse, whList)) {
            clusterRows.push(d);
            unclustered.splice(i, 1);
          }
        }

        if (clusterRows.length > 0) {
          clusterRows.sort((a, b) => (a.warehouse || "").localeCompare(b.warehouse || ""));
          groupedData.push(...clusterRows);

          let clusterTotal = 0;
          let clusterOpening = 0, clusterReceipt = 0, clusterSales = 0, clusterClosing = 0, clusterDiff = 0, clusterAvgSales = 0;
          let clusterSums = {};
          labels.forEach(l => clusterSums[l] = 0);

          clusterRows.forEach(d => {
            clusterTotal += (Number(d.total) || 0);
            clusterOpening += (Number(d.opening) || 0);
            clusterReceipt += (Number(d.receipt) || 0);
            clusterSales += (Number(d.sales || d.outward) || 0);
            clusterClosing += (Number(d.closing) || 0);
            clusterDiff += (Number(d.difference) || 0);
            clusterAvgSales += (Number(d.avg_sales_per_day) || 0);

            labels.forEach(l => {
              clusterSums[l] += (Number(d[l]) || 0);
            });
          });

          const cleanClusterLabel = clusterName.toUpperCase().replace(/CLUSTER\s*-\s*/gi, "CLUSTER ");

          groupedData.push({
            isClusterTotal: true,
            clusterName: cleanClusterLabel,
            warehouse: `${cleanClusterLabel} TOTAL`,
            total: clusterTotal,
            opening: clusterOpening,
            receipt: clusterReceipt,
            sales: clusterSales,
            closing: clusterClosing,
            difference: clusterDiff,
            avg_sales_per_day: clusterAvgSales,
            ...clusterSums,
            key: `total-${clusterName}`
          });
        }
      });

      if (unclustered.length > 0) {
        unclustered.sort((a, b) => (a.warehouse || "").localeCompare(b.warehouse || ""));
        groupedData.push(...unclustered);

        let unclusteredTotal = 0;
        let unclusteredOpening = 0, unclusteredReceipt = 0, unclusteredSales = 0, unclusteredClosing = 0, unclusteredDiff = 0, unclusteredAvgSales = 0;
        let unclusteredSums = {};
        labels.forEach(l => unclusteredSums[l] = 0);

        unclustered.forEach(d => {
          unclusteredTotal += (Number(d.total) || 0);
          unclusteredOpening += (Number(d.opening) || 0);
          unclusteredReceipt += (Number(d.receipt) || 0);
          unclusteredSales += (Number(d.sales || d.outward) || 0);
          unclusteredClosing += (Number(d.closing) || 0);
          unclusteredDiff += (Number(d.difference) || 0);
          unclusteredAvgSales += (Number(d.avg_sales_per_day) || 0);

          labels.forEach(l => {
            unclusteredSums[l] += (Number(d[l]) || 0);
          });
        });

        groupedData.push({
          isClusterTotal: true,
          clusterName: "UNCLUSTERED WAREHOUSES",
          warehouse: "UNCLUSTERED TOTAL",
          total: unclusteredTotal,
          opening: unclusteredOpening,
          receipt: unclusteredReceipt,
          sales: unclusteredSales,
          closing: unclusteredClosing,
          difference: unclusteredDiff,
          avg_sales_per_day: unclusteredAvgSales,
          ...unclusteredSums,
          key: "total-unclustered"
        });
      }

      return groupedData;
    }

    return baseData;
  }, [filteredData, netDays, mode, drilledBond, drilledWarehouse, clusters, warehouseClusters, labels]);

  const disabledDate = (current) => {
    return disabledFutureMonthDates(current);
  };

  const getTitle = () => {
    if (drilledWarehouse || drilledBond || mode === "shop") return "Shop Name";
    if (mode === "bond" && !drilledBond) return "Bond";
    return "Warehouse";
  };

  const getDataIndex = () => {
    if (drilledWarehouse || drilledBond || mode === "shop") return "shop_name";
    return "warehouse";
  };

  const formatName = (name) => {
    if (name && typeof name === "string") {
      return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim();
    }
    return name;
  };

  const renderFirstCol = (text, record) => {
    if (record.isClusterTotal) {
      return <b>{text}</b>;
    }
    const displayText = formatName(text);
    if (mode === "warehouse" && !drilledWarehouse) {
      return <a onClick={() => setDrilledWarehouse(record.warehouse)}>{displayText}</a>;
    }
    if (mode === "bond" && !drilledBond) {
      return <a onClick={() => setDrilledBond(record.warehouse)}>{displayText}</a>;
    }
    return <span>{record.shop_code ? `${displayText} (${record.shop_code})` : displayText}</span>;
  };

  // 🔹 daywise + total
  const daywiseColumns = [
    { title: getTitle(), dataIndex: getDataIndex(), fixed: "left", width: 220, render: renderFirstCol },
    ...labels.map(l => ({ title: l, dataIndex: l, width: 180, align: "right", render: (v) => formatVal(v) })),
    {
      title: "Total",
      dataIndex: "total",
      fixed: "right",
      width: 220,
      align: "right",
      render: (v) => formatVal(v),
    }
  ];

  const cumulativeColumns = [
    { title: getTitle(), dataIndex: getDataIndex(), width: 220, render: renderFirstCol },
    { title: "Opening", dataIndex: "opening", width: 200, align: "right", render: (v) => formatVal(v) },
    { title: "Receipt", dataIndex: "receipt", width: 200, align: "right", render: (v) => formatVal(v) },
    { title: "Sales", dataIndex: "sales", width: 200, align: "right", render: (v) => formatVal(v) },
    { title: "Closing", dataIndex: "closing", width: 200, align: "right", render: (v) => formatVal(v) },
    { title: "Difference", dataIndex: "difference", width: 200, align: "right", render: (v) => formatVal(v) },
    { title: "Avg Sales / Day", dataIndex: "avg_sales_per_day", width: 220, align: "right", render: (v) => formatVal(v) }
  ];

  const getPdfDataAndColumns = (sourceRows) => {
    const firstColTitle = getTitle();
    const firstColKey = getDataIndex();

    const pdfCols = [firstColTitle];
    const mappingCols = [{ title: firstColTitle, key: firstColKey }];
    let pdfHead = null;

    if (view === "daywise" || view === "daywise_sales") {
      const firstHeaderRow = [
        { content: firstColTitle, rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
      ];
      const secondHeaderRow = [];

      labels.forEach(l => {
        const match = l.match(/\((.*?)\)/);
        const dayStr = match ? match[1].toUpperCase() : (dayjs(l.split(" ")[0], "DD-MMM").isValid() ? dayjs(l.split(" ")[0], "DD-MMM").format("ddd").toUpperCase() : "");
        const dateNum = String(parseInt(l.split("-")[0], 10));
        const formattedLabel = (dayStr && !isNaN(dateNum)) ? `${dayStr}\n${dateNum}` : l;
        pdfCols.push(formattedLabel);
        mappingCols.push({ title: formattedLabel, key: l });

        firstHeaderRow.push({ content: dayStr, styles: { halign: 'center' } });
        secondHeaderRow.push({ content: dateNum, styles: { halign: 'center' } });
      });
      pdfCols.push("Total");
      mappingCols.push({ title: "Total", key: "total" });
      firstHeaderRow.push({ content: "Total", rowSpan: 2, styles: { valign: 'middle', halign: 'center' } });

      pdfHead = [firstHeaderRow, secondHeaderRow];
    } else {
      const cols = ["Opening", "Receipt", "Sales", "Closing", "Difference", "Avg Sales / Day"];
      cols.forEach(c => {
        pdfCols.push(c);
      });
      mappingCols.push(
        { title: "Opening", key: "opening" },
        { title: "Receipt", key: "receipt" },
        { title: "Sales", key: "sales" },
        { title: "Closing", key: "closing" },
        { title: "Difference", key: "difference" },
        { title: "Avg Sales / Day", key: "avg_sales_per_day" }
      );
    }

    const pdfData = sourceRows.map(row => {
      const pdfRow = {};
      mappingCols.forEach(col => {
        let val = row[col.key];
        if (col.key === firstColKey) {
          if (row.shop_code) {
            val = `${row.shop_code} - ${formatName(row.shop_name || row.warehouse)}`;
          } else {
            val = formatName(row.warehouse);
          }
        } else {
          val = useWholeNumbers ? Math.round(Number(val || 0)) : Number(val || 0).toFixed(2);
        }
        pdfRow[col.title] = val !== undefined && val !== null ? val : "";
      });
      return pdfRow;
    });

    const grandTotalRow = {};
    mappingCols.forEach(col => {
      grandTotalRow[col.title] = "";
    });
    grandTotalRow[firstColTitle] = "Grand Total";

    if (view === "daywise" || view === "daywise_sales") {
      labels.forEach(l => {
        const match = l.match(/\((.*?)\)/);
        const dayStr = match ? match[1].toUpperCase() : (dayjs(l.split(" ")[0], "DD-MMM").isValid() ? dayjs(l.split(" ")[0], "DD-MMM").format("ddd").toUpperCase() : "");
        const dateNum = parseInt(l.split("-")[0], 10);
        const formattedLabel = (dayStr && !isNaN(dateNum)) ? `${dayStr}\n${dateNum}` : l;
        let sum = 0;
        sourceRows.forEach(r => sum += Number(r[l] || 0));
        grandTotalRow[formattedLabel] = useWholeNumbers ? Math.round(sum) : sum.toFixed(2);
      });
      let totalSum = 0;
      sourceRows.forEach(r => totalSum += Number(r.total || 0));
      grandTotalRow["Total"] = useWholeNumbers ? Math.round(totalSum) : totalSum.toFixed(2);
    } else {
      let tOpening = 0, tReceipt = 0, tSales = 0, tClosing = 0, tDiff = 0;
      sourceRows.forEach(r => {
        tOpening += Number(r.opening || 0);
        tReceipt += Number(r.receipt || 0);
        tSales += Number(r.sales || 0);
        tClosing += Number(r.closing || 0);
        tDiff += Number(r.difference || 0);
      });
      grandTotalRow["Opening"] = useWholeNumbers ? Math.round(tOpening) : tOpening.toFixed(2);
      grandTotalRow["Receipt"] = useWholeNumbers ? Math.round(tReceipt) : tReceipt.toFixed(2);
      grandTotalRow["Sales"] = useWholeNumbers ? Math.round(tSales) : tSales.toFixed(2);
      grandTotalRow["Closing"] = useWholeNumbers ? Math.round(tClosing) : tClosing.toFixed(2);
      grandTotalRow["Difference"] = useWholeNumbers ? Math.round(tDiff) : tDiff.toFixed(2);

      const totalAvgSalesPerDay = netDays ? tSales / netDays : 0;
      grandTotalRow["Avg Sales / Day"] = useWholeNumbers ? Math.round(totalAvgSalesPerDay) : totalAvgSalesPerDay.toFixed(2);
    }

    pdfData.push(grandTotalRow);

    return { columns: pdfCols, data: pdfData, head: pdfHead };
  };

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    let exportData = [];
    if (view === "cumulative") {
      // Map to fit the format for exportShopSalesExcel
      exportData = processedData.map(d => ({
        "Row Labels": d.shop_code ? `${d.shop_name} (${d.shop_code})` : formatName(d.warehouse),
        Opening: useWholeNumbers ? Math.round(d.opening || 0) : d.opening,
        Receipt: useWholeNumbers ? Math.round(d.receipt || 0) : d.receipt,
        Sales: useWholeNumbers ? Math.round(d.sales || 0) : d.sales,
        Closing: useWholeNumbers ? Math.round(d.closing || 0) : d.closing
      }));

      exportShopSalesExcel(
        exportData,
        {
          Period: dateRange.length === 2 ? `${dateRange[0].format("DD-MM-YYYY")} to ${dateRange[1].format("DD-MM-YYYY")}` : "All",
          Bond: mode === "bond" ? "All" : null,
          Warehouse: warehouseFilter ? formatName(warehouseFilter) : null,
          View: "Case"
        },
        "cumulative_shopwise_report.xlsx",
        "Cumulative Shopwise"
      );
    } else {
      exportData = processedData.map(row => {
        const firstColVal = row.shop_code
          ? (row.shop_name ? `${formatName(row.shop_name)} (${row.shop_code})` : row.shop_code)
          : formatName(row.warehouse);

        const obj = {
          mainColKey: firstColVal
        };

        let total = 0;
        labels.forEach(l => {
          const val = Number(row[l] || 0);
          const formattedVal = useWholeNumbers ? Math.round(val) : val;
          obj[l] = formattedVal;
          total += formattedVal;
        });

        obj["total"] = total;
        return obj;
      });

      const d1 = dateRange[0]?.format("D MMMM YYYY");
      const d2 = dateRange[1]?.format("D MMMM YYYY");
      const subtitle = d1 && d2 ? `${d1} to ${d2}` : "";

      exportDailySecondaryExcel({
        data: exportData,
        labels,
        title: "Shop Sales Daily",
        subtitle,
        filename: "cumulative_shopwise_report.xlsx",
        sheetName: "Daily Offtake",
        firstColHeader: getTitle(),
        firstColKey: "mainColKey",
        baseDateStr: config.start_date
      });
    }
  };

  const handleDownload = async (format, modeType) => {
    const reportTitle = "Shop Sales Daily";

    if (format === "xlsx") {
      if (modeType === "unified") {
        setLoading(true);
        try {
          const d1 = dateRange[0]?.format("YYYY-MM-DD");
          const d2 = dateRange[1]?.format("YYYY-MM-DD");

          const isBondMode = mode === "bond";
          const filterField = isBondMode ? "Bond" : "Warehouse";

          const params = {
            mode: "shop"
          };
          if (d1 && d2) {
            params.start_date = d1;
            params.end_date = d2;
          }

          const res = await getReport(id, null, view, params);
          const fullData = (res.data.data || []).filter(d => d.warehouse || d.shop_code || d.bond);

          const exportData = fullData.map(d => {
            const rowItem = {
              Bond: formatName(d.bond) || "",
              Warehouse: formatName(d.warehouse) || "",
              "Shop Code": d.shop_code || "",
              "Shop Name": formatName(d.shop_name) || ""
            };

            if (view === "cumulative") {
              rowItem["Opening"] = useWholeNumbers ? Math.round(d.opening || 0) : d.opening;
              rowItem["Receipt"] = useWholeNumbers ? Math.round(d.receipt || 0) : d.receipt;
              rowItem["Sales"] = useWholeNumbers ? Math.round(d.sales || 0) : d.sales;
              rowItem["Closing"] = useWholeNumbers ? Math.round(d.closing || 0) : d.closing;
              rowItem["Difference"] = useWholeNumbers ? Math.round(d.difference || 0) : d.difference;
              const avg_sales_per_day = netDays ? (d.sales || 0) / netDays : 0;
              rowItem["Avg Sales / Day"] = useWholeNumbers ? Math.round(avg_sales_per_day) : Number(avg_sales_per_day).toFixed(2);
            } else {
              labels.forEach(l => {
                rowItem[l] = d[l] || 0;
              });
              rowItem["Total"] = d.total || 0;
            }
            return rowItem;
          });

          const uniqueList = Array.from(new Set(
            exportData.map(d => isBondMode ? d.Bond : d.Warehouse).filter(Boolean)
          )).sort();

          const sumKeys = [];
          if (view === "cumulative") {
            sumKeys.push("Opening", "Receipt", "Sales", "Closing", "Difference", "Avg Sales / Day");
          } else {
            sumKeys.push("Total", ...labels);
          }

          exportUnifiedWithDropdown({
            data: exportData,
            warehouses: uniqueList,
            reportTitle: `${reportTitle} (Unified - Shop Drilldown)`,
            periodLabel: dateRange.length === 2 ? `${dateRange[0].format("DD-MM-YYYY")} to ${dateRange[1].format("DD-MM-YYYY")}` : "All",
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_unified.xlsx`,
            sheetName: "Shop Drilldown",
            sumCols: sumKeys,
            dropdownLabel: filterField,
            filterColumnName: filterField,
            theme: "navy"
          });
        } catch (e) {
          console.error("Error exporting unified excel:", e);
          message.error("Failed to export unified report");
        } finally {
          setLoading(false);
        }
      } else {
        downloadExcel();
      }
    } else if (format === "pdf") {
      setLoading(true);
      try {
        const period = dateRange.length === 2 ? `${dateRange[0].format("D MMMM YYYY")} - ${dateRange[1].format("D MMMM YYYY")}` : "All";

        const sumCols = [];
        if (view === "cumulative") {
          sumCols.push("Opening", "Receipt", "Sales", "Closing", "Difference", "Avg Sales / Day");
        } else {
          sumCols.push("Total", ...labels);
        }

        if (modeType === "current") {
          const { columns: pdfCols, data: pdfData, head: pdfHead } = getPdfDataAndColumns(processedData);

          exportToPdf({
            title: reportTitle,
            periodLabel: period,
            columns: pdfCols,
            data: pdfData,
            head: pdfHead,
            filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_current.pdf`,
            zeroMargin: true,
            orientation: "landscape"
          });
        } else if (modeType === "unified" || modeType === "cluster") {
          const params = {
            mode: "shop"
          };
          const d1 = dateRange[0]?.format("YYYY-MM-DD");
          const d2 = dateRange[1]?.format("YYYY-MM-DD");
          if (d1 && d2) {
            params.start_date = d1;
            params.end_date = d2;
          }

          const isBondMode = mode === "bond";
          const groupByField = isBondMode ? "Bond" : "Warehouse";

          const res = await getReport(id, null, view, params);
          const fullData = (res.data.data || []).filter(d => d.warehouse || d.shop_code || d.bond);

          const pdfCols = ["Shop Name"];
          if (view === "cumulative") {
            pdfCols.push("Opening", "Receipt", "Sales", "Closing", "Difference", "Avg Sales / Day");
          } else {
            pdfCols.push(...labels, "Total");
          }

          const pdfData = fullData.map(d => {
            const rowItem = {
              Bond: formatName(d.bond) || "",
              Warehouse: formatName(d.warehouse) || "",
              "Shop Name": d.shop_code ? `${d.shop_code} - ${formatName(d.shop_name || d.warehouse)}` : formatName(d.shop_name || d.warehouse)
            };

            if (view === "cumulative") {
              rowItem["Opening"] = d.opening || 0;
              rowItem["Receipt"] = d.receipt || 0;
              rowItem["Sales"] = d.sales || 0;
              rowItem["Closing"] = d.closing || 0;
              rowItem["Difference"] = d.difference || 0;
              const avg_sales_per_day = netDays ? (d.sales || 0) / netDays : 0;
              rowItem["Avg Sales / Day"] = Number(avg_sales_per_day).toFixed(2);
            } else {
              labels.forEach(l => {
                rowItem[l] = d[l] || 0;
              });
              rowItem["Total"] = d.total || 0;
            }
            return rowItem;
          });

          if (modeType === "unified") {
            exportToPdf({
              title: reportTitle,
              periodLabel: period,
              columns: pdfCols,
              data: pdfData,
              groupByField,
              sumCols: sumCols,
              filename: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}_unified.pdf`,
              zeroMargin: true,
              orientation: "landscape"
            });
          } else if (modeType === "cluster") {
            const clusterConfigName = isBondMode ? "clusters" : "warehouse_clusters";
            const clusterRes = await getJson(clusterConfigName);
            const clustersData = clusterRes.data || {};

            exportClusterPdf({
              title: reportTitle,
              periodLabel: period,
              columns: pdfCols,
              data: pdfData,
              groupByField,
              sumCols: sumCols,
              clusters: clustersData,
              filenamePrefix: `${reportTitle.toLowerCase().replace(/\s+/g, '_')}_${mode}`,
              zeroMargin: true,
              orientation: "landscape"
            });
          }
        }
      } catch (e) {
        console.error("Error exporting PDF:", e);
        message.error("Failed to export PDF");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Shop Sales Daily</h2>
        <Space>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={() => handleDownload("xlsx", "current")}
            loading={loading}
            disabled={processedData.length === 0}
          >
            Download Excel
          </Button>
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            onClick={() => handleDownload("pdf", "current")}
            loading={loading}
            disabled={processedData.length === 0}
          >
            Download PDF
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button
          type={mode === "bond" ? "primary" : "default"}
          onClick={() => { setMode("bond"); setDrilledBond(null); setDrilledWarehouse(null); }}
        >
          Bond
        </Button>

        <Button
          type={mode === "warehouse" && !drilledBond ? "primary" : "default"}
          onClick={() => { setMode("warehouse"); setDrilledBond(null); setDrilledWarehouse(null); }}
          style={{ marginLeft: 8 }}
        >
          Warehouse
        </Button>

        <Button
          type={mode === "shop" ? "primary" : "default"}
          onClick={() => { setMode("shop"); setDrilledBond(null); setDrilledWarehouse(null); }}
          style={{ marginLeft: 8 }}
        >
          Shop
        </Button>

        {drilledWarehouse && (
          <Button type="dashed" danger onClick={() => setDrilledWarehouse(null)} style={{ marginLeft: 8 }}>
            Back to Warehouse View (Exit Drilling: {formatName(drilledWarehouse)})
          </Button>
        )}
        {drilledBond && (
          <Button type="dashed" danger onClick={() => setDrilledBond(null)} style={{ marginLeft: 8 }}>
            Back to Bond View (Exit Drilling: {formatName(drilledBond)})
          </Button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        {/* <b>Start Date:</b> {config.start_date ? dayjs(config.start_date).format("DD-MM-YYYY") : ""} &nbsp;&nbsp; */}
        <b>Days (Excl. Leaves):</b> {netDays}
      </div>

      {/* 🔥 FILTERS */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Warehouse"
          style={{ width: 250 }}
          value={warehouseFilter}
          onChange={setWarehouseFilter}
          allowClear
        >
          {uniqueWarehouses.map(w => (
            <Select.Option key={w} value={w}>{formatName(w)}</Select.Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          disabledDate={disabledDate}
          disabled={loading || !dateRange || dateRange.length < 2}
        />

        <Button
          type="primary"
          onClick={handleApplyDateRange}
          disabled={loading || !dateRange || dateRange.length < 2}
        >
          Apply Date Range
        </Button>

        <Button onClick={resetFilters} disabled={loading || !dateRange || dateRange.length < 2}>
          Reset
        </Button>

        <Checkbox checked={useWholeNumbers} onChange={e => setUseWholeNumbers(e.target.checked)} disabled={loading || !dateRange || dateRange.length < 2}>
          Round off
        </Checkbox>
        {(loading || !dateRange || dateRange.length < 2) && (
          <span style={{ color: '#8c8c8c', fontSize: '12px', fontStyle: 'italic' }}>
            Loading default dates...
          </span>
        )}
      </Space>

      {/* 🔥 VIEW PILLS */}
      {/* <div style={{ marginBottom: 16 }}>
        <Button
          type={view === "daywise_sales" ? "primary" : "default"}
          onClick={() => setView("daywise_sales")}
        >
          Sales
        </Button>
      </div> */}

      {/* 🔥 TABLE */}
      <Table
        loading={loading}
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={processedData}
        rowKey={(record) => `${record.warehouse}-${record.shop_code || "none"}-${record.bond || "none"}`}
        scroll={{ x: true }}
        pagination={false}
        onRow={(record) => {
          if (record.isClusterTotal) {
            return {
              style: { background: "#1b365d", color: "#ffbd31", fontWeight: "bold" }
            };
          }
          return {};
        }}
        summary={(pageData) => {
          if (pageData.length === 0) return null;

          if (view === "cumulative") {
            let totalOpening = 0;
            let totalReceipt = 0;
            let totalSales = 0;
            let totalClosing = 0;
            let totalDiff = 0;

            pageData.filter(d => !d.isClusterTotal).forEach(({ opening, receipt, sales, closing, difference }) => {
              totalOpening += opening || 0;
              totalReceipt += receipt || 0;
              totalSales += sales || 0;
              totalClosing += closing || 0;
              totalDiff += difference || 0;
            });

            const totalAvgSalesPerDay = netDays ? totalSales / netDays : 0;

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                  <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalOpening)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalReceipt)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalSales)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalClosing)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalDiff)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(totalAvgSalesPerDay)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          } else {
            // Daywise view
            const colTotals = {};
            let grandTotal = 0;

            labels.forEach(l => colTotals[l] = 0);

            pageData.filter(d => !d.isClusterTotal).forEach(row => {
              labels.forEach(l => {
                colTotals[l] += row[l] || 0;
              });
              grandTotal += row.total || 0;
            });

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                  <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                  {labels.map((l, index) => (
                    <Table.Summary.Cell key={l} index={index + 1} align="right" style={{ padding: "12px 8px" }}>
                      <Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(colTotals[l])}</Text>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={labels.length + 1} align="right" style={{ padding: "12px 8px" }}>
                    <Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{formatVal(grandTotal)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }
        }}
      />
      <SourceReportsPopover uploads={uploads} labels={labels} config={config} dateRange={dateRange} />
    </div>
  );
}