import { useEffect, useState } from "react";
import { Table, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportUtils";

export default function MonthComparative() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({});

  useEffect(() => {
    getReport(id).then((res) => {
      setData(res.data.data || []);
      setMeta(res.data);
    });
  }, [id]);

  const d1Label = meta?.date1
    ? dayjs(meta.date1).format("DD MMM")
    : "First";

  const d2Label = meta?.date2
    ? dayjs(meta.date2).format("DD MMM")
    : "Second";

  const columns = [
    {
      title: "Depot",
      dataIndex: "warehouse",
      fixed: "left",
      width: 180,
    },

    // 🔥 FIRST
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

    // 🔥 SECOND
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

    // 🔥 DIFFERENCE
    {
      title: "Difference",
      children: [
        { title: "Cases", dataIndex: "diff" },
        {
          title: "%",
          dataIndex: "pct",
          render: (v) => (
            <span
              style={{
                color: v < 0 ? "#d94f4f" : "#2ca02c",
                fontWeight: 600,
              }}
            >
              {v}%
            </span>
          ),
        },
      ],
    },
  ];

  // ✅ DOWNLOAD
  const downloadExcel = () => {
    const exportData = data.map(d => ({
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

    exportToExcel(
      exportData,
      {
        "First Date": meta.date1,
        "Second Date": meta.date2
      },
      "sec_sales_comparison.xlsx",
      "Sec. Sales Comparison"
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Sec. Sales Comparison Report</h2>
        <Button type="primary" onClick={downloadExcel}>Download Excel</Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="warehouse"
        scroll={{ x: 1200 }}
        pagination={false}
      />
    </div>
  );
}