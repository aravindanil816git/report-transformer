import { useEffect, useState } from "react";
import { Table, Button, Select, DatePicker, Space, Typography } from "antd";

const { Text } = Typography;
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportUtils";

const { RangePicker } = DatePicker;

export default function CumulativeShopwiseReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [config, setConfig] = useState({});
  const [view, setView] = useState("cumulative");

  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [dateRange, setDateRange] = useState([]);

  const [mode, setMode] = useState("warehouse");

  // 🔹 load
  const load = async (startIdx = null, endIdx = null) => {
    const res = await getReport(id, null, view, {
      start_idx: startIdx,
      end_idx: endIdx,
      mode
    });

    const cleaned = (res.data.data || []).filter(d => d.warehouse);

    setData(cleaned);
    setLabels(res.data.labels || []);
    setConfig(res.data.config || {});

    if (allLabels.length === 0) {
      setAllLabels(res.data.labels || []);
    }
  };

  // 🔥 retain filters on view switch
useEffect(() => {
  applyFilters();
}, [view, mode]);

  const labelToDate = (label) => dayjs(label.split(" ")[0], "DD-MMM");

  const getIndexFromDate = (date) => {
    return allLabels.findIndex(l =>
      labelToDate(l).isSame(date, "day")
    );
  };

  // 🔥 APPLY
  const applyFilters = () => {
    let startIdx = null;
    let endIdx = null;

    if (dateRange.length === 2) {
      startIdx = getIndexFromDate(dateRange[0]);
      endIdx = getIndexFromDate(dateRange[1]);
    }

    load(startIdx, endIdx);
  };

  // 🔥 RESET
  const resetFilters = () => {
    setWarehouseFilter(null);
    setDateRange([]);
    load();
  };

  const filteredData = warehouseFilter
    ? data.filter(d => d.warehouse === warehouseFilter)
    : data;

  const uniqueWarehouses = [...new Set(data.map(d => d.warehouse))];

  // 🔒 strict date range
  const minDate = config.start_date ? dayjs(config.start_date) : null;
  const maxDate = minDate ? minDate.add(config.num_days - 1, "day") : null;

  const disabledDate = (current) => {
    if (!minDate || !maxDate) return false;
    return current.isBefore(minDate, "day") || current.isAfter(maxDate, "day");
  };

  // 🔹 daywise + total
  const daywiseColumns = [
    { title: "Warehouse", dataIndex: "warehouse", fixed: "left", width: 220 },
    ...labels.map(l => ({ title: l, dataIndex: l, width: 180, align: "right" })),
    {
      title: "Total",
      dataIndex: "total",
      fixed: "right",
      width: 220,
      align: "right",
    }
  ];

  const cumulativeColumns = [
    { title: "Warehouse", dataIndex: "warehouse", width: 220 },
    { title: "Opening", dataIndex: "opening", width: 200, align: "right" },
    { title: "Receipt", dataIndex: "receipt", width: 200, align: "right" },
    { title: "Sales", dataIndex: "sales", width: 200, align: "right" },
    { title: "Closing", dataIndex: "closing", width: 200, align: "right" },
    { title: "Difference", dataIndex: "difference", width: 200, align: "right" },
    { title: "ClosingStock@Sales%", dataIndex: "closing_stock_at_sales_perc", width: 220, align: "right" },
    { title: "Avg Sales / Day", dataIndex: "avg_sales_per_day", width: 220, align: "right" },
    { title: "Perc(%)", dataIndex: "perc", width: 220, align: "right" }
  ];

  // 🔥 DOWNLOAD
  const downloadExcel = () => {
    let exportData = [];
    if (view === "cumulative") {
      exportData = filteredData.map(d => ({
        Warehouse: d.warehouse,
        Opening: d.opening,
        Receipt: d.receipt,
        Sales: d.sales,
        Closing: d.closing,
        Difference: d.difference,
        "ClosingStock@Sales%": d.closing_stock_at_sales_perc,
        "Avg Sales / Day": d.avg_sales_per_day,
        "Perc(%)": d.perc
      }));
    } else {
      exportData = filteredData.map(row => {
        const obj = { Warehouse: row.warehouse };
        let total = 0;
        labels.forEach(l => {
          obj[l] = row[l] || 0;
          total += row[l] || 0;
        });
        obj["Total"] = total;
        return obj;
      });
    }

    exportToExcel(
      exportData,
      {
        Mode: mode,
        View: view,
        Warehouse: warehouseFilter,
        "Date Range": dateRange.length === 2 ? `${dateRange[0].format("YYYY-MM-DD")} to ${dateRange[1].format("YYYY-MM-DD")}` : "All",
        "Start Date": config.start_date,
        "Total Days": config.num_days
      },
      "cumulative_shopwise_report.xlsx",
      "Cumulative Shopwise"
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Cumulative Shopsales</h2>
        <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
      </div>

      <div style={{ marginBottom: 16 }}>
  <Button
    type={mode === "warehouse" ? "primary" : "default"}
    onClick={() => setMode("warehouse")}
  >
    Warehouse
  </Button>

  <Button
    type={mode === "bond" ? "primary" : "default"}
    onClick={() => setMode("bond")}
    style={{ marginLeft: 8 }}
  >
    Bond
  </Button>
</div>

      <div style={{ marginBottom: 12 }}>
        <b>Start Date:</b> {config.start_date} &nbsp;&nbsp;
        <b>Days:</b> {config.num_days}
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
            <Select.Option key={w} value={w}>{w}</Select.Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          disabledDate={disabledDate}
        />

        <Button type="primary" onClick={applyFilters}>
          Apply
        </Button>

        <Button onClick={resetFilters}>
          Reset
        </Button>
      </Space>

      {/* 🔥 VIEW PILLS */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type={view === "cumulative" ? "primary" : "default"}
          onClick={() => setView("cumulative")}
          style={{ marginLeft: 8 }}
        >
          Cumulative
        </Button>
      </div>

      {/* 🔥 TABLE */}
      <Table
        columns={view === "cumulative" ? cumulativeColumns : daywiseColumns}
        dataSource={filteredData}
        rowKey="warehouse"
        scroll={{ x: true }}
        pagination={false}
        summary={(pageData) => {
          if (pageData.length === 0) return null;

          if (view === "cumulative") {
            let totalOpening = 0;
            let totalReceipt = 0;
            let totalSales = 0;
            let totalClosing = 0;
            let totalDiff = 0;
            let totalClosingStockAtSalesPerc = 0;
            let totalPerc = 0;

            pageData.forEach(({ opening, receipt, sales, closing, difference, closing_stock_at_sales_perc, perc }) => {
              totalOpening += opening || 0;
              totalReceipt += receipt || 0;
              totalSales += sales || 0;
              totalClosing += closing || 0;
              totalDiff += difference || 0;
              totalClosingStockAtSalesPerc += closing_stock_at_sales_perc || 0;
              totalPerc += perc || 0;
            });

            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ background: "#f0f2f5", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                  <Table.Summary.Cell index={0} style={{ padding: "12px 8px" }}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalOpening.toFixed(2)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalReceipt.toFixed(2)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalSales.toFixed(2)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalClosing.toFixed(2)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalDiff.toFixed(2)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalClosingStockAtSalesPerc.toFixed(2)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} style={{ padding: "12px 8px" }} />
                  <Table.Summary.Cell index={8} align="right" style={{ padding: "12px 8px" }}><Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{totalPerc.toFixed(2)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          } else {
            // Daywise view
            const colTotals = {};
            let grandTotal = 0;

            labels.forEach(l => colTotals[l] = 0);

            pageData.forEach(row => {
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
                      <Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{colTotals[l].toFixed(2)}</Text>
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={labels.length + 1} align="right" style={{ padding: "12px 8px" }}>
                    <Text strong style={{ fontSize: "16px", whiteSpace: "nowrap" }}>{grandTotal.toFixed(2)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }
        }}
      />
    </div>
  );
}