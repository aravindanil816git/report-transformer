
import { useEffect, useState } from "react";
import { Table, Button, Modal, Input, Upload, DatePicker, Space } from "antd";
import { useNavigate } from "react-router-dom";
import {
  listReports,
  createReport,
  uploadFile,
  processReport,
} from "./api";

const { RangePicker } = DatePicker;

export default function DataPage() {
  const [data, setData] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState();
  const [dates, setDates] = useState([]);
  const [current, setCurrent] = useState(null);

  const navigate = useNavigate();

  const load = () => {
    listReports().then((r) => setData(r.data || []));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!name) return;
    await createReport(name);
    setOpen(false);
    setName("");
    load();
  };

  const handleUpload = async () => {
    if (!file || dates.length !== 2) return;
    await uploadFile(current, file, dates[0], dates[1]);
    setUploadOpen(false);
    load();
  };

  const handleProcess = async (id) => {
    await processReport(id);
    load();
  };

  const columns = [
    { title: "Name", dataIndex: "name" },
    { title: "Status", dataIndex: "status" },
    {
      title: "Actions",
      render: (_, r) => (
        <Space>
          <Button onClick={() => { setCurrent(r.id); setUploadOpen(true); }}>
            Upload
          </Button>

          {r.status === "Uploaded" && (
            <Button onClick={() => handleProcess(r.id)}>
              Process
            </Button>
          )}

          {r.status === "Processed" && (
            <Button onClick={() => navigate(`/report/${r.id}`)}>
              View Report
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>
        Add Report
      </Button>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        style={{ marginTop: 20 }}
        expandable={{
          expandedRowRender: (r) => (
            <ul>
              {(r.uploads || []).map((u, i) => (
                <li key={i}>
                  {u.file} ({u.from} - {u.to})
                </li>
              ))}
            </ul>
          ),
        }}
      />

      <Modal
        title="Create Report"
        open={open}
        onOk={handleCreate}
        onCancel={() => setOpen(false)}
      >
        <Input
          placeholder="Enter report name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Modal>

      <Modal
        title="Upload File"
        open={uploadOpen}
        onOk={handleUpload}
        onCancel={() => setUploadOpen(false)}
      >
        <Upload beforeUpload={(f) => { setFile(f); return false; }}>
          <Button>Select File</Button>
        </Upload>

        <RangePicker
          style={{ marginTop: 10 }}
          onChange={(d, s) => setDates(s)}
        />
      </Modal>
    </>
  );
}
