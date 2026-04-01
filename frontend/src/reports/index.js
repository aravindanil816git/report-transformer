
import ShopwiseReport from "./shopwise/ShopwiseReport";
import CumShopwiseReport from "./shopwise/CumShopwiseReport";
import CleanupReport from "./cleanup/CleanupReport";

export const REPORT_REGISTRY = {
  shopwise: {
    component: ShopwiseReport,
    route: "/report/shopwise/:id",
    label: "Shopwise Stock",
  },
  cleanup: {
    component: CleanupReport,
    route: "/report/cleanup/:id",
    label: "Daily Warehouse Report",
  },
  cumulative_shopwise: {
    component: CumShopwiseReport,
    route: "/report/cumulative_shopwise/:id",
    label: "Cumulative Shopwise Stock",
  },
};
