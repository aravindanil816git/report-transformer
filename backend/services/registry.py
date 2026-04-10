from services.reports.shopwise import ShopwiseReportService
from services.reports.warehouse import WarehouseReportService
from services.reports.cumulative_shopwise import CumulativeShopwiseReportService
from services.reports.cumulative_warehouse import CumulativeWarehouseMatrixService

_registry = {
    "shopwise": ShopwiseReportService(),
    "cleanup": WarehouseReportService(),
    "cumulative_shopwise": CumulativeShopwiseReportService(),
    "cumulative_warehouse": CumulativeWarehouseMatrixService(),
}

def get_service(report_type: str):
    svc = _registry.get(report_type)
    if not svc:
        raise ValueError(f"Unsupported report type: {report_type}")
    return svc

def supported_types():
    return list(_registry.keys())
