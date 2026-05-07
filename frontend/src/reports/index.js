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

export const REPORT_REGISTRY = {
  shopwise: {
    component: ShopwiseReport,
    route: "/report/shopwise/:id",
    label: "Shop Sales Daily",
  },
  combined_shopwise: {
    component: CombinedShopwiseReport,
    route: "/report/combined_shopwise/:id",
    label: "Combined Shopwise",
  },
  daily_warehouse: {
    component: DailyWarehouseReport,
    route: "/report/daily_warehouse/:id",
    label: "Physical Stock",
  },
  daily_warehouse_offtake: {
    component: DailyWarehouseOfftakeReport,
    route: "/report/daily_warehouse_offtake/:id",
    label: "Secondary Sales - Daily",
  },
  cumulative_shopwise: {
    component: CumShopwiseReport,
    route: "/report/cumulative_shopwise/:id",
    label: "Cum. Shopwise Stock",
  },
  cumulative_warehouse: {
    component: CumulativeWarehouseReport,
    route: "/report/cumulative_warehouse/:id",
    label: "Consolidated Secondary Sales (Legacy)",
  },
  dailywise_secondary_sales_cum: {
    component: CumulativeWarehouseReport,
    route: "/report/dailywise_secondary_sales_cum/:id",
    label: "DailyWise Secondary Sales",
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
    label: "Sec. Sales Comparison",
    component: MonthlyComparitive,
    route: "/month-compare/:id",
  },
  monthly_stock_sales: {
    label: "Monthly Stock & Sales",
    component: MonthlyStockSales,
    route: "/report/monthly_stock_sales/:id",
  },
};
