import { Modal, Table, Upload, Button } from "antd";
import { uploadFile } from "../api";

export default function DailySecondaryUploadModal({
  report,
  onClose,
  reload,
}) {
  const handleUpload = async (file, warehouse) => {
    await uploadFile(report.id, file, null, null, warehouse);

    setTimeout(() => {
      reload();
    }, 300);
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
      title="Upload Daily data"
      width={800}
    >
      <Table
        columns={columns}
        dataSource={report.uploads}
        rowKey="warehouse"
        pagination={false}
      />
    </Modal>
  );
}