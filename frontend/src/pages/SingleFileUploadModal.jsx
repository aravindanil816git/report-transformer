import { Modal, Upload, Button, message, Space, Alert } from "antd";
import { InboxOutlined, CheckCircleFilled, DownloadOutlined } from '@ant-design/icons';
import { uploadFile, processReport, downloadRaw } from "../api";

const { Dragger } = Upload;

export default function SingleFileUploadModal({ report, onClose, reload }) {
  const handleUpload = async (file) => {
    try {
      await uploadFile(report.id, file);
      message.success("File uploaded successfully");
      
      // Auto-process for single file reports
      message.loading("Auto-processing report...", 2);
      await handleProcess();
    } catch (e) {
      message.error("Upload failed");
    }
  };

  const handleProcess = async () => {
    try {
      await processReport(report.id);
      message.success("Report processed successfully. It is now ready to be viewed.");
      reload();
      onClose();
    } catch (e) {
      message.error("Processing failed");
    }
  };

  const isUploadNeeded = !["monthly_stock_sales", "month_comparative", "achieved_target"].includes(report.type);
  const hasUploads = report.uploads?.length > 0;
  const uploadedFiles = report.uploads || [];

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
            {hasUploads && (
              <Alert
                message="Files Uploaded Successfully"
                description={
                  <span>
                    {uploadedFiles.map((u, idx) => (
                      <div key={idx} style={{ marginBottom: 4 }}>
                        <b>{u.file}</b>
                        <Button 
                          icon={<DownloadOutlined />} 
                          type="link" 
                          size="small"
                          onClick={() => downloadRaw(report.id, u.date || u.warehouse)}
                        >
                          Download
                        </Button>
                      </div>
                    ))}
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
                {hasUploads ? "Upload another file or replace" : "Click or drag file to this area to upload"}
              </p>
              <p className="ant-upload-hint">
                Support for Excel files (.xls, .xlsx).
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
