import DailyWarehouseReport from "./warehouse/DailyWarehouse";
import DailyWarehouseOfftakeReport from "./warehouse/DailyWarehouseOfftake";
import ShopwiseReport from "./shopwise/ShopwiseReport";
import CumShopwiseReport from "./shopwise/CumShopwiseReport";
import CleanupReport from "./cleanup/CleanupReport";
import DailySecondaryReport from "./comparitive/DailySecondaryReport";
import MonthlyComparitive from "./comparitive/MonthComparative";
import CumulativeWarehouseReport from "./shopwise/CumWareHouseReport";
import MonthlyStockSales from "./warehouse/MonthlyStockSale";
import CombinedShopwiseReport from "./shopwise/CombinedShopwiseReport";
import NewCumulativeReport from "./shopwise/NewCumulativeReport";
import WarehouseStock from "../pages/WarehouseStock";

export const REPORT_REGISTRY = {
  shopwise: {
    component: ShopwiseReport,
    route: "/report/shopwise/:id",
    label: "Shop sales - Daily",
  },
  shop_sales_cumulative: {
    component: ShopwiseReport,
    route: "/report/shop_sales_cumulative/:id",
    label: "Shop Sales Cumulative",
  },
  combined_shopwise: {
    component: CombinedShopwiseReport,
    route: "/report/combined_shopwise/:id",
    label: "Shop sales - Cumulative",
  },
  new_cumulative_report: {
    component: NewCumulativeReport,
    route: "/report/new_cumulative_shopwise/:id",
    label: "New Cumulative Report",
  },
  daily_warehouse: {
    component: DailyWarehouseReport,
    route: "/report/daily_warehouse/:id",
    label: "Warehouse Physical Stock",
  },
  daily_warehouse_offtake: {
    component: DailyWarehouseOfftakeReport,
    route: "/report/daily_warehouse_offtake/:id",
    label: "Secondary Sales - Daily",
  },
  cumulative_shopwise: {
    component: CumShopwiseReport,
    route: "/report/cumulative_shopwise/:id",
    label: "Shop Sales Daily",
  },
  cumulative_warehouse: {
    component: CumulativeWarehouseReport,
    route: "/report/cumulative_warehouse/:id",
    label: "Consolidated Secondary Sales (Legacy)",
  },
  dailywise_secondary_sales_cum: {
    component: CumulativeWarehouseReport,
    route: "/report/dailywise_secondary_sales_cum/:id",
    label: "Daily Secondary Sales",
  },
  brandwise_cum_secondary_sales: {
    component: CumulativeWarehouseReport,
    route: "/report/brandwise_cum_secondary_sales/:id",
    label: "Brandwise Cum Secondary Sales",
  },
  daily_secondary_sales: {
    label: "Item Issue Consolidation",
    component: DailySecondaryReport,
    route: "/daily-secondary/:id",
  },
  month_comparative: {
    label: "Item Issue Consolidation",
    component: MonthlyComparitive,
    route: "/month-compare/:id",
  },
  monthly_stock_sales: {
    label: "WH Monthly Stock & Sales",
    component: MonthlyStockSales,
    route: "/report/monthly_stock_sales/:id",
  },
  warehouse_stock: {
    label: "Warehouse Stock",
    component: WarehouseStock,
    route: "/report/warehouse_stock/:id",
  },
};
