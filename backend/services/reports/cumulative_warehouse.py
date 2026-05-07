import pandas as pd
import json
from datetime import datetime, timedelta
from .base import BaseReportService
from core.utils import read_excel_robust


# ✅ LOAD MAPPING
with open("mapping.json") as f:
    MAPPING = json.load(f)

# ✅ FLATTEN LOOKUP
SHOP_LOOKUP = {}
WAREHOUSE_TO_BOND = {}

for bond, b_data in MAPPING["bonds"].items():
    for wh, w_data in b_data["warehouses"].items():
        WAREHOUSE_TO_BOND[wh] = bond

        for shop_code, s_data in w_data["shops"].items():
            SHOP_LOOKUP[shop_code] = {
                "warehouse": wh,
                "bond": bond,
                "shop_name": s_data["shop_name"],
                "staffs": s_data["staffs"]
            }

class CumulativeWarehouseMatrixService(BaseReportService):
    type_name = "cumulative_warehouse"

    def _generate_labels(self, start_date, num_days):
        start = datetime.strptime(start_date, "%Y-%m-%d")
        return [
            (start + timedelta(days=i)).strftime("%d-%b (%a)")
            for i in range(num_days)
        ]

    def upload(self, report, path, file_name, date=None, **kwargs):
        df = read_excel_robust(path)

        for u in report.get("uploads", []):
            if u["date"] == date:
                u["file"] = file_name
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                break

    def _compute(self, df):
        # 🔍 Detect shop code column (Licensee No.)
        shop_col = next((c for c in df.columns if "license" in c.lower() and "no" in c.lower()), None)
        if not shop_col:
            shop_col = next((c for c in df.columns if "license" in c.lower()), None)
            
        # 🔍 Detect issues/quantity column
        issue_col = next((c for c in df.columns if "issue" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "inv" in c.lower() and "qty" in c.lower()), None)
        if not issue_col:
            # Fallback to any column with "qty" or "quantity"
            issue_col = next((c for c in df.columns if "qty" in c.lower() or "quantity" in c.lower()), None)

        brand_col = next((c for c in df.columns if "brand" in c.lower() or "item" in c.lower()), None)

        if not shop_col or not issue_col:
            print(f"DEBUG: Could not find columns. Shop: {shop_col}, Issue: {issue_col}")
            return pd.DataFrame()

        # ✅ clean shop code
        df["shop_code"] = (
            df[shop_col]
            .astype(str)
            .str.replace(".0", "", regex=False)
            .str.replace(r"\s+", "", regex=True)
            .str.strip()
        )

        # ✅ clean issues
        df["issues"] = pd.to_numeric(df[issue_col], errors="coerce").fillna(0)
        df["brand"] = df[brand_col].astype(str).str.strip() if brand_col else "Unknown"

        # ✅ map warehouse
        df["warehouse"] = df["shop_code"].apply(
            lambda x: SHOP_LOOKUP.get(x, {}).get("warehouse")
        )
        df["shop_name"] = df["shop_code"].apply(
            lambda x: SHOP_LOOKUP.get(x, {}).get("shop_name")
        )

        # ✅ keep only mapped
        df = df[df["warehouse"].notna()]

        return df[["warehouse", "shop_code", "shop_name", "brand", "issues"]]

    def process(self, report):
        uploads = report.get("uploads", [])
        config = report.get("config", {})

        start_date = config.get("start_date")
        num_days = int(config.get("num_days", 1))

        if not start_date:
            report["processed"] = {}
            return

        labels = self._generate_labels(start_date, num_days)

        # 🔍 Link with Daily Warehouse Offtake data if missing
        from services.store import reports as all_reports
        
        # Build date to data map for daily warehouse offtake
        daily_offtake_map = {}
        for r in all_reports.values():
            if r.get("type") == "daily_warehouse_offtake" and r.get("status") in ["Processed", "Ready", "Uploaded"]:
                rd = r.get("config", {}).get("date")
                if rd and r.get("data"):
                    daily_offtake_map[rd] = r.get("data")

        final_map = {}
        shop_map = {} # For drilling

        for idx, u in enumerate(uploads):
            dt = u.get("date")
            data = u.get("data")
            
            # Auto-link if data is missing but available in daily reports
            if not data and dt in daily_offtake_map:
                data = daily_offtake_map[dt]
                u["status"] = "uploaded"
                u["file"] = "Auto-linked from Daily Warehouse Offtake"
                u["data"] = data

            if not data:
                continue

            df = pd.DataFrame(data)
            if df.empty:
                continue

            df_calc = self._compute(df)
            if df_calc.empty:
                continue

            label = labels[idx]

            # 1. Warehouse level
            wh_grouped = df_calc.groupby("warehouse")["issues"].sum().reset_index()
            for _, row in wh_grouped.iterrows():
                wh = row["warehouse"]
                val = round(row["issues"])
                if wh not in final_map:
                    final_map[wh] = {"warehouse": wh}
                final_map[wh][label] = val

            # 2. Shop level (for drilling & shop mode)
            shop_grouped = df_calc.groupby(["warehouse", "shop_code", "shop_name"])["issues"].sum().reset_index()
            for _, row in shop_grouped.iterrows():
                wh = row["warehouse"]
                sc = row["shop_code"]
                sn = row["shop_name"]
                val = round(row["issues"])
                
                key = (wh, sc, sn)
                if key not in shop_map:
                    shop_map[key] = {"warehouse": wh, "shop_code": sc, "shop_name": sn}
                shop_map[key][label] = val

            # 3. Brand level (at warehouse and shop level)
            brand_grouped = df_calc.groupby(["warehouse", "shop_code", "shop_name", "brand"])["issues"].sum().reset_index()
            for _, row in brand_grouped.iterrows():
                wh = row["warehouse"]
                sc = row["shop_code"]
                sn = row["shop_name"]
                brand = row["brand"]
                val = round(row["issues"])
                
                # Warehouse level brand aggregation
                if wh not in final_map:
                    final_map[wh] = {"warehouse": wh}
                
                brand_key = f"BRAND_{brand}"
                if brand_key not in final_map[wh]:
                    final_map[wh][brand_key] = {}
                final_map[wh][brand_key][label] = final_map[wh][brand_key].get(label, 0) + val

                # Shop level brand aggregation
                key = (wh, sc, sn)
                if key not in shop_map:
                    shop_map[key] = {"warehouse": wh, "shop_code": sc, "shop_name": sn}
                
                if brand_key not in shop_map[key]:
                    shop_map[key][brand_key] = {}
                shop_map[key][brand_key][label] = shop_map[key][brand_key].get(label, 0) + val

        # ✅ fill missing labels
        for wh in final_map:
            for label in labels:
                if label not in final_map[wh]:
                    final_map[wh][label] = 0
                
                # Also for brands
                for k in list(final_map[wh].keys()):
                    if k.startswith("BRAND_"):
                        if label not in final_map[wh][k]:
                            final_map[wh][k][label] = 0

        for key in shop_map:
            for label in labels:
                if label not in shop_map[key]:
                    shop_map[key][label] = 0
                
                # Also for brands
                for k in list(shop_map[key].keys()):
                    if k.startswith("BRAND_"):
                        if label not in shop_map[key][k]:
                            shop_map[key][k][label] = 0

        report["processed"] = {
            "daywise": list(final_map.values()),
            "shopwise": [v for v in shop_map.values()],
            "labels": labels
        }

    def get_report(
        self,
        report,
        shop_code=None,
        view="daywise",
        start_idx=None,
        end_idx=None,
        mode="warehouse",
        warehouse=None,
        **kwargs
    ):
        processed = report.get("processed") or {}
        labels = processed.get("labels", [])
        
        # If warehouse is provided, we filter shopwise data
        # Or if mode is shop, we return all shopwise data
        if (warehouse and view == "shopwise") or mode == "shop":
            data = processed.get("shopwise", [])
            if warehouse:
                data = [r for r in data if r["warehouse"] == warehouse]
        else:
            data = processed.get("daywise", [])

        if (
            start_idx is not None and end_idx is not None and
            0 <= start_idx < len(labels) and
            0 <= end_idx < len(labels) and
            start_idx <= end_idx
        ):
            idxs = list(range(start_idx, end_idx + 1))
            selected_labels = [labels[i] for i in idxs]
        else:
            idxs = list(range(len(labels)))
            selected_labels = labels

        result = []

        for row in data:
            wh = row.get("warehouse")
            sc = row.get("shop_code")
            sn = row.get("shop_name")
            
            bond = WAREHOUSE_TO_BOND.get(wh, "UNKNOWN")
            new_row = {"warehouse": wh, "bond": bond}
            if sc: new_row["shop_code"] = sc
            if sn: new_row["shop_name"] = sn

            total = 0
            for i in idxs:
                l = labels[i]
                val = row.get(l, 0)
                new_row[l] = val
                total += val

            new_row["total"] = total
            
            # Brands only for warehouse/shop mode and daywise/cumulative
            if mode != "bond":
                for k, v in row.items():
                    if k.startswith("BRAND_"):
                        brand_total = sum(v.get(labels[i], 0) for i in idxs)
                        new_row[k] = brand_total

            result.append(new_row)

        # 🔥 BOND MODE
        if mode == "bond" and not warehouse:
            bond_map = {}

            for row in result:
                bond = row.get("bond", "UNKNOWN")

                if bond not in bond_map:
                    bond_map[bond] = {"warehouse": bond, "bond": bond}
                    for k in row:
                        if k not in ["warehouse", "bond", "shop_code", "shop_name"] and not k.startswith("BRAND_"):
                            bond_map[bond][k] = 0

                for k, v in row.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"] and not k.startswith("BRAND_"):
                        bond_map[bond][k] += v

            result = list(bond_map.values())

        # cumulative
        if view == "cumulative":
            final_res = []
            for r in result:
                item = {
                    "warehouse": r["warehouse"],
                    "bond": r.get("bond"),
                    "total": r["total"],
                }
                if "shop_code" in r: item["shop_code"] = r["shop_code"]
                if "shop_name" in r: item["shop_name"] = r["shop_name"]
                
                # Add brands
                for k, v in r.items():
                    if k.startswith("BRAND_"):
                        item[k] = v
                
                final_res.append(item)
            
            return {
                "data": final_res,
                "labels": selected_labels,
                "config": {**report.get("config", {}), "type": report.get("type")}
            }

        return {
            "data": result,
            "labels": selected_labels,
            "config": {**report.get("config", {}), "type": report.get("type")}
        }