import { Modal, Table, Upload, Button, message, Progress, Space, Input } from "antd";
import { uploadFile, processReport, downloadRaw } from "../api";
import { useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";

const { Dragger } = Upload;

export default function MultiShopUpload({
  report,
  onClose,
  reload,
}) {
  const [uploading, setUploading] = useState(false);
  const [searchText, setSearchText] = useState("");

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

  const handleUpload = async (file, shopCode) => {
    try {
      await uploadFile(report.id, file, null, null, shopCode);
      message.success(`${file.name} uploaded successfully for shop ${shopCode}`);
      
      // Auto-process
      message.loading("Auto-processing report...", 2);
      await handleProcess();
    } catch (e) {
      message.error(`${file.name} upload failed`);
    }
  };

  const handleBulkUpload = async (fileList) => {
    if (fileList.length === 0) return;

    setUploading(true);

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const res = await uploadFile(report.id, file, null, null, "auto");
        if (res.data?.status === "error") {
          console.error(`Failed to auto-detect shop for ${file.name}: ${res.data.message}`);
          failCount++;
        } else {
          successCount++;
        }
      } catch (e) {
        console.error(`Failed to upload ${file.name}`, e);
        failCount++;
      }
    }

    if (failCount > 0) {
      message.warning(`Uploaded ${successCount} files. Failed to identify ${failCount} files.`);
    } else {
      message.success(`Uploaded all ${successCount} files successfully`);
    }
    
    setUploading(false);
    
    if (successCount > 0) {
      message.loading("Auto-processing report...", 2);
      await handleProcess();
    } else {
      setTimeout(() => {
        reload();
      }, 500);
    }
  };

  const totalCount = (report.uploads || []).length;
  const uploadedCount = (report.uploads || []).filter(u => u.status === "uploaded").length;

  const filteredUploads = (report.uploads || []).filter(u => {
    // Visually hide any non-KSBC shops from the list
    if (u.category && String(u.category).toUpperCase() !== "KSBC") {
      return false;
    }

    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    return (
      (u.shop_name && u.shop_name.toLowerCase().includes(lower)) ||
      (u.shop_code && String(u.shop_code).toLowerCase().includes(lower))
    );
  });

  const columns = [
    {
      title: "Shop",
      dataIndex: "shop_name",
      render: (text, record) => `${record.shop_name} (${record.shop_code})`,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (v) => (
        <span style={{ color: v === "uploaded" ? "green" : "orange" }}>{v}</span>
      ),
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
          return (
            <Space>
              <span>✅ Done</span>
              <Button 
                icon={<DownloadOutlined />} 
                size="small"
                onClick={() => downloadRaw(report.id, row.shop_code)}
              >
                Download
              </Button>
            </Space>
          );
        }

        return (
          <Upload
            maxCount={1}
            beforeUpload={(file) => {
              handleUpload(file, row.shop_code);
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
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 40 }}>
          <span>Upload PI Variance Data</span>
          <Button 
            type="primary" 
            onClick={handleProcess}
            disabled={!report.uploads.some(u => u.status === "uploaded")}
          >
            Process Report
          </Button>
        </div>
      }
      width={900}
    >
      <div style={{ marginBottom: 24 }}>
        <Dragger multiple showUploadList={false} beforeUpload={(file, fileList) => { if (fileList.indexOf(file) === fileList.length - 1) { handleBulkUpload(fileList); } return false; }} disabled={uploading} >
          <p className="ant-upload-drag-icon"><span style={{ fontSize: "2rem" }}>📥</span></p>
          <p className="ant-upload-text">Click or drag files to this area to upload</p>
          <p className="ant-upload-hint">Support for bulk upload. System will automatically match files to shops based on content.</p>
        </Dragger>
        {uploading && <div style={{ marginTop: 16 }}><Progress percent={100} status="active" showInfo={false} /></div>}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '16px', fontWeight: 500 }}>
          Status: <span style={{ color: uploadedCount === totalCount ? 'green' : '#1890ff' }}>{uploadedCount}</span> / {totalCount} Uploaded
        </span>
        <Input.Search 
          placeholder="Search by shop name or code..." 
          onChange={(e) => setSearchText(e.target.value)} 
          style={{ width: 300 }} 
          allowClear 
        />
      </div>

      <Table columns={columns} dataSource={filteredUploads} rowKey="shop_code" pagination={{ pageSize: 50, showSizeChanger: true }} size="small" />
    </Modal>
  );
}