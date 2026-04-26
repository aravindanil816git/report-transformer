import { Modal, Table, Upload, Button, message, Progress, Space } from "antd";
import { uploadFile, processReport } from "../api";
import { useState } from "react";

const { Dragger } = Upload;

export default function DailySecondaryUploadModal({
  report,
  onClose,
  reload,
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleProcess = async () => {
    try {
      await processReport(report.id);
      message.success("Report processed successfully");
      reload();
      onClose();
    } catch (e) {
      message.error("Processing failed");
    }
  };

  const handleUpload = async (file, warehouse) => {
    try {
      await uploadFile(report.id, file, null, null, warehouse);
      message.success(`${file.name} uploaded successfully`);
      reload();
    } catch (e) {
      message.error(`${file.name} upload failed`);
    }
  };

  const handleBulkUpload = async (info) => {
    const { fileList } = info;
    if (fileList.length === 0) return;

    setUploading(true);
    setProgress(0);

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i].originFileObj;
      try {
        const res = await uploadFile(report.id, file, null, null, "auto");
        if (res.data?.status === "error") {
          console.error(`Failed to auto-detect warehouse for ${file.name}: ${res.data.message}`);
          failCount++;
        } else {
          successCount++;
        }
      } catch (e) {
        console.error(`Failed to upload ${file.name}`, e);
        failCount++;
      }
      setProgress(Math.round(((i + 1) / fileList.length) * 100));
    }

    if (failCount > 0) {
      message.warning(`Uploaded ${successCount} files. Failed to identify ${failCount} files.`);
    } else {
      message.success(`Uploaded all ${successCount} files successfully`);
    }
    setUploading(false);
    setTimeout(() => {
      reload();
      setProgress(0);
    }, 500);
  };

  const columns = [
    {
      title: "Warehouse",
      dataIndex: "warehouse",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (v) =>
        v === "uploaded" ? "✅ Uploaded" : "Pending",
    },
    {
      title: "File",
      dataIndex: "file",
      render: (v) => v || "-",
    },
    {
      title: "Action",
      render: (_, row) => {
        if (row.status === "uploaded") {
          return "✅ Done";
        }

        return (
          <Upload
            maxCount={1}
            beforeUpload={(file) => {
              handleUpload(file, row.warehouse);
              return false;
            }}
            showUploadList={false}
          >
            <Button>Select File</Button>
          </Upload>
        );
      },
    },
  ];

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 40 }}>
          <span>Upload Daily data</span>
          <Button 
            type="primary" 
            onClick={handleProcess}
            disabled={!report.uploads.some(u => u.status === "uploaded")}
          >
            Process Report
          </Button>
        </div>
      }
      width={900}
    >
      <div style={{ marginBottom: 24 }}>
        <Dragger
          multiple
          showUploadList={false}
          beforeUpload={() => false}
          onChange={handleBulkUpload}
          disabled={uploading}
        >
          <p className="ant-upload-drag-icon">
            <span style={{ fontSize: "2rem" }}>📥</span>
          </p>
          <p className="ant-upload-text">
            Click or drag files to this area to upload
          </p>
          <p className="ant-upload-hint">
            Support for bulk upload. System will automatically match files to
            warehouses based on content.
          </p>
        </Dragger>
        {uploading && (
          <div style={{ marginTop: 16 }}>
            <Progress percent={progress} />
          </div>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={report.uploads}
        rowKey="warehouse"
        pagination={false}
        size="small"
      />
    </Modal>
  );
}