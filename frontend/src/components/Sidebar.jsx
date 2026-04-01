
import { Layout, Menu } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import { REPORT_REGISTRY } from "../reports";

const { Sider } = Layout;

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const reportItems = Object.entries(REPORT_REGISTRY).map(([key, r]) => ({
    key: `report-${key}`,
    label: r.label,
  }));

  const items = [
    {
      key: "data",
      label: "Data Centre",
      children: [
        { key: "data-home", label: "All Reports" },
        ...reportItems,
      ],
    },
  ];

  return (
    <Sider>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={items}
        onClick={(e) => {
          if (e.key === "data-home") navigate("/");
          if (e.key.startsWith("report-")) {
            const type = e.key.replace("report-", "");
            navigate(`/?type=${type}`);
          }
        }}
      />
    </Sider>
  );
}
