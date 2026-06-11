import { useEffect, useState } from "react";
import { Table, Spin, Tabs, message, Button, Card, Tag } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { getReport } from "../api";
import { exportToExcel } from "../utils/exportUtils";
import PiVarianceReport from "./PiVarianceReport";

export default function RawDataReport() {
  const { type: paramType, id: paramId } = useParams();
  
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const id = paramId || pathParts[pathParts.length - 1];
  const type = paramType || (pathParts.includes("report") ? pathParts[pathParts.indexOf("report") + 1] : null);

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [reportName, setReportName] = useState("Raw Data View");

  if (type === "pi_variance") {
    return <PiVarianceReport />;
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getReport(id).then(res => {
      setData(res?.data?.data || []);
      setUploads(res?.data?.uploads || []);
      if (res?.data?.name) {
        setReportName(res.data.name);
      } else if (res?.data?.type) {
        setReportName(res.data.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      message.error("Failed to load data");
    });
  }, [id]);

  const DynamicTable = ({ dataSource, title }) => {
    if (!dataSource || dataSource.length === 0) return <p>No data found.</p>;
    const firstRow = dataSource.find(r => r && typeof r === 'object') || {};
    const columns = Object.keys(firstRow).map(key => ({
       title: String(key).replace(/_/g, ' ').toUpperCase(),
       dataIndex: key,
       key: String(key),
       render: (val) => {
           if (val === null || val === undefined) return "-";
           return typeof val === 'object' ? JSON.stringify(val) : String(val);
       }
    }));
    return (
      <div>
        <div style={{ marginBottom: 16, textAlign: "right" }}>
          <Button type="primary" onClick={() => exportToExcel(dataSource, {}, `${title || reportName}.xlsx`)}>
            Download Excel
          </Button>
        </div>
        <Table dataSource={dataSource} columns={columns} scroll={{ x: 'max' }} size="small" rowKey={(r, i) => i} pagination={{ pageSize: 50 }} />
      </div>
    );
  };

  const validUploads = uploads.filter(u => u.data && u.data.length > 0);

  if (type === 'pi_variance_raw') {
    const piColumns = [
      { title: "Shop Code", dataIndex: "shop_code", sorter: (a, b) => (a.shop_code || "").localeCompare(b.shop_code || "") },
      { title: "Shop Name", dataIndex: "shop_name", sorter: (a, b) => (a.shop_name || "").localeCompare(b.shop_name || "") },
      { 
        title: "Status", 
        dataIndex: "status", 
        filters: [{text: 'Uploaded', value: 'uploaded'}, {text: 'Pending', value: 'pending'}], 
        onFilter: (value, record) => record.status === value,
        render: (status) => <Tag color={status === 'uploaded' ? 'success' : 'warning'}>{status}</Tag>
      },
      { title: "File", dataIndex: "file" },
    ];

    return (
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
            &larr; Back
          </Button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2>{reportName}</h2>
          <Button type="primary" onClick={() => exportToExcel(uploads, {}, `${reportName}_status.xlsx`)}>Download Upload Status</Button>
        </div>
        <Card>
          {loading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
            <Table dataSource={uploads} columns={piColumns} rowKey="shop_code" pagination={{ pageSize: 50 }} />
          )}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{reportName}</h2>
      </div>
      
      <Card>
        {loading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
           data.length > 0 ? <DynamicTable dataSource={data} title={reportName} /> :
           validUploads.length > 0 ? (
               <Tabs items={validUploads.map((u, i) => {
                   const tabLabel = u.warehouse || u.date || u.file || `Upload ${i+1}`;
                   return {
                       key: String(i),
                       label: tabLabel,
                       children: <DynamicTable dataSource={u.data} title={`${reportName} - ${tabLabel}`} />
                   };
               })} />
           ) : <p>No data available. Please ensure files are uploaded and processed.</p>
        )}
      </Card>
    </div>
  );
}