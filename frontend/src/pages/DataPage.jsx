import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  DatePicker,
  Form,
  Space,
  Tooltip,
} from "antd";
import {
  listReports,
  createReport,
  processReport,
  deleteReport,
} from "../api";
import { REPORT_REGISTRY } from "../reports";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import dayjs from "dayjs";
import { DeleteOutlined } from "@ant-design/icons";
import { message, Popconfirm } from "antd";

import DailySecondaryUploadModal from "./DailySecondaryUploadModal";
import CumulativeUploadModal from "./CumShopUpload";
import SingleFileUploadModal from "./SingleFileUploadModal";

export default function DataPage() {
  const [data, setData] = useState([]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("daily_secondary_sales");

  const [current, setCurrent] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [reportDate, setReportDate] = useState(null);
  const [date1, setDate1] = useState(null);
  const [date2, setDate2] = useState(null);

  const [params] = useSearchParams();
  const typeFilter = params.get("type");

  const navigate = useNavigate();

  const load = () =>
    listReports().then((r) => {
      const reports = r.data || [];
      setData(reports);
      setCurrent((prev) => {
        if (!prev) return null;
        return reports.find((x) => x.id === prev.id) || prev;
      });
    });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeFilter) {
      setType(typeFilter);
    }
  }, [typeFilter, open]);

  const handleAddReport = () => {
    setName("");
    setReportDate(null);
    setDate1(null);
    setDate2(null);
    if (typeFilter) {
      setType(typeFilter);
    }
    setOpen(true);
  };

  const handleProcess = async (id) => {
    await processReport(id);
    load();
  };

  const handleDelete = async (id) => {
    try {
      await deleteReport(id);
      message.success("Report deleted successfully");
      load();
    } catch (error) {
      message.error("Failed to delete report");
    }
  };

  // 🔥 available dates for comparative
  const dailyDates = data
    .filter((d) => d.type === "daily_secondary_sales")
    .map((d) => d.config?.date)
    .filter(Boolean);

  // 🔥 sidebar filtering
  const filteredData = typeFilter
    ? data.filter((d) => d.type === typeFilter)
    : data;

  const columns = [
    { title: "Name", dataIndex: "name" },

    { title: "Type", dataIndex: "type" },

    // 🔥 DATE COLUMN
    {
      title: "Date",
      render: (_, r) => {
        if (["daily_secondary_sales", "shopwise", "daily_warehouse", "daily_warehouse_offtake"].includes(r.type)) {
          return r.config?.date
            ? dayjs(r.config.date).format("DD MMM YYYY")
            : "-";
        }

        if (r.type === "month_comparative") {
          return `${dayjs(r.config?.date1).format("DD MMM")} → ${dayjs(
            r.config?.date2
          ).format("DD MMM")}`;
        }

        return "-";
      },
    },

    { title: "Status", dataIndex: "status" },

    {
      title: "Actions",
      render: (_, r) => {
        const config = REPORT_REGISTRY[r.type];
        const isProcessed = r.status === "Processed";

        return (
          <Space direction="horizontal">
            {/* 🔥 Upload/Manage button for ALL reports */}
            <Button
              onClick={() => {
                setCurrent(r);
                setUploadOpen(true);
              }}
            >
              {["month_comparative", "monthly_stock_sales"].includes(r.type) ? "Manage" : "Upload"}
            </Button>

            {/* 🔥 View */}
            <Tooltip title={!isProcessed ? "Upload and Click process to View" : ""}>
              <Button
                type="primary"
                disabled={!isProcessed}
                onClick={() => navigate(config.route.replace(":id", r.id))}
              >
                View
              </Button>
            </Tooltip>

            {/* 🔥 Delete */}
            <Popconfirm
              title="Are you sure to delete this report?"
              onConfirm={() => handleDelete(r.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Button onClick={handleAddReport}>Add Report</Button>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        style={{ marginTop: 20 }}
      />

      <Modal
        title="Create New Report"
        open={open}
        onOk={async () => {
          if (type === "month_comparative") {
            const res = await createReport(name, type, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });

            // 🔥 auto process
            await processReport(res.data.id);
          }
          else if (type === "monthly_stock_sales") {
            await createReport(name, type, {
              date: reportDate?.format("YYYY-MM"),
            });
          } 
          else if (["cumulative_shopwise", "cumulative_warehouse"].includes(type)) {
            await createReport(name, type, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });
          }
          else {
            await createReport(name, type, {
              date: reportDate?.format("YYYY-MM-DD"),
            });
          }

          setOpen(false);
          load();
        }}
        onCancel={() => setOpen(false)}
        width={500}
      >
        <Form layout="vertical" style={{ marginTop: 20 }}>
          <Form.Item label="Report Name">
            <Input
              placeholder="Enter report name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Form.Item>

          <Form.Item label="Report Type">
            <Select
              showSearch
              value={type}
              onChange={setType}
              style={{ width: '100%' }}
              placeholder="Select report type"
              optionFilterProp="label"
              options={Object.entries(REPORT_REGISTRY).map(
                ([k, v]) => ({
                  value: k,
                  label: v.label,
                })
              )}
            />
          </Form.Item>

          {/* 🔥 DAILY */}
          {["daily_secondary_sales", "shopwise", "daily_warehouse_offtake"].includes(type) && (
            <Form.Item label="Report Date">
              <DatePicker style={{ width: '100%' }} onChange={setReportDate} />
            </Form.Item>
          )}

          {/* 🔥 CLEANUP */}
          {type === "daily_warehouse" && (
            <Form.Item label="Report Date">
              <DatePicker style={{ width: '100%' }} onChange={setReportDate} />
            </Form.Item>
          )}

          {type === "monthly_stock_sales" && (
            <Form.Item label="Select Month">
              <DatePicker picker="month" style={{ width: '100%' }} onChange={setReportDate} />
            </Form.Item>
          )}

          {["month_comparative", "cumulative_shopwise", "cumulative_warehouse"].includes(type) && (
            <Form.Item label="Date Range">
              <Space direction="vertical" style={{ width: '100%' }}>
                <DatePicker
                  placeholder="Start Date"
                  style={{ width: '100%' }}
                  value={date1}
                  onChange={(val) => {
                    setDate1(val);
                    if (val && date2 && date2.isBefore(val, 'day')) {
                      setDate2(null);
                    }
                  }}
                />
                <DatePicker
                  placeholder="End Date"
                  style={{ width: '100%' }}
                  value={date2}
                  onChange={setDate2}
                  disabledDate={(current) => {
                    return date1 ? current && current.isBefore(date1, 'day') : false;
                  }}
                />
              </Space>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 🔥 UPLOAD MODAL */}
      {uploadOpen &&
        ["daily_secondary_sales", "daily_warehouse"].includes(
          current?.type
        ) && (
          <DailySecondaryUploadModal
            report={current}
            onClose={() => setUploadOpen(false)}
            reload={load}
          />
        )}

      {/* 🔥 SINGLE FILE UPLOAD MODAL */}
      {uploadOpen && ["shopwise", "daily_warehouse_offtake", "monthly_stock_sales", "month_comparative"].includes(current?.type) && (
        <SingleFileUploadModal
          report={current}
          onClose={() => setUploadOpen(false)}
          reload={load}
        />
      )}

      {/* 🔥 CUMULATIVE UPLOAD MODAL */}
      {uploadOpen &&
        ["cumulative_shopwise", "cumulative_warehouse"].includes(
          current?.type
        ) && (
          <CumulativeUploadModal
            report={current}
            onClose={() => setUploadOpen(false)}
            reload={load}
          />
        )}
    </>
  );
}