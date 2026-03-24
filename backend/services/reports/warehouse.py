import pandas as pd
from .base import BaseReportService
from core.utils import clean_df, find_dynamic

class WarehouseReportService(BaseReportService):
    type_name = "cleanup"

    def _parse_cleanup_excel(self, path):
        df_raw = pd.read_excel(path, header=None)
        warehouse = None
        for i in range(6):
            row = " ".join([str(x) for x in df_raw.iloc[i].values if str(x) != "nan"]).lower()
            if "rfl" in row:
                warehouse = row.split("/")[-1].strip().upper()

        df = pd.read_excel(path, header=[4, 5])
        df.columns = [
            "_".join([str(i) for i in col if str(i) != "nan"]).lower().replace(" ", "_")
            for col in df.columns
        ]
        df = df.dropna(how="all")
        df = clean_df(df)
        df["warehouse"] = warehouse
        return df

    def upload(self, report, path, file_name, from_date, to_date):
        df = self._parse_cleanup_excel(path)
        report.setdefault("uploads", []).append({
            "file": file_name,
            "from": from_date,
            "to": to_date,
            "data": df.to_dict("records")
        })

    def _process_cleanup(self, df):
        allocated = find_dynamic(df, ["alloc"])
        pending = find_dynamic(df, ["pending"])
        instock = find_dynamic(df, ["physical"])
        cols = [c for c in [allocated, pending, instock, "warehouse"] if c]
        df = df[cols]
        rename = {}
        if allocated: rename[allocated] = "Allocated"
        if pending: rename[pending] = "Pending"
        if instock: rename[instock] = "Instock"
        return df.rename(columns=rename)

    def process(self, report):
        dfs = [pd.DataFrame(u.get("data", [])) for u in report.get("uploads", [])]
        if not dfs:
            report["processed"] = []
            return
        combined = pd.concat(dfs, ignore_index=True)
        processed = self._process_cleanup(combined)
        report["processed"] = processed.to_dict("records")

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []) or [],
            "uploads": report.get("uploads", []) or []
        }

    def get_filters(self, report):
        data = report.get("processed") or []
        if not data:
            return {"warehouses": []}
        df = pd.DataFrame(data)
        if "warehouse" not in df.columns:
            return {"warehouses": []}
        warehouses = [{"warehouse": w} for w in df["warehouse"].dropna().unique()]
        return {"warehouses": warehouses}
