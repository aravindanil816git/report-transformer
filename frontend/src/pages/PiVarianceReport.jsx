import { useEffect, useState, useMemo } from "react";
import { Table, Select, Segmented, Row, Col, Button, Checkbox, Spin, Alert, Typography, Card, message } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { PlusSquareOutlined, MinusSquareOutlined } from "@ant-design/icons";
import { getReport } from "../api";
import { exportToExcel } from "../utils/exportUtils";

const { Title } = Typography;
const METRICS = ['l3ms', 'rl', 'rq', 'mq'];

export default function PiVarianceReport() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ brands: [], warehouses: [], bonds: [] });
  const [config, setConfig] = useState({});

  const [mode, setMode] = useState("warehouse"); // warehouse or bond
  const [reportInfo, setReportInfo] = useState({ name: "PI Variance Report" });
  const [selectedWarehouse, setSelectedWarehouse] = useState();
  const [selectedBond, setSelectedBond] = useState();
  const [useWholeNumbers, setUseWholeNumbers] = useState(false);
  const [comparativeMode, setComparativeMode] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const load = () => {
    setLoading(true);
    setError(null);
    getReport(id)
      .then((res) => {
        if (res.data?.error) {
          setError(res.data.error);
          setData([]);
        } else {
          setData(res.data.data || []);
          setMeta(res.data.meta || { brands: [], warehouses: [], bonds: [] });
          setConfig(res.data.config || {});
          setReportInfo({ name: res.data?.name || "PI Variance Report" });
        }
      })
      .catch((err) => {
        setError("Failed to load report data. Please try again.");
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const toggleGroup = (groupKey) => {
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const formatVal = (val) => {
    const num = Number(val);
    if (isNaN(num)) return 0;
    return useWholeNumbers ? Math.round(num) : num.toFixed(2);
  };

  const filteredData = useMemo(() => {
    if (!selectedWarehouse && !selectedBond) return data;
    return data.filter(item => {
      const warehouseMatch = selectedWarehouse ? item.warehouse === selectedWarehouse : true;
      const bondMatch = selectedBond ? item.bond === selectedBond : true;
      return warehouseMatch && bondMatch;
    });
  }, [data, selectedWarehouse, selectedBond]);

  const tableData = useMemo(() => {
    const rows = [];
    const groupKey = mode === 'warehouse' ? 'warehouse' : 'bond';

    const groupedByMode = filteredData.reduce((acc, item) => {
      const key = item[groupKey] || 'UNMAPPED';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const grandTotal = {};
    meta.brands.forEach(brand => {
      METRICS.forEach(metric => {
        if (metric === 'l3ms') {
          grandTotal[`${brand}_${metric}_cm`] = 0;
        } else {
          ['cm', 'lm', 'var'].forEach(type => {
            grandTotal[`${brand}_${metric}_${type}`] = 0;
          });
        }
      });
    });

    Object.entries(groupedByMode).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, items]) => {
      const isCollapsed = collapsedGroups[key];
      const groupTotal = { ...grandTotal }; // Initialize with 0s for keys

      items.forEach(item => {
        Object.keys(groupTotal).forEach(totalKey => {
          groupTotal[totalKey] += item[totalKey] || 0;
        });
      });

      rows.push({
        key: `group_${key}`,
        display_name: key,
        isGroupHeader: true,
        isCollapsed,
        ...groupTotal
      });

      if (!isCollapsed) {
        items.forEach(item => {
          rows.push({
            ...item,
            key: `shop_${item.shop_code}`,
            display_name: `${item.shop_name} (${item.shop_code})`,
          });
        });

        rows.push({
          key: `total_${key}`,
          display_name: `${key} Total`,
          isGroupTotal: true,
          ...groupTotal
        });
        rows.push({ key: `spacer_${key}`, isSpacer: true });
      }

      Object.keys(grandTotal).forEach(totalKey => {
        grandTotal[totalKey] += groupTotal[totalKey] || 0;
      });
    });

    if (rows.length > 0) {
      rows.push({
        key: 'grand_total',
        display_name: 'Grand Total',
        isGrandTotal: true,
        ...grandTotal
      });
    }

    return rows;
  }, [filteredData, mode, collapsedGroups, meta.brands]);

  const columns = useMemo(() => {
    const baseCols = [{
      title: 'Row Labels',
      dataIndex: 'display_name',
      fixed: 'left',
      width: 280,
      render: (text, record) => {
        if (record.isSpacer) return null;
        if (record.isGroupHeader) {
          const Icon = record.isCollapsed ? PlusSquareOutlined : MinusSquareOutlined;
          return (
            <div onClick={() => toggleGroup(text)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon style={{ color: '#888' }} />
              <b style={{ color: "#a52a2a" }}>{text}</b>
            </div>
          );
        }
        if (record.isGroupTotal || record.isGrandTotal) return <b style={{ color: record.isGrandTotal ? '#000' : '#a52a2a' }}>{text}</b>;
        return <span style={{ paddingLeft: 24 }}>{text}</span>;
      }
    }];

    const brandCols = (meta.brands || []).map(brand => ({
      title: brand,
      children: METRICS.map(metric => {
        if (!comparativeMode || metric === 'l3ms') {
          return {
            title: metric.toUpperCase(),
            dataIndex: `${brand}_${metric}_cm`,
            align: 'right',
            width: 85,
            render: (val, record) => {
              if (record.isSpacer) return null;
              const isTotal = record.isGroupHeader || record.isGroupTotal || record.isGrandTotal;
              const formattedVal = formatVal(val);
              return isTotal ? <b>{formattedVal}</b> : formattedVal;
            }
          };
        }
        return {
          title: metric.toUpperCase(),
          children: ['cm', 'lm', 'var'].map(type => ({
            title: type.toUpperCase(),
            dataIndex: `${brand}_${metric}_${type}`,
            align: 'right',
            width: 85,
            render: (val, record) => {
              if (record.isSpacer) return null;
              const isTotal = record.isGroupHeader || record.isGroupTotal || record.isGrandTotal;
              const formattedVal = formatVal(val);
              
              if (type === 'var') {
                const num = Number(val);
                const color = num < 0 ? 'red' : (num > 0 ? 'green' : 'inherit');
                return <span style={{ color, fontWeight: isTotal ? 'bold' : 'normal' }}>{formattedVal}</span>;
              }
              
              return isTotal ? <b>{formattedVal}</b> : formattedVal;
            }
          }))
        };
      })
    }));

    return [...baseCols, ...brandCols];
  }, [meta.brands, useWholeNumbers, collapsedGroups, mode, comparativeMode]);

  const downloadExcel = () => {
    const dataForExport = tableData.filter(r => !r.isSpacer).map(row => {
        const exportRow = { 'Row Labels': row.display_name };
        columns.slice(1).forEach(brandCol => {
            brandCol.children.forEach(metricCol => {
                if (metricCol.children) {
                    metricCol.children.forEach(typeCol => {
                        const key = `${brandCol.title} ${metricCol.title} ${typeCol.title}`;
                        exportRow[key] = formatVal(row[typeCol.dataIndex]);
                    });
                } else {
                    const key = `${brandCol.title} ${metricCol.title}`;
                    exportRow[key] = formatVal(row[metricCol.dataIndex]);
                }
            });
        });
        return exportRow;
    });

    exportToExcel(
      dataForExport,
      {
        "Report": "PI Variance",
        "Month": config.month || "N/A",
        "View": mode.charAt(0).toUpperCase() + mode.slice(1),
        "Warehouse Filter": selectedWarehouse,
        "Bond Filter": selectedBond,
        "Round off": useWholeNumbers ? "Yes" : "No",
        "Comparative Mode": comparativeMode ? "Yes" : "No"
      },
      `pi_variance_report_${config.month}.xlsx`
    );
  };

  if (loading) {
    return <Spin tip="Loading Report..." size="large" style={{ display: 'block', marginTop: '50px' }} />;
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon style={{ margin: 24 }}/>;
  }

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
            &larr; Back
          </Button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{reportInfo.name}</Title>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }} align="middle">
          <Col>
            <Segmented
              options={[{ label: "Warehouse View", value: "warehouse" }, { label: "Bond View", value: "bond" }]}
              value={mode}
              onChange={setMode}
            />
          </Col>
          <Col>
            <Select
              placeholder="Filter by Warehouse"
              allowClear
              showSearch
              style={{ width: 220 }}
              options={(meta.warehouses || []).map(w => ({ value: w, label: w }))}
              value={selectedWarehouse}
              onChange={setSelectedWarehouse}
            />
          </Col>
          <Col>
            <Select
              placeholder="Filter by Bond"
              allowClear
              showSearch
              style={{ width: 180 }}
              options={(meta.bonds || []).map(b => ({ value: b, label: b }))}
              value={selectedBond}
              onChange={setSelectedBond}
            />
          </Col>
          <Col>
            <Checkbox checked={useWholeNumbers} onChange={e => setUseWholeNumbers(e.target.checked)}>
              Round off
            </Checkbox>
          </Col>
          <Col>
            <Checkbox checked={comparativeMode} onChange={e => setComparativeMode(e.target.checked)}>
              Comparative mode
            </Checkbox>
          </Col>
          <Col>
            <Button onClick={downloadExcel}>Download Excel</Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={tableData}
          pagination={false}
          bordered
          size="small"
          scroll={{ x: 'max-content' }}
          rowClassName={(record) => {
            if (record.isSpacer) return "spacer-row";
            if (record.isGrandTotal) return "grand-total-row";
            if (record.isGroupTotal) return "group-total-row";
            if (record.isGroupHeader) return "group-header-row";
            return "data-row";
          }}
        />
        <style>{`
          .spacer-row td {
            padding: 2px 0 !important;
            background-color: #fff !important;
            height: 4px;
            border: none !important;
          }
          .group-header-row td, .group-total-row td {
            background-color: #f2f2f2 !important;
          }
          .grand-total-row td {
            background-color: #e6f7ff !important;
            font-weight: bold;
          }
          .ant-table-thead > tr > th {
            background-color: #fafafa !important;
            text-align: center !important;
            font-weight: bold !important;
          }
          .ant-table-summary tr td {
              font-weight: bold;
          }
          .ant-table-cell-fix-left {
              background: #fff;
          }
          .group-header-row .ant-table-cell-fix-left {
              background: #f2f2f2;
          }
        `}</style>
      </Card>
    </div>
  );
}