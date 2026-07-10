import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Button, Space, message, Typography, Checkbox, DatePicker } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getReport } from "../api";
import { exportToExcel } from "../utils/exportUtils";

const { Title } = Typography;

export default function MonthlySummaryReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportInfo, setReportInfo] = useState({ name: "" });
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);
  const [dateRange1, setDateRange1] = useState(null);
  const [dateRange2, setDateRange2] = useState(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id, dateRange1, dateRange2]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange1 && dateRange1[0] && dateRange1[1]) {
        params.start_date = dateRange1[0].format("YYYY-MM-DD");
        params.end_date = dateRange1[1].format("YYYY-MM-DD");
      }
      if (dateRange2 && dateRange2[0] && dateRange2[1]) {
        params.start_date2 = dateRange2[0].format("YYYY-MM-DD");
        params.end_date2 = dateRange2[1].format("YYYY-MM-DD");
      }
      const res = await getReport(id, null, null, params);
      setData(res.data?.data || []);
      setMeta(res.data?.meta || null);
      setReportInfo({ name: res.data?.name || "Monthly Summary Report" });
    } catch (error) {
      message.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  // Group data by cluster and calculate subtotals
  const tableData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const grouped = {};
    data.forEach(row => {
      const c = row.cluster || "UNMAPPED CLUSTER";
      if (!grouped[c]) {
        grouped[c] = {
          rows: [],
          totals: {
            curr_shop_liq: 0, prev_shop_liq: 0,
            curr_sec_sales: 0, prev_sec_sales: 0,
            curr_fed_bar: 0, prev_fed_bar: 0,
            curr_total: 0, prev_total: 0,
          }
        };
      }
      grouped[c].rows.push(row);
      
      const t = grouped[c].totals;
      t.curr_shop_liq += row.curr_shop_liq || 0;
      t.prev_shop_liq += row.prev_shop_liq || 0;
      t.curr_sec_sales += row.curr_sec_sales || 0;
      t.prev_sec_sales += row.prev_sec_sales || 0;
      t.curr_fed_bar += row.curr_fed_bar || 0;
      t.prev_fed_bar += row.prev_fed_bar || 0;
      t.curr_total += row.curr_total || 0;
      t.prev_total += row.prev_total || 0;
    });

    const finalData = [];
    Object.keys(grouped).sort().forEach(c => {
      finalData.push(...grouped[c].rows);
      
      const t = grouped[c].totals;
      const calcVarPct = (curr, prev) => {
        const v = curr - prev;
        const p = prev ? ((v / prev) * 100) : 0;
        return { v, p };
      };

      const shopLiq = calcVarPct(t.curr_shop_liq, t.prev_shop_liq);
      t.var_shop_liq = shopLiq.v; t.pct_shop_liq = shopLiq.p;
      const secSales = calcVarPct(t.curr_sec_sales, t.prev_sec_sales);
      t.var_sec_sales = secSales.v; t.pct_sec_sales = secSales.p;
      const fedBar = calcVarPct(t.curr_fed_bar, t.prev_fed_bar);
      t.var_fed_bar = fedBar.v; t.pct_fed_bar = fedBar.p;
      const totalLiq = calcVarPct(t.curr_total, t.prev_total);
      t.var_total = totalLiq.v; t.pct_total = totalLiq.p;

      finalData.push({ bond: `${c} TOTAL`, isClusterTotal: true, cluster: c, ...t });
    });

    return finalData;
  }, [data]);

  // Calculate Totals dynamically
  const totals = useMemo(() => {
    const t = {
      curr_shop_liq: 0, prev_shop_liq: 0,
      curr_sec_sales: 0, prev_sec_sales: 0,
      curr_fed_bar: 0, prev_fed_bar: 0,
      curr_total: 0, prev_total: 0,
    };
    data.forEach(row => {
      t.curr_shop_liq += row.curr_shop_liq || 0;
      t.prev_shop_liq += row.prev_shop_liq || 0;
      t.curr_sec_sales += row.curr_sec_sales || 0;
      t.prev_sec_sales += row.prev_sec_sales || 0;
      t.curr_fed_bar += row.curr_fed_bar || 0;
      t.prev_fed_bar += row.prev_fed_bar || 0;
      t.curr_total += row.curr_total || 0;
      t.prev_total += row.prev_total || 0;
    });

    const calcVarPct = (curr, prev) => {
        const v = curr - prev;
        const p = prev ? ((v / prev) * 100) : 0;
        return { v, p };
    };

    const shopLiq = calcVarPct(t.curr_shop_liq, t.prev_shop_liq);
    t.var_shop_liq = shopLiq.v; t.pct_shop_liq = shopLiq.p;

    const secSales = calcVarPct(t.curr_sec_sales, t.prev_sec_sales);
    t.var_sec_sales = secSales.v; t.pct_sec_sales = secSales.p;

    const fedBar = calcVarPct(t.curr_fed_bar, t.prev_fed_bar);
    t.var_fed_bar = fedBar.v; t.pct_fed_bar = fedBar.p;

    const totalLiq = calcVarPct(t.curr_total, t.prev_total);
    t.var_total = totalLiq.v; t.pct_total = totalLiq.p;

    return t;
  }, [data]);

  // Calculate Daily Averages based on the Totals & net days
  const averages = useMemo(() => {
    const cWhDays = Number(meta?.curr_wh_days) || 1;
    const pWhDays = Number(meta?.prev_wh_days) || 1;
    const cShDays = Number(meta?.curr_sh_days) || 1;
    const pShDays = Number(meta?.prev_sh_days) || 1;

    const a = {
      curr_shop_liq: totals.curr_shop_liq / cShDays,
      prev_shop_liq: totals.prev_shop_liq / pShDays,
      curr_sec_sales: totals.curr_sec_sales / cWhDays,
      prev_sec_sales: totals.prev_sec_sales / pWhDays,
      curr_fed_bar: totals.curr_fed_bar / cWhDays,
      prev_fed_bar: totals.prev_fed_bar / pWhDays,
      curr_total: totals.curr_total / cShDays,
      prev_total: totals.prev_total / pShDays,
    };

    const calcVarPct = (curr, prev) => {
        const v = curr - prev;
        const p = prev ? ((v / prev) * 100) : 0;
        return { v, p };
    };

    const shopLiq = calcVarPct(a.curr_shop_liq, a.prev_shop_liq);
    a.var_shop_liq = shopLiq.v; a.pct_shop_liq = shopLiq.p;
    const secSales = calcVarPct(a.curr_sec_sales, a.prev_sec_sales);
    a.var_sec_sales = secSales.v; a.pct_sec_sales = secSales.p;
    const fedBar = calcVarPct(a.curr_fed_bar, a.prev_fed_bar);
    a.var_fed_bar = fedBar.v; a.pct_fed_bar = fedBar.p;
    const totalLiq = calcVarPct(a.curr_total, a.prev_total);
    a.var_total = totalLiq.v; a.pct_total = totalLiq.p;

    return a;
  }, [totals, meta]);

  // Formatter for UI values
  const fmt = (val, dec = 0) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    if (useWholeNumbers) return Math.round(Number(val));
    return Number(val).toFixed(dec).replace(/\.0+$/, '');
  };

  // Formatter for Table Cells
  const formatTableVal = (val, dec = 2) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    if (useWholeNumbers) return Math.round(Number(val));
    return Number(val).toFixed(dec);
  };

  // Formatter for Excel Export (forces numbers instead of strings)
  const formatForExcel = (val) => {
    if (val === undefined || val === null || isNaN(val)) return 0;
    if (useWholeNumbers) return Math.round(Number(val));
    return Number(Number(val).toFixed(2));
  };

  const handleExport = () => {
    if (data.length === 0) {
      message.warning("No data available to export");
      return;
    }
    
    // Flatten headers for Excel export
    const flatData = tableData.map((row) => ({
      "Bond": row.isClusterTotal ? `${row.cluster} TOTAL` : row.bond,
      
      "Shop Liq Curr": formatForExcel(row.curr_shop_liq),
      "Shop Liq Prev": formatForExcel(row.prev_shop_liq),
      "Shop Liq Var": formatForExcel(row.var_shop_liq),
      "Shop Liq %": formatForExcel(row.pct_shop_liq),
      
      "Sec Sales Curr": formatForExcel(row.curr_sec_sales),
      "Sec Sales Prev": formatForExcel(row.prev_sec_sales),
      "Sec Sales Var": formatForExcel(row.var_sec_sales),
      "Sec Sales %": formatForExcel(row.pct_sec_sales),
      
      "Fed/Bar Curr": formatForExcel(row.curr_fed_bar),
      "Fed/Bar Prev": formatForExcel(row.prev_fed_bar),
      "Fed/Bar Var": formatForExcel(row.var_fed_bar),
      "Fed/Bar %": formatForExcel(row.pct_fed_bar),
      
      "Total Liq Curr": formatForExcel(row.curr_total),
      "Total Liq Prev": formatForExcel(row.prev_total),
      "Total Liq Var": formatForExcel(row.var_total),
      "Total Liq %": formatForExcel(row.pct_total),
    }));

    // Add totals to Excel
    flatData.push({
      "Bond": "TOTAL",
      "Shop Liq Curr": formatForExcel(totals.curr_shop_liq),
      "Shop Liq Prev": formatForExcel(totals.prev_shop_liq),
      "Shop Liq Var": formatForExcel(totals.var_shop_liq),
      "Shop Liq %": formatForExcel(totals.pct_shop_liq),
      
      "Sec Sales Curr": formatForExcel(totals.curr_sec_sales),
      "Sec Sales Prev": formatForExcel(totals.prev_sec_sales),
      "Sec Sales Var": formatForExcel(totals.var_sec_sales),
      "Sec Sales %": formatForExcel(totals.pct_sec_sales),
      
      "Fed/Bar Curr": formatForExcel(totals.curr_fed_bar),
      "Fed/Bar Prev": formatForExcel(totals.prev_fed_bar),
      "Fed/Bar Var": formatForExcel(totals.var_fed_bar),
      "Fed/Bar %": formatForExcel(totals.pct_fed_bar),
      
      "Total Liq Curr": formatForExcel(totals.curr_total),
      "Total Liq Prev": formatForExcel(totals.prev_total),
      "Total Liq Var": formatForExcel(totals.var_total),
      "Total Liq %": formatForExcel(totals.pct_total),
    });

    // Add Averages to Excel
    flatData.push({
      "Bond": "AVERAGE DAILY SALE",
      "Shop Liq Curr": formatForExcel(averages.curr_shop_liq),
      "Shop Liq Prev": formatForExcel(averages.prev_shop_liq),
      "Shop Liq Var": formatForExcel(averages.var_shop_liq),
      "Shop Liq %": formatForExcel(averages.pct_shop_liq),
      
      "Sec Sales Curr": formatForExcel(averages.curr_sec_sales),
      "Sec Sales Prev": formatForExcel(averages.prev_sec_sales),
      "Sec Sales Var": formatForExcel(averages.var_sec_sales),
      "Sec Sales %": formatForExcel(averages.pct_sec_sales),
      
      "Fed/Bar Curr": formatForExcel(averages.curr_fed_bar),
      "Fed/Bar Prev": formatForExcel(averages.prev_fed_bar),
      "Fed/Bar Var": formatForExcel(averages.var_fed_bar),
      "Fed/Bar %": formatForExcel(averages.pct_fed_bar),
      
      "Total Liq Curr": formatForExcel(averages.curr_total),
      "Total Liq Prev": formatForExcel(averages.prev_total),
      "Total Liq Var": formatForExcel(averages.var_total),
      "Total Liq %": formatForExcel(averages.pct_total),
    });

    exportToExcel(flatData, { "Report Name": reportInfo.name, "Round off": useWholeNumbers ? "Yes" : "No" }, `${reportInfo.name}.xlsx`);
  };

  // Dynamic Date Formatting
  const currMonth = meta?.curr_month ? dayjs(meta.curr_month) : dayjs();
  const prevMonth = meta?.prev_month ? dayjs(meta.prev_month) : currMonth.subtract(1, 'month');
  
  const disabledDate1 = (current) => {
    if (!current) return false;
    return !current.isSame(currMonth, "month");
  };

  const disabledDate2 = (current) => {
    if (!current) return false;
    return !current.isSame(prevMonth, "month");
  };
  
  const currMonthStr = currMonth.format("MMMM").toUpperCase();
  const prevMonthStr = prevMonth.format("MMMM").toUpperCase();
  const currYearStr = currMonth.format("YYYY");
  const prevYearShortStr = prevMonth.format("YY");
  
  const currDateLabel = meta?.curr_end_date 
    ? dayjs(meta.curr_end_date).format("DD-MMM") 
    : currMonth.endOf('month').format("DD-MMM");
  const prevDateLabel = meta?.prev_end_date 
    ? dayjs(meta.prev_end_date).format("DD-MMM") 
    : prevMonth.endOf('month').format("DD-MMM");

  const currRangeLabelStr = (meta?.curr_start_date && meta?.curr_end_date)
    ? ` (${dayjs(meta.curr_start_date).format("DD/MM")} - ${dayjs(meta.curr_end_date).format("DD/MM")})`
    : "";
  const prevRangeLabelStr = (meta?.prev_start_date && meta?.prev_end_date)
    ? ` (${dayjs(meta.prev_start_date).format("DD/MM")} - ${dayjs(meta.prev_end_date).format("DD/MM")})`
    : "";
  
  // Helper to generate the nested headers dynamically
  const makeSection = (title, dataKey, cDays, pDays) => ({
    title: title,
    children: [
      {
        title: "NO. OF DAYS",
        children: [
          {
            title: cDays ?? "-",
            children: [
              { title: `${currDateLabel}${currRangeLabelStr}`, dataIndex: `curr_${dataKey}`, align: "right", render: val => formatTableVal(val) }
            ]
          },
          {
            title: pDays ?? "-",
            children: [
              { title: `${prevDateLabel}${prevRangeLabelStr}`, dataIndex: `prev_${dataKey}`, align: "right", render: val => formatTableVal(val) }
            ]
          }
        ]
      },
      {
        title: "VARIANCE",
        dataIndex: `var_${dataKey}`,
        align: "right",
        render: val => formatTableVal(val)
      },
      {
        title: "%",
        dataIndex: `pct_${dataKey}`,
        align: "right",
        render: (val) => (val ? `${formatTableVal(val, 1)}%` : "0%")
      }
    ]
  });

  const columns = [
    {
      title: "BOND",
      dataIndex: "bond",
      fixed: "left",
      width: 120,
    },
    makeSection(`SHOP LIQUIDATION - ${currMonthStr} Vs ${prevMonthStr} ${currYearStr}`, "shop_liq", meta?.curr_sh_days, meta?.prev_sh_days),
    makeSection(`SECONDARY SALES - ${currMonthStr} Vs ${prevMonthStr} ${prevYearShortStr}`, "sec_sales", meta?.curr_wh_days, meta?.prev_wh_days),
    makeSection("FED AND BAR", "fed_bar", meta?.curr_wh_days, meta?.prev_wh_days),
    makeSection("TOTAL LIQUIDATION (SHOP + FED AND BAR)", "total", meta?.curr_sh_days, meta?.prev_sh_days),
  ];

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .cluster-total-row {
          background-color: #e6f7ff !important;
          font-weight: bold;
        }
        .month-only-picker .ant-picker-header-super-prev-btn,
        .month-only-picker .ant-picker-header-prev-btn,
        .month-only-picker .ant-picker-header-next-btn,
        .month-only-picker .ant-picker-header-super-next-btn {
          display: none !important;
        }
        .month-only-picker .ant-picker-header-view {
          pointer-events: none !important;
        }
      `}</style>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
            &larr; Back
          </Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
          <Title level={4} style={{ margin: 0 }}>
            {reportInfo.name || "Monthly Summary Report"}
          </Title>
          <Space wrap size="middle">
            <Space>
              <span>1st Month Range:</span>
              <DatePicker.RangePicker 
                value={dateRange1} 
                onChange={(dates) => setDateRange1(dates)} 
                format="YYYY-MM-DD"
                disabledDate={disabledDate1}
                defaultPickerValue={[currMonth, currMonth]}
                popupClassName="month-only-picker"
              />
            </Space>
            <Space>
              <span>2nd Month Range:</span>
              <DatePicker.RangePicker 
                value={dateRange2} 
                onChange={(dates) => setDateRange2(dates)} 
                format="YYYY-MM-DD"
                disabledDate={disabledDate2}
                defaultPickerValue={[prevMonth, prevMonth]}
                popupClassName="month-only-picker"
              />
            </Space>
            {(dateRange1 || dateRange2) && (
              <Button onClick={() => { setDateRange1(null); setDateRange2(null); }}>
                Clear Filters
              </Button>
            )}
            <Checkbox checked={useWholeNumbers} onChange={(e) => setUseWholeNumbers(e.target.checked)}>
              Round off
            </Checkbox>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              Export Excel
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={tableData}
          rowKey={(record) => record.bond + (record.isClusterTotal ? "-total" : "")}
          loading={loading}
          bordered
          size="small"
          rowClassName={(record) => record.isClusterTotal ? 'cluster-total-row' : ''}
          pagination={false}
          scroll={{ x: "max-content" }}
          summary={() => {
            if (!data || data.length === 0) return null;
            return (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ backgroundColor: "#fafafa", fontWeight: "bold" }}>
                  <Table.Summary.Cell index={0} fixed="left">TOTAL</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">{fmt(totals.curr_shop_liq)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">{fmt(totals.prev_shop_liq)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">{fmt(totals.var_shop_liq)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{fmt(totals.pct_shop_liq)}%</Table.Summary.Cell>
                  
                  <Table.Summary.Cell index={5} align="right">{fmt(totals.curr_sec_sales)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">{fmt(totals.prev_sec_sales)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">{fmt(totals.var_sec_sales)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">{fmt(totals.pct_sec_sales)}%</Table.Summary.Cell>
                  
                  <Table.Summary.Cell index={9} align="right">{fmt(totals.curr_fed_bar)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="right">{fmt(totals.prev_fed_bar)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="right">{fmt(totals.var_fed_bar)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={12} align="right">{fmt(totals.pct_fed_bar)}%</Table.Summary.Cell>
                  
                  <Table.Summary.Cell index={13} align="right">{fmt(totals.curr_total)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={14} align="right">{fmt(totals.prev_total)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={15} align="right">{fmt(totals.var_total)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={16} align="right">{fmt(totals.pct_total)}%</Table.Summary.Cell>
                </Table.Summary.Row>
                
                <Table.Summary.Row style={{ backgroundColor: "#f0f2f5", fontWeight: "bold" }}>
                  <Table.Summary.Cell index={0} fixed="left">AVERAGE DAILY SALE</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">{fmt(averages.curr_shop_liq)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">{fmt(averages.prev_shop_liq)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">{fmt(averages.var_shop_liq, 1)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{fmt(averages.pct_shop_liq)}%</Table.Summary.Cell>
                  
                  <Table.Summary.Cell index={5} align="right">{fmt(averages.curr_sec_sales)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">{fmt(averages.prev_sec_sales)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">{fmt(averages.var_sec_sales, 1)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">{fmt(averages.pct_sec_sales)}%</Table.Summary.Cell>
                  
                  <Table.Summary.Cell index={9} align="right">{fmt(averages.curr_fed_bar)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="right">{fmt(averages.prev_fed_bar)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="right">{fmt(averages.var_fed_bar, 1)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={12} align="right">{fmt(averages.pct_fed_bar)}%</Table.Summary.Cell>
                  
                  <Table.Summary.Cell index={13} align="right">{fmt(averages.curr_total)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={14} align="right">{fmt(averages.prev_total)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={15} align="right">{fmt(averages.var_total, 1)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={16} align="right">{fmt(averages.pct_total)}%</Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
    </div>
  );
}