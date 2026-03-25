import { useEffect, useState, useMemo } from "react";
import { Table, Select } from "antd";
import { useParams } from "react-router-dom";

export default function CleanupReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [wh, setWh] = useState();

  // ===== LOAD FILTERS =====
  useEffect(() => {
    fetch(`http://localhost:8000/warehouses/${id}`)
      .then((r) => r.json())
      .then(setWarehouses);
  }, [id]);

  // ===== LOAD DATA =====
  useEffect(() => {
    fetch(`http://localhost:8000/report/${id}`)
      .then((r) => r.json())
      .then((r) => setData(r.data || []));
  }, [id]);

  // ===== FILTERED DATA =====
  const filtered = useMemo(() => {
    return wh ? data.filter((d) => d.warehouse === wh) : data;
  }, [data, wh]);

  // ===== COLUMNS =====
  const columns = [
    {
      title: "Physical Stock",
      children: [
        { title: "Case", dataIndex: "Physical Case" },
        { title: "Bottle", dataIndex: "Physical Bottle" },
      ],
    },
    {
      title: "Allotted Stock",
      children: [
        { title: "Case", dataIndex: "Allotted Case" },
        { title: "Bottle", dataIndex: "Allotted Bottle" },
      ],
    },
    {
      title: "Pending Stock",
      children: [
        { title: "Case", dataIndex: "Pending Case" },
        { title: "Bottle", dataIndex: "Pending Bottle" },
      ],
    },
    {
      title: "WH Price",
      dataIndex: "WH Price",
    },
    {
      title: "Landed Cost",
      dataIndex: "Landed Cost",
    },
  ];

  // ===== TOTAL KEYS (avoid double count) =====
  const KEYS = [
    "Physical Case",
    "Physical Bottle",
    "Allotted Case",
    "Allotted Bottle",
    "Pending Case",
    "Pending Bottle",
    "WH Price",
    "Landed Cost",
  ];

  // ===== TOTAL CALCULATION =====
  const totals = useMemo(() => {
    const t = {};
    KEYS.forEach((k) => (t[k] = 0));

    filtered.forEach((row) => {
      KEYS.forEach((key) => {
        t[key] += Number(row[key]) || 0;
      });
    });
    console.log(t)

    return t;
  }, [filtered]);

  // ===== DROPDOWN OPTIONS =====
  const options = [
    { label: "All", value: "" },
    ...warehouses.map((w) => ({
      value: w.warehouse,
      label: w.warehouse,
    })),
  ];

  return (
    <>
      {/* ===== FILTER ===== */}
      <Select
        placeholder="Warehouse"
        style={{ width: 220, marginBottom: 16 }}
        onChange={(v) => setWh(v || undefined)}
        options={options}
      />

      {/* ===== TABLE ===== */}
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(r, i) => i}
        pagination={false}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <b>Total</b>
            </Table.Summary.Cell>

            {KEYS.map((key, i) => (
              <Table.Summary.Cell key={i}>
                <b>{totals[key]?.toLocaleString()}</b>
              </Table.Summary.Cell>
            ))}
          </Table.Summary.Row>
        )}
      />
    </>
  );
}