
import { Layout, Menu } from "antd";
import { Routes, Route, useNavigate } from "react-router-dom";
import DataPage from "./DataPage";
import ReportPage from "./ReportPage";

const { Sider, Content } = Layout;

export default function App() {
  const navigate = useNavigate();

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider>
        <Menu
          theme="dark"
          defaultSelectedKeys={["data"]}
          items={[
            { key: "data", label: "Data" },
          ]}
          onClick={(e) => {
            if (e.key === "data") navigate("/");
          }}
        />
      </Sider>

      <Content style={{ padding: 20 }}>
        <Routes>
          <Route path="/" element={<DataPage />} />
          <Route path="/report/:id" element={<ReportPage />} />
        </Routes>
      </Content>
    </Layout>
  );
}
