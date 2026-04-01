
import { Layout } from "antd";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import DataPage from "./pages/DataPage";
import { REPORT_REGISTRY } from "./reports";

const { Content } = Layout;

export default function App() {
  return (
    <Layout style={{ height: "100vh" }}>
      <Sidebar />
      <Content style={{ padding: 20 }}>
        <Routes>
          <Route path="/" element={<DataPage />} />
          {Object.entries(REPORT_REGISTRY).map(([k, r]) => {
            const C = r.component;
            return <Route key={k} path={r.route} element={<C />} />;
          })}
        </Routes>
      </Content>
    </Layout>
  );
}
