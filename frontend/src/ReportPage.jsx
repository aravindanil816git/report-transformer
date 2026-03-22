
import { useEffect, useState } from "react";
import { Table, Select, Segmented, Button, Row, Col, Empty, Spin } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getShops } from "./api";

export default function ReportPage() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [shops, setShops] = useState([]);
  const [shop, setShop] = useState();
  const [view, setView] = useState("case");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    getShops(id).then((res) => setShops(res.data || []));
  }, [id]);

  const load = () => {
    if (!id) return;
    setLoading(true);

    getReport(id, shop, view)
      .then((res) => setData(res.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [view]);

  const columns =
    data.length > 0
      ? Object.keys(data[0]).map((k) => ({
          title: k.toUpperCase(),
          dataIndex: k,
          key: k,
        }))
      : [];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Select Shop"
            style={{ width: 200 }}
            onChange={setShop}
            options={shops.map((s) => ({
              value: s.shop_code,
              label: s.shop_name,
            }))}
          />
        </Col>

        <Col>
          <Segmented
            options={[
              { label: "Case", value: "case" },
              { label: "Bottle", value: "bottle" },
            ]}
            value={view}
            onChange={setView}
          />
        </Col>

        <Col>
          <Button type="primary" onClick={load}>
            Apply
          </Button>
        </Col>
      </Row>

      {loading ? (
        <Spin />
      ) : data.length === 0 ? (
        <Empty description="No data" />
      ) : (
        <Table columns={columns} dataSource={data} rowKey={(r, i) => i} />
      )}
    </div>
  );
}
