import { useEffect, useState } from "react";
import { Table } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";

export default function MonthlyStockSales() {
  const { id } = useParams();
  const [data, setData] = useState([]);

  useEffect(() => {
    getReport(id).then((res) => {
      setData(res.data.data || []);
    });
  }, [id]);

  const totals = data.reduce(
    (acc, d) => {
      acc.op += d.op || 0;
      acc.inward += d.inward || 0;
      acc.total += d.total || 0;
      acc.sales += d.sales || 0;
      acc.cl += d.cl || 0;
      return acc;
    },
    { op: 0, inward: 0, total: 0, sales: 0, cl: 0 }
  );

  const columns = [
    { title: "ITEM", dataIndex: "warehouse" },
    { title: "OP STOCK", dataIndex: "op" },
    { title: "INWARD", dataIndex: "inward" },
    { title: "TOTAL", dataIndex: "total" },
    { title: "SALES", dataIndex: "sales" },
    { title: "CL STOCK", dataIndex: "cl" },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="warehouse"
      pagination={false}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell>Grand Total</Table.Summary.Cell>
          <Table.Summary.Cell>{totals.op}</Table.Summary.Cell>
          <Table.Summary.Cell>{totals.inward}</Table.Summary.Cell>
          <Table.Summary.Cell>{totals.total}</Table.Summary.Cell>
          <Table.Summary.Cell>{totals.sales}</Table.Summary.Cell>
          <Table.Summary.Cell>{totals.cl}</Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  );
}