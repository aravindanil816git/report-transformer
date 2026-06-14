from .base import BaseReportService

class PiVarianceRawService(BaseReportService):
    type_name = "pi_variance_raw"

    def process(self, report):
        # Placeholder for future processing logic
        pass

    def get_report(self, report, **kwargs):
        return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}