import { useEffect, useState, useMemo } from "react";
import { Table, Spin, message, Button, Card, Select, Space } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { getReport, getAllWarehouses } from "../api";
import { exportToExcel } from "../utils/exportUtils";

export default function WarehouseStock() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [reportName, setReportName] = useState("Warehouse Stock Report");
  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    getAllWarehouses()
      .then((res) => {
        setWarehouses(res.data || res || []);
      })
      .catch((err) => console.error("Failed to load warehouses", err));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getReport(id).then(res => {
      setData(res?.data?.data || []);
      if (res?.data?.name) {
        setReportName(res.data.name);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      message.error("Failed to load warehouse stock data");
    });
  }, [id]);

  const filteredData = useMemo(() => {
    if (!warehouseFilter) return data;
    return data.filter(row => {
      const wh = row._source_warehouse || row.warehouse || row.Warehouse || row.WAREHOUSE;
      return wh === warehouseFilter;
    });
  }, [data, warehouseFilter]);

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    const keys = Object.keys(data[0]);
    const findKey = (keywords) => keys.find(k => keywords.every(kw => k.toLowerCase().includes(kw)));
    
    return [
      { title: "Warehouse", key: "wh", render: (_, r) => r._source_warehouse || r.warehouse || r.Warehouse || r.WAREHOUSE || "-" },
      { title: "Item Code", dataIndex: findKey(['item', 'code']) || 'Item Code' },
      { title: "Current Supplier Name", dataIndex: findKey(['supplier', 'name']) || 'Current Supplier Name' },
      { title: "Brand", dataIndex: findKey(['brand']) || 'Brand' },
      { title: "Packing", dataIndex: findKey(['packing']) || 'Packing' },
      { title: "Inward (Cases)", dataIndex: findKey(['inward', 'case']) || findKey(['inward', 'cases']) || 'Inward (Cases)' }
    ];
  }, [data]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{reportName}</h2>
        <Button onClick={() => navigate(-1)}>Back</Button>
      </div>
      
      <Card>
        {loading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <Space>
                <Select
                  placeholder="Filter by Warehouse"
                  style={{ width: 250 }}
                  allowClear
                  showSearch
                  value={warehouseFilter}
                  onChange={setWarehouseFilter}
                  options={warehouses.map(wh => ({ label: wh, value: wh }))}
                />
              </Space>
              <Button 
                type="primary" 
                onClick={() => exportToExcel(filteredData, { Warehouse: warehouseFilter || "All" }, `${reportName}.xlsx`)}
                disabled={filteredData.length === 0}
              >
                Download Excel
              </Button>
            </div>
            <Table 
              dataSource={filteredData} 
              columns={columns} 
              scroll={{ x: 'max-content' }} 
              size="small" 
              rowKey={(r, i) => i} 
              pagination={{ pageSize: 50 }} 
              summary={(pageData) => {
                if (!pageData || pageData.length === 0) return null;
                
                let totalInward = 0;
                const inwardKey = columns.find(c => c.title === "Inward (Cases)")?.dataIndex;

                if (inwardKey) {
                  pageData.forEach(row => {
                    const val = Number(row[inwardKey]);
                    if (!isNaN(val)) {
                      totalInward += val;
                    }
                  });
                }

                return (
                  <Table.Summary fixed="bottom">
                    <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold" }}>
                      {columns.map((col, idx) => {
                        if (idx === 0) return <Table.Summary.Cell key={idx} index={idx}>Grand Total</Table.Summary.Cell>;
                        if (col.title === "Inward (Cases)") return <Table.Summary.Cell key={idx} index={idx}>{totalInward > 0 ? totalInward.toFixed(2) : "-"}</Table.Summary.Cell>;
                        return <Table.Summary.Cell key={idx} index={idx} />;
                      })}
                    </Table.Summary.Row>
                  </Table.Summary>
                );
              }}
            />
          </>
        )}
        {!loading && data.length === 0 && <p>No processed data available for this report.</p>}
      </Card>
    </div>
  );
}