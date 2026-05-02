import pandas as pd
import json
from .base import BaseReportService
from core.utils import read_excel_robust, normalize, clean_df, find_column

# ✅ LOAD MAPPING
with open("mapping.json") as f:
    MAPPING = json.load(f)

# ✅ FLATTEN LOOKUP
SHOP_LOOKUP = {}
for bond, b_data in MAPPING["bonds"].items():
    for wh, w_data in b_data["warehouses"].items():
        for shop_code, s_data in w_data["shops"].items():
            SHOP_LOOKUP[shop_code] = {
                "warehouse": wh,
                "bond": bond,
                "shop_name": s_data["shop_name"]
            }

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
            
        issue_col = next((c for c in df.columns if "issue" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "inv" in c.lower() and "qty" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "qty" in c.lower() or "quantity" in c.lower()), None)

        brand_col = next((c for c in df.columns if "brand" in c.lower() or "item" in c.lower()), None)

        if not shop_col or not issue_col:
            report["processed"] = []
            return

        # ✅ Clean
        df["shop_code"] = (
            df[shop_col]
            .astype(str)
            .str.replace(".0", "", regex=False)
            .str.replace(r"\s+", "", regex=True)
            .str.strip()
        )
        df["issues"] = pd.to_numeric(df[issue_col], errors="coerce").fillna(0)
        df["brand"] = df[brand_col].astype(str).str.strip() if brand_col else "Unknown"

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

        # ✅ Filter out unmapped
        df = df[df["warehouse"].notna()]

        # ✅ Aggregate by shop and brand for the daily view
        grouped = df.groupby(["bond", "warehouse", "shop_code", "shop_name", "brand"])["issues"].sum().reset_index()
        
        report["processed"] = grouped.to_dict("records")

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []),
            "config": report.get("config", {}),
            "uploads": report.get("uploads", [])
        }
