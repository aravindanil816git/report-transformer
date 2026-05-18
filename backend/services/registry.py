# -*- coding: utf-8 -*-
from services.reports.shopwise import ShopwiseReportService
from services.reports.warehouse import WarehouseReportService
from .reports.combined_shopwise import CombinedShopwiseReportService
from .reports.combined_shopwise_multi import CombinedShopwiseMultiReportService
from services.reports.cumulative_warehouse import CumulativeWarehouseMatrixService
from services.reports.daily_secondary_sales import DailySecondarySalesService
from services.reports.month_comparative import MonthComparativeService
from services.reports.monthly_stock_sales import MonthlyStockSalesService
from services.reports.daily_warehouse_offtake import DailyWarehouseOfftakeService
from services.reports.combined_shopwise import CombinedShopwiseReportService
from services.reports.cumulative_shopwise import CumulativeShopwiseReportService
from services.reports.achieved_target import AchievedTargetReportService

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
    # Use the multi-upload implementation for the original combined_shopwise type
    "combined_shopwise": CombinedShopwiseMultiReportService(),
    "combined_shopwise_multi": CombinedShopwiseMultiReportService(),
    "shop_sales_cumulative": CombinedShopwiseMultiReportService(),
    "achieved_target": AchievedTargetReportService(),
}

def get_service(report_type):
    """Retrieve a service instance by its report type.

    The type hint was removed to avoid syntax issues on older Python versions
    or files with non-ASCII characters. This function simply looks up the
    service in the registry and raises a clear error if the type is unknown.
    """
    svc = _registry.get(report_type)
    if not svc:
        raise ValueError("Unsupported report type: " + str(report_type))
    return svc

def supported_types():
    return list(_registry.keys())
