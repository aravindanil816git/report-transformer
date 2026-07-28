import { Modal, Table, Upload, Button, message, Progress, Space, Input } from "antd";
import { uploadFile, processReport, downloadRaw } from "../api";
import { useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";
import { exportToExcel } from "../utils/exportUtils";
import dayjs from "dayjs";

const { Dragger } = Upload;

export default function MultiShopUpload({
  report,
  onClose,
  reload,
}) {
  const [uploading, setUploading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [failedFiles, setFailedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [successfulCount, setSuccessfulCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [eta, setEta] = useState("");

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

  const uploadSingleFile = async (file) => {
    try {
      const res = await uploadFile(report.id, file, null, null, "auto");
      if (res.data?.status === "error") {
        console.error(`Failed to auto-detect shop for ${file.name}: ${res.data.message}`);
        return { success: false, file, error: res.data.message || "Auto-detect failed" };
      }
      return { success: true, file };
    } catch (e) {
      console.error(`Failed to upload ${file.name}`, e);
      return { success: false, file, error: e.message || "Network error" };
    }
  };

  const handleBulkUpload = async (fileList) => {
    if (fileList.length === 0) return;

    setUploading(true);
    setFailedFiles([]);
    setSuccessfulCount(0);
    setFailedCount(0);
    setTotalToUpload(fileList.length);
    setEta("Calculating...");
    
    const startTime = Date.now();
    let completedCount = 0;
    let currentFailed = [];
    const totalFiles = fileList.length;
    const batchSize = 20;

    const processBatch = async (batch) => {
      return Promise.all(
        batch.map(async (file) => {
          const res = await uploadSingleFile(file);
          completedCount++;
          if (res.success) {
            setSuccessfulCount((prev) => prev + 1);
          } else {
            currentFailed.push({ file: res.file, reason: res.error || "Upload failed" });
            setFailedCount((prev) => prev + 1);
          }
          // Calculate ETA
          const elapsed = (Date.now() - startTime) / 1000;
          const avgTime = elapsed / completedCount;
          const remaining = totalFiles - completedCount;
          const remainingSeconds = Math.round(avgTime * remaining);
          if (remainingSeconds > 0) {
            if (remainingSeconds >= 60) {
              const mins = Math.floor(remainingSeconds / 60);
              const secs = remainingSeconds % 60;
              setEta(`${mins}m ${secs}s remaining`);
            } else {
              setEta(`${remainingSeconds}s remaining`);
            }
          } else {
            setEta("Finishing up...");
          }
          return res;
        })
      );
    };

    for (let i = 0; i < totalFiles; i += batchSize) {
      const batch = fileList.slice(i, i + batchSize);
      setUploadProgress(`Uploading batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(totalFiles / batchSize)}...`);
      await processBatch(batch);
    }

    // Auto-retry failed files once if any failed
    if (currentFailed.length > 0) {
      setUploadProgress(`Retrying ${currentFailed.length} failed files...`);
      const retryList = currentFailed.map(item => item.file);
      currentFailed = []; // Clear for retry tracking
      
      const retryStartTime = Date.now();
      let retryCompleted = 0;
      const totalRetry = retryList.length;
      
      setTotalToUpload(totalRetry);
      setSuccessfulCount(0);
      setFailedCount(0);
      
      const processRetryBatch = async (batch) => {
        return Promise.all(
          batch.map(async (file) => {
            const res = await uploadSingleFile(file);
            retryCompleted++;
            if (res.success) {
              setSuccessfulCount((prev) => prev + 1);
            } else {
              currentFailed.push({ file: res.file, reason: res.error || "Upload failed after retry" });
              setFailedCount((prev) => prev + 1);
            }
            const elapsed = (Date.now() - retryStartTime) / 1000;
            const avgTime = elapsed / retryCompleted;
            const remaining = totalRetry - retryCompleted;
            const remainingSeconds = Math.round(avgTime * remaining);
            if (remainingSeconds > 0) {
              setEta(`${remainingSeconds}s remaining (retry)`);
            } else {
              setEta("Finishing retry...");
            }
          })
        );
      };

      for (let i = 0; i < totalRetry; i += batchSize) {
        const batch = retryList.slice(i, i + batchSize);
        await processRetryBatch(batch);
      }
    }

    if (currentFailed.length > 0) {
      setFailedFiles(currentFailed);
      message.warning(`Upload complete. Failed to identify ${currentFailed.length} files.`);
    } else {
      message.success(`Uploaded all files successfully`);
    }
    
    setUploading(false);
    setUploadProgress("");
    setEta("");
    
    const finalSuccess = fileList.length - currentFailed.length;
    if (finalSuccess > 0) {
      message.loading("Auto-processing report...", 2);
      await handleProcess();
    } else {
      setTimeout(() => {
        reload();
      }, 500);
    }
  };

  const downloadFailureReport = () => {
    if (failedFiles.length === 0) return;
    const data = failedFiles.map((f, idx) => ({
      "Serial No": idx + 1,
      "Raw Data File Name": f.file.name,
      "File Size (KB)": Math.round(f.file.size / 1024),
      "Failure Reason": f.reason || "Unknown upload error"
    }));
    exportToExcel(
      data,
      {
        "Report Name": "PI Variance Upload Failures",
        "Date": dayjs().format("DD-MM-YYYY HH:mm:ss")
      },
      "pi_variance_upload_failures.xlsx"
    );
  };

  const totalCount = (report.uploads || []).length;
  const uploadedCount = (report.uploads || []).filter(u => u.status === "uploaded").length;
  const blankCount = (report.uploads || []).filter(u => u.status === "blank").length;

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

  const sortedUploads = [...filteredUploads].sort((a, b) => {
    const statusOrder = { pending: 1, blank: 2, uploaded: 3 };
    const aOrder = statusOrder[a.status] || 99;
    const bOrder = statusOrder[b.status] || 99;
    return aOrder - bOrder;
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
        <span style={{ color: v === "uploaded" ? "green" : (v === "blank" ? "#faad14" : "orange"), fontWeight: v === "blank" ? "bold" : "normal" }}>{v}</span>
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
        {uploading && (
          <div style={{ marginTop: 16, padding: 16, backgroundColor: '#f0f5ff', borderRadius: 8, border: '1px solid #adc6ff' }}>
            <Progress 
              percent={Math.round(((successfulCount + failedCount) / (totalToUpload || 1)) * 100)} 
              status={failedCount > 0 ? "exception" : "active"}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '13px', fontWeight: 500 }}>
              <span style={{ color: '#1890ff' }}>{uploadProgress}</span>
              <span style={{ color: '#8c8c8c' }}>{eta}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '13px' }}>
              <span style={{ color: '#52c41a', fontWeight: 'bold' }}>✅ Success: {successfulCount}</span>
              <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>❌ Failed: {failedCount}</span>
              <span style={{ color: '#faad14', fontWeight: 'bold' }}>⏳ Pending: {Math.max(0, totalToUpload - successfulCount - failedCount)}</span>
            </div>
          </div>
        )}
      </div>

      {failedFiles.length > 0 && (
        <div style={{ padding: 16, backgroundColor: "#fff2f0", border: "1px solid #ffccc7", borderRadius: 8, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: "#ff4d4f", fontWeight: "bold", fontSize: '15px' }}>
              ⚠️ {failedFiles.length} files failed to upload (Auto-retry also failed):
            </span>
            <Space>
              <Button 
                type="default" 
                onClick={downloadFailureReport}
              >
                Download Failure Report
              </Button>
              <Button 
                type="primary" 
                danger 
                onClick={() => handleBulkUpload(failedFiles.map(item => item.file))}
                disabled={uploading}
              >
                Retry Failed Files ({failedFiles.length})
              </Button>
            </Space>
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', padding: 8, backgroundColor: '#fff', borderRadius: 4, border: '1px solid #f0f0f0', fontSize: '13px', color: '#555' }}>
            {failedFiles.map((f, idx) => (
              <div key={idx} style={{ padding: '3px 0', borderBottom: idx < failedFiles.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                📄 <b>{f.file.name}</b> <span style={{ color: "#ff4d4f", marginLeft: 8 }}>({f.reason})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '16px', fontWeight: 500 }}>
          Status: <span style={{ color: uploadedCount + blankCount === totalCount ? 'green' : '#1890ff' }}>{uploadedCount}</span> / {totalCount} Uploaded
          {blankCount > 0 && (
            <span style={{ marginLeft: 16, color: '#faad14' }}>
              ⚠️ Blanks: <b>{blankCount}</b>
            </span>
          )}
        </span>
        <Input.Search 
          placeholder="Search by shop name or code..." 
          onChange={(e) => setSearchText(e.target.value)} 
          style={{ width: 300 }} 
          allowClear 
        />
      </div>

      <Table columns={columns} dataSource={sortedUploads} rowKey="shop_code" pagination={{ pageSize: 50, showSizeChanger: true }} size="small" />
    </Modal>
  );
}