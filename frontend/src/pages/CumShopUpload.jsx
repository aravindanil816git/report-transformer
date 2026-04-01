import { Modal, Table, Upload, Button } from "antd";
import { useState } from "react";
import { uploadFile } from "../api";

export default function CumulativeUploadModal({ report, onClose, reload }) {

  const [selectedFiles, setSelectedFiles] = useState({}); 
  // { "2026-03-01": File }

  const handleSelect = (file, date) => {
    setSelectedFiles(prev => ({
      ...prev,
      [date]: file
    }));
    return false; // prevent auto upload
  };

const handleUpload = async (file, date) => {
  await uploadFile(report.id, file, date);
  reload();
};

  const columns = [
    { title: "Date", dataIndex: "date" },

    { title: "Status", dataIndex: "status" },

    {
      title: "Selected File",
      render: (_, row) =>
        selectedFiles[row.date]?.name || "-"
    },

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
      title="Upload Daily Reports"
    >
      <Table
        columns={columns}
        dataSource={report.uploads}
        rowKey="date"
      />
    </Modal>
  );
}