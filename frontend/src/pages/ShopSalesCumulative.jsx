import { useState } from "react";
import { Modal, Table, Button, Upload, message, DatePicker, Tooltip } from "antd";
import { uploadFile } from "../api";

export default function ShopSalesCumulative({ report, onClose, reload }) {
  const [uploads, setUploads] = useState(report.uploads);

  const handleUpload = async (file, date) => {
    try {
      const res = await uploadFile(report.id, file, null, null, date);
      if (res.data.status !== "uploaded") {
        throw new Error(res.data.message || "Failed to upload");
      }

      message.success(`${file.name} uploaded successfully`);
      reload(); // Reload data in parent
    } catch (err) {
      message.error(err.message || "Upload failed");
      return Upload.LIST_IGNORE; // Prevent file from being added to list
    }
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => <span style={{ color: status === "uploaded" ? "green" : "red" }}>{status}</span>,
    },
    {
      title: "File",
      dataIndex: "file",
      key: "file",
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Upload
          customRequest={({ file }) => handleUpload(file, record.date)}
          showUploadList={false}
        >
          <Button>Upload</Button>
        </Upload>
      ),
    },
  ];

  return (
    <Modal
      title={`Uploads for ${report.name}`}
      open={true}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      <Table dataSource={uploads} columns={columns} rowKey="date" />
    </Modal>
  );
}
