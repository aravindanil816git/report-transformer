
import { useEffect, useState } from "react";
import { Table, Select, Segmented, Row, Col, Button } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getShops } from "../../api";

export default function ShopwiseReport() {
  const { id } = useParams();
  const [data, setData] = useState([]);
  const [shops, setShops] = useState([]);
  const [shop, setShop] = useState();
  const [view, setView] = useState("case");

  useEffect(() => {
    getShops(id).then(r => setShops(r.data || []));
  }, [id]);

  const load = () => {
    getReport(id, shop, view).then(res => setData(res.data.data || []));
  };

  useEffect(() => { load(); }, []);

  const columns = data[0] ? Object.keys(data[0]).map(k => ({ title: k, dataIndex: k })) : [];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Shop"
            style={{ width: 200 }}
            onChange={setShop}
            options={shops.map(s => ({ value: s.shop_code, label: s.shop_name }))}
          />
        </Col>
        <Col>
          <Segmented
            options={[{ label: "Case", value: "case" }, { label: "Bottle", value: "bottle" }]}
            value={view}
            onChange={setView}
          />
        </Col>
        <Col>
          <Button onClick={load}>Apply</Button>
        </Col>
      </Row>
      <Table dataSource={data} columns={columns} rowKey={(r,i)=>i} />
    </>
  );
}
