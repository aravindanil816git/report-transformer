import { useEffect, useState } from "react";
import { Table, Button, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function DailyWarehouseOfftakeReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getReport(id).then((res) => {
      setData(res.data?.data || []);
      setLoading(false);
    });
  }, [id]);

  const columns = [
    {
      title: "Bond",
      dataIndex: "bond",
      sorter: (a, b) => a.bond.localeCompare(b.bond),
    },
    {
      title: "Warehouse",
      dataIndex: "warehouse",
      sorter: (a, b) => a.warehouse.localeCompare(b.warehouse),
    },
    {
      title: "Shop Code",
      dataIndex: "shop_code",
      sorter: (a, b) => a.shop_code.localeCompare(b.shop_code),
    },
    {
      title: "Shop Name",
      dataIndex: "shop_name",
    },
    {
      title: "Brand",
      dataIndex: "brand",
      sorter: (a, b) => a.brand.localeCompare(b.brand),
    },
    {
      title: "Issues (Cases)",
      dataIndex: "issues",
      render: (v) => <b>{v}</b>,
      sorter: (a, b) => a.issues - b.issues,
    },
  ];

  const downloadExcel = () => {
    const exportData = data.map((item) => ({
      Bond: item.bond,
      Warehouse: item.warehouse,
      "Shop Code": item.shop_code,
      "Shop Name": item.shop_name,
      Brand: item.brand,
      "Issues (Cases)": item.issues,
    }));

    exportToExcel(
      exportData,
      {},
      `daily_warehouse_offtake_${id}.xlsx`,
      "Daily Warehouse Offtake"
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2>Daily Warehouse Offtake</h2>
        <Button
          type="primary"
          onClick={downloadExcel}
          disabled={data.length === 0}
        >
          Download Excel
        </Button>
      </div>

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        rowKey={(r) => `${r.warehouse}-${r.shop_code}`}
        pagination={false}
        summary={(pageData) => {
          let totalIssues = 0;
          pageData.forEach(({ issues }) => {
            totalIssues += Number(issues || 0);
          });

          return (
            <Table.Summary fixed>
              <Table.Summary.Row
                style={{ backgroundColor: "#fafafa", fontWeight: "bold" }}
              >
                <Table.Summary.Cell index={0} colSpan={4}>
                  GRAND TOTAL
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>{totalIssues}</Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
    </div>
  );
}
