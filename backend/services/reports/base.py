class BaseReportService:
    type_name = None

    def upload(self, report, path, file_name, from_date, to_date):
        raise NotImplementedError

    def process(self, report):
        raise NotImplementedError

    def get_report(self, report, **kwargs):
        raise NotImplementedError

    def get_filters(self, report):
        return {}
