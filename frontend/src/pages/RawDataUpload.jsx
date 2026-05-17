import { useState, useEffect } from "react";
import { Card, Row, Col, Button, Table, Space, Tooltip, Popconfirm, message, Modal, Form, Input, DatePicker } from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { DeleteOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import { REPORT_REGISTRY } from "../reports";
import { listReports, createReport, deleteReport, processReport, getReport } from "../api";
import DailySecondaryUploadModal from "./DailySecondaryUploadModal";
import SingleFileUploadModal from "./SingleFileUploadModal";
import { exportToExcel } from "../utils/exportUtils";

const RAW_DATA_TYPES = [
  "daily_warehouse",
  "shopwise",
  "shop_sales_cumulative",
  "daily_warehouse_offtake",
  "daily_secondary_sales",
];

function RawDataView({ type, onOpenCreate }) {
  const [data, setData] = useState([]);
  const [current, setCurrent] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    listReports().then((r) => {
      const reports = r.data || [];
      // Filter by type on the frontend since api.js doesn't support server-side filtering yet
      setData(reports.filter((item) => item.type === type));
    });
  };

  useEffect(() => {
    load();
  }, [type]);

  const handleDelete = async (id) => {
    try {
      await deleteReport(id);
      message.success("Upload deleted successfully");
      load();
    } catch (error) {
      message.error("Failed to delete upload");
    }
  };

  const handleDownload = async (report) => {
    try {
      const hide = message.loading("Downloading report...", 0);
      const res = await getReport(report.id);
      hide();
      
      const reportData = res?.data?.data || [];
      if (reportData.length === 0) {
        message.warning("No data available for this report.");
        return;
      }
      
      exportToExcel(reportData, { "Report Name": report.name, "Type": REPORT_REGISTRY[report.type]?.label || report.type, "Date": dayjs().format("DD MMM YYYY") }, `${report.name || report.type}.xlsx`);
    } catch (error) {
      message.error("Failed to download report");
    }
  };

  const columns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Date",
      render: (_, r) => {
        if (r.type === "shop_sales_cumulative") {
          return `${dayjs(r.config?.date1).format("DD MMM")} → ${dayjs(r.config?.date2).format("DD MMM")}`;
        }
        return r.config?.date ? dayjs(r.config.date).format("DD MMM YYYY") : "-";
      },
    },
    { title: "Status", dataIndex: "status" },
    {
      title: "Actions",
      render: (_, r) => {
        const config = REPORT_REGISTRY[r.type];
        const isProcessed = r.status === "Processed" || r.status === "Ready";

        return (<Space direction="horizontal">
          {config?.route && (
            <Tooltip title={!isProcessed ? "Upload/Process report first to view" : ""}>
              <Button
                type="primary"
                disabled={!isProcessed}
                icon={<EyeOutlined />}
                onClick={() => navigate(config.route.replace(":id", r.id))}
              >
                View
              </Button>
            </Tooltip>
          )}
          <Tooltip title={!isProcessed ? "Upload/Process report first to download" : ""}>
            <Button
              disabled={!isProcessed}
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(r)}
            >
              Download
            </Button>
          </Tooltip>
          <Button
            onClick={() => {
              setCurrent(r);
              setUploadOpen(true);
            }}
          >
            Upload
          </Button>
          <Popconfirm
            title="Are you sure to delete this upload?"
            onConfirm={() => handleDelete(r.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>);
      },
    },
  ];

  return (
    <div>
      <Button type="primary" onClick={() => onOpenCreate(type)} style={{ marginBottom: 16 }}>
        Add New Upload
      </Button>
      <Table columns={columns} dataSource={data} rowKey="id" />
      {uploadOpen && ["daily_secondary_sales", "daily_warehouse"].includes(current?.type) && (
        <DailySecondaryUploadModal report={current} onClose={() => setUploadOpen(false)} reload={load} />
      )}
      {uploadOpen && ["shopwise", "daily_warehouse_offtake", "shop_sales_cumulative"].includes(current?.type) && (
        <SingleFileUploadModal report={current} onClose={() => setUploadOpen(false)} reload={load} />
      )}
    </div>
  );
}

