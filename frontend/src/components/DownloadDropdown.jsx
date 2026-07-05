import React from "react";
import { Dropdown, Button, Space } from "antd";
import { DownOutlined } from "@ant-design/icons";

/**
 * A beautiful, reusable download button group for downloading reports in Excel or PDF formats.
 * 
 * @param {Object} props
 * @param {Function} props.onDownload - Callback when an option is clicked, receives (format, type)
 * @param {boolean} [props.loading] - Whether the button is in a loading/exporting state
 * @param {boolean} [props.disabled] - Whether the download buttons should be disabled
 */
export default function DownloadDropdown({ onDownload, loading, disabled, showPdf = true, excelOptions, pdfOptions, clusterLabel = "Cluster" }) {
  const allExcelItems = {
    current: {
      key: "xlsx-current",
      label: (
        <div style={{ padding: "4px 8px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f1f1f" }}>Current View</div>
          <div style={{ fontSize: "12px", color: "#8c8c8c", marginTop: "2px" }}>Downloads only the filtered data matching the UI</div>
        </div>
      ),
    },
    unified: {
      key: "xlsx-unified",
      label: (
        <div style={{ padding: "4px 8px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f1f1f" }}>Unified Sheet</div>
          <div style={{ fontSize: "12px", color: "#8c8c8c", marginTop: "2px" }}>Downloads all data with a dynamic dropdown filter</div>
        </div>
      ),
    },
  };

  const excelItems = excelOptions
    ? excelOptions.map(opt => allExcelItems[opt]).filter(Boolean)
    : [allExcelItems.current, allExcelItems.unified];

  const allPdfItems = {
    current: {
      key: "pdf-current",
      label: (
        <div style={{ padding: "4px 8px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f1f1f" }}>Current View</div>
          <div style={{ fontSize: "12px", color: "#8c8c8c", marginTop: "2px" }}>Downloads currently filtered view as PDF</div>
        </div>
      ),
    },
    unified: {
      key: "pdf-unified",
      label: (
        <div style={{ padding: "4px 8px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f1f1f" }}>Unified PDF</div>
          <div style={{ fontSize: "12px", color: "#8c8c8c", marginTop: "2px" }}>Downloads all warehouses, one warehouse per page</div>
        </div>
      ),
    },
    cluster: {
      key: "pdf-cluster",
      label: (
        <div style={{ padding: "4px 8px" }}>
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f1f1f" }}>PDF by {clusterLabel}</div>
          <div style={{ fontSize: "12px", color: "#8c8c8c", marginTop: "2px" }}>Downloads separate PDF files for each {clusterLabel.toLowerCase()}</div>
        </div>
      ),
    },
  };

  const pdfItems = pdfOptions
    ? pdfOptions.map(opt => allPdfItems[opt]).filter(Boolean)
    : [allPdfItems.current, allPdfItems.unified, allPdfItems.cluster];

  const handleExcelClick = ({ key }) => {
    if (key === "xlsx-current") {
      onDownload("xlsx", "current");
    } else if (key === "xlsx-unified") {
      onDownload("xlsx", "unified");
    }
  };

  const handlePdfClick = ({ key }) => {
    if (key === "pdf-current") {
      onDownload("pdf", "current");
    } else if (key === "pdf-unified") {
      onDownload("pdf", "unified");
    } else if (key === "pdf-cluster") {
      onDownload("pdf", "cluster");
    }
  };

  return (
    <Space size="middle">
      {/* Excel Download Dropdown */}
      <Dropdown
        menu={{
          items: excelItems,
          onClick: handleExcelClick,
        }}
        trigger={["click"]}
        placement="bottomRight"
        disabled={disabled || loading}
      >
        <Button 
          type="primary" 
          disabled={disabled || loading}
        >
          <Space>
            {loading ? "Exporting..." : "Download Excel"}
            <DownOutlined style={{ fontSize: "10px" }} />
          </Space>
        </Button>
      </Dropdown>

      {/* PDF Download Dropdown */}
      {showPdf && (
        <Dropdown
          menu={{
            items: pdfItems,
            onClick: handlePdfClick,
          }}
          trigger={["click"]}
          placement="bottomRight"
          disabled={disabled || loading}
        >
          <Button 
            type="primary" 
            disabled={disabled || loading}
          >
            <Space>
              {loading ? "Exporting..." : "Download PDF"}
              <DownOutlined style={{ fontSize: "10px" }} />
            </Space>
          </Button>
        </Dropdown>
      )}
    </Space>
  );
}
