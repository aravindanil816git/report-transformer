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
        print(f"[DEBUG] daily_secondary_sales: Starting _find_grand_total. DataFrame shape: {df.shape}")
        df = df.copy()

        df = df.dropna(how="all").reset_index(drop=True)

        # 🔥 find ALL rows containing 'TOTAL' to see what we are dealing with
        total_idx = None
        total_rows_found = []
        for i, row in df.iterrows():
            row_str = row.astype(str)
            if row_str.str.contains("TOTAL", case=False).any():
                total_rows_found.append(i)
                print(f"[DEBUG] daily_secondary_sales: Found 'TOTAL' at index {i}. Raw row data: {row.tolist()}")

        if not total_rows_found:
            print("[WARN] daily_secondary_sales: 'TOTAL' row not found in document.")
            print(f"[DEBUG] daily_secondary_sales: Last 3 rows of file for inspection: {df.tail(3).values.tolist()}")
            return None

        # 🔥 Prioritize 'GRAND TOTAL' if it exists, otherwise take the LAST 'TOTAL' row found
        for i in total_rows_found:
            if df.iloc[i].astype(str).str.contains("GRAND TOTAL", case=False).any():
                total_idx = i
                print(f"[DEBUG] daily_secondary_sales: Selecting 'GRAND TOTAL' row at index {i}")
                break
        
        if total_idx is None:
            total_idx = total_rows_found[-1]
            print(f"[DEBUG] daily_secondary_sales: Selecting last 'TOTAL' row found at index {total_idx}")

        row = df.iloc[total_idx]

        # 🔥 Clean the row before numeric conversion (remove commas and extra spaces)
        cleaned_row = row.astype(str).str.replace(",", "", regex=False).str.replace(" ", "", regex=False)
        numeric = pd.to_numeric(cleaned_row, errors="coerce")

        print(f"[DEBUG] daily_secondary_sales: Cleaned row data: {cleaned_row.tolist()}")
        print(f"[DEBUG] daily_secondary_sales: Parsed numeric row: {numeric.tolist()}")
        
        values = numeric.dropna().tolist()

        # 🔥 IMPORTANT: pick only "Cases" columns
        # pattern: [cases, bottles, cases, bottles, ...]
        cases_only = values[::2]

        print(f"[DEBUG] daily_secondary_sales: ALL NUMERIC VALUES extracted: {values}")
        print(f"[DEBUG] daily_secondary_sales: CASES ONLY (every alternate value): {cases_only}")

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
            else:
                print(f"[DEBUG] daily_secondary_sales: DataFrame loaded successfully. Shape: {df.shape}")

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