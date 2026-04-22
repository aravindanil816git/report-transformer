import { Modal, Table, Upload, Button } from "antd";
import { uploadFile } from "../api";

export default function CumulativeWarehouseUpload({ report, onClose, reload }) {

  const handleUpload = async (file, date) => {
    await uploadFile(report.id, file, date);
    reload();
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