export default function RawDataUpload() {
  const [view, setView] = useState(null);
  const [current, setCurrent] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  
  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState(null);
  const [name, setName] = useState("");
  const [reportDate, setReportDate] = useState(null);
  const [date1, setDate1] = useState(null);
  const [date2, setDate2] = useState(null);

  // Auto-generate name
  useEffect(() => {
    if (!createType) return;
    const label = REPORT_REGISTRY[createType]?.label || createType;
    let dateStr = "";
    if (createType === "shop_sales_cumulative") {
      if (date1 && date2) {
        dateStr = `${date1.format("DD MMM")} to ${date2.format("DD MMM")}`;
      }
    } else if (reportDate) {
      dateStr = reportDate.format("DD MMM YYYY");
    }
    
    if (dateStr) {
      setName(`${label} - ${dateStr}`);
    }
  }, [createType, reportDate, date1, date2]);

  const handleOpenCreate = (type) => {
    setCreateType(type);
    setName("");
    setReportDate(null);
    setDate1(null);
    setDate2(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const config = {};
    if (createType === "shop_sales_cumulative") {
      config.date1 = date1?.format("YYYY-MM-DD");
      config.date2 = date2?.format("YYYY-MM-DD");
    } else {
      config.date = reportDate?.format("YYYY-MM-DD");
    }

    const res = await createReport(name, createType, config);
    setCreateOpen(false);
    message.success("Upload created successfully");
    
    // Auto-open upload modal
    setCurrent(res.data);
    setUploadOpen(true);

    // Switch to history view for this type to show the new entry in background
    setView(createType);
  };

  // Creation Modal
  function CreateModal() {
    if (!createOpen) return null;
    return (
      <Modal
        title={`Add New ${REPORT_REGISTRY[createType]?.label || 'Upload'}`}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        width={500}
        okButtonProps={{ disabled: createType === "shop_sales_cumulative" ? !(date1 && date2) : !reportDate }}
      >
        <Form layout="vertical" style={{ marginTop: 20 }}>
          <Form.Item label="Name">
            <Input
              placeholder="Enter name"
              value={name}
              disabled
            />
          </Form.Item>

          {createType === "shop_sales_cumulative" ? (
            <Form.Item label="Date Range">
              <Space direction="vertical" style={{ width: '100%' }}>
                <DatePicker
                  placeholder="Start Date"
                  style={{ width: '100%' }}
                  value={date1}
                  onChange={setDate1}
                />
                <DatePicker
                  placeholder="End Date"
                  style={{ width: '100%' }}
                  value={date2}
                  onChange={setDate2}
                  disabledDate={(current) => date1 ? current && current.isBefore(date1, 'day') : false}
                />
              </Space>
            </Form.Item>
          ) : (
            <Form.Item label="Date">
              <DatePicker 
                style={{ width: '100%' }} 
                value={reportDate}
                onChange={setReportDate} 
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    );
  }

  const renderUploadModals = () => {
    if (!uploadOpen || !current) return null;
    
    const refresh = () => {
      // If we are in history view, we might need to trigger its load. 
      // But since history view uses its own local state, we'll just reload the page/component or let it be.
      // Actually, if we use a shared state for data, it would be better.
      // For now, let's just close and hope for the best, or better:
      window.location.reload(); // Simple way to ensure all data is fresh
    };

    if (["daily_secondary_sales", "daily_warehouse"].includes(current.type)) {
      return <DailySecondaryUploadModal report={current} onClose={() => setUploadOpen(false)} reload={refresh} />;
    }
    if (["shopwise", "daily_warehouse_offtake", "shop_sales_cumulative"].includes(current.type)) {
      return <SingleFileUploadModal report={current} onClose={() => setUploadOpen(false)} reload={refresh} />;
    }
    return null;
  };

  if (view) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Button onClick={() => setView(null)}>Back to Tiles</Button>
          <h2 style={{ marginLeft: 16, marginBottom: 0 }}>{REPORT_REGISTRY[view]?.label} History</h2>
        </div>
        <RawDataView type={view} onOpenCreate={handleOpenCreate} />
        <CreateModal />
        {renderUploadModals()}
      </div>
    );
  }

  return (
    <div>
      <h1>Raw Data Upload</h1>
      <p>Select a data type to upload.</p>
      <Row gutter={[16, 16]}>
        {RAW_DATA_TYPES.map((type) => (
          <Col span={8} key={type}>
            <Card>
              <Card.Meta title={REPORT_REGISTRY[type].label} />
              <Space style={{ marginTop: 16 }}>
                <Button type="primary" onClick={() => handleOpenCreate(type)}>Upload</Button>
                <Button onClick={() => setView(type)}>History</Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
      <CreateModal />
      {renderUploadModals()}
    </div>
  );
}
