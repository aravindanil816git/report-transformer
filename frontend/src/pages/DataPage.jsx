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
import { DeleteOutlined, UploadOutlined, FileTextOutlined } from "@ant-design/icons";
import { message, Popconfirm } from "antd";

import DailySecondaryUploadModal from "./DailySecondaryUploadModal";
import CumulativeUploadModal from "./CumShopUpload";
import SingleFileUploadModal from "./SingleFileUploadModal";



const RAW_DATA_TYPES = [
  "shopwise",
  "shop_sales_cumulative",
  "daily_warehouse",
  "daily_warehouse_offtake",
  "daily_secondary_sales",
];

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
    if (['cumulative_shopwise', 'combined_shopwise'].includes(type) && date1 && date2) {
      setName(`${date1.format('MMM D')} to ${date2.format('MMM D')}`);
    }
  }, [date1, date2, type]);

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

  // 🔥 available dates for comparative (based on Item Issue Consolidation)
  const dailyDates = data
    .filter((d) => d.type === "daily_secondary_sales" && (d.status === "Processed" || d.status === "Ready" || d.status === "Uploaded"))
    .map((d) => d.config?.date)
    .filter(Boolean);

  const isDateAvailable = (date) => {
    if (!date) return false;
    const s = date.format("YYYY-MM-DD");
    return dailyDates.includes(s);
  };

  // 🔥 sidebar filtering
  const filteredData = [
    ...(typeFilter === null || typeFilter === "month_comparative" ? [{
      id: "live-compare",
      name: "Item Issue Consolidation",
      type: "month_comparative",
      status: "Ready",
      isLive: true
    }] : []),
    ...data.filter((d) => {
      let currentTypeFilter = typeFilter;
      if (typeFilter === 'new_cumulative_report') {
        currentTypeFilter = 'cumulative_shopwise';
      }

      if (currentTypeFilter) {
        return d.type === currentTypeFilter;
      }

      return !RAW_DATA_TYPES.includes(d.type) && d.type !== "month_comparative";
    })
  ];

  const columns = [
    { title: "Name", dataIndex: "name" },

    // 🔥 DATE COLUMN
    {
      title: "Date",
      render: (_, r) => {
        if (r.isLive) return "Live Comparison";
        if (["daily_secondary_sales", "shopwise", "daily_warehouse", "daily_warehouse_offtake", "shop_sales_cumulative"].includes(r.type)) {
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
        if (r.isLive) {
          return (
            <Button type="primary" onClick={() => navigate("/item-issue-consolidation")}>
              View
            </Button>
          );
        }
        const config = REPORT_REGISTRY[r.type];
        const isProcessed = r.status === "Processed";

        return (
          <Space direction="horizontal">
            {/* 🔥 View (Primary Focus for Physical Stock) */}
            {r.type === "daily_warehouse" ? (
              <Tooltip title={!isProcessed ? "Upload raw data to View" : ""}>
                <Button
                  type="primary"
                  disabled={!isProcessed}
                  onClick={() => navigate(config.route.replace(":id", r.id))}
                >
                  View
                </Button>
              </Tooltip>
            ) : null}

            {/* 🔥 View (Standard) */}
            {["cumulative_shopwise", "new_cumulative_report"].includes(r.type) ? (
              <Tooltip title={!isProcessed ? "Upload and Click process to View" : ""}>
                <Button
                  type="primary"
                  disabled={!isProcessed}
                  onClick={() => {
                    if (typeFilter === 'new_cumulative_report') {
                      navigate(REPORT_REGISTRY.new_cumulative_report.route.replace(":id", r.id));
                    } else {
                      navigate(config.route.replace(":id", r.id));
                    }
                  }}
                >
                  View
                </Button>
              </Tooltip>
            ) : r.type !== "daily_warehouse" && (
              <Tooltip title={!isProcessed ? "Upload and Click process to View" : ""}>
                <Space direction="horizontal">
                  <Button
                    type="primary"
                    disabled={!isProcessed}
                    onClick={() => {
                      if (typeFilter === 'new_cumulative_report') {
                        navigate(REPORT_REGISTRY.new_cumulative_report.route.replace(":id", r.id));
                      } else {
                        navigate(config.route.replace(":id", r.id));
                      }
                    }}
                  >
                    View
                  </Button>

                  {r.type === "cumulative_warehouse" && isProcessed && (
                    <Button
                      onClick={() => navigate(`${config.route.replace(":id", r.id)}?mode=shop&view=cumulative`)}
                    >
                      Bondwise Secondary Sales
                    </Button>
                  )}
                </Space>
              </Tooltip>
            )}

            {/* 🔥 Upload/Manage button */}
            {["cumulative_shopwise", "new_cumulative_report"].includes(r.type) ? (
              <Tooltip title="Raw Data Upload/History">
                <Button
                  type="default"
                  icon={<UploadOutlined />}
                  onClick={() => {
                    setCurrent(r);
                    setUploadOpen(true);
                  }}
                />
              </Tooltip>
            ) : r.type === "daily_warehouse" ? (
              <Tooltip title="Raw Data Upload/History">
                <Button
                  type="default"
                  icon={<FileTextOutlined />}
                  onClick={() => {
                    setCurrent(r);
                    setUploadOpen(true);
                  }}
                />
              </Tooltip>
            ) : (
              <Button
                onClick={() => {
                  setCurrent(r);
                  setUploadOpen(true);
                }}
              >
                {["month_comparative", "monthly_stock_sales"].includes(r.type) ? "Manage" : "Upload"}
              </Button>
            )}

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

  const isUploadType = ["shopwise", "daily_warehouse", "daily_warehouse_offtake", "daily_secondary_sales", "shop_sales_cumulative"].includes(typeFilter);

  const renderHelpNote = () => {
    if (!typeFilter) return null;

    const notes = {
      shopwise: {
        text: "Data uploaded here is used in:",
        warning: "Please add raw data for each Day eg: 1,2,3,",
        links: [
          // { type: "cumulative_shopwise", label: "Cum. Shopwise Stock" },
          { type: "shopwise", label: "Shop Sales Daily" }
        ]
      },
      shop_sales_cumulative: {
        text: "Data uploaded here is used in:",
        warning: "Please add raw data for cumulative dates eg: 1-2,1-10. 1-16,",
        links: [
          { type: "shop_sales_cumulative", label: "Shop Sales Cumulative" }
        ]
      },
      // combined_shopwise: {
      //   text: "Data uploaded here is used in:",
      //    warning: "Please add raw data for cumulative dates eg: 1-2,1-10. 1-16,",
      //   links: [
      //     { type: "combined_shopwise", label: "Cumulative Shopwise" }
      //   ]
      // },
      daily_warehouse: {
        text: "Data uploaded here is used in:",
        links: [
          { type: "daily_warehouse", label: "Physical Stock report" }
        ]
      },
      daily_secondary_sales: {
        text: "Data uploaded here is used in:",
        links: [
          { type: "month_comparative", label: "Item Issue Period Comparison" }
        ]
      },
      daily_warehouse_offtake: {
        text: "Data uploaded here is used in:",
        links: [
          { type: "dailywise_secondary_sales_cum", label: "DailyWise Secondary Sales" },
          { type: "brandwise_cum_secondary_sales", label: "Brandwise Cum Secondary Sales" }
        ]
      }
    };

    const note = notes[typeFilter];
    if (!note) return null;

    return (
      <div style={{ marginTop: 8, padding: "8px 12px", backgroundColor: "#f0f5ff", border: "1px solid #adc6ff", borderRadius: 4 }}>
        <div style={{ fontSize: 13, color: "#262626", marginBottom: note.warning ? 4 : 0 }}>
          {note.text} {note.links.map((l, i) => (
            <span key={l.type}>
              <a 
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/reports?type=${l.type}`);
                }}
                style={{ fontWeight: "bold", color: "#1890ff", cursor: "pointer" }}
              >
                {l.label}
              </a>
              {i < note.links.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
        {note.warning && (
          <div style={{ fontSize: 12, color: "#faad14", fontWeight: "500" }}>
            ⚠️ {note.warning}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {typeFilter !== 'new_cumulative_report' && <Button onClick={handleAddReport}>Add Report</Button>}
      
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
          let finalType = type;
          if (type === 'new_cumulative_report') {
            finalType = 'cumulative_shopwise';
          }

          if (type === "month_comparative") {
            const res = await createReport(name, finalType, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });

            // 🔥 auto process
            await processReport(res.data.id);
          }
          else if (type === "monthly_stock_sales") {
            await createReport(name, finalType, {
              date: reportDate?.format("YYYY-MM"),
            });
          } 
          else if (["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales", "shop_sales_cumulative", "new_cumulative_report"].includes(type)) {
            const res = await createReport(name, finalType, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });
            await processReport(res.data.id);
          }
          else {
            await createReport(name, finalType, {
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
          <Form.Item label="Name">
            <Input
              placeholder="Enter name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={['cumulative_shopwise', 'combined_shopwise'].includes(type)}
            />
          </Form.Item>

          <Form.Item label="Type">
            <Select
              showSearch
              value={type}
              onChange={setType}
              style={{ width: '100%' }}
              placeholder="Select type"
              optionFilterProp="label"
              options={Object.entries(REPORT_REGISTRY)
                .filter(([k]) => !RAW_DATA_TYPES.includes(k) && k !== "month_comparative")
                .map(([k, v]) => ({
                  value: k,
                  label: v.label,
                }))}
            />
          </Form.Item>

          {/* 🔥 DAILY */}
          {["daily_secondary_sales", "shopwise", "daily_warehouse_offtake"].includes(type) && (
            <Form.Item label="Date">
              <DatePicker style={{ width: '100%' }} onChange={setReportDate} />
            </Form.Item>
          )}

          {/* 🔥 CLEANUP */}
          {type === "daily_warehouse" && (
            <Form.Item label="Date">
              <DatePicker style={{ width: '100%' }} onChange={setReportDate} />
            </Form.Item>
          )}

          {type === "monthly_stock_sales" && (
            <Form.Item label="Date">
              <DatePicker picker="month" style={{ width: '100%' }} onChange={setReportDate} />
            </Form.Item>
          )}

                    {["month_comparative", "cumulative_shopwise", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales", "shop_sales_cumulative", "new_cumulative_report"].includes(type) && (
            <Form.Item label="Date">
              <Space direction="vertical" style={{ width: '100%' }}>
                <DatePicker
                  placeholder={type === "month_comparative" ? "First Date" : "Start Date"}
                  style={{ width: '100%' }}
                  value={date1}
                  onChange={(val) => {
                    setDate1(val);
                    if (val && date2 && date2.isBefore(val, 'day')) {
                      setDate2(null);
                    }
                  }}
                  disabledDate={(current) => {
                    if (type === "month_comparative") {
                      return !isDateAvailable(current);
                    }
                    return false;
                  }}
                />
                <DatePicker
                  placeholder={type === "month_comparative" ? "Second Date" : "End Date"}
                  style={{ width: '100%' }}
                  value={date2}
                  onChange={setDate2}
                  disabledDate={(current) => {
                    if (type === "month_comparative") {
                      return !isDateAvailable(current);
                    }
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
      {uploadOpen && ["shopwise", "daily_warehouse_offtake", "monthly_stock_sales", "month_comparative", "shop_sales_cumulative"].includes(current?.type) && (
        <SingleFileUploadModal
          report={current}
          onClose={() => setUploadOpen(false)}
          reload={load}
        />
      )}

      {/* 🔥 CUMULATIVE UPLOAD MODAL */}
      {uploadOpen &&
        ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"].includes(
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