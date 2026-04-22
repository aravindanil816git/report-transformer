import { useEffect, useState } from "react";
import { Table } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import dayjs from "dayjs";

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
    : "Current";

  const d2Label = meta?.date2
    ? dayjs(meta.date2).format("DD MMM")
    : "Previous";

  const columns = [
    {
      title: "Depot",
      dataIndex: "warehouse",
      fixed: "left",
      width: 180,
    },

    // 🔥 CURRENT
    {
      title: `Current (${d1Label})`,
      children: [
        { title: "STN", dataIndex: "stn1" },
        { title: "GTN", dataIndex: "gtn1" },
        { title: "TOTAL", dataIndex: "total1" },
        { title: "CFED", dataIndex: "cfed1" },
        { title: "BAR", dataIndex: "bar1" },
        { title: "Final", dataIndex: "final1" },
      ],
    },

    // 🔥 PREVIOUS
    {
      title: `Previous (${d2Label})`,
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

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="warehouse"
      scroll={{ x: 1200 }}
      pagination={false}
    />
  );
}