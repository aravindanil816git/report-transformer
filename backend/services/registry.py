from services.reports.shopwise import ShopwiseReportService
from services.reports.warehouse import WarehouseReportService
from services.reports.cumulative_shopwise import CumulativeShopwiseReportService
from services.reports.cumulative_warehouse import CumulativeWarehouseMatrixService
from services.reports.daily_secondary_sales import DailySecondarySalesService
from services.reports.month_comparative import MonthComparativeService
from services.reports.monthly_stock_sales import MonthlyStockSalesService
from services.reports.daily_warehouse_offtake import DailyWarehouseOfftakeService
from services.reports.combined_shopwise import CombinedShopwiseReportService

_registry = {
    "shopwise": ShopwiseReportService(),
    "daily_warehouse": WarehouseReportService(),
    "cumulative_shopwise": CumulativeShopwiseReportService(),
    "cumulative_warehouse": CumulativeWarehouseMatrixService(),
    "dailywise_secondary_sales_cum": CumulativeWarehouseMatrixService(),
    "brandwise_cum_secondary_sales": CumulativeWarehouseMatrixService(),
    "daily_secondary_sales": DailySecondarySalesService(),
    "month_comparative": MonthComparativeService(),
    "monthly_stock_sales": MonthlyStockSalesService(),
    "daily_warehouse_offtake": DailyWarehouseOfftakeService(),
    "combined_shopwise": CombinedShopwiseReportService(),
}

def get_service(report_type: str):
    svc = _registry.get(report_type)
    if not svc:
        raise ValueError(f"Unsupported report type: {report_type}")
    return svc

def supported_types():
    return list(_registry.keys())
