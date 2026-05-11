import { useEffect, useState, useMemo } from "react";
import { Table, Button, DatePicker, Space, Card, message, Select } from "antd";
import { listReports, compareLive, getAllWarehouses } from "../api";
import dayjs from "dayjs";
import { exportToExcel } from "../utils/exportUtils";

export default function ItemIssueConsolidation() {
  const [reports, setReports] = useState([]);
  const [date1, setDate1] = useState(null);
  const [date2, setDate2] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);

  useEffect(() => {
    listReports().then((res) => {
      setReports(res.data || []);
    });
    // Get master list of warehouses
    getAllWarehouses().then(res => {
      setWarehouses(res.data || []);
    });
  }, []);

  const availableDates = useMemo(() => {
    return reports
      .filter((r) => r.type === "daily_secondary_sales" && r.status === "Processed")
      .map((r) => r.config?.date)
      .filter(Boolean);
  }, [reports]);

  const disabledDate = (current) => {
    if (!current) return false;
    const s = current.format("YYYY-MM-DD");
    return !availableDates.includes(s);
  };

  const handleFetch = async () => {
    if (!date1 || !date2) {
      message.warning("Please select both dates");
      return;
    }
    setLoading(true);
    try {
      const res = await compareLive(date1.format("YYYY-MM-DD"), date2.format("YYYY-MM-DD"));
      setData(res.data.data || []);
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
      stn2: 0, gtn2: 0, total2: 0, cfed2: 0, bar2: 0, final2: 0,
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
      t.diff += d.diff || 0;
    });
    t.pct = t.final2 ? Math.round((t.diff / t.final2) * 100) : 0;
    return t;
  }, [filteredData]);

  const d1Label = date1 ? date1.format("DD MMM") : "First";
  const d2Label = date2 ? date2.format("DD MMM") : "Second";

  const columns = [
    {
      title: "Depot",
      dataIndex: "warehouse",
      fixed: "left",
      width: 180,
    },
    {
      title: `First (${d1Label})`,
      children: [
        { title: "STN", dataIndex: "stn1" },
        { title: "GTN", dataIndex: "gtn1" },
        { title: "TOTAL", dataIndex: "total1" },
        { title: "CFED", dataIndex: "cfed1" },
        { title: "BAR", dataIndex: "bar1" },
        { title: "Final", dataIndex: "final1" },
      ],
    },
    {
      title: `Second (${d2Label})`,
      children: [
        { title: "STN", dataIndex: "stn2" },
        { title: "GTN", dataIndex: "gtn2" },
        { title: "TOTAL", dataIndex: "total2" },
        { title: "CFED", dataIndex: "cfed2" },
        { title: "BAR", dataIndex: "bar2" },
        { title: "Final", dataIndex: "final2" },
      ],
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
  ];

  const downloadExcel = () => {
    const exportData = filteredData.map(d => ({
      Depot: d.warehouse,
      [`First STN (${d1Label})`]: d.stn1,
      [`First GTN (${d1Label})`]: d.gtn1,
      [`First TOTAL (${d1Label})`]: d.total1,
      [`First CFED (${d1Label})`]: d.cfed1,
      [`First BAR (${d1Label})`]: d.bar1,
      [`First Final (${d1Label})`]: d.final1,
      [`Second STN (${d2Label})`]: d.stn2,
      [`Second GTN (${d2Label})`]: d.gtn2,
      [`Second TOTAL (${d2Label})`]: d.total2,
      [`Second CFED (${d2Label})`]: d.cfed2,
      [`Second BAR (${d2Label})`]: d.bar2,
      [`Second Final (${d2Label})`]: d.final2,
      "Difference Cases": d.diff,
      "Difference %": d.pct
    }));

    // Add totals row to export
    exportData.push({
      Depot: "TOTAL",
      [`First STN (${d1Label})`]: totals.stn1,
      [`First GTN (${d1Label})`]: totals.gtn1,
      [`First TOTAL (${d1Label})`]: totals.total1,
      [`First CFED (${d1Label})`]: totals.cfed1,
      [`First BAR (${d1Label})`]: totals.bar1,
      [`First Final (${d1Label})`]: totals.final1,
      [`Second STN (${d2Label})`]: totals.stn2,
      [`Second GTN (${d2Label})`]: totals.gtn2,
      [`Second TOTAL (${d2Label})`]: totals.total2,
      [`Second CFED (${d2Label})`]: totals.cfed2,
      [`Second BAR (${d2Label})`]: totals.bar2,
      [`Second Final (${d2Label})`]: totals.final2,
      "Difference Cases": totals.diff,
      "Difference %": totals.pct
    });

    exportToExcel(
      exportData,
      {
        "First Date": date1.format("YYYY-MM-DD"),
        "Second Date": date2.format("YYYY-MM-DD"),
        "Warehouse Filter": selectedWarehouse || "All"
      },
      "item_issue_consolidation.xlsx",
      "Item Issue Consolidation"
    );
  };

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <Space size="large" align="end" wrap>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>First Date</div>
            <DatePicker 
              value={date1} 
              onChange={setDate1} 
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
                options={warehouses.map(w => ({ value: w, label: w }))}
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
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

