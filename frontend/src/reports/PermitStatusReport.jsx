import { useEffect, useState, useMemo } from "react";
import { Table, DatePicker, Select, InputNumber, Button, Card, Tag, Space, Typography, Spin, message, Row, Col } from "antd";
import { DownloadOutlined, SaveOutlined, EditOutlined, CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getPermitStatus, getPermitStatusAllWarehouses, savePermitStatusConfig } from "../api";
import { exportPermitStatusExcel } from "../utils/export/permitStatusExport";
import { disabledFutureMonthDates } from "../utils/dateUtils";

const { Title, Text } = Typography;

export default function PermitStatusReport() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);

  const [maintThreshold, setMaintThreshold] = useState(40);
  const [targetThreshold, setTargetThreshold] = useState(125);
  const [pendingPermits, setPendingPermits] = useState({});

  // Draft state while editing
  const [draftMaintThreshold, setDraftMaintThreshold] = useState(40);
  const [draftTargetThreshold, setDraftTargetThreshold] = useState(125);
  const [draftPendingPermits, setDraftPendingPermits] = useState({});

  const [rawRows, setRawRows] = useState([]);
  const [monthLabels, setMonthLabels] = useState(["Month 1", "Month 2", "Month 3"]);

  const fetchData = async (dateStr, whStr) => {
    setLoading(true);
    try {
      const params = { date: dateStr };
      if (whStr) {
        params.warehouse = whStr;
      }
      const res = await getPermitStatus(params);
      if (res.data) {
        setRawRows(res.data.data || []);
        setMonthLabels(res.data.month_labels || ["Month 1", "Month 2", "Month 3"]);

        const whList = res.data.warehouses || [];
        setWarehouses(whList);

        const currentWh = res.data.config?.warehouse || (whList.length > 0 ? whList[0] : null);
        if (currentWh && currentWh !== selectedWarehouse) {
          setSelectedWarehouse(currentWh);
        }

        if (res.data.config) {
          const mTh = res.data.config.maint_threshold !== undefined ? res.data.config.maint_threshold : 40;
          const tTh = res.data.config.target_threshold !== undefined ? res.data.config.target_threshold : 125;
          const pPerm = res.data.config.pending_permits || {};

          setMaintThreshold(mTh);
          setTargetThreshold(tTh);
          setPendingPermits(pPerm);

          setDraftMaintThreshold(mTh);
          setDraftTargetThreshold(tTh);
          setDraftPendingPermits(pPerm);
        }
      }
    } catch (err) {
      console.error("Failed to load permit status report data", err);
      message.error("Failed to load Permit Status report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const formattedDate = selectedDate ? selectedDate.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    fetchData(formattedDate, selectedWarehouse);
  }, [selectedDate, selectedWarehouse]);

  const handleStartEdit = () => {
    setDraftMaintThreshold(maintThreshold);
    setDraftTargetThreshold(targetThreshold);
    setDraftPendingPermits({ ...pendingPermits });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraftMaintThreshold(maintThreshold);
    setDraftTargetThreshold(targetThreshold);
    setDraftPendingPermits({ ...pendingPermits });
    setIsEditing(false);
  };

  const handlePendingPermitChange = (key, val) => {
    const num = val === null || val === undefined ? 0 : Number(val);
    setDraftPendingPermits((prev) => ({
      ...prev,
      [key]: num
    }));
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const payload = {
        date: selectedDate ? selectedDate.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        warehouse: selectedWarehouse,
        maint_threshold: draftMaintThreshold,
        target_threshold: draftTargetThreshold,
        pending_permits: draftPendingPermits
      };
      await savePermitStatusConfig(payload);

      setMaintThreshold(draftMaintThreshold);
      setTargetThreshold(draftTargetThreshold);
      setPendingPermits({ ...draftPendingPermits });
      setIsEditing(false);

      message.success("Thresholds & Pending Permits saved successfully!");
    } catch (err) {
      console.error("Save config error:", err);
      message.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const dateStr = selectedDate ? selectedDate.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
      const res = await getPermitStatusAllWarehouses({ date: dateStr });
      if (res.data) {
        const reportsByWarehouse = res.data.reports_by_warehouse || {};
        const whList = res.data.warehouses || warehouses;

        await exportPermitStatusExcel({
          reportsByWarehouse,
          warehouses: whList,
          config: {
            date: dateStr,
            maint_threshold: maintThreshold,
            target_threshold: targetThreshold
          },
          filename: `Permit_Status_Report_${dateStr}.xlsx`
        });
        message.success("Permit Status multi-tab Excel exported successfully!");
      }
    } catch (err) {
      console.error("Excel Export error:", err);
      message.error("Failed to export Permit Status Excel");
    } finally {
      setExporting(false);
    }
  };

  // Active values depending on edit mode
  const activeMaintTh = isEditing ? draftMaintThreshold : maintThreshold;
  const activeTargetTh = isEditing ? draftTargetThreshold : targetThreshold;
  const activePendingPermits = isEditing ? draftPendingPermits : pendingPermits;

  // Recalculate columns dynamically based on active values
  const tableData = useMemo(() => {
    return rawRows.map((row) => {
      const avg3m = Number(row.avg_3m) || 0;
      const maintStock = Number((avg3m * (activeMaintTh / 100.0)).toFixed(2));
      const allotable = Number(row.allotable) || 0;
      const variance = Number((allotable - maintStock).toFixed(2));
      const triggerStatus = variance < 0 ? "APPLY FOR PERMIT" : "STOCK OK";
      const targetStock = Number((avg3m * (activeTargetTh / 100.0)).toFixed(2));
      const requiredStock = Number((targetStock - allotable).toFixed(2));
      const permVal = activePendingPermits[row.key] !== undefined ? activePendingPermits[row.key] : (row.pending_permit || 0);

      return {
        ...row,
        maint_stock: maintStock,
        variance,
        trigger_status: triggerStatus,
        target_stock: targetStock,
        required_stock: requiredStock,
        pending_permit: permVal
      };
    });
  }, [rawRows, activeMaintTh, activeTargetTh, activePendingPermits]);

  // Group rowSpan for Brand column
  const brandRowSpans = useMemo(() => {
    const spans = {};
    let currentBrand = null;
    let count = 0;
    let startIndex = 0;

    tableData.forEach((item, index) => {
      if (item.brand !== currentBrand) {
        if (currentBrand !== null) {
          spans[startIndex] = count;
        }
        currentBrand = item.brand;
        startIndex = index;
        count = 1;
      } else {
        count++;
      }
    });
    if (currentBrand !== null) {
      spans[startIndex] = count;
    }
    return spans;
  }, [tableData]);

  const columns = [
    {
      title: "Brand",
      dataIndex: "brand",
      key: "brand",
      fixed: "left",
      width: 180,
      render: (text, record, index) => {
        const span = brandRowSpans[index] || 0;
        return {
          children: (
            <div style={{ padding: "4px 0" }}>
              <Text style={{ fontWeight: 700, fontSize: 14 }}>{text}</Text>
            </div>
          ),
          props: {
            rowSpan: span
          }
        };
      }
    },
    {
      title: "Pack Size",
      dataIndex: "pack",
      key: "pack",
      width: 110,
      render: (val) => <Text style={{ fontWeight: 600 }}>{val}</Text>
    },
    {
      title: monthLabels[0] || "Month 1",
      dataIndex: "m1",
      key: "m1",
      align: "right",
      width: 100
    },
    {
      title: monthLabels[1] || "Month 2",
      dataIndex: "m2",
      key: "m2",
      align: "right",
      width: 100
    },
    {
      title: monthLabels[2] || "Month 3",
      dataIndex: "m3",
      key: "m3",
      align: "right",
      width: 100
    },
    {
      title: "AVG 3 Months",
      dataIndex: "avg_3m",
      key: "avg_3m",
      align: "right",
      width: 120,
      render: (val) => <Text style={{ fontWeight: 600 }}>{val}</Text>
    },
    {
      title: "STOCK TO BE MAINTAINED",
      dataIndex: "maint_stock",
      key: "maint_stock",
      align: "right",
      width: 160,
      render: (val) => <Text style={{ fontWeight: 600 }}>{val}</Text>
    },
    {
      title: "ALLOTABLE STOCK",
      dataIndex: "allotable",
      key: "allotable",
      align: "right",
      width: 140,
      render: (val) => <Text style={{ fontWeight: 600 }}>{val}</Text>
    },
    {
      title: "VARIANCE",
      dataIndex: "variance",
      key: "variance",
      align: "right",
      width: 110,
      render: (val) => (
        <Text style={{ color: val < 0 ? "#cf1322" : "#3f8600", fontWeight: 700 }}>
          {val}
        </Text>
      )
    },
    {
      title: "Trigger Status",
      dataIndex: "trigger_status",
      key: "trigger_status",
      align: "center",
      width: 160,
      render: (status) => (
        <Tag color={status === "APPLY FOR PERMIT" ? "error" : "success"} style={{ fontWeight: 600, padding: "2px 8px" }}>
          {status}
        </Tag>
      )
    },
    {
      title: "PENDING PERMIT",
      dataIndex: "pending_permit",
      key: "pending_permit",
      align: "center",
      width: 140,
      render: (val, record) => {
        if (!isEditing) {
          return <Text style={{ fontWeight: 500 }}>{val || 0}</Text>;
        }
        return (
          <InputNumber
            min={0}
            value={val}
            disabled={loading}
            onChange={(newVal) => handlePendingPermitChange(record.key, newVal)}
            style={{ width: "100%" }}
          />
        );
      }
    },
    {
      title: `TARGET STOCK (${activeTargetTh}% OF 3 MONTHS AVG)`,
      dataIndex: "target_stock",
      key: "target_stock",
      align: "right",
      width: 180,
      render: (val) => <Text style={{ fontWeight: 600 }}>{val}</Text>
    },
    {
      title: "Required stock for Permit",
      dataIndex: "required_stock",
      key: "required_stock",
      align: "right",
      width: 160,
      render: (val) => (
        <Text style={{ color: val > 0 ? "#cf1322" : "#000", fontWeight: 700 }}>
          {val}
        </Text>
      )
    }
  ];

  return (
    <div style={{ padding: "20px" }}>
      <style>{`
        .brand-section-border > td {
          border-bottom: 2.5px solid #d4b106 !important;
        }
        .ant-table-wrapper .ant-table-cell {
          border-color: #e8e8e8;
        }
      `}</style>
      
      <Card style={{ marginBottom: 20 }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Permit Status Report
            </Title>
          </Col>
          <Col>
            <Space wrap align="middle">
              <Text bold>Warehouse:</Text>
              <Select
                value={selectedWarehouse}
                disabled={loading || exporting}
                onChange={(wh) => setSelectedWarehouse(wh)}
                style={{ width: 200 }}
                placeholder="Select Warehouse"
                options={warehouses.map((w) => ({ label: w, value: w }))}
              />

              <Text bold>Point of Time Date:</Text>
              <DatePicker
                value={selectedDate}
                disabled={loading || exporting}
                disabledDate={disabledFutureMonthDates}
                onChange={(d) => d && setSelectedDate(d)}
                allowClear={false}
              />

              <Text bold>Maintenance Threshold:</Text>
              {isEditing ? (
                <InputNumber
                  min={0}
                  max={500}
                  addonAfter="%"
                  disabled={loading || exporting}
                  value={draftMaintThreshold}
                  onChange={(val) => val !== null && setDraftMaintThreshold(val)}
                  style={{ width: 120 }}
                />
              ) : (
                <Tag color="blue" style={{ fontSize: 14, padding: "2px 8px" }}>
                  {maintThreshold}%
                </Tag>
              )}

              <Text bold>Target Threshold:</Text>
              {isEditing ? (
                <InputNumber
                  min={0}
                  max={500}
                  addonAfter="%"
                  disabled={loading || exporting}
                  value={draftTargetThreshold}
                  onChange={(val) => val !== null && setDraftTargetThreshold(val)}
                  style={{ width: 120 }}
                />
              ) : (
                <Tag color="purple" style={{ fontSize: 14, padding: "2px 8px" }}>
                  {targetThreshold}%
                </Tag>
              )}

              {!isEditing ? (
                <>
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    disabled={loading || exporting}
                    onClick={handleStartEdit}
                  >
                    Edit Inputs
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    loading={exporting}
                    disabled={loading}
                    onClick={handleExportExcel}
                  >
                    Excel Export
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    icon={<CloseOutlined />}
                    disabled={loading || exporting}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    disabled={loading || exporting}
                    onClick={handleSaveConfig}
                  >
                    Save Inputs
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 50, textAlign: "center" }}>
            <Spin size="large" tip="Loading Permit Status data..." />
          </div>
        ) : (
          <Table
            dataSource={tableData}
            columns={columns}
            rowKey="key"
            pagination={false}
            bordered
            rowClassName={(record, index) => ((index + 1) % 5 === 0 ? "brand-section-border" : "")}
            scroll={{ x: 1700 }}
            size="middle"
          />
        )}
      </Card>
    </div>
  );
}
