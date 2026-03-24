from services.reports.shopwise import ShopwiseReportService
from services.reports.warehouse import WarehouseReportService

_registry = {
    "shopwise": ShopwiseReportService(),
    "cleanup": WarehouseReportService(),
}

def get_service(report_type: str):
    svc = _registry.get(report_type)
    if not svc:
        raise ValueError(f"Unsupported report type: {report_type}")
    return svc

def supported_types():
    return list(_registry.keys())
