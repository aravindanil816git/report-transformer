import pandas as pd
from .base import BaseReportService
from core.utils import read_excel_robust, normalize, clean_df, find_column
from core.mapping_utils import get_shop_lookup_and_warehouse_to_bond

SHOP_LOOKUP, _ = get_shop_lookup_and_warehouse_to_bond()

class DailyWarehouseOfftakeService(BaseReportService):
    type_name = "daily_warehouse_offtake"

    def upload(self, report, path, file_name, date=None, **kwargs):
        df = read_excel_robust(path)
        
        # We store the raw data for cumulative reports to use
        # But we also want to provide a view for the daily report
        report["data"] = df.to_dict("records")
        report.setdefault("uploads", []).append({
            "file": file_name,
            "from": date,
            "to": date,
            "date": date,
            "status": "uploaded"
        })

    def process(self, report):
        data = report.get("data")
        if not data:
            return

        df = pd.DataFrame(data)
        
        # 🔍 Detect columns
        shop_col = next((c for c in df.columns if "license" in c.lower() and "no" in c.lower()), None)
        if not shop_col:
            shop_col = next((c for c in df.columns if "license" in c.lower()), None)
        if not shop_col:
            shop_col = next((c for c in df.columns if "shop" in c.lower() and "code" in c.lower()), None)
            
        issue_col = next((c for c in df.columns if "issue" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "inv" in c.lower() and "qty" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "out" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "qty" in c.lower() or "quantity" in c.lower()), None)

        brand_col = next((c for c in df.columns if "brand" in c.lower() or "item" in c.lower()), None)

        print(f"[DEBUG] daily_warehouse_offtake: Detected Columns -> Shop: '{shop_col}', Issue: '{issue_col}', Brand: '{brand_col}'")

        if not shop_col or not issue_col:
            report["processed"] = []
            return

        # ✅ Clean
        df["shop_code"] = (
            df[shop_col]
            .astype(str)
            .str.replace(r"\.0+$", "", regex=True)  # Safely remove .0 at the very end
            .str.replace(r"[^\d]", "", regex=True)  # ✅ Strip everything except pure numbers (handles quotes, zero-width spaces, etc.)
        )

        # ✅ Remove rows where shop code is missing (e.g., empty excel rows or summary rows)
        df = df[df["shop_code"].notna() & (df["shop_code"] != "nan") & (df["shop_code"] != "")]

        # ✅ Clean issues column for text formatting artifacts (like commas or hidden strings)
        df["issues"] = (
            df[issue_col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.replace(r"[^\d\.\-]", "", regex=True) # Keep only digits, decimals, and negative signs
        )
        df["issues"] = pd.to_numeric(df["issues"], errors="coerce").fillna(0)
        df["brand"] = df[brand_col].astype(str).str.strip() if brand_col else "Unknown"

        # ✅ Debug specific shop code
        print(f"[DEBUG] daily_warehouse_offtake: Rows for 104012 after cleaning: {len(df[df['shop_code'] == '104012'])}")
        if len(df[df['shop_code'] == '104012']) > 0:
            print(f"[DEBUG] 104012 Issues Sum: {df[df['shop_code'] == '104012']['issues'].sum()}")

        # ✅ Map
        df["warehouse"] = df["shop_code"].apply(
            lambda x: SHOP_LOOKUP.get(x, {}).get("warehouse")
        )
        df["bond"] = df["shop_code"].apply(
            lambda x: SHOP_LOOKUP.get(x, {}).get("bond")
        )
        df["shop_name"] = df["shop_code"].apply(
            lambda x: SHOP_LOOKUP.get(x, {}).get("shop_name")
        )

        # ✅ Debug: Identify and retain unmapped shop codes
        unmapped_mask = df["warehouse"].isna()
        if unmapped_mask.any():
            print(f"[DEBUG] daily_warehouse_offtake: Found {unmapped_mask.sum()} rows with unmapped shop codes: {df[unmapped_mask]['shop_code'].unique()}")
        
        df["warehouse"] = df["warehouse"].fillna("UNMAPPED")
        df["bond"] = df["bond"].fillna("UNMAPPED")
        df["shop_name"] = df["shop_name"].fillna("Unknown Shop")

        # ✅ Aggregate by shop and brand for the daily view
        grouped = df.groupby(["bond", "warehouse", "shop_code", "shop_name", "brand"])["issues"].sum().reset_index()
        
        report["processed"] = grouped.to_dict("records")

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []),
            "config": report.get("config", {}),
            "uploads": report.get("uploads", [])
        }
