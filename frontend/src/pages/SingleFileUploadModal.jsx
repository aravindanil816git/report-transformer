import { Modal, Upload, Button, message } from "antd";
import { InboxOutlined } from '@ant-design/icons';
import { uploadFile } from "../api";

const { Dragger } = Upload;

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
      <div style={{ padding: '20px' }}>
        <Dragger
          maxCount={1}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          showUploadList={false}
          accept=".xls,.xlsx"
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag file to this area to upload</p>
          <p className="ant-upload-hint">
            Support for a single Excel file (.xls, .xlsx).
          </p>
        </Dragger>
      </div>
    </Modal>
  );
}
