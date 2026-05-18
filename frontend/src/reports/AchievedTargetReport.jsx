import { useEffect, useState } from "react";
import { Table, InputNumber, Button, message, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport } from "../api";
import axios from "axios";

export default function AchievedTargetReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [brands, setBrands] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = () => {
    setLoading(true);
    getReport(id).then((res) => {
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
      // Using standard local API base for the update
      await axios.put(`http://127.0.0.1:8000/reports/${id}/config`, { targets: targetsMap });
      message.success("Targets saved successfully!");
      loadData(); // refresh to ensure data alignment
    } catch (e) {
      message.error("Failed to save targets");
    }
  };

  const handleAddBrand = () => {
    const brandName = window.prompt("Enter new brand name:");
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
      title: "Staffs", 
      dataIndex: "staffs", 
      key: "staffs", 
      fixed: "left", 
      width: 250,
      render: (value, record, index) => {
        const obj = { children: value, props: {} };
        if (index % 2 === 0) obj.props.rowSpan = 2;
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
      />
    </div>
  );
}