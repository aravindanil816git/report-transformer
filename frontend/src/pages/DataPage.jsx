
import { useEffect, useState } from "react";
import { Table, Button, Modal, Input, Select, Upload, DatePicker } from "antd";
import { listReports, createReport, uploadFile, processReport } from "../api";
import { REPORT_REGISTRY } from "../reports";
import { useNavigate, useSearchParams } from "react-router-dom";

const { RangePicker } = DatePicker;

export default function DataPage() {
  const [data, setData] = useState([]);
  const [params] = useSearchParams();
  const typeFilter = params.get("type");

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("shopwise");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [dates, setDates] = useState([]);
  const [current, setCurrent] = useState(null);

  const navigate = useNavigate();

  const load = () => listReports().then(r => setData(r.data || []));
  useEffect(() => { load(); }, []);


  const handleProcess = async (id) => {
    await processReport(id);
    load();
  };

  const filtered = typeFilter ? data.filter(d => d.type === typeFilter) : data;

  const columns = [
    { title: "Name", dataIndex: "name" },
    { title: "Type", dataIndex: "type" },
    { title: "Status", dataIndex: "status" },
    {
      title: "Actions",
      render: (_, r) => {
        const config = REPORT_REGISTRY[r.type];
        return (
          <>
            <Button onClick={() => { setCurrent(r.id); setUploadOpen(true); }}>
              Upload
            </Button>
                      {r.status === "Uploaded" && (
            <Button onClick={() => handleProcess(r.id)}>Process</Button>
          )}
            {r.status === "Processed" && (
              <Button onClick={() => navigate(config.route.replace(":id", r.id))}>
                View
              </Button>
            )}
          </>
        );
      },
    },
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add Report</Button>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        expandable={{
          expandedRowRender: (r) => (
            <ul>
              {(r.uploads || []).map((u, i) => (
                <li key={i}>{u.file} ({u.from} → {u.to})</li>
              ))}
            </ul>
          ),
        }}
        style={{ marginTop: 20 }}
      />

      <Modal open={open} onOk={async () => { await createReport(name, type); setOpen(false); load(); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          value={type}
          onChange={setType}
          options={Object.entries(REPORT_REGISTRY).map(([k,v]) => ({ value: k, label: v.label }))}
        />
      </Modal>

      <Modal open={uploadOpen} onOk={async () => {
        await uploadFile(current, file, dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD"));
        setUploadOpen(false);
        load();
      }}>
        <Upload beforeUpload={(f) => { setFile(f); return false; }}>
          <Button>Select File</Button>
        </Upload>
        <RangePicker onChange={(d) => setDates(d || [])} />
      </Modal>
    </>
  );
}
