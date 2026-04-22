import { Modal, Upload, Button, message } from "antd";
import { uploadFile } from "../api";

export default function SingleFileUploadModal({ report, onClose, reload }) {
  const handleUpload = async (file) => {
    try {
      await uploadFile(report.id, file);
      message.success("File uploaded successfully");
      reload();
      onClose();
    } catch (e) {
      message.error("Upload failed");
    }
  };

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title={`Upload ${report.name}`}
    >
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <Upload
          maxCount={1}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          showUploadList={false}
        >
          <Button type="primary" size="large">Select Excel File</Button>
        </Upload>
        <p style={{ marginTop: 10, color: '#666' }}>
          Please upload the single Excel file for this report.
        </p>
      </div>
    </Modal>
  );
}
