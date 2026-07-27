import { useEffect, useState, useMemo } from "react";
import { Table, InputNumber, Button, message, Space, DatePicker, Popover, Checkbox, Segmented } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import { getReport, getJson, updateReportConfig } from "../api";
import axios from "axios";
import { FilterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { disabledFutureMonthDates } from "../utils/dateUtils";

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
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [shopData, setShopData] = useState([]);
  const [brands, setBrands] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([]);
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [visibleBrands, setVisibleBrands] = useState(DEFAULT_VISIBLE_BRANDS);
  const [clusters, setClusters] = useState({});

  // View States
  const [viewMode, setViewMode] = useState("bond"); // "bond" or "shop"
  const [drilledBond, setDrilledBond] = useState(null);
  const [shopCategoryFilter, setShopCategoryFilter] = useState("ALL"); // "ALL", "KSBC", "BAR/CFD"

  useEffect(() => {
    // Load the basic report structure (bonds, brands, saved targets) on open.
    loadData();
  }, [id]);

  useEffect(() => {
    getJson("clusters").then(res => setClusters(res.data)).catch(() => {});
  }, []);

  const loadData = (applyDates = false) => {
    const hasDateRange = dateRange && Array.isArray(dateRange) && dateRange.length === 2 && dateRange[0] && dateRange[1];
    if (applyDates && !hasDateRange) {
      message.warning("Please select a date range before loading data");
      return;
    }

    setLoading(true);
    const params = {};
    if (applyDates && hasDateRange) {
      params.start_date = dateRange[0].format("YYYY-MM-DD");
      params.end_date = dateRange[1].format("YYYY-MM-DD");
    }

    getReport(id, null, null, params).then((res) => {
      const reportData = res?.data?.data || [];
      setData(reportData);
      setShopData(res?.data?.shop_data || []);
      const reportConfig = res?.data?.config || {};
      setConfig(reportConfig);

      if (!applyDates && reportConfig.month && (!dateRange || dateRange.length !== 2)) {
        const monthStart = dayjs(reportConfig.month).startOf("month");
        const monthEnd = dayjs(reportConfig.month).endOf("month");
        const today = dayjs();
        
        let defaultEnd = monthEnd;
        if (today.isBefore(monthEnd)) {
          defaultEnd = today;
        }
        setDateRange([monthStart, defaultEnd]);
      }

      const allBrands = new Set(DEFAULT_VISIBLE_BRANDS);
      reportData.forEach((row) => {
        if (row.brands) {
          Object.keys(row.brands).forEach((b) => allBrands.add(b));
        }
      });
      const newBrands = Array.from(allBrands).sort();
      setBrands(newBrands);

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
        if (row.brands) {
          Object.keys(row.brands).forEach((brand) => {
            targetsMap[row.bond][brand] = row.brands[brand].target || 0;
          });
        }
      });
      await updateReportConfig(id, { targets: targetsMap });
      message.success("Targets saved successfully!");
      setIsEditingTargets(false);
      loadData(); // refresh to ensure data alignment
    } catch (e) {
      message.error("Failed to save targets");
    }
  };

  const disabledDate = (current) => {
    if (!current) return false;
    if (config?.month) {
      const startOfMonth = dayjs(config.month).startOf("month");
      const endOfMonth = dayjs(config.month).endOf("month");
      return current.isBefore(startOfMonth, "day") || current.isAfter(endOfMonth, "day");
    }
    return disabledFutureMonthDates(current);
  };

  // Group and Pivot the data by Cluster, and calculate Cluster Totals
  const tableData = useMemo(() => {
    if (viewMode === "bond") {
      const list = [];
      const bondsProcessed = new Set();

      Object.keys(clusters).forEach((clusterName) => {
        const clusterBonds = clusters[clusterName] || [];
        const clusterRows = data.filter((r) => clusterBonds.includes(r.bond));

        if (clusterRows.length === 0) return;

        const clusterTarget = { bond: `${clusterName} TOTAL`, isClusterTotal: true, type: "Target", brands: {} };
        const clusterAchieved = { bond: `${clusterName} TOTAL`, isClusterTotal: true, type: "Achieved", brands: {} };

        brands.forEach((b) => {
          clusterTarget.brands[b] = { target: 0, achieved: 0 };
          clusterAchieved.brands[b] = { target: 0, achieved: 0 };
        });

        clusterRows.forEach((row) => {
          bondsProcessed.add(row.bond);
          list.push({ ...row, key: `${row.bond}_target`, type: "Target" });
          list.push({ ...row, key: `${row.bond}_achieved`, type: "Achieved" });

          Object.keys(row.brands || {}).forEach((brand) => {
            if (clusterTarget.brands[brand]) clusterTarget.brands[brand].target += row.brands[brand].target || 0;
            if (clusterAchieved.brands[brand]) clusterAchieved.brands[brand].achieved += row.brands[brand].achieved || 0;
          });
        });

        list.push({ ...clusterTarget, key: `${clusterName}_total_target` });
        list.push({ ...clusterAchieved, key: `${clusterName}_total_achieved` });
      });

      const otherRows = data.filter((r) => !bondsProcessed.has(r.bond));
      if (otherRows.length > 0) {
        const otherTarget = { bond: `OTHER TOTAL`, isClusterTotal: true, type: "Target", brands: {} };
        const otherAchieved = { bond: `OTHER TOTAL`, isClusterTotal: true, type: "Achieved", brands: {} };
        brands.forEach((b) => { otherTarget.brands[b] = { target: 0, achieved: 0 }; otherAchieved.brands[b] = { target: 0, achieved: 0 }; });

        otherRows.forEach((row) => {
          list.push({ ...row, key: `${row.bond}_target`, type: "Target" });
          list.push({ ...row, key: `${row.bond}_achieved`, type: "Achieved" });
          Object.keys(row.brands || {}).forEach((brand) => {
            if (otherTarget.brands[brand]) otherTarget.brands[brand].target += row.brands[brand].target || 0;
            if (otherAchieved.brands[brand]) otherAchieved.brands[brand].achieved += row.brands[brand].achieved || 0;
          });
        });
        list.push({ ...otherTarget, key: `OTHER_total_target` });
        list.push({ ...otherAchieved, key: `OTHER_total_achieved` });
      }
      return list;
    } else {
      // Shop view
      let list = [...shopData];
      if (drilledBond) {
        list = list.filter(s => s.bond === drilledBond);
      }
      if (shopCategoryFilter !== "ALL") {
        list = list.filter(s => s.category === shopCategoryFilter);
      }
      return list.map((s, idx) => ({
        ...s,
        key: `shop_${s.shop_code}_${idx}`
      }));
    }
  }, [data, shopData, viewMode, drilledBond, shopCategoryFilter, clusters, brands]);

  const displayedBrands = brands.filter(b => visibleBrands.includes(b));

  const columns = useMemo(() => {
    if (viewMode === "bond") {
      const cols = [
        { 
          title: "Bond", 
          dataIndex: "bond", 
          key: "bond", 
          fixed: "left", 
          width: 150,
          render: (value, record, index) => {
            const isTotal = record.isClusterTotal;
            const obj = { 
              children: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {isTotal ? (
                    <b style={{ color: '#1890ff' }}>{value}</b>
                  ) : (
                    <a onClick={() => {
                      setDrilledBond(value);
                      setViewMode("shop");
                    }} style={{ fontWeight: 'bold', color: '#1890ff', cursor: 'pointer' }}>
                      {value}
                    </a>
                  )}
                </div>
              ), 
              props: {} 
            };
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

      displayedBrands.forEach((brand) => {
        cols.push({
          title: brand,
          key: brand,
          width: 120,
          align: "right",
          render: (_, record) => {
            if (record.type === "Target") {
              const val = record.brands?.[brand]?.target || 0;
              if (record.isClusterTotal || !isEditingTargets) {
                return <span>{Math.round(val)}</span>;
              }
              return (
                <InputNumber
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

      cols.push({
        title: "Total",
        key: "total",
        width: 120,
        align: "right",
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

      cols.push({
        title: "%",
        key: "percentage",
        width: 100,
        align: "right",
        render: (_, record) => {
          if (record.type === "Target") return null;
          let targetTotal = 0;
          let achievedTotal = 0;
          
          if (record.isClusterTotal) {
            const clusterName = record.bond.replace(" TOTAL", "");
            const clusterBonds = clusters[clusterName] || [];
            const isOther = clusterName === "OTHER";
            
            data.forEach((row) => {
              const inCluster = clusterBonds.includes(row.bond);
              const isProcessed = Object.keys(clusters).some(c => (clusters[c] || []).includes(row.bond));
              
              if ((isOther && !isProcessed) || (!isOther && inCluster)) {
                displayedBrands.forEach((b) => {
                  targetTotal += row.brands?.[b]?.target || 0;
                  achievedTotal += row.brands?.[b]?.achieved || 0;
                });
              }
            });
          } else {
            if (record.brands) {
              displayedBrands.forEach((b) => {
                const bData = record.brands[b];
                if (bData) {
                  targetTotal += bData.target || 0;
                  achievedTotal += bData.achieved || 0;
                }
              });
            }
          }

          if (targetTotal === 0) {
            return <b style={{ color: achievedTotal > 0 ? "#52c41a" : "#000" }}>{achievedTotal > 0 ? "100.00%" : "-"}</b>;
          }
          const pct = (achievedTotal * 100) / targetTotal;
          return <b style={{ color: pct >= 100 ? "#52c41a" : "#f5222d" }}>{pct.toFixed(2)}%</b>;
        },
      });

      return cols;
    } else {
      // Shop view columns
      const cols = [
        { 
          title: "Category", 
          dataIndex: "category", 
          key: "category", 
          fixed: "left", 
          width: 120,
          render: (val) => (
            <span style={{ 
              backgroundColor: val === "BAR/CFD" ? "#fff0f6" : "#f6ffed",
              color: val === "BAR/CFD" ? "#c41d7f" : "#389e0d",
              border: val === "BAR/CFD" ? "1px solid #ffadd2" : "1px solid #b7eb8f",
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: '500',
              fontSize: '11px',
              display: 'inline-block'
            }}>
              {val}
            </span>
          )
        },
        { 
          title: "Shop Code", 
          dataIndex: "shop_code", 
          key: "shop_code", 
          fixed: "left", 
          width: 110,
          sorter: (a, b) => a.shop_code.localeCompare(b.shop_code)
        },
        { 
          title: "Shop Name", 
          dataIndex: "shop_name", 
          key: "shop_name", 
          fixed: "left", 
          width: 220,
          sorter: (a, b) => a.shop_name.localeCompare(b.shop_name)
        },
        { 
          title: "Bond", 
          dataIndex: "bond", 
          key: "bond", 
          width: 120,
          sorter: (a, b) => a.bond.localeCompare(b.bond)
        }
      ];

      displayedBrands.forEach((brand) => {
        cols.push({
          title: brand,
          key: brand,
          width: 120,
          align: "right",
          render: (_, record) => {
            const val = Math.round(record.brands?.[brand]?.achieved || 0);
            return val || "-";
          }
        });
      });

      cols.push({
        title: "Total Achieved",
        key: "total_achieved",
        width: 130,
        align: "right",
        render: (_, record) => {
          let total = 0;
          if (record.brands) {
            displayedBrands.forEach((b) => {
              const bData = record.brands[b];
              if (bData) {
                total += bData.achieved || 0;
              }
            });
          }
          return <b>{Math.round(total)}</b>;
        },
      });

      return cols;
    }
  }, [viewMode, brands, visibleBrands, isEditingTargets, data, shopData, drilledBond]);

  const tableSummary = (pageData) => {
    if (viewMode === "bond") {
      let totalTarget = {};
      let totalAchieved = {};
      let grandTotalTarget = 0;
      let grandTotalAchieved = 0;

      displayedBrands.forEach(b => { 
        totalTarget[b] = 0; 
        totalAchieved[b] = 0; 
      });

      pageData.forEach(row => {
        if (row.isClusterTotal) return;
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
        <Table.Summary>
          <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
            <Table.Summary.Cell index={0}>Grand Total</Table.Summary.Cell>
            <Table.Summary.Cell index={1}><span style={{ color: "#1890ff" }}>Target</span></Table.Summary.Cell>
            {displayedBrands.map((b, i) => <Table.Summary.Cell key={`target-${b}`} index={i + 2} align="right">{Math.round(totalTarget[b])}</Table.Summary.Cell>)}
            <Table.Summary.Cell index={displayedBrands.length + 2} align="right">{Math.round(grandTotalTarget)}</Table.Summary.Cell>
            <Table.Summary.Cell index={displayedBrands.length + 3}></Table.Summary.Cell>
          </Table.Summary.Row>
          <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold" }}>
            <Table.Summary.Cell index={0}></Table.Summary.Cell>
            <Table.Summary.Cell index={1}><span style={{ color: "#52c41a" }}>Achieved</span></Table.Summary.Cell>
            {displayedBrands.map((b, i) => <Table.Summary.Cell key={`achieved-${b}`} index={i + 2} align="right">{Math.round(totalAchieved[b])}</Table.Summary.Cell>)}
            <Table.Summary.Cell index={displayedBrands.length + 2} align="right">{Math.round(grandTotalAchieved)}</Table.Summary.Cell>
            <Table.Summary.Cell index={displayedBrands.length + 3} align="right">
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
    } else {
      // Summary for Shop view
      let grandTotalAchieved = {};
      let totalSum = 0;
      displayedBrands.forEach(b => { 
        grandTotalAchieved[b] = 0; 
      });

      pageData.forEach(row => {
        displayedBrands.forEach(b => {
          grandTotalAchieved[b] += row.brands?.[b]?.achieved || 0;
        });
      });

      displayedBrands.forEach(b => {
        totalSum += grandTotalAchieved[b];
      });

      return (
        <Table.Summary>
          <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold", borderTop: "2px solid #d9d9d9" }}>
            <Table.Summary.Cell index={0} colSpan={4}>Grand Total Achieved</Table.Summary.Cell>
            {displayedBrands.map((b, i) => <Table.Summary.Cell key={`achieved-${b}`} index={i + 4} align="right">{Math.round(grandTotalAchieved[b])}</Table.Summary.Cell>)}
            <Table.Summary.Cell index={displayedBrands.length + 4} align="right"><b>{Math.round(totalSum)}</b></Table.Summary.Cell>
          </Table.Summary.Row>
        </Table.Summary>
      );
    }
  };

  return (
    <div style={{ background: "#fff", padding: 20, minHeight: "100%" }}>
      <style>{`
        .cluster-total-row > td {
          background-color: #f0f5ff !important;
          font-weight: bold;
        }
      `}</style>
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0, fontSize: "16px" }}>
          &larr; Back
        </Button>
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Target v/s Achieved Report {config.month ? `- ${dayjs(config.month).format("MMM YYYY")}` : ""}</h2>
          {drilledBond && (
            <div style={{ marginTop: 4 }}>
              <Button type="dashed" danger size="small" onClick={() => setDrilledBond(null)}>
                Exit Bond Drilldown ({drilledBond}) ✕
              </Button>
            </div>
          )}
        </div>
        <Space wrap>
          <RangePicker 
            value={dateRange} 
            onChange={setDateRange} 
            disabledDate={disabledDate}
          />
          <Button type="primary" onClick={() => loadData(true)}>Apply Filter</Button>
          {!isEditingTargets ? (
            <Button onClick={() => setIsEditingTargets(true)} disabled={viewMode === "shop"}>Edit Targets</Button>
          ) : (
            <>
              <Button onClick={() => { setIsEditingTargets(false); loadData(); }}>Cancel</Button>
              <Button type="primary" onClick={saveTargets}>Save Targets</Button>
            </>
          )}
        </Space>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <Space size="middle">
          <span><b>View Mode:</b></span>
          <Segmented
            options={[
              { label: "Bond View", value: "bond" },
              { label: "Shop View", value: "shop" }
            ]}
            value={viewMode}
            onChange={(val) => {
              setViewMode(val);
              if (val === "bond") setDrilledBond(null);
            }}
          />
        </Space>

        {viewMode === "shop" && (
          <Space size="middle">
            <span><b>Shop Type Filter:</b></span>
            <Segmented
              options={[
                { label: "All Shops", value: "ALL" },
                { label: "KSBC (Retail)", value: "KSBC" },
                { label: "BAR & CFD (Clubs)", value: "BAR/CFD" }
              ]}
              value={shopCategoryFilter}
              onChange={setShopCategoryFilter}
            />
          </Space>
        )}
      </div>

      <Table 
        loading={loading}
        columns={columns} 
        dataSource={tableData} 
        rowKey="key" 
        bordered 
        rowClassName={(record) => record.isClusterTotal ? "cluster-total-row" : ""}
        sticky
        scroll={{ x: "max-content" }} 
        pagination={false} 
        summary={tableSummary}
      />
    </div>
  );
}