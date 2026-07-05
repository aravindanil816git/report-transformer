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
import { DeleteOutlined, UploadOutlined, FileTextOutlined, ReloadOutlined } from "@ant-design/icons";
import { message, Popconfirm } from "antd";

import DailySecondaryUploadModal from "./DailySecondaryUploadModal";
import CumulativeUploadModal from "./CumShopUpload";
import SingleFileUploadModal from "./SingleFileUploadModal";
import { disabledFutureMonthDates } from "../utils/dateUtils";



const RAW_DATA_TYPES = [
  "shopwise",
  "shop_sales_cumulative",
  "daily_warehouse",
  "daily_warehouse_offtake",
  "daily_secondary_sales",
  "warehouse_stock",
];

export default function DataPage() {
  const [data, setData] = useState([]);
  const [dailyDates, setDailyDates] = useState([]);

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
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const loadDailyDates = () => {
    Promise.all([
      listReports({ type: "daily_secondary_sales", limit: 1000 }),
      listReports({ type: "item_issue_consolidation", limit: 1000 })
    ]).then(([res1, res2]) => {
      const reps1 = res1.data?.items || res1.data || [];
      const reps2 = res2.data?.items || res2.data || [];
      const dates = [...reps1, ...reps2]
        .filter((d) => d.status === "Processed" || d.status === "Ready" || d.status === "Uploaded")
        .map((d) => d.config?.date)
        .filter(Boolean);
      setDailyDates(dates);
    });
  };

  const load = () => {
    let currentTypeFilter = typeFilter;
    if (typeFilter === 'new_cumulative_report') {
      currentTypeFilter = 'cumulative_shopwise';
    }
    
    const queryParams = { skip: (currentPage - 1) * pageSize, limit: pageSize };
    if (currentTypeFilter) {
      queryParams.type = currentTypeFilter;
    } else {
      queryParams.exclude_raw = true;
    }
    
    listReports(queryParams).then((r) => {
      const reports = r.data?.items || r.data || [];
      setData(reports);
      setTotal(r.data?.total || reports.length);
      setCurrent((prev) => {
        if (!prev) return null;
        return reports.find((x) => x.id === prev.id) || prev;
      });
    });
    loadDailyDates();
  };

  useEffect(() => {
    load();
  }, [typeFilter, currentPage, pageSize]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter]);

  useEffect(() => {
    if (['cumulative_shopwise', 'combined_shopwise', 'shop_sales_cumulative', 'new_cumulative_report', 'month_comparative', 'dailywise_secondary_sales_cum', 'brandwise_cum_secondary_sales'].includes(type) && date1 && date2) {
      setName(`${date1.format('DD-MM-YYYY')} to ${date2.format('DD-MM-YYYY')}`);
    } else if (type === 'monthly_summary' && reportDate) {
      const curr = reportDate.format('MMMM YYYY');
      const prev = reportDate.subtract(1, 'month').format('MMMM YYYY');
      setName(`${curr} v/s ${prev} summary`);
    } else if (['achieved_target', 'monthly_stock_sales', 'pi_variance'].includes(type) && reportDate) {
      const label = REPORT_REGISTRY[type]?.label || (type === 'achieved_target' ? 'Achieved / Target' : type);
      setName(`${label} - ${reportDate.format('MM-YYYY')}`);
    } else if (reportDate) {
      const label = REPORT_REGISTRY[type]?.label || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      setName(`${label} - ${reportDate.format('DD-MM-YYYY')}`);
    } else {
      setName("");
    }
  }, [date1, date2, reportDate, type]);

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
    ...data
  ];

  const columns = [
    { title: "Name", dataIndex: "name" },

    // 🔥 DATE COLUMN
    {
      title: "Date",
      render: (_, r) => {
        if (r.isLive) return "Live Comparison";
        if (["daily_secondary_sales", "shopwise", "daily_warehouse", "daily_warehouse_offtake", "shop_sales_cumulative", "warehouse_stock"].includes(r.type)) {
          return r.config?.date
            ? dayjs(r.config.date).format("DD-MM-YYYY")
            : "-";
        }

        if (r.type === "month_comparative") {
          return `${dayjs(r.config?.date1).format("DD-MM-YYYY")} → ${dayjs(
            r.config?.date2
          ).format("DD-MM-YYYY")}`;
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
        
        // Allow users to open lazy-processed report containers regardless of processed status
        const isLazyType = ["cumulative_shopwise", "new_cumulative_report", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"].includes(r.type);
        const isProcessed = r.status === "Processed" || isLazyType;

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
                    } else if (r.type === 'monthly_summary') {
                      navigate(`/report/monthly_summary/${r.id}`);
                    } else if (r.type === 'pi_variance') {
                      navigate(`/report/pi_variance/${r.id}`);
                    } else if (!config?.route && RAW_DATA_TYPES.includes(r.type)) {
                        navigate(`/report/${r.type}/${r.id}`);
                    } else {
                      navigate(config?.route?.replace(":id", r.id) || `/achieved-target/${r.id}`);
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
            ) : ["month_comparative", "monthly_stock_sales", "achieved_target", "monthly_summary", "pi_variance"].includes(r.type) ? (
              <Tooltip title="Reprocess Report">
                <Button
                  type="default"
                  icon={<ReloadOutlined />}
                  onClick={async () => {
                    const hide = message.loading("Processing report...", 0);
                    try {
                      await handleProcess(r.id);
                      hide();
                      message.success("Report processed successfully");
                    } catch (e) {
                      hide();
                      message.error("Failed to process report");
                    }
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
                Upload
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

  const isUploadType = ["shopwise", "daily_warehouse", "daily_warehouse_offtake", "daily_secondary_sales", "shop_sales_cumulative", "warehouse_stock"].includes(typeFilter);

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
      warehouse_stock: {
        text: "Data uploaded here is used in:",
        links: [
          { type: "monthly_stock_sales", label: "Monthly Stock Sales (Inward)" }
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
          { type: "cumulative_warehouse", label: "Cumulative Warehouse" },
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
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          }
        }}
        style={{ marginTop: 20 }}
      />

      <Modal
        title="Create New Report"
        open={open}
        okButtonProps={{
          disabled: 
            (["monthly_stock_sales", "achieved_target", "monthly_summary", "pi_variance"].includes(type) && !reportDate) ||
            (["month_comparative", "cumulative_shopwise", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales", "shop_sales_cumulative", "new_cumulative_report"].includes(type) && (!date1 || !date2)) ||
            (["daily_secondary_sales", "shopwise", "daily_warehouse_offtake", "daily_warehouse", "warehouse_stock"].includes(type) && (!name || !reportDate))
        }}
        onOk={async () => {
          let finalType = type;
          if (type === 'new_cumulative_report') {
            finalType = 'cumulative_shopwise';
          }

          // Ensure a name is always present before sending to backend to prevent "Field required" crash
          let finalName = name;
          if (!finalName) {
             if (['cumulative_shopwise', 'combined_shopwise', 'shop_sales_cumulative', 'new_cumulative_report', 'month_comparative', 'dailywise_secondary_sales_cum', 'brandwise_cum_secondary_sales'].includes(type) && date1 && date2) {
               finalName = `${date1.format('DD-MM-YYYY')} to ${date2.format('DD-MM-YYYY')}`;
             } else if (type === 'monthly_summary' && reportDate) {
               const curr = reportDate.format('MMMM YYYY');
               const prev = reportDate.subtract(1, 'month').format('MMMM YYYY');
               finalName = `${curr} v/s ${prev} summary`;
             } else if (['achieved_target', 'monthly_stock_sales', 'pi_variance'].includes(type) && reportDate) {
               const label = REPORT_REGISTRY[type]?.label || (type === 'achieved_target' ? 'Achieved / Target' : type);
               finalName = `${label} - ${reportDate.format('MM-YYYY')}`;
             } else if (reportDate) {
               const label = REPORT_REGISTRY[type]?.label || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
               finalName = `${label} - ${reportDate.format('DD-MM-YYYY')}`;
             } else {
               const label = REPORT_REGISTRY[type]?.label || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
               finalName = `${label} Report`;
             }
          }

          if (type === "month_comparative") {
            const res = await createReport(finalName, finalType, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });

            // 🔥 auto process
            await processReport(res.data.id);
          }
          else if (["monthly_stock_sales", "achieved_target", "monthly_summary", "pi_variance"].includes(type)) {
            await createReport(finalName, finalType, {
              date: reportDate?.format("YYYY-MM"),
            });
          } 
          else if (["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales", "shop_sales_cumulative", "new_cumulative_report"].includes(type)) {
            const res = await createReport(finalName, finalType, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });
            // Only auto-process raw data containers; lazy-view types process on-demand inside the view
            if (type === "shop_sales_cumulative") {
              await processReport(res.data.id);
            }
          }
          else {
            await createReport(finalName, finalType, {
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
              placeholder="Auto-generated on date selection"
              value={name}
              disabled
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
          {["daily_secondary_sales", "shopwise", "daily_warehouse_offtake", "warehouse_stock"].includes(type) && (
            <Form.Item label="Date">
              <DatePicker style={{ width: '100%' }} onChange={setReportDate} disabledDate={disabledFutureMonthDates} />
            </Form.Item>
          )}

          {/* 🔥 CLEANUP */}
          {type === "daily_warehouse" && (
            <Form.Item label="Date">
              <DatePicker style={{ width: '100%' }} onChange={setReportDate} disabledDate={disabledFutureMonthDates} />
            </Form.Item>
          )}

        {["monthly_stock_sales", "achieved_target", "monthly_summary", "pi_variance"].includes(type) && (
            <Form.Item label="Month">
              <DatePicker picker="month" style={{ width: '100%' }} onChange={setReportDate} disabledDate={disabledFutureMonthDates} />
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
                  if (disabledFutureMonthDates(current)) return true;
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
                    if (disabledFutureMonthDates(current)) return true;
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
        ["daily_secondary_sales", "daily_warehouse", "warehouse_stock"].includes(
          current?.type
        ) && (
          <DailySecondaryUploadModal
            report={current}
            onClose={() => setUploadOpen(false)}
            reload={load}
          />
        )}

      {/* 🔥 SINGLE FILE UPLOAD MODAL */}
      {uploadOpen && ["shopwise", "daily_warehouse_offtake", "monthly_stock_sales", "month_comparative", "shop_sales_cumulative", "achieved_target", "monthly_summary"].includes(current?.type) && (
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