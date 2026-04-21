
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
      label: "Reports",
      type: 'group',
      children: [
        { key: "report-month_comparative", label: REPORT_REGISTRY.month_comparative.label },
        { key: "report-monthly_stock_sales", label: REPORT_REGISTRY.monthly_stock_sales.label },
      ],
    },
  ];

  return (
    <Sider width={250}>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.search ? `report-${new URLSearchParams(location.search).get('type')}` : 'data-home']}
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
