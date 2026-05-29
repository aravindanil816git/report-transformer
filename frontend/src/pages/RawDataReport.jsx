import { useEffect, useState } from "react";
import { Table, Spin, Tabs, message, Button, Card } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { getReport } from "../api";
import { exportToExcel } from "../utils/exportUtils";

export default function RawDataReport() {
  const { type, id: paramId } = useParams();
  
  // Safely extract ID directly from the URL if App.jsx router is missing the :id capture block
  const id = paramId || window.location.pathname.split("/").filter(Boolean).pop();

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [reportName, setReportName] = useState("Raw Data View");

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

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{reportName}</h2>
        <Button onClick={() => navigate(-1)}>Back</Button>
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