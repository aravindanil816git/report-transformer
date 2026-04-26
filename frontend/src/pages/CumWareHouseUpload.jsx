import { Modal, Table, Upload, Button, message } from "antd";
import { uploadFile } from "../api";

export default function CumulativeWarehouseUpload({ report, onClose, reload }) {

  const handleUpload = async (file, date) => {
    try {
      const res = await uploadFile(report.id, file, null, null, date);
      if (res.data?.status === "error") {
        message.error(`${date}: ${res.data.message}`);
      } else {
        message.success(`${date}: ${file.name} uploaded successfully`);
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
        if (row.status === "uploaded") return "✅ Uploaded";

        return (
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
        );
      }
    }
  ];

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title="Upload Warehouse Reports"
    >
      <Table
        columns={columns}
        dataSource={report.uploads}
        rowKey="date"
        pagination={false}
      />
    </Modal>
  );
}