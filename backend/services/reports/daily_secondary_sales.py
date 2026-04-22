import pandas as pd
from .base import BaseReportService


class DailySecondarySalesService(BaseReportService):
    type_name = "daily_secondary_sales"

    def upload(self, report, path, file_name, date=None, **kwargs):
        # handled in routes.py (no-op here)
        pass


    # ================= GRAND TOTAL EXTRACTION =================
    def _find_grand_total(self, df):
        df = df.copy()

        df = df.dropna(how="all").reset_index(drop=True)

        # 🔥 find TOTAL row
        total_idx = None
        for i, row in df.iterrows():
            if row.astype(str).str.contains("TOTAL", case=False).any():
                total_idx = i

        if total_idx is None:
            return None

        row = df.iloc[total_idx]

        # 🔥 convert to numeric
        numeric = pd.to_numeric(row, errors="coerce")

        values = numeric.dropna().tolist()

        # 🔥 IMPORTANT: pick only "Cases" columns
        # pattern: [cases, bottles, cases, bottles, ...]
        cases_only = values[::2]

        print("ALL VALUES:", values)
        print("CASES ONLY:", cases_only)

        # 🔥 now map correctly (based on your sheet)
        # order is: FTN, STN, GTN, INTER, CFED, OTHER, TOTAL
        # we need: STN, GTN, TOTAL, CFED, OTHER

        if len(cases_only) < 7:
            return None

        return {
            "STN": round(cases_only[1]),
            "GTN": round(cases_only[2]),
            "TOTAL": round(cases_only[6]),
            "CFED": round(cases_only[4]),
            "BAR": round(cases_only[5]),
        }
   # ================= PROCESS =================
    def process(self, report):
        final = []

        # ✅ FIX: date comes from config, not upload
        report_date = report.get("config", {}).get("date")

        for u in report.get("uploads", []):
            if u.get("status") != "uploaded":
                continue

            df = pd.DataFrame(u.get("data", []))

            if df.empty:
                continue

            warehouse = u.get("warehouse")

            totals = self._find_grand_total(df)

            if not totals:
                continue

            final.append({
                "warehouse": warehouse,
                "date": report_date,
                "STN": round(totals["STN"]),
                "GTN": round(totals["GTN"]),
                "TOTAL": round(totals["TOTAL"]),
                "CFED": round(totals["CFED"]),
                "BAR": round(totals["BAR"]),
            })

        report["processed"] = final


    # ================= GET REPORT =================
    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", [])
        }