import pandas as pd
import os
from datetime import datetime, timedelta
from .base import BaseReportService
from core.utils import read_excel_robust
from core.mapping_utils import get_shop_lookup_and_warehouse_to_bond




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
            
        # 🔍 Detect issues/quantity column in cases
        issue_col = next((c for c in df.columns if "issue" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "inv" in c.lower() and "qty" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            issue_col = next((c for c in df.columns if "qty" in c.lower() and "case" in c.lower()), None)
        if not issue_col:
            # Fallback to any column with "qty" or "quantity"
            issue_col = next((c for c in df.columns if "qty" in c.lower() or "quantity" in c.lower()), None)

        # 🔍 Detect issues/quantity column in bottles
        bottle_col = next((c for c in df.columns if "issue" in c.lower() and "bottle" in c.lower()), None)
        if not bottle_col:
            bottle_col = next((c for c in df.columns if "inv" in c.lower() and "qty" in c.lower() and "bottle" in c.lower()), None)
        if not bottle_col:
            bottle_col = next((c for c in df.columns if "qty" in c.lower() and "bottle" in c.lower()), None)
        if not bottle_col:
            bottle_col = next((c for c in df.columns if "bottle" in c.lower()), None)

        # 🔍 Detect PACK column
        pack_col = next((c for c in df.columns if "pack" in c.lower() or "size" in c.lower()), None)

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

        # ✅ clean issues (cases + rounded bottles based on pack size)
        cases = pd.to_numeric(df[issue_col], errors="coerce").fillna(0)
        if bottle_col and pack_col:
            bottles = pd.to_numeric(df[bottle_col], errors="coerce").fillna(0)
            
            def get_bpc(pack_val):
                if pd.isna(pack_val):
                    return 1
                val_str = str(pack_val).upper()
                if "180" in val_str:
                    return 48
                elif "375" in val_str:
                    return 24
                elif "500" in val_str:
                    return 18
                elif "750" in val_str:
                    return 12
                elif "1000" in val_str or "1 LTR" in val_str or "1LTR" in val_str:
                    return 9
                return 1

            bpcs = df[pack_col].apply(get_bpc)
            df["issues"] = cases + (bottles / bpcs).round()
        else:
            df["issues"] = cases

        df["brand"] = df[brand_col].astype(str).str.strip() if brand_col else "Unknown"

        # ✅ map warehouse
        wh_col = next((c for c in df.columns if ("warehouse" in c.lower() or "wh" in c.lower()) and "name" in c.lower()), None)
        if not wh_col:
            wh_col = next((c for c in df.columns if ("warehouse" in c.lower() or "wh" == c.lower()) and "code" not in c.lower()), None)
        if not wh_col:
            wh_col = next((c for c in df.columns if "warehouse" in c.lower() or "wh" == c.lower()), None)
            
        shop_lookup, _ = get_shop_lookup_and_warehouse_to_bond()
        if wh_col:
            df["warehouse"] = df[wh_col].astype(str).str.strip()
        else:
            df["warehouse"] = df["shop_code"].apply(
                lambda x: shop_lookup.get(x, {}).get("warehouse")
            )
        
        shop_name_col = next((c for c in df.columns if "license" in c.lower() and "name" in c.lower()), None)
        if shop_name_col:
            df["shop_name"] = df[shop_name_col].astype(str).str.strip()
        else:
            df["shop_name"] = df["shop_code"].apply(
                lambda x: shop_lookup.get(x, {}).get("shop_name")
            )

        # Fill missing values to show unmapped shops
        df["warehouse"] = df["warehouse"].fillna("UNMAPPED")
        df["shop_name"] = df["shop_name"].fillna("Unknown Shop")

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

        # 🔍 Link with daily source data if missing from a primary sync
        from services.store import reports as all_reports
        
        reports_list = list(all_reports.values())
        source_type = "daily_warehouse_offtake"
        
        # Check if we actually have source reports loaded in memory, otherwise fetch from DB
        has_source = any(r.get("type") == source_type and r.get("data") for r in reports_list)
        if not has_source:
            from services.db import supabase
            res = supabase.table("reports").select("id, type, status, config, data").eq("type", source_type).execute()
            if res.data:
                reports_list.extend(res.data)

        # Build date-to-data map from the appropriate source
        source_data_map = {}
        for r in reports_list:
            if r.get("type") == source_type and r.get("status") in ["Processed", "Ready", "Uploaded"]:
                rd = r.get("config", {}).get("date")
                if rd and r.get("data"):
                    source_data_map[rd] = r.get("data")

        final_map = {}
        shop_map = {} # For drilling

        uploads_by_date = {u.get("date"): u for u in uploads if u.get("date")}
        
        from datetime import datetime, timedelta
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            return

        for i in range(num_days):
            current_date_dt = start_dt + timedelta(days=i)
            dt = current_date_dt.strftime("%Y-%m-%d")
            label = labels[i]

            u = uploads_by_date.get(dt, {})
            data = u.get("data")
            
            # Auto-link if data is missing but available in daily reports
            if not data and dt in source_data_map:
                data = source_data_map[dt]
                if u:
                    u["status"] = "uploaded"
                    u["file"] = f"Auto-linked from {source_type.replace('_', ' ').title()}"
                    # Data is loaded into memory for processing but not saved to the DB to prevent timeouts

            if data and len(data) > 0:
                df = pd.DataFrame(data)
            else:
                path = u.get("path")
                if path and os.path.exists(path):
                    df = read_excel_robust(path)
                else:
                    continue

            if df.empty:
                continue

            df_calc = self._compute(df)
            if df_calc.empty:
                continue

            # 1. Warehouse level
            wh_grouped = df_calc.groupby("warehouse")["issues"].sum().reset_index()
            for _, row in wh_grouped.iterrows():
                wh = row["warehouse"]
                val = round(float(row["issues"]), 2)
                if wh not in final_map:
                    final_map[wh] = {"warehouse": wh}
                final_map[wh][label] = val

            # 2. Shop level (for drilling & shop mode)
            shop_grouped = df_calc.groupby(["warehouse", "shop_code", "shop_name"])["issues"].sum().reset_index()
            for _, row in shop_grouped.iterrows():
                wh = row["warehouse"]
                sc = row["shop_code"]
                sn = row["shop_name"]
                val = round(float(row["issues"]), 2)
                
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
                val = round(float(row["issues"]), 2)
                
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
        # Or if mode is shop or bond, we need shopwise data to ensure accurate bond mappings
        if (warehouse and view == "shopwise") or mode in ["shop", "bond"]:
            data = processed.get("shopwise", [])
            if warehouse and mode != "bond":
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

        shop_lookup, warehouse_to_bond = get_shop_lookup_and_warehouse_to_bond()
        for row in data:
            wh = row.get("warehouse")
            sc = row.get("shop_code")
            sn = row.get("shop_name")
            
            bond = shop_lookup.get(sc, {}).get("bond", warehouse_to_bond.get(wh, "UNKNOWN")) if sc else warehouse_to_bond.get(wh, "UNKNOWN")
            
            if bond == "UNKNOWN":
                print(f"[DEBUG] cumulative_warehouse get_report: UNKNOWN bond for shop_code: '{sc}', name: '{sn}', warehouse: '{wh}'")
                
            new_row = {"warehouse": wh, "bond": bond}
            if sc: new_row["shop_code"] = sc
            if sn: new_row["shop_name"] = sn

            total = 0
            for i in idxs:
                l = labels[i]
                val = row.get(l, 0)
                new_row[l] = round(float(val), 2)
                total += val

            new_row["total"] = round(float(total), 2)
            
            # Calculate brand totals for all modes
            for k, v in row.items():
                if k.startswith("BRAND_"):
                    brand_total = sum(v.get(labels[i], 0) for i in idxs)
                    new_row[k] = round(float(brand_total), 2)

            result.append(new_row)

        # 🔥 BOND MODE
        if mode == "bond" and not warehouse:
            bond_map = {}
            bond_filter = kwargs.get("bond")
            
            if not bond_filter:
                from core.mapping_utils import get_bond_mapping_data
                for b in get_bond_mapping_data().keys():
                    bond_map[b] = {"warehouse": b, "bond": b, "total": 0}
                    for i in idxs: bond_map[b][labels[i]] = 0

            for row in result:
                bnd = row.get("bond", "UNKNOWN")

                if bnd not in bond_map:
                    bond_map[bnd] = {"warehouse": bnd, "bond": bnd, "total": 0}
                    for i in idxs:
                        bond_map[bnd][labels[i]] = 0

                for k, v in row.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"]:
                        if k not in bond_map[bnd]:
                            bond_map[bnd][k] = 0
                        bond_map[bnd][k] += v
                        
            for bnd, vals in bond_map.items():
                for k, v in vals.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"] and isinstance(v, (int, float)):
                        vals[k] = round(float(v), 2)

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