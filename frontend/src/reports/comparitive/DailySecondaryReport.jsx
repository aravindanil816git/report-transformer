import { useEffect, useState } from "react";
import { Table } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";

export default function DailySecondaryReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);

  useEffect(() => {
    getReport(id).then(res => {
      setData(res.data.data || []);
    });
  }, [id]);

  const columns = [
    { title: "Warehouse", dataIndex: "warehouse" },
    { title: "STN", dataIndex: "STN" },
    { title: "GTN", dataIndex: "GTN" },
    { title: "TOTAL", dataIndex: "TOTAL" },
    { title: "CFED", dataIndex: "CFED" },
    { title: "BAR", dataIndex: "BAR" },
  ];

  return <Table columns={columns} dataSource={data} rowKey="warehouse" />;
}