import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Button, Space, message, Typography } from "antd";
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

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getReport(id);
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
    return Number(val).toFixed(dec).replace(/\.0$/, '');
  };

  const handleExport = () => {
    if (data.length === 0) {
      message.warning("No data available to export");
      return;
    }
    
    // Flatten headers for Excel export
    const flatData = tableData.map((row) => ({
      "Bond": row.isClusterTotal ? `${row.cluster} TOTAL` : row.bond,
      
      "Shop Liq Curr": row.curr_shop_liq,
      "Shop Liq Prev": row.prev_shop_liq,
      "Shop Liq Var": row.var_shop_liq,
      "Shop Liq %": row.pct_shop_liq,
      
      "Sec Sales Curr": row.curr_sec_sales,
      "Sec Sales Prev": row.prev_sec_sales,
      "Sec Sales Var": row.var_sec_sales,
      "Sec Sales %": row.pct_sec_sales,
      
      "Fed/Bar Curr": row.curr_fed_bar,
      "Fed/Bar Prev": row.prev_fed_bar,
      "Fed/Bar Var": row.var_fed_bar,
      "Fed/Bar %": row.pct_fed_bar,
      
      "Total Liq Curr": row.curr_total,
      "Total Liq Prev": row.prev_total,
      "Total Liq Var": row.var_total,
      "Total Liq %": row.pct_total,
    }));

    // Add totals to Excel
    flatData.push({
      "Bond": "TOTAL",
      "Shop Liq Curr": Number(totals.curr_shop_liq.toFixed(0)),
      "Shop Liq Prev": Number(totals.prev_shop_liq.toFixed(0)),
      "Shop Liq Var": Number(totals.var_shop_liq.toFixed(0)),
      "Shop Liq %": Number(totals.pct_shop_liq.toFixed(0)),
      
      "Sec Sales Curr": Number(totals.curr_sec_sales.toFixed(0)),
      "Sec Sales Prev": Number(totals.prev_sec_sales.toFixed(0)),
      "Sec Sales Var": Number(totals.var_sec_sales.toFixed(0)),
      "Sec Sales %": Number(totals.pct_sec_sales.toFixed(0)),
      
      "Fed/Bar Curr": Number(totals.curr_fed_bar.toFixed(0)),
      "Fed/Bar Prev": Number(totals.prev_fed_bar.toFixed(0)),
      "Fed/Bar Var": Number(totals.var_fed_bar.toFixed(0)),
      "Fed/Bar %": Number(totals.pct_fed_bar.toFixed(0)),
      
      "Total Liq Curr": Number(totals.curr_total.toFixed(0)),
      "Total Liq Prev": Number(totals.prev_total.toFixed(0)),
      "Total Liq Var": Number(totals.var_total.toFixed(0)),
      "Total Liq %": Number(totals.pct_total.toFixed(0)),
    });

    // Add Averages to Excel
    flatData.push({
      "Bond": "AVERAGE DAILY SALE",
      "Shop Liq Curr": Number(averages.curr_shop_liq.toFixed(0)),
      "Shop Liq Prev": Number(averages.prev_shop_liq.toFixed(0)),
      "Shop Liq Var": Number(averages.var_shop_liq.toFixed(1)),
      "Shop Liq %": Number(averages.pct_shop_liq.toFixed(0)),
      
      "Sec Sales Curr": Number(averages.curr_sec_sales.toFixed(0)),
      "Sec Sales Prev": Number(averages.prev_sec_sales.toFixed(0)),
      "Sec Sales Var": Number(averages.var_sec_sales.toFixed(1)),
      "Sec Sales %": Number(averages.pct_sec_sales.toFixed(0)),
      
      "Fed/Bar Curr": Number(averages.curr_fed_bar.toFixed(0)),
      "Fed/Bar Prev": Number(averages.prev_fed_bar.toFixed(0)),
      "Fed/Bar Var": Number(averages.var_fed_bar.toFixed(1)),
      "Fed/Bar %": Number(averages.pct_fed_bar.toFixed(0)),
      
      "Total Liq Curr": Number(averages.curr_total.toFixed(0)),
      "Total Liq Prev": Number(averages.prev_total.toFixed(0)),
      "Total Liq Var": Number(averages.var_total.toFixed(1)),
      "Total Liq %": Number(averages.pct_total.toFixed(0)),
    });

    exportToExcel(flatData, { "Report Name": reportInfo.name }, `${reportInfo.name}.xlsx`);
  };

  // Dynamic Date Formatting
  const currMonth = meta?.curr_month ? dayjs(meta.curr_month) : dayjs();
  const prevMonth = meta?.prev_month ? dayjs(meta.prev_month) : currMonth.subtract(1, 'month');
  
  const currMonthStr = currMonth.format("MMMM").toUpperCase();
  const prevMonthStr = prevMonth.format("MMMM").toUpperCase();
  const currYearStr = currMonth.format("YYYY");
  const prevYearShortStr = prevMonth.format("YY");
  
  const currDateLabel = currMonth.endOf('month').format("DD-MMM");
  const prevDateLabel = prevMonth.endOf('month').format("DD-MMM");
  
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
              { title: currDateLabel, dataIndex: `curr_${dataKey}`, align: "right" }
            ]
          },
          {
            title: pDays ?? "-",
            children: [
              { title: prevDateLabel, dataIndex: `prev_${dataKey}`, align: "right" }
            ]
          }
        ]
      },
      {
        title: "VARIANCE",
        dataIndex: `var_${dataKey}`,
        align: "right",
      },
      {
        title: "%",
        dataIndex: `pct_${dataKey}`,
        align: "right",
        render: (val) => (val ? `${val}%` : "0%")
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
      `}</style>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
            &larr; Back
          </Button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            {reportInfo.name || "Monthly Summary Report"}
          </Title>
          <Space>
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