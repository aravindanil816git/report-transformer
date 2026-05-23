
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
      key: "raw-data-upload",
      label: "Raw Data Upload",
    },
    {
      key: "grp-reports",
      label: "Reports",
      children: [
        { key: "report-daily_warehouse", label: REPORT_REGISTRY.daily_warehouse.label },
        {
          key: "parent-shopSales-Daily",
          label: "Shop Sales",
          children: [
            { key: "report-cumulative_shopwise", label: REPORT_REGISTRY.cumulative_shopwise.label },
            { key: "report-new_cumulative_report", label: "Shop Sales Comparitive" },
          ],
        },
        { key: "report-combined_shopwise", label: REPORT_REGISTRY.combined_shopwise.label },
        { key: "item-issue-consolidation", label: "Item Issue Consolidation" },
                {
          key: "parent-secSales-Daily",
          label: "Secondary Sales",
          children: [
        { key: "report-dailywise_secondary_sales_cum", label: REPORT_REGISTRY.dailywise_secondary_sales_cum.label },
        { key: "report-brandwise_cum_secondary_sales", label: REPORT_REGISTRY.brandwise_cum_secondary_sales.label },
          ],
        },
        { key: "report-monthly_stock_sales", label: REPORT_REGISTRY.monthly_stock_sales.label },
        { key: "report-achieved_target", label: REPORT_REGISTRY.achieved_target?.label || "Achieved / Target" },
      ],
    },
    {
      key: "settings",
      label: "Settings"
    }
  ];

  const selectedKey = location.pathname === '/' ? 'status-calendar' :
    location.pathname === '/raw-data-upload' ? 'raw-data-upload' :
    location.pathname === '/item-issue-consolidation' ? 'item-issue-consolidation' :
    location.pathname === '/reports' && location.search ? `report-${new URLSearchParams(location.search).get('type')}` :
    location.pathname === '/reports' ? 'grp-reports' :
    '';

  return (
    <Sider width={270}>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={items}
        onClick={(e) => {
          if (e.key === "status-calendar") navigate("/");
          if (e.key === "raw-data-upload") navigate("/raw-data-upload");
          if (e.key === "item-issue-consolidation") navigate("/item-issue-consolidation");
           if (e.key.startsWith("report-")) {
             const type = e.key.replace("report-", "");
             navigate(`/reports?type=${type}`);
           }
           if (e.key === "settings") {
             navigate("/json-crud");
           }
        }}
      />
    </Sider>
  );
}
