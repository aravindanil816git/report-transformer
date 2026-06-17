import { useEffect, useState, useMemo } from "react";
import { Table, Button, DatePicker, Space, Card, message, Select } from "antd";
import { useNavigate } from "react-router-dom";
import { listReports, compareLive, getAllWarehouses } from "../api";
import dayjs from "dayjs";
import { exportToExcel } from "../utils/exportUtils";
import { disabledFutureMonthDates } from "../utils/dateUtils";

export default function ItemIssueConsolidation() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [date1, setDate1] = useState(null);
  const [date2, setDate2] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [lastMonthLabel, setLastMonthLabel] = useState("");
  const [daySales1, setDaySales1] = useState("-");
  const [daySales2, setDaySales2] = useState("-");
  const [hasSetDefaults, setHasSetDefaults] = useState(false);

  useEffect(() => {
    listReports().then((res) => {
      setReports(res.data?.items || res.data || []);
    });
    // Get master list of warehouses
    getAllWarehouses().then(res => {
      setWarehouses(res.data || []);
    });
  }, []);

  const availableDates = useMemo(() => {
    return reports
      .filter((r) => ["item_issue_consolidation", "daily_secondary_sales"].includes(r.type) && r.status === "Processed")
      .map((r) => r.config?.date)
      .filter(Boolean);
  }, [reports]);

  // Set smart default dates once the available dates are loaded
  useEffect(() => {
    if (availableDates.length > 0 && !hasSetDefaults) {
      const sortedDates = [...availableDates].sort();
      const latestDateStr = sortedDates[sortedDates.length - 1];
      const initialDate1 = dayjs(latestDateStr);
      setDate1(initialDate1);

      const lastMonthStr = initialDate1.subtract(1, "month").format("YYYY-MM");
      const lastMonthDates = sortedDates.filter(d => d.startsWith(lastMonthStr));

      if (lastMonthDates.length > 0) {
        setDate2(dayjs(lastMonthDates[lastMonthDates.length - 1]));
      }
      
      setHasSetDefaults(true);
    }
  }, [availableDates, hasSetDefaults]);

  const disabledDate = (current) => {
    if (!current) return false;
    if (disabledFutureMonthDates(current)) return true;
    const s = current.format("YYYY-MM-DD");
    return !availableDates.includes(s);
  };

  const handleDate1Change = (val) => {
    setDate1(val);
    if (val) {
      const lastMonthStr = val.subtract(1, "month").format("YYYY-MM");
      const lastMonthDates = availableDates.filter(d => d.startsWith(lastMonthStr)).sort();
      if (lastMonthDates.length > 0) {
        setDate2(dayjs(lastMonthDates[lastMonthDates.length - 1]));
      } else {
        setDate2(null);
      }
    } else {
      setDate2(null);
    }
  };

  const handleFetch = async () => {
    if (!date1 || !date2) {
      message.warning("Please select both dates");
      return;
    }
    setLoading(true);
    try {
      const res = await compareLive(date1.format("YYYY-MM-DD"), date2.format("YYYY-MM-DD"));
      const payload = res?.data || res;
      setData(payload?.data || payload || []);
      setLastMonthLabel(payload?.last_month_date_label || "");
      setDaySales1(payload?.day_sales1 ?? "-");
      setDaySales2(payload?.day_sales2 ?? "-");
    } catch (e) {
      message.error("Failed to fetch comparison data");
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!selectedWarehouse) return data;
    return data.filter(d => d.warehouse === selectedWarehouse);
  }, [data, selectedWarehouse]);

  const totals = useMemo(() => {
    const t = {
      stn1: 0, gtn1: 0, total1: 0, cfed1: 0, bar1: 0, final1: 0,
      stn2: 0, gtn2: 0, total2: 0, cfed2: 0, bar2: 0, final2: 0, last_month_final: 0,
      diff: 0
    };
    filteredData.forEach(d => {
      t.stn1 += d.stn1 || 0;
      t.gtn1 += d.gtn1 || 0;
      t.total1 += d.total1 || 0;
      t.cfed1 += d.cfed1 || 0;
      t.bar1 += d.bar1 || 0;
      t.final1 += d.final1 || 0;
      t.stn2 += d.stn2 || 0;
      t.gtn2 += d.gtn2 || 0;
      t.total2 += d.total2 || 0;
      t.cfed2 += d.cfed2 || 0;
      t.bar2 += d.bar2 || 0;
      t.final2 += d.final2 || 0;
      t.last_month_final += d.last_month_final || 0;
      t.diff += d.diff || 0;
    });
    t.pct = t.final2 ? Math.round((t.diff / t.final2) * 100) : 0;
    return t;
  }, [filteredData]);

  const formatDepot = (name) => {
    if (name && typeof name === "string") {
      return name.replace(/^WH-/i, "").split(/\s+(?:FL|RFL)/i)[0].trim();
    }
    return name;
  };

  const d1Label = date1 ? date1.format("MMM YYYY") : "Date 1";
  const d2Label = date2 ? date2.format("MMM YYYY") : "Date 2";
  const lmLabel = lastMonthLabel ? `Last Month (${lastMonthLabel})` : "Last Month";

  const columns = [
    {
      title: "Depot",
      dataIndex: "warehouse",
      fixed: "left",
      width: 180,
      render: (text) => formatDepot(text),
    },
    {
      title: `Secondary Sales (${d1Label} vs ${d2Label})`,
      children: [
        { title: "STN", dataIndex: "stn1" },
        { title: "GTN", dataIndex: "gtn1" },
        { title: "TOTAL", dataIndex: "total1" },
        { title: "CFED", dataIndex: "cfed1" },
        { title: "BAR", dataIndex: "bar1" },
        { title: d1Label, dataIndex: "final1" },
        { title: "STN", dataIndex: "stn2" },
        { title: "GTN", dataIndex: "gtn2" },
        { title: "TOTAL", dataIndex: "total2" },
        { title: "CFED", dataIndex: "cfed2" },
        { title: "BAR", dataIndex: "bar2" },
        { title: d2Label, dataIndex: "final2" },
      ]
    },
    {
      title: "Difference",
      children: [
        { title: "Cases", dataIndex: "diff" },
        {
          title: "%",
          dataIndex: "pct",
          render: (v) => (
            <span style={{ color: v < 0 ? "#d94f4f" : "#2ca02c", fontWeight: 600 }}>
              {v}%
            </span>
          ),
        },
      ],
    },
    {
      title: lmLabel,
      dataIndex: "last_month_final",
      width: 150,
    },
  ];

  const downloadExcel = () => {
    const exportData = filteredData.map(d => ({
      Depot: formatDepot(d.warehouse),
      [`STN (${d1Label})`]: d.stn1,
      [`GTN (${d1Label})`]: d.gtn1,
      [`TOTAL (${d1Label})`]: d.total1,
      [`CFED (${d1Label})`]: d.cfed1,
      [`BAR (${d1Label})`]: d.bar1,
      [d1Label]: d.final1,
      [`STN (${d2Label})`]: d.stn2,
      [`GTN (${d2Label})`]: d.gtn2,
      [`TOTAL (${d2Label})`]: d.total2,
      [`CFED (${d2Label})`]: d.cfed2,
      [`BAR (${d2Label})`]: d.bar2,
      [d2Label]: d.final2,
      "Difference Cases": d.diff,
      "Difference %": d.pct,
      [lmLabel]: d.last_month_final,
    }));

    // Add totals row to export
    exportData.push({
      Depot: "TOTAL",
      [`STN (${d1Label})`]: totals.stn1,
      [`GTN (${d1Label})`]: totals.gtn1,
      [`TOTAL (${d1Label})`]: totals.total1,
      [`CFED (${d1Label})`]: totals.cfed1,
      [`BAR (${d1Label})`]: totals.bar1,
      [d1Label]: totals.final1,
      [`STN (${d2Label})`]: totals.stn2,
      [`GTN (${d2Label})`]: totals.gtn2,
      [`TOTAL (${d2Label})`]: totals.total2,
      [`CFED (${d2Label})`]: totals.cfed2,
      [`BAR (${d2Label})`]: totals.bar2,
      [d2Label]: totals.final2,
      "Difference Cases": totals.diff,
      "Difference %": totals.pct,
      [lmLabel]: totals.last_month_final,
    });

    // Add Day Sales row
    exportData.push({
      Depot: "Day Sales",
      [`TOTAL (${d1Label})`]: daySales1,
      [`TOTAL (${d2Label})`]: daySales2,
    });

    exportToExcel(
      exportData,
      {
        "First Date": date1.format("MMM YYYY"),
        "Second Date": date2.format("MMM YYYY"),
        "Warehouse Filter": selectedWarehouse || "All"
      },
      "item_issue_consolidation.xlsx",
      "Item Issue Consolidation"
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Item Issue Consolidation</h2>
      </div>
      <Card style={{ marginBottom: 20 }}>
        <Space size="large" align="end" wrap>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>First Date</div>
            <DatePicker 
              value={date1} 
              onChange={handleDate1Change} 
              disabledDate={disabledDate}
              format="DD MMM YYYY"
            />
          </div>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>Second Date</div>
            <DatePicker 
              value={date2} 
              onChange={setDate2} 
              disabledDate={disabledDate}
              format="DD MMM YYYY"
            />
          </div>
          <Button type="primary" onClick={handleFetch} loading={loading}>
            View Report
          </Button>
          
          {data.length > 0 && (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>Filter Warehouse</div>
              <Select
                placeholder="All Warehouses"
                style={{ width: 200 }}
                allowClear
                value={selectedWarehouse}
                onChange={setSelectedWarehouse}
                options={warehouses.map(w => ({ value: w, label: formatDepot(w) }))}
              />
            </div>
          )}

          {data.length > 0 && (
            <Button onClick={downloadExcel}>Download Excel</Button>
          )}
        </Space>
      </Card>

      {data.length > 0 && (
        <div>
          <h2>Item Issue Consolidation Report</h2>
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="warehouse"
            scroll={{ x: 1200 }}
            pagination={false}
            size="small"
            bordered
            summary={(pageData) => {
              return (
                <Table.Summary fixed>
                  <>
                    <Table.Summary.Row style={{ backgroundColor: "#fafafa", fontWeight: "bold" }}>
                      <Table.Summary.Cell index={0} fixed="left">TOTAL</Table.Summary.Cell>
                      <Table.Summary.Cell index={1}>{totals.stn1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={2}>{totals.gtn1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={3}>{totals.total1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={4}>{totals.cfed1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={5}>{totals.bar1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={6}>{totals.final1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={7}>{totals.stn2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={8}>{totals.gtn2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={9}>{totals.total2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={10}>{totals.cfed2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={11}>{totals.bar2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={12}>{totals.final2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={13}>{totals.diff}</Table.Summary.Cell>
                      <Table.Summary.Cell index={14}>
                        <span style={{ color: totals.pct < 0 ? "#d94f4f" : "#2ca02c" }}>
                          {totals.pct}%
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={15}>{totals.last_month_final}</Table.Summary.Cell>
                    </Table.Summary.Row>
                    <Table.Summary.Row style={{ backgroundColor: "#f0f2f5", fontWeight: "bold" }}>
                      <Table.Summary.Cell index={0} fixed="left">Day Sales</Table.Summary.Cell>
                      <Table.Summary.Cell index={1} colSpan={2} />
                      <Table.Summary.Cell index={3}>{daySales1}</Table.Summary.Cell>
                      <Table.Summary.Cell index={4} colSpan={5} />
                      <Table.Summary.Cell index={9}>{daySales2}</Table.Summary.Cell>
                      <Table.Summary.Cell index={10} colSpan={6} />
                    </Table.Summary.Row>
                  </>
                </Table.Summary>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
