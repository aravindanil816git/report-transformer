import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Upload,
  DatePicker,
  Space,
  Select,
} from "antd";
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
  const [type, setType] = useState("shopwise");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [dates, setDates] = useState([]);
  const [current, setCurrent] = useState(null);

  const navigate = useNavigate();

  const load = () => {
    listReports().then((r) => setData(r.data || []));
  };

  useEffect(() => {
    load();
  }, []);

  // ===== CREATE =====
  const handleCreate = async () => {
    if (!name) return;

    await createReport(name, type);

    setOpen(false);
    setName("");
    setType("shopwise");

    load();
  };

  // ===== UPLOAD =====
  const handleUpload = async () => {
    if (!file || dates.length !== 2) return;

    await uploadFile(
      current,
      file,
      dates[0]?.format("YYYY-MM-DD"),
      dates[1]?.format("YYYY-MM-DD")
    );

    setUploadOpen(false);
    setFile(null);
    setDates([]);

    load();
  };

  // ===== PROCESS =====
  const handleProcess = async (id) => {
    await processReport(id);
    load();
  };

  // ===== TABLE =====
  const columns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Type",
      dataIndex: "type",
      render: (t) =>
        t === "cleanup" ? "Daily Warehouse Report" : "Shopwise Stock",
    },
    { title: "Status", dataIndex: "status" },
    {
      title: "Actions",
      render: (_, r) => (
        <Space>
          <Button
            onClick={() => {
              setCurrent(r.id);
              setUploadOpen(true);
            }}
          >
            Upload
          </Button>

          {r.status === "Uploaded" && (
            <Button onClick={() => handleProcess(r.id)}>Process</Button>
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
                  {u.file} ({u.from} → {u.to})
                </li>
              ))}
            </ul>
          ),
        }}
      />

      {/* CREATE */}
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

        <Select
          style={{ marginTop: 10, width: "100%" }}
          value={type}
          onChange={setType}
          options={[
            { label: "Shopwise Stock", value: "shopwise" },
            { label: "Daily Warehouse Report", value: "cleanup" },
          ]}
        />
      </Modal>

      {/* UPLOAD */}
      <Modal
        title="Upload File"
        open={uploadOpen}
        onOk={handleUpload}
        onCancel={() => setUploadOpen(false)}
      >
        // only change Upload modal

<Upload
  beforeUpload={(f) => {
    setFile(f);
    return false;
  }}
  multiple={false}
>
          <Button>Select File</Button>
        </Upload>

        <RangePicker
          style={{ marginTop: 10, width: "100%" }}
          onChange={(d) => setDates(d || [])}
        />
      </Modal>
    </>
  );
}