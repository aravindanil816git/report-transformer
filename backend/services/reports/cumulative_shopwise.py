# -*- coding: utf-8 -*-
import pandas as pd
import re
import os
import json
from datetime import datetime, timedelta
from .base import BaseReportService
from core.utils import normalize, clean_df, read_excel_robust
from core.mapping_utils import get_shop_lookup_and_warehouse_to_bond

SHOP_LOOKUP, WAREHOUSE_TO_BOND = get_shop_lookup_and_warehouse_to_bond()

SHOP_TO_BOND = {}
try:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    mapping_path = os.path.join(base_dir, "shopcode_mapping.json")
    if os.path.exists(mapping_path):
        with open(mapping_path, "r", encoding="utf-8") as f:
            shopcode_map = json.load(f)
            for bnd, shops in shopcode_map.items():
                for shop in shops:
                    SHOP_TO_BOND[str(shop.get("shop_code")).strip()] = bnd
except Exception as e:
    print(f"Error loading shopcode_mapping.json: {e}")


class CumulativeShopwiseReportService(BaseReportService):
    type_name = "cumulative_shopwise"

    def _generate_labels(self, start_date, num_days):
        start = datetime.strptime(start_date, "%Y-%m-%d")
        return [
            (start + timedelta(days=i)).strftime("%d-%b (%a)")
            for i in range(num_days)
        ]

    def upload(self, report, path, file_name, date=None, from_date=None, to_date=None, **kwargs):
        df = read_excel_robust(path)
        df = normalize(df)
        df = clean_df(df)

        # Ensure the uploads list exists
        if "uploads" not in report:
            report["uploads"] = []

        # If a specific date is provided, treat it as a single‑day upload.
        # Update an existing entry for that date or append a new one if it does not exist.
        if date:
            for u in report["uploads"]:
                if u.get("date") == date:
                    u["file"] = file_name
                    u["status"] = "uploaded"
                    u["data"] = df.to_dict("records")
                    break
            else:
                # No existing entry for this date – create a new one
                report["uploads"].append({
                    "date": date,
                    "file": file_name,
                    "status": "uploaded",
                    "data": df.to_dict("records"),
                })
        # If a date range is provided, treat it as a bulk upload.
        elif from_date and to_date:
            report["uploads"].append({
                "file": file_name,
                "from": from_date,
                "to": to_date,
                "status": "uploaded",
                "data": df.to_dict("records"),
            })


    def _compute(self, df):
        # 🔍 Detect columns
        shop_col = next((c for c in df.columns if "shop" in c and "code" in c), None)
        bpc_col = next((c for c in df.columns if "bottle" in c and "case" in c), None)

        open_case_col = next((c for c in df.columns if "opening" in c and "case" in c), None)
        open_bottle_col = next((c for c in df.columns if "opening" in c and "bottle" in c), None)

        in_case_col = next((c for c in df.columns if "shop_in" in c and "case" in c), None)
        in_bottle_col = next((c for c in df.columns if "shop_in" in c and "bottle" in c), None)

        out_case_col = next((c for c in df.columns if "out" in c and "case" in c), None)
        out_bottle_col = next((c for c in df.columns if "out" in c and "bottle" in c), None)

        if not all([shop_col, bpc_col, open_case_col, open_bottle_col]):
            return pd.DataFrame()

        # ✅ Normalize
        df[shop_col] = df[shop_col].astype(str).str.strip()
        df[bpc_col] = pd.to_numeric(df[bpc_col], errors="coerce").fillna(1)

        for col in [
            open_case_col, open_bottle_col,
            in_case_col, in_bottle_col,
            out_case_col, out_bottle_col
        ]:
            if col:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        # ✅ Calculations
        df["opening"] = ((df[open_case_col] * df[bpc_col]) + df[open_bottle_col]) / df[bpc_col]
        df["receipt"] = ((df[in_case_col] * df[bpc_col]) + df[in_bottle_col]) / df[bpc_col] if in_case_col and in_bottle_col else 0
        df["sales"] = ((df[out_case_col] * df[bpc_col]) + df[out_bottle_col]) / df[bpc_col] if out_case_col and out_bottle_col else 0

        # ✅ MAP USING SHOP CODE (KEY FIX)
        df["shop_code"] = df[shop_col]

        def map_meta(code):
            return SHOP_LOOKUP.get(code, {})

        df["warehouse"] = df["shop_code"].apply(lambda x: map_meta(x).get("warehouse") or "UNKNOWN")
        df["warehouse_code"] = df["shop_code"].apply(lambda x: map_meta(x).get("warehouse_code"))
        df["shop_name"] = df["shop_code"].apply(lambda x: map_meta(x).get("shop_name"))
        df["staff"] = df["shop_code"].apply(lambda x: ", ".join(map_meta(x).get("staffs", [])))
        
        df["bond"] = df["shop_code"].apply(lambda x: SHOP_TO_BOND.get(str(x).strip()) or map_meta(x).get("bond") or "UNKNOWN")

        # ❗ Remove unmapped rows
        df = df[(df["warehouse"] != "UNKNOWN") | (df["bond"] != "UNKNOWN")]

        return df[[
            "warehouse", "warehouse_code",
            "shop_code", "shop_name", "staff",
            "opening", "receipt", "sales", "bond"
        ]]

    def process(self, report):
        uploads = report.get("uploads", [])
        config = report.get("config", {})

        start_date_str = config.get("date1")
        end_date_str = config.get("date2")

        # Fallback for older reports
        if not start_date_str or not end_date_str:
            start_date_str = config.get("start_date")
            if not start_date_str:
                report["processed"] = {"daywise": {}, "cumulative": [], "labels": []}
                return
            num_days = int(config.get("num_days", 1))
            end_date = datetime.strptime(start_date_str, "%Y-%m-%d") + timedelta(days=num_days - 1)
            end_date_str = end_date.strftime("%Y-%m-%d")
        
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")

        # Filter uploads to only include those within the date range
        relevant_uploads = []
        for u in uploads:
            if u.get("status") != "uploaded" or not u.get("date"):
                continue
            
            upload_date = datetime.strptime(u["date"], "%Y-%m-%d")
            if start_date <= upload_date <= end_date:
                relevant_uploads.append(u)
        
        # Sort by date to ensure correct order
        relevant_uploads.sort(key=lambda x: x["date"])
        
        num_days = (end_date - start_date).days + 1
        labels = self._generate_labels(start_date_str, num_days)

        daywise_opening = {}
        daywise_sales = {}
        daywise_receipt = {}
        cumulative_map = {}

        uploads_by_date = {u["date"]: u for u in relevant_uploads}

        for i in range(num_days):
            current_date = start_date + timedelta(days=i)
            current_date_str = current_date.strftime("%Y-%m-%d")
            label = labels[i]

            u = uploads_by_date.get(current_date_str)
            if not u:
                continue

            df = pd.DataFrame(u.get("data", []))
            if df.empty:
                continue

            # Map possible raw column names to the internal ones expected by _compute
            column_map = {
                "Bottle Per Case": "bottle_per_case",
                "Shop In Cases": "shop_in_cases",
                "Shop In Bottles": "shop_in_bottles",
                "Shop Out Cases": "shop_out_cases",
                "Shop Out Bottles": "shop_out_bottles",
                # also handle lowercase variants that may appear in some files
                "bottle per case": "bottle_per_case",
                "shop in cases": "shop_in_cases",
                "shop in bottles": "shop_in_bottles",
                "shop out cases": "shop_out_cases",
                "shop out bottles": "shop_out_bottles",
            }
            df = df.rename(columns=column_map)
            df = normalize(df)
            df_calc = self._compute(df)

            if df_calc.empty:
                continue

            # ✅ GROUP BY MAPPED WAREHOUSE AND BOND
            grouped = (
                df_calc.groupby(["warehouse", "bond"])[["opening", "receipt", "sales"]]
                .sum()
                .reset_index()
            )

            for _, row in grouped.iterrows():
                wh = row["warehouse"]
                bond = row["bond"]
                group_key = f"{wh}___{bond}"
                display_wh = wh if wh != "UNKNOWN" else bond

                opening = round(row.get("opening", 0))
                receipt = round(row.get("receipt", 0))
                sales = round(row.get("sales", 0))

                for store, val in [
                    (daywise_opening, opening),
                    (daywise_receipt, receipt),
                    (daywise_sales, sales),
                ]:
                    if group_key not in store:
                        store[group_key] = {"warehouse": display_wh, "bond": bond}
                    store[group_key][label] = val

                if group_key not in cumulative_map:
                    cumulative_map[group_key] = {"warehouse": display_wh, "bond": bond, "opening": 0, "receipt": 0, "sales": 0}

                cumulative_map[group_key]["opening"] += opening
                cumulative_map[group_key]["receipt"] += receipt
                cumulative_map[group_key]["sales"] += sales

        # fill missing labels
        for store in [daywise_opening, daywise_sales, daywise_receipt]:
            for group_key in store:
                for label in labels:
                    if label not in store[group_key]:
                        store[group_key][label] = 0

        cumulative_data = []
        for group_key, vals in cumulative_map.items():
            wh = vals["warehouse"]
            bond = vals["bond"]
            opening = vals["opening"]
            receipt = vals["receipt"]
            sales = vals["sales"]

            closing = opening + receipt - sales
            diff = closing - opening
            avg_sales = round(sales / num_days)

            closing_stock_at_sales_perc = round((closing * 100) / sales, 2) if sales else 0
            perc = round((diff * 100) / opening, 2) if opening else 0

            cumulative_data.append({
                "warehouse": wh,
                "bond": bond,
                "opening": opening,
                "receipt": receipt,
                "sales": sales,
                "closing": closing,
                "difference": diff,
                "avg_sales_per_day": avg_sales,
                "closing_stock_at_sales_perc": closing_stock_at_sales_perc,
                "perc": perc
            })

        report["processed"] = {
            "daywise_opening": list(daywise_opening.values()),
            "daywise_sales": list(daywise_sales.values()),
            "daywise_receipt": list(daywise_receipt.values()),
            "cumulative": cumulative_data,
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
        **kwargs
    ):
        processed = report.get("processed") or {}
        labels = processed.get("labels", [])
        data = processed.get(view, [])

        bond = kwargs.get("bond")
        warehouse = kwargs.get("warehouse")
        
        if bond:
            data = [d for d in data if d.get("bond") == bond]
        if warehouse:
            data = [d for d in data if d.get("warehouse") == warehouse]

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
            new_row = {"warehouse": row["warehouse"], "bond": row.get("bond", "UNKNOWN")}
            total = 0

            for i in idxs:
                l = labels[i]
                val = row.get(l, 0)
                new_row[l] = val
                total += val

            new_row["total"] = total
            result.append(new_row)

        # 🔥 AGGREGATE DAYWISE
        if mode == "bond":
            bond_map = {}
            if not bond and not warehouse:
                from core.mapping_utils import get_bond_mapping_data
                for b in get_bond_mapping_data().keys():
                    bond_map[b] = {"warehouse": b, "bond": b, "total": 0}
                    for i in idxs: bond_map[b][labels[i]] = 0

            for row in result:
                wh = row["warehouse"]
                bnd = row.get("bond")
                if not bnd or bnd == "UNKNOWN":
                    bnd = WAREHOUSE_TO_BOND.get(wh, "UNKNOWN")

                if bnd not in bond_map:
                    bond_map[bnd] = {"warehouse": bnd, "bond": bnd, "total": 0}
                    for i in idxs: bond_map[bnd][labels[i]] = 0

                for k, v in row.items():
                    if k not in ["warehouse", "bond"]:
                        if k not in bond_map[bnd]:
                            bond_map[bnd][k] = 0
                        bond_map[bnd][k] += v

            result = list(bond_map.values())
        else:
            # 🔥 WAREHOUSE MODE
            wh_map = {}
            from core.mapping_utils import get_warehouse_mapping_data
            for w in get_warehouse_mapping_data().keys():
                bnd = WAREHOUSE_TO_BOND.get(w, "UNKNOWN")
                if not bond and not warehouse:
                    wh_map[w] = {"warehouse": w, "bond": bnd, "total": 0}
                    for i in idxs: wh_map[w][labels[i]] = 0
                elif bond and bnd == bond and not warehouse:
                    wh_map[w] = {"warehouse": w, "bond": bnd, "total": 0}
                    for i in idxs: wh_map[w][labels[i]] = 0

            for row in result:
                wh = row.get("warehouse", "UNKNOWN")
                if wh not in wh_map:
                    wh_map[wh] = {"warehouse": wh, "bond": "UNKNOWN", "total": 0}
                    for i in idxs: wh_map[wh][labels[i]] = 0

                for k, v in row.items():
                    if k not in ["warehouse", "bond"]:
                        if k not in wh_map[wh]:
                            wh_map[wh][k] = 0
                        wh_map[wh][k] += v

            result = list(wh_map.values())

        # cumulative
        if view == "cumulative":
            cumulative_data = processed.get("cumulative", [])
            if mode == "bond":
                bond_map = {}
                if not bond and not warehouse:
                    from core.mapping_utils import get_bond_mapping_data
                    for b in get_bond_mapping_data().keys():
                        bond_map[b] = {"warehouse": b, "bond": b, "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}

                for row in cumulative_data:
                    wh = row["warehouse"]
                    bnd = row.get("bond")
                    if not bnd or bnd == "UNKNOWN":
                        bnd = WAREHOUSE_TO_BOND.get(wh, "UNKNOWN")

                    if bnd not in bond_map:
                        bond_map[bnd] = {"warehouse": bnd, "bond": bnd, "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}
                    
                    for k, v in row.items():
                        if k not in ["warehouse", "bond"]:
                            if k not in bond_map[bnd]:
                                bond_map[bnd][k] = 0
                            bond_map[bnd][k] += v
                
                # Recalculate percentages correctly after summing
                for b, vals in bond_map.items():
                    vals["closing_stock_at_sales_perc"] = round((vals.get("closing", 0) * 100) / vals["sales"], 2) if vals.get("sales") else 0
                    vals["perc"] = round((vals.get("difference", 0) * 100) / vals["opening"], 2) if vals.get("opening") else 0

                cumulative_data = list(bond_map.values())
            else:
                # 🔥 WAREHOUSE MODE
                wh_map = {}
                from core.mapping_utils import get_warehouse_mapping_data
                for w in get_warehouse_mapping_data().keys():
                    bnd = WAREHOUSE_TO_BOND.get(w, "UNKNOWN")
                    if not bond and not warehouse:
                        wh_map[w] = {"warehouse": w, "bond": bnd, "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}
                    elif bond and bnd == bond and not warehouse:
                        wh_map[w] = {"warehouse": w, "bond": bnd, "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}

                for row in cumulative_data:
                    wh = row.get("warehouse", "UNKNOWN")
                    if wh not in wh_map:
                        wh_map[wh] = {"warehouse": wh, "bond": "UNKNOWN", "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}
                    for k, v in row.items():
                        if k not in ["warehouse", "bond"]:
                            if k not in wh_map[wh]:
                                wh_map[wh][k] = 0
                            wh_map[wh][k] += v
                
                for wh, vals in wh_map.items():
                    vals["closing_stock_at_sales_perc"] = round((vals.get("closing", 0) * 100) / vals["sales"], 2) if vals.get("sales") else 0
                    vals["perc"] = round((vals.get("difference", 0) * 100) / vals["opening"], 2) if vals.get("opening") else 0
                
                cumulative_data = list(wh_map.values())
                
            return {
                "data": cumulative_data,
                "labels": selected_labels,
                "config": report.get("config", {})
            }

        return {
            "data": result,
            "labels": selected_labels,
            "config": report.get("config", {})
        }