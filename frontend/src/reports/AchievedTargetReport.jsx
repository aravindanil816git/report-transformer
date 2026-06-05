import { useEffect, useState } from "react";
import { Table, InputNumber, Button, message, Space, DatePicker, Popover, Checkbox } from "antd";
import { useParams } from "react-router-dom";
import { getReport, processReport } from "../api";
import axios from "axios";
import { FilterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

const DEFAULT_VISIBLE_BRANDS = [
  "BCB NO.1 CLASSIC BRANDY",
  "BLENDERS CHOICE NO.1 BRANDY",
  "CHAIRMANS CHOICE XO BRANDY",
  "K.S 99 LIFE TIME MATURED XXX RUM",
  "MAGIC BLEND RESERVED XXX RUM",
  "MORNING WALKERS XO BRANDY",
  "OLD PEARL NO.1 MATURED XXX RUM"
];

export default function AchievedTargetReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [brands, setBrands] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([]);
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [visibleBrands, setVisibleBrands] = useState(DEFAULT_VISIBLE_BRANDS);

  useEffect(() => {
    // 🛑 Intentionally leaving this blank so data doesn't auto-fetch on open.
    // The user must explicitly choose dates and click "Apply Filter".
  }, [id]);

  const loadData = (isManual = false) => {
    if (!dateRange || !Array.isArray(dateRange) || dateRange.length !== 2) {
      if (isManual === true) message.warning("Please select a date range before loading data");
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
      setIsEditingTargets(false);
      loadData(); // refresh to ensure data alignment
    } catch (e) {
      message.error("Failed to save targets");
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
      title: (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Type
          <Popover
            content={
              <Checkbox.Group
                options={brands.map(b => ({ label: b, value: b }))}
                value={visibleBrands}
                onChange={setVisibleBrands}
                style={{ display: "flex", flexDirection: "column", maxHeight: "300px", overflowY: "auto", overflowX: "hidden", minWidth: "200px" }}
              />
            }
            title="Select Brands"
            trigger="click"
            placement="bottom"
          >
            <FilterOutlined style={{ cursor: "pointer", color: visibleBrands.length !== brands.length && visibleBrands.length > 0 ? "#1890ff" : undefined }} />
          </Popover>
        </div>
      ),
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

  const displayedBrands = brands.filter(b => visibleBrands.includes(b));

  displayedBrands.forEach((brand) => {
    columns.push({
      title: brand,
      key: brand,
      width: 120,
      render: (_, record) => {
        if (record.type === "Target") {
          const val = record.brands?.[brand]?.target || 0;
          return (
            <InputNumber
              disabled={!isEditingTargets}
              value={val}
              min={0}
              onChange={(newVal) => handleTargetChange(record.bond, brand, newVal)}
              style={{ width: "100%" }}
            />
          );
        } else {
          const val = Math.round(record.brands?.[brand]?.achieved || 0);
          return val;
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
        displayedBrands.forEach((b) => {
          const bData = record.brands[b];
          if (bData) {
            total += record.type === "Target" ? (bData.target || 0) : (bData.achieved || 0);
          }
        });
      }
      return <b>{Math.round(total)}</b>;
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
        displayedBrands.forEach((b) => {
          const bData = record.brands[b];
          if (bData) {
            targetTotal += bData.target || 0;
            achievedTotal += bData.achieved || 0;
          }
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
        <h2>Target v/s Achieved Report {config.month ? `- ${dayjs(config.month).format("MM-YYYY")}` : ""}</h2>
        <Space wrap>
          <RangePicker 
            value={dateRange} 
            onChange={setDateRange} 
          />
          <Button type="primary" onClick={loadData}>Apply Filter</Button>
          <Button onClick={handleRefresh}>Refresh Data</Button>
          {!isEditingTargets ? (
            <Button onClick={() => setIsEditingTargets(true)}>Edit Targets</Button>
          ) : (
            <>
              <Button onClick={() => { setIsEditingTargets(false); loadData(); }}>Cancel</Button>
              <Button type="primary" onClick={saveTargets}>Save Targets</Button>
            </>
          )}
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

          displayedBrands.forEach(b => { 
            totalTarget[b] = 0; 
            totalAchieved[b] = 0; 
          });

          pageData.forEach(row => {
            if (row.type === "Target") {
              displayedBrands.forEach(b => {
                 totalTarget[b] += row.brands?.[b]?.target || 0;
              });
            } else {
              displayedBrands.forEach(b => {
                 totalAchieved[b] += row.brands?.[b]?.achieved || 0;
              });
            }
          });
          
          displayedBrands.forEach(b => {
            grandTotalTarget += totalTarget[b];
            grandTotalAchieved += totalAchieved[b];
          });

          return (
            <Table.Summary fixed="bottom">
              <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
                <Table.Summary.Cell index={0}>Grand Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1}><span style={{ color: "#1890ff" }}>Target</span></Table.Summary.Cell>
                {displayedBrands.map((b, i) => <Table.Summary.Cell key={`target-${b}`} index={i + 2}>{Math.round(totalTarget[b])}</Table.Summary.Cell>)}
                <Table.Summary.Cell index={displayedBrands.length + 2}>{Math.round(grandTotalTarget)}</Table.Summary.Cell>
                <Table.Summary.Cell index={displayedBrands.length + 3}></Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold" }}>
                <Table.Summary.Cell index={0}></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><span style={{ color: "#52c41a" }}>Achieved</span></Table.Summary.Cell>
                {displayedBrands.map((b, i) => <Table.Summary.Cell key={`achieved-${b}`} index={i + 2}>{Math.round(totalAchieved[b])}</Table.Summary.Cell>)}
                <Table.Summary.Cell index={displayedBrands.length + 2}>{Math.round(grandTotalAchieved)}</Table.Summary.Cell>
                <Table.Summary.Cell index={displayedBrands.length + 3}>
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