import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Select,
  DatePicker,
} from "antd";
import {
  listReports,
  createReport,
  processReport,
} from "../api";
import { REPORT_REGISTRY } from "../reports";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";

import DailySecondaryUploadModal from "./DailySecondaryUploadModal";

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
    listReports().then((r) => setData(r.data || []));

  useEffect(() => {
    load();
  }, []);

  const handleProcess = async (id) => {
    await processReport(id);
    load();
  };

  // 🔥 available dates from daily reports
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
        if (r.type === "daily_secondary_sales") {
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

        return (
          <>
            {/* 🔥 Upload only for Daily */}
            {r.type === "daily_secondary_sales" && (
              <Button
                onClick={() => {
                  setCurrent(r);
                  setUploadOpen(true);
                }}
              >
                Upload
              </Button>
            )}

            {/* 🔥 Process */}
            {["Uploaded", "Ready"].includes(r.status) && (
              <Button onClick={() => handleProcess(r.id)}>
                Process
              </Button>
            )}

            {/* 🔥 View */}
            {r.status === "Processed" && (
              <Button
                onClick={() =>
                  navigate(config.route.replace(":id", r.id))
                }
              >
                View
              </Button>
            )}
          </>
        );
      },
    },
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add Report</Button>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        style={{ marginTop: 20 }}
      />

      {/* CREATE MODAL */}
      <Modal
        open={open}
        onOk={async () => {
          if (type === "month_comparative") {
            const res = await createReport(name, type, {
              date1: date1?.format("YYYY-MM-DD"),
              date2: date2?.format("YYYY-MM-DD"),
            });

            // 🔥 auto process
            await processReport(res.data.id);
          } else {
            await createReport(name, type, {
              date: reportDate?.format("YYYY-MM-DD"),
            });
          }

          setOpen(false);
          load();
        }}
        onCancel={() => setOpen(false)}
      >
        <Input
          placeholder="Report Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Select
          value={type}
          onChange={setType}
          options={Object.entries(REPORT_REGISTRY).map(
            ([k, v]) => ({
              value: k,
              label: v.label,
            })
          )}
        />

        {/* DAILY */}
        {type === "daily_secondary_sales" && (
          <DatePicker onChange={setReportDate} />
        )}

        {/* MONTH COMPARATIVE */}
        {type === "month_comparative" && (
          <>
            <DatePicker
              placeholder="Date 1"
              onChange={setDate1}
              disabledDate={(current) =>
                !dailyDates.includes(
                  current.format("YYYY-MM-DD")
                )
              }
            />

            <DatePicker
              placeholder="Date 2"
              onChange={setDate2}
              disabledDate={(current) =>
                !dailyDates.includes(
                  current.format("YYYY-MM-DD")
                )
              }
            />
          </>
        )}
      </Modal>

      {/* UPLOAD MODAL */}
      {uploadOpen &&
        current?.type === "daily_secondary_sales" && (
          <DailySecondaryUploadModal
            report={current}
            onClose={() => setUploadOpen(false)}
            reload={load}
          />
        )}
    </>
  );
}