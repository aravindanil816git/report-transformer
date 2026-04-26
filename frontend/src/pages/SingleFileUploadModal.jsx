import { Modal, Upload, Button, message, Space, Alert } from "antd";
import { InboxOutlined, CheckCircleFilled } from '@ant-design/icons';
import { uploadFile, processReport } from "../api";

const { Dragger } = Upload;

export default function SingleFileUploadModal({ report, onClose, reload }) {
  const handleUpload = async (file) => {
    try {
      await uploadFile(report.id, file);
      message.success("File uploaded successfully");
      reload();
      // Don't close, let them click process
    } catch (e) {
      message.error("Upload failed");
    }
  };

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

  const isUploadNeeded = !["monthly_stock_sales", "month_comparative"].includes(report.type);
  const latestUpload = report.uploads?.length > 0 ? report.uploads[report.uploads.length - 1] : null;
  const uploadedFile = latestUpload?.file;

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 40 }}>
          <span>{isUploadNeeded ? `Upload ${report.name}` : `Manage ${report.name}`}</span>
          <Button 
            type="primary" 
            onClick={handleProcess}
            disabled={isUploadNeeded && report.status === "Created"}
          >
            Process Report
          </Button>
        </div>
      }
      width={600}
    >
      <div style={{ padding: '20px' }}>
        {isUploadNeeded ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {uploadedFile && (
              <Alert
                message="File Uploaded Successfully"
                description={
                  <span>
                    Current file: <b>{uploadedFile}</b>
                  </span>
                }
                type="success"
                showIcon
                icon={<CheckCircleFilled />}
              />
            )}
            
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
              <p className="ant-upload-text">
                {uploadedFile ? "Replace existing file" : "Click or drag file to this area to upload"}
              </p>
              <p className="ant-upload-hint">
                Support for a single Excel file (.xls, .xlsx).
              </p>
            </Dragger>
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>This report is generated from existing data. Click "Process Report" to update the results.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
