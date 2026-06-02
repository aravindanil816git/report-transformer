import pandas as pd
import os
from .base import BaseReportService
from core.utils import read_excel_robust

# Report Item Issue consolidation

class DailySecondarySalesService(BaseReportService):
    type_name = "daily_secondary_sales"

    def upload(self, report, path, file_name, date=None, **kwargs):
        # handled in routes.py (no-op here)
        pass


    # ================= GRAND TOTAL EXTRACTION =================
    def _find_grand_total(self, df):
        print("[DEBUG] daily_secondary_sales: Starting _find_grand_total")
        df = df.copy()

        df = df.dropna(how="all").reset_index(drop=True)

        # 🔥 find TOTAL row
        total_idx = None
        for i, row in df.iterrows():
            if row.astype(str).str.contains("TOTAL", case=False).any():
                total_idx = i
                print(f"[DEBUG] daily_secondary_sales: Found 'TOTAL' row at index {i}")
                break

        if total_idx is None:
            print("[WARN] daily_secondary_sales: 'TOTAL' row not found in document.")
            return None

        row = df.iloc[total_idx]

        # 🔥 convert to numeric
        numeric = pd.to_numeric(row, errors="coerce")

        values = numeric.dropna().tolist()

        # 🔥 IMPORTANT: pick only "Cases" columns
        # pattern: [cases, bottles, cases, bottles, ...]
        cases_only = values[::2]

        print(f"[DEBUG] daily_secondary_sales: ALL NUMERIC VALUES: {values}")
        print(f"[DEBUG] daily_secondary_sales: CASES ONLY: {cases_only}")

        # 🔥 now map correctly (based on your sheet)
        # order is: FTN, STN, GTN, INTER, CFED, OTHER, TOTAL
        # we need: STN, GTN, TOTAL, CFED, OTHER

        if len(cases_only) < 7:
            print(f"[WARN] daily_secondary_sales: Not enough case columns found (found {len(cases_only)}, expected at least 7)")
            return None

        print("[DEBUG] daily_secondary_sales: Extracting metrics based on column positions...")

        result = {
            "STN": round(cases_only[1], 2),
            "GTN": round(cases_only[2], 2),
            "TOTAL": round(cases_only[1] + cases_only[2], 2),
            "CFED": round(cases_only[4], 2),
            "BAR": round(cases_only[5], 2),
        }
        print(f"[DEBUG] daily_secondary_sales: Successfully extracted totals: {result}")
        return result

   # ================= PROCESS =================
    def process(self, report):
        print(f"[INFO] daily_secondary_sales: Starting process for report ID {report.get('id')}")
        final = []

        # ✅ FIX: date comes from config, not upload
        report_date = report.get("config", {}).get("date")

        for u in report.get("uploads", []):
            if u.get("status") != "uploaded":
                continue

            warehouse = u.get("warehouse")
            print(f"[INFO] daily_secondary_sales: Processing upload for warehouse '{warehouse}'")

            # 🔥 Implement path approach fallback
            data = u.get("data")
            df = None
            if data and len(data) > 0:
                df = pd.DataFrame(data)
            else:
                path = u.get("path")
                if path and os.path.exists(path):
                    print(f"[INFO] daily_secondary_sales: Loading raw data directly from path: {path}")
                    df = read_excel_robust(path)
                else:
                    print(f"[WARN] daily_secondary_sales: No data or valid path found for warehouse '{warehouse}'")
                    continue

            if df is None or df.empty:
                print(f"[WARN] daily_secondary_sales: DataFrame is empty for warehouse '{warehouse}'. Skipping.")
                continue

            totals = self._find_grand_total(df)

            if not totals:
                print(f"[WARN] daily_secondary_sales: Could not extract grand totals for warehouse '{warehouse}'.")
                continue

            final.append({
                "warehouse": warehouse,
                "date": report_date,
                "STN": round(totals["STN"], 2),
                "GTN": round(totals["GTN"], 2),
                "TOTAL": round(totals["TOTAL"], 2),
                "CFED": round(totals["CFED"], 2),
                "BAR": round(totals["BAR"], 2),
            })

        print(f"[INFO] daily_secondary_sales: Finished processing. Successfully mapped {len(final)} warehouse records.")
        report["processed"] = final


    # ================= GET REPORT =================
    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []) or [],
            "uploads": report.get("uploads", []),
            "config": report.get("config", {})
        }