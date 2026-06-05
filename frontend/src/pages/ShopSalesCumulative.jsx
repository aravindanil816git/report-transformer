import { useState } from "react";
import { Modal, Table, Button, Upload, message, DatePicker, Space } from "antd";
import { uploadFile } from "../api";
import dayjs from "dayjs";

export default function ShopSalesCumulative({ report, onClose, reload }) {
  const [uploads, setUploads] = useState(report.uploads || []);
  const [uploadDate, setUploadDate] = useState(null);

  const handleUpload = async (file, date) => {
    try {
      const uploadKey = date || (uploadDate ? uploadDate.format("YYYY-MM-DD") : null);
      const res = await uploadFile(report.id, file, uploadKey, null, uploadKey);
      
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
      render: (_, r) => {
        if (r.from && r.to) return `${r.from} to ${r.to}`;
        return r.date || "N/A";
      }
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
      <div style={{ marginBottom: 16 }}>
        <Space>
          <DatePicker 
            value={uploadDate} 
            onChange={setUploadDate} 
            placeholder="Select Date" 
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
          <Upload
            beforeUpload={(file) => {
              if (!uploadDate) {
                message.warning("Please select a date first");
                return Upload.LIST_IGNORE;
              }
              return true;
            }}
            customRequest={({ file }) => handleUpload(file, null)}
            showUploadList={false}
          >
            <Button type="primary">Upload New File</Button>
          </Upload>
        </Space>
      </div>
      <Table dataSource={uploads} columns={columns} rowKey={(r) => r.date || r.from || Math.random()} />
    </Modal>
  );
}
