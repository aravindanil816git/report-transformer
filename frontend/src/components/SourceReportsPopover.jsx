import React from "react";
import { Popover, Tag, Typography, Space, Badge } from "antd";
import { FileExcelOutlined, InfoCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

export default function SourceReportsPopover({ uploads = [], labels = [], config = {}, onlyCombined = false }) {
  // Filter out daily auto-synced entries if onlyCombined is true
  const validUploads = (uploads || []).filter(u => {
    if (!u) return false;
    const rawFile = u.file || "";
    const isAutoSynced = String(rawFile).toLowerCase().includes("auto-synced");
    
    if (onlyCombined && isAutoSynced) return false;
    return u.file || u.status === "uploaded" || u.range_key || u.start_day || u.date;
  });

  if (!validUploads || validUploads.length === 0) {
    return null;
  }

  // Determine active query bounds & month
  const date1Str = config.start_date || config.date1;
  const date2Str = config.end_date || config.date2;
  
  let targetMonth = "";
  let queryStartDay = 1;
  let queryEndDay = 31;

  if (date1Str && dayjs(date1Str).isValid()) {
    targetMonth = dayjs(date1Str).format("MMMM");
    queryStartDay = dayjs(date1Str).date();
  }
  if (date2Str && dayjs(date2Str).isValid()) {
    queryEndDay = dayjs(date2Str).date();
    if (!targetMonth) targetMonth = dayjs(date2Str).format("MMMM");
  }

  // Format label as "Month DayRange" matching active query bounds e.g. "August 1-17", "August 17-19"
  const getFormattedLabel = (item) => {
    const rawFile = item.file || "";
    
    // Extract Item Month
    let monthName = targetMonth;
    const itemDateStr = item.date1 || item.date || item.from;
    if (itemDateStr && dayjs(itemDateStr).isValid() && String(itemDateStr).length >= 7) {
      monthName = dayjs(itemDateStr).format("MMMM");
    } else if (!monthName) {
      const mMatch = String(rawFile).match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i);
      if (mMatch) {
        const parsedM = dayjs(mMatch[0], "MMM");
        if (parsedM.isValid()) monthName = parsedM.format("MMMM");
      }
    }
    if (!monthName) monthName = dayjs().format("MMMM");

    // Extract Day Range matching user's requested filter range bounds
    const itemStart = item.start_day !== undefined ? item.start_day : 1;
    const itemEnd = item.end_day !== undefined ? item.end_day : queryEndDay;

    let rangeStr = "";
    if (itemStart <= 16) {
      // Set 1 (Days 1 to 16/17)
      const endBound = queryEndDay > 16 ? Math.min(17, queryEndDay) : itemEnd;
      rangeStr = `1-${endBound}`;
    } else {
      // Set 2 (Days 17 to end)
      rangeStr = `17-${queryEndDay > 17 ? queryEndDay : itemEnd}`;
    }

    return `${monthName} ${rangeStr}`;
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
