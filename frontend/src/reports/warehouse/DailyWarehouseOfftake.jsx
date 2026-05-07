import { useEffect, useState, useMemo } from "react";
import { Table, Button, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../../api";
import { exportToExcel } from "../../utils/exportUtils";

export default function DailyWarehouseOfftakeReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    setLoading(true);
    getReport(id).then((res) => {
      setData(res.data?.data || []);
      setUploads(res.data?.uploads || []);
      setConfig(res.data?.config || {});
      setLoading(false);
    });
  }, [id]);

  const periodLabel = useMemo(() => {
    const froms = uploads.map(u => u.from).filter(Boolean);
    const tos = uploads.map(u => u.to).filter(Boolean);
    
    if (froms.length && tos.length) {
      return `PERIOD : ${froms[0]} - ${tos[0]}`;
    }
    
    if (config.date) {
      return `PERIOD : ${config.date} - ${config.date}`;
    }
    
    return "";
  }, [uploads, config]);

  const uploadDateLabel = useMemo(() => {
    const dates = uploads.map(u => u.from).filter(Boolean);
    if (dates.length) return `UPLOAD DATE : ${dates[0]}`;
    if (config.date) return `UPLOAD DATE : ${config.date}`;
    return "";
  }, [uploads, config]);

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
      `secondary_sales_daily_${id}.xlsx`,
      "Secondary Sales - Daily"
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
        <h2>Secondary Sales - Daily</h2>
        <Button
          type="primary"
          onClick={downloadExcel}
          disabled={data.length === 0}
        >
          Download Excel
        </Button>
      </div>

      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{uploadDateLabel}</span>
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
