import { useEffect, useState } from "react";
import { Table, InputNumber, Button, message, Space, DatePicker } from "antd";
import { useParams } from "react-router-dom";
import { getReport, processReport } from "../api";
import axios from "axios";

const { RangePicker } = DatePicker;

export default function AchievedTargetReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [brands, setBrands] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([]);

  useEffect(() => {
    loadData();
  }, [id, dateRange]);

  const loadData = () => {
    // 🛑 EARLY RETURN: Do not make the network call if dates are missing
    if ((!dateRange || dateRange.length !== 2) && Object.keys(config).length > 0) {
      message.warning("Please select a date range");
      return;
    }

    setLoading(true);
    const params = {};
    if (dateRange && dateRange.length === 2) {
      params.start_date = dateRange[0].format("YYYY-MM-DD");
      params.end_date = dateRange[1].format("YYYY-MM-DD");
    }

    getReport(id, null, null, params).then((res) => {
      const reportData = res?.data?.data || [];
      setData(reportData);
      setConfig(res?.data?.config || {});

      const allBrands = new Set();
      reportData.forEach((row) => {
        if (row.brands) {
          Object.keys(row.brands).forEach((b) => allBrands.add(b));
        }
      });
      setBrands(Array.from(allBrands).sort());
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const handleTargetChange = (bond, brand, val) => {
    const newData = [...data];
    const rowIndex = newData.findIndex((r) => r.bond === bond);
    if (rowIndex > -1) {
      if (!newData[rowIndex].brands[brand]) {
        newData[rowIndex].brands[brand] = { achieved: 0, target: 0 };
      }
      newData[rowIndex].brands[brand].target = val;
      setData(newData);
    }
  };

  const saveTargets = async () => {
    try {
      const targetsMap = {};
      data.forEach((row) => {
        targetsMap[row.bond] = {};
        Object.keys(row.brands).forEach((brand) => {
          targetsMap[row.bond][brand] = row.brands[brand].target || 0;
        });
      });
      const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      await axios.put(`${API_BASE}/reports/${id}/config`, { targets: targetsMap });
      message.success("Targets saved successfully!");
      loadData(); // refresh to ensure data alignment
    } catch (e) {
      message.error("Failed to save targets");
    }
  };

  const handleAddBrand = () => {
    const brandName = window.prompt("Enter exact brand name (e.g. CHAIRMANS CHOICE):")?.toUpperCase().trim();
    if (brandName && !brands.includes(brandName)) {
      setBrands([...brands, brandName].sort());
      const newData = data.map(row => {
        if (!row.brands) row.brands = {};
        if (!row.brands[brandName]) {
          row.brands[brandName] = { achieved: 0, target: 0 };
        }
        return row;
      });
      setData(newData);
    }
  };

  const handleRefresh = async () => {
    try {
      const hide = message.loading("Refreshing report data...", 0);
      await processReport(id);
      hide();
      message.success("Report refreshed successfully!");
      loadData(); 
    } catch (error) {
      message.error("Failed to refresh report");
    }
  };

  // Pivot the data: Generate a Target row and an Achieved row for each Bond
  const tableData = data.flatMap((row) => [
    { ...row, key: `${row.bond}_target`, type: "Target" },
    { ...row, key: `${row.bond}_achieved`, type: "Achieved" },
  ]);

  const columns = [
    { 
      title: "Bond", 
      dataIndex: "bond", 
      key: "bond", 
      fixed: "left", 
      width: 150,
      render: (value, record, index) => {
        const obj = { children: <b>{value}</b>, props: {} };
        if (index % 2 === 0) obj.props.rowSpan = 2; // Span across the two Target/Achieved rows
        else obj.props.rowSpan = 0;
        return obj;
      }
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      fixed: "left",
      width: 100,
      render: (val) => (
        <span style={{ color: val === "Target" ? "#1890ff" : "#52c41a", fontWeight: "bold" }}>
          {val}
        </span>
      )
    }
  ];

  brands.forEach((brand) => {
    columns.push({
      title: brand,
      key: brand,
      width: 120,
      render: (_, record) => {
        if (record.type === "Target") {
          const val = record.brands?.[brand]?.target || 0;
          return (
            <InputNumber
              value={val}
              min={0}
              onChange={(newVal) => handleTargetChange(record.bond, brand, newVal)}
              style={{ width: "100%" }}
            />
          );
        } else {
          const val = record.brands?.[brand]?.achieved || 0;
          return Number(val).toFixed(2);
        }
      }
    });
  });

  columns.push({
    title: "Total",
    key: "total",
    width: 120,
    render: (_, record) => {
      let total = 0;
      if (record.brands) {
        Object.values(record.brands).forEach((b) => {
          total += record.type === "Target" ? (b.target || 0) : (b.achieved || 0);
        });
      }
      return <b>{Number(total).toFixed(2)}</b>;
    },
  });

  columns.push({
    title: "%",
    key: "percentage",
    width: 100,
    render: (_, record) => {
      if (record.type === "Target") return null;
      let targetTotal = 0;
      let achievedTotal = 0;
      if (record.brands) {
        Object.values(record.brands).forEach((b) => {
          targetTotal += b.target || 0;
          achievedTotal += b.achieved || 0;
        });
      }
      
      // Highlight 100% if they achieved sales despite a 0 target
      if (targetTotal === 0) {
        return <b style={{ color: achievedTotal > 0 ? "#52c41a" : "#000" }}>{achievedTotal > 0 ? "100.00%" : "-"}</b>;
      }
      
      // Total Achieved * 100 / Total Target
      const pct = (achievedTotal * 100) / targetTotal;
      return <b style={{ color: pct >= 100 ? "#52c41a" : "#f5222d" }}>{pct.toFixed(2)}%</b>;
    },
  });

  return (
    <div style={{ background: "#fff", padding: 20, minHeight: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2>Achieved / Target Report {config.month ? `- ${config.month}` : ""}</h2>
        <Space>
          <RangePicker 
            value={dateRange} 
            onChange={setDateRange} 
          />
          <Button type="primary" onClick={loadData}>Apply Filter</Button>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          <Button onClick={handleAddBrand}>Add Brand</Button>
          <Button type="primary" onClick={saveTargets}>Save Targets</Button>
        </Space>
      </div>
      <Table 
        loading={loading}
        columns={columns} 
        dataSource={tableData} 
        rowKey="key" 
        bordered 
        scroll={{ x: "max-content" }} 
        pagination={false} 
        summary={(pageData) => {
          let totalTarget = {};
          let totalAchieved = {};
          let grandTotalTarget = 0;
          let grandTotalAchieved = 0;

          brands.forEach(b => { 
            totalTarget[b] = 0; 
            totalAchieved[b] = 0; 
          });

          pageData.forEach(row => {
            if (row.type === "Target") {
              brands.forEach(b => {
                 totalTarget[b] += row.brands?.[b]?.target || 0;
              });
            } else {
              brands.forEach(b => {
                 totalAchieved[b] += row.brands?.[b]?.achieved || 0;
              });
            }
          });
          
          brands.forEach(b => {
            grandTotalTarget += totalTarget[b];
            grandTotalAchieved += totalAchieved[b];
          });

          return (
            <Table.Summary fixed="bottom">
              <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                <Table.Summary.Cell index={0}>Grand Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1}><span style={{ color: "#1890ff" }}>Target</span></Table.Summary.Cell>
                {brands.map((b, i) => <Table.Summary.Cell key={`target-${b}`} index={i + 2}>{totalTarget[b]}</Table.Summary.Cell>)}
                <Table.Summary.Cell index={brands.length + 2}>{grandTotalTarget.toFixed(2)}</Table.Summary.Cell>
                <Table.Summary.Cell index={brands.length + 3}></Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold" }}>
                <Table.Summary.Cell index={0}></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><span style={{ color: "#52c41a" }}>Achieved</span></Table.Summary.Cell>
                {brands.map((b, i) => <Table.Summary.Cell key={`achieved-${b}`} index={i + 2}>{totalAchieved[b].toFixed(2)}</Table.Summary.Cell>)}
                <Table.Summary.Cell index={brands.length + 2}>{grandTotalAchieved.toFixed(2)}</Table.Summary.Cell>
                <Table.Summary.Cell index={brands.length + 3}>
                  {(() => {
                    if (grandTotalTarget === 0) {
                      return <span style={{ color: grandTotalAchieved > 0 ? "#52c41a" : "#000" }}>{grandTotalAchieved > 0 ? "100.00%" : "-"}</span>;
                    }
                    const pct = (grandTotalAchieved * 100) / grandTotalTarget;
                    return <span style={{ color: pct >= 100 ? "#52c41a" : "#f5222d" }}>{pct.toFixed(2)}%</span>;
                  })()}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
    </div>
  );
}