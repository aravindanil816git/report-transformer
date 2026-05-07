
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
      key: "grp-uploads",
      label: "Raw Data Upload",
      children: [
        { key: "report-shopwise", label: REPORT_REGISTRY.shopwise.label },
        { key: "report-daily_warehouse", label: REPORT_REGISTRY.daily_warehouse.label },
        { key: "report-daily_warehouse_offtake", label: REPORT_REGISTRY.daily_warehouse_offtake.label },
        { key: "report-daily_secondary_sales", label: REPORT_REGISTRY.daily_secondary_sales.label },
      ],
    },
    {
      key: "grp-reports",
      label: "Reports",
      children: [
        { key: "report-dailywise_secondary_sales_cum", label: REPORT_REGISTRY.dailywise_secondary_sales_cum.label },
        { key: "report-brandwise_cum_secondary_sales", label: REPORT_REGISTRY.brandwise_cum_secondary_sales.label },
        { key: "report-cumulative_shopwise", label: REPORT_REGISTRY.cumulative_shopwise.label },
        { key: "report-combined_shopwise", label: REPORT_REGISTRY.combined_shopwise.label },
        { key: "report-month_comparative", label: REPORT_REGISTRY.month_comparative.label },
        { key: "report-monthly_stock_sales", label: REPORT_REGISTRY.monthly_stock_sales.label },
        { key: "report-daily_warehouse", label: "Physical Stock" },
      ],
    },
  ];

  const selectedKey = location.pathname === '/' ? 'status-calendar' :
    location.pathname === '/reports' && location.search ? `report-${new URLSearchParams(location.search).get('type')}` :
    '';

  return (
    <Sider width={250}>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={(e) => {
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
