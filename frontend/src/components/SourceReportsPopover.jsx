import React from "react";
import { Popover, Tag, Typography, Space, Badge } from "antd";
import { FileExcelOutlined, InfoCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

const MONTH_NAMES = {
  jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June",
  jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December"
};

function getItemMonth(item, fallbackMonth) {
  // 1. Check item date string e.g. "2026-08-15" or "2026-07-01"
  const dStr = item.date1 || item.from || item.date;
  if (dStr && typeof dStr === "string" && dStr.length >= 7 && dStr.startsWith("202")) {
    const d = dayjs(dStr.slice(0, 10));
    if (d.isValid()) return d.format("MMMM");
  }

  // 2. Check filename or path for month keywords e.g. "JULY", "AUG", "MAY", "JUNE"
  const fileStr = String(item.file || item.path || "").toLowerCase();
  for (const [shortM, fullM] of Object.entries(MONTH_NAMES)) {
    if (fileStr.includes(shortM)) {
      return fullM;
    }
  }

  return fallbackMonth || dayjs().format("MMMM");
}

export default function SourceReportsPopover({ uploads = [], labels = [], config = {}, dateRange = [], onlyCombined = false }) {
  // Filter valid uploads
  const validUploads = (uploads || []).filter(u => {
    if (!u) return false;
    const rawFile = u.file || "";
    const isAutoSynced = String(rawFile).toLowerCase().includes("auto-synced");
    if (onlyCombined && isAutoSynced) return false;
    if (u.status && u.status !== "uploaded") return false;

    // Filter out uploads outside current active dateRange if dateRange is provided
    if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      const activeStart = dateRange[0].date();
      const activeEnd = dateRange[1].date();
      const sDay = u.start_day !== undefined ? u.start_day : (u.range_key && u.range_key.includes("-") ? parseInt(u.range_key.split("-")[0], 10) : (u.date && u.date.includes("-") ? parseInt(u.date.split("-")[0], 10) : 1));
      const eDay = u.end_day !== undefined ? u.end_day : (u.range_key && u.range_key.includes("-") ? parseInt(u.range_key.split("-")[1], 10) : (u.date && u.date.includes("-") ? parseInt(u.date.split("-")[1], 10) : 31));

      if (!isNaN(sDay) && !isNaN(eDay)) {
        if (eDay < activeStart || sDay > activeEnd) {
          return false;
        }
      }
    }
    return u.file || u.status === "uploaded" || u.range_key || u.start_day || u.date;
  });

  if (!validUploads || validUploads.length === 0) {
    return null;
  }

  // Determine fallback active month & query end day from dateRange
  let fallbackMonth = "";
  let activeEndDay = 31;
  if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
    fallbackMonth = dayjs(dateRange[0]).format("MMMM");
    activeEndDay = dayjs(dateRange[1]).date();
  } else {
    const d1Str = config.date1 || config.start_date;
    const d2Str = config.date2 || config.end_date;
    if (d1Str && dayjs(d1Str).isValid()) fallbackMonth = dayjs(d1Str).format("MMMM");
    if (d2Str && dayjs(d2Str).isValid()) activeEndDay = dayjs(d2Str).date();
  }

  // Format label as "Month DayRange" e.g. "August 1-16", "August 17-19"
  const getFormattedLabel = (item) => {
    const rawFile = item.file || "";
    const monthName = getItemMonth(item, fallbackMonth);

    // Extract Day Range
    let sDay = item.start_day;
    let eDay = item.end_day;

    if (sDay === undefined || eDay === undefined) {
      if (item.range_key && item.range_key.includes("-")) {
        const parts = item.range_key.split("-");
        sDay = parseInt(parts[0], 10);
        eDay = parseInt(parts[1], 10);
      } else {
        const clean = String(rawFile).replace(/(\d+)\s*(?:st|nd|rd|th)/gi, "$1");
        const m = clean.match(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})/i);
        if (m) {
          sDay = parseInt(m[1], 10);
          eDay = parseInt(m[2], 10);
        }
      }
    }

    if (sDay === undefined) sDay = 1;
    if (eDay === undefined) eDay = activeEndDay;

    return `${monthName} ${sDay}-${eDay}`;
  };

  // Deduplicate by formatted label
  const uniqueItemsMap = new Map();
  validUploads.forEach(u => {
    const formattedLabel = getFormattedLabel(u);
    if (!uniqueItemsMap.has(formattedLabel)) {
      uniqueItemsMap.set(formattedLabel, { ...u, displayLabel: formattedLabel });
    }
  });

  const sourceItems = Array.from(uniqueItemsMap.values());

  if (sourceItems.length === 0) return null;

  const content = (
    <div style={{ maxWidth: 360, maxHeight: 300, overflowY: "auto", padding: "4px 2px" }}>
      <div style={{ marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #f0f0f0" }}>
        <Text strong style={{ fontSize: 14 }}>
          📄 Source Reports Involved ({sourceItems.length})
        </Text>
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size={8}>
        {sourceItems.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "#f0f5ff",
              border: "1px solid #adc6ff",
              borderRadius: 6,
              fontSize: 13
            }}
          >
            <Space style={{ overflow: "hidden" }}>
              <FileExcelOutlined style={{ color: "#1890ff", fontSize: 16 }} />
              <Text strong style={{ fontSize: 13, color: "#1d39c4" }}>
                {item.displayLabel}
              </Text>
            </Space>
            <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
              Source Report
            </Tag>
          </div>
        ))}
      </Space>
    </div>
  );

  return (
    <div style={{ marginTop: 16, marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
      <Popover
        content={content}
        title={null}
        trigger="hover"
        placement="topRight"
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            background: "#e6f7ff",
            border: "1px solid #91d5ff",
            borderRadius: 20,
            cursor: "pointer",
            color: "#096dd9",
            fontWeight: 500,
            fontSize: 13,
            boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
            transition: "all 0.2s"
          }}
        >
          <InfoCircleOutlined style={{ color: "#1890ff", fontSize: 14 }} />
          <span>Source Reports Involved ({sourceItems.length})</span>
          <Badge status="processing" color="#1890ff" />
        </span>
      </Popover>
    </div>
  );
}
