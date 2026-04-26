
import { Layout, Menu } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import { REPORT_REGISTRY } from "../reports";

const { Sider } = Layout;

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    {
      key: "status-calendar",
      label: "Status Calendar",
    },
    {
      key: "data-home",
      label: "All Reports",
    },
    {
      key: "grp-daily",
      label: "Daily Uploads",
      type: 'group',
      children: [
        { key: "report-shopwise", label: REPORT_REGISTRY.shopwise.label },
        { key: "report-daily_warehouse", label: REPORT_REGISTRY.daily_warehouse.label },
        { key: "report-daily_warehouse_offtake", label: REPORT_REGISTRY.daily_warehouse_offtake.label },
        { key: "report-daily_secondary_sales", label: REPORT_REGISTRY.daily_secondary_sales.label },
      ],
    },
    {
      key: "grp-cumulative",
      label: "Cumulative Uploads",
      type: 'group',
      children: [
        { key: "report-cumulative_warehouse", label: REPORT_REGISTRY.cumulative_warehouse.label },
        { key: "report-cumulative_shopwise", label: REPORT_REGISTRY.cumulative_shopwise.label },
      ],
    },
    {
      key: "grp-reports",
      label: "Monthly Reports",
      type: 'group',
      children: [
        { key: "report-month_comparative", label: REPORT_REGISTRY.month_comparative.label },
        { key: "report-monthly_stock_sales", label: REPORT_REGISTRY.monthly_stock_sales.label },
      ],
    },
  ];

  const selectedKey = location.pathname === '/' ? 'status-calendar' :
    location.pathname === '/reports' ? (location.search ? `report-${new URLSearchParams(location.search).get('type')}` : 'data-home') :
    '';

  return (
    <Sider width={250}>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={(e) => {
          if (e.key === "data-home") navigate("/reports");
          if (e.key === "status-calendar") navigate("/");
          if (e.key.startsWith("report-")) {
            const type = e.key.replace("report-", "");
            navigate(`/reports?type=${type}`);
          }
        }}
      />
    </Sider>
  );
}
