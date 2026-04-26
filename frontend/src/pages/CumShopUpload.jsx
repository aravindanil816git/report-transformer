import { Modal, Table, Upload, Button, message, Space } from "antd";
import { useState } from "react";
import { uploadFile, processReport } from "../api";

export default function CumulativeUploadModal({ report, onClose, reload }) {
  const [uploading, setUploading] = useState(false);

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

  const handleUpload = async (file, date) => {
    try {
      const res = await uploadFile(report.id, file, null, null, date);
      if (res.data?.status === "error") {
        message.error(`${date}: ${res.data.message}`);
      } else {
        message.success(`${date}: ${file.name} uploaded`);
        reload();
      }
    } catch (e) {
      message.error(`${date}: Upload failed`);
    }
  };

  const columns = [
    { title: "Date", dataIndex: "date" },
    { title: "Status", dataIndex: "status" },
    {
      title: "Action",
      render: (_, row) => {
        if (row.status === "uploaded") {
          return "✅ Uploaded";
        }

        return (
          <>
            <Upload
  maxCount={1}
  beforeUpload={(file) => {
    handleUpload(file, row.date);
    return false;
  }}
  showUploadList={false}
>
  <Button>Select File</Button>
</Upload>
          </>
        );
      }
    }
  ];

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 40 }}>
          <span>Upload Daily Reports</span>
          <Button 
            type="primary" 
            onClick={handleProcess}
            disabled={!report.uploads.some(u => u.status === "uploaded")}
          >
            Process Report
          </Button>
        </div>
      }
    >
      <Table
        columns={columns}
        dataSource={report.uploads}
        rowKey="date"
      />
    </Modal>
  );
}