
import { Layout } from "antd";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import DataPage from "./pages/DataPage";
import RawDataUpload from "./pages/RawDataUpload";
import StatusCalendar from "./pages/StatusCalendar";
import ItemIssueConsolidation from "./pages/ItemIssueConsolidation";
import JsonCrud from "./pages/JsonCrud";
import { REPORT_REGISTRY } from "./reports";
import AchievedTargetReport from "./reports/AchievedTargetReport";

const { Content } = Layout;

export default function App() {
  return (
    <Layout style={{ height: "100vh" }}>
      <Sidebar />
      <Content style={{ padding: 20, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<StatusCalendar />} />
          <Route path="/reports" element={<DataPage />} />
          <Route path="/raw-data-upload" element={<RawDataUpload />} />
          <Route path="/item-issue-consolidation" element={<ItemIssueConsolidation />} />
          <Route path="/json-crud" element={<JsonCrud />} />
          <Route path="/achieved-target/:id" element={<AchievedTargetReport />} />
          {Object.entries(REPORT_REGISTRY).map(([k, r]) => {
            const C = r.component;
            return <Route key={k} path={r.route} element={<C />} />;
          })}
        </Routes>
      </Content>
    </Layout>
  );
}
