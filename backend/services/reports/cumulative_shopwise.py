# -*- coding: utf-8 -*-
import pandas as pd
import re
import os
import json
import time
from datetime import datetime, timedelta
from .base import BaseReportService
from core.utils import normalize, clean_df, read_excel_robust
from core.mapping_utils import get_shop_lookup_and_warehouse_to_bond

import functools
print = functools.partial(print, flush=True)

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
                    u["path"] = path
                    u.pop("data", None)
                    break
            else:
                # No existing entry for this date – create a new one
                report["uploads"].append({
                    "date": date,
                    "file": file_name,
                    "path": path,
                    "status": "uploaded",
                })
        # If a date range is provided, treat it as a bulk upload.
        elif from_date and to_date:
            report["uploads"].append({
                "file": file_name,
                "path": path,
                "from": from_date,
                "to": to_date,
                "status": "uploaded",
            })


    def _compute(self, df):
        # start_time = time.time()
        # print(f"[_compute] Starting computation for DataFrame with {len(df)} rows.")

        # 🔍 Detect columns
        shop_col = next((c for c in df.columns if "shop" in c and "code" in c), None)
        
        if not shop_col:
            # Try fallback to just 'code' or 'license'
            for c in df.columns:
                if "code" in c or "license" in c:
                    shop_col = c
                    break
                    
        if not shop_col:
            print("[ERROR] [_compute] Could not find a suitable shop code column. Aborting.")
            return pd.DataFrame()

        bpc_col = next((c for c in df.columns if "bottle" in c and "case" in c), None)

        open_case_col = next((c for c in df.columns if "opening" in c and "case" in c), None)
        open_bottle_col = next((c for c in df.columns if "opening" in c and "bottle" in c), None)

        in_case_col = next((c for c in df.columns if ("shop_in" in c or "receipt" in c or "inward" in c or c.startswith("in_") or c.endswith("_in")) and "case" in c), None)
        in_bottle_col = next((c for c in df.columns if ("shop_in" in c or "receipt" in c or "inward" in c or c.startswith("in_") or c.endswith("_in")) and "bottle" in c), None)

        out_case_col = next((c for c in df.columns if ("out" in c or "sales" in c) and "case" in c), None)
        out_bottle_col = next((c for c in df.columns if ("out" in c or "sales" in c) and "bottle" in c), None)

        # ✅ Normalize
        df[shop_col] = df[shop_col].astype(str).str.strip()
        
        if bpc_col:
            df[bpc_col] = pd.to_numeric(df[bpc_col], errors="coerce").fillna(1)
            # Prevent division by zero mathematically crashing output
            df.loc[df[bpc_col] <= 0, bpc_col] = 1
        else:
            bpc_col = "_bpc_temp"
            df[bpc_col] = 1

        for col_name, col_var in [
            ("open_case", open_case_col), ("open_bottle", open_bottle_col),
            ("in_case", in_case_col), ("in_bottle", in_bottle_col),
            ("out_case", out_case_col), ("out_bottle", out_bottle_col)
        ]:
            if col_var and col_var in df.columns:
                df[col_var] = pd.to_numeric(df[col_var], errors="coerce").fillna(0)

        # ✅ Calculations
        df["opening"] = 0
        if open_case_col or open_bottle_col:
            oc = df[open_case_col] if open_case_col else 0
            ob = df[open_bottle_col] if open_bottle_col else 0
            df["opening"] = ((oc * df[bpc_col]) + ob) / df[bpc_col]
            
        df["receipt"] = 0
        if in_case_col or in_bottle_col:
            ic = df[in_case_col] if in_case_col else 0
            ib = df[in_bottle_col] if in_bottle_col else 0
            df["receipt"] = ((ic * df[bpc_col]) + ib) / df[bpc_col]
            
        df["sales"] = 0
        if out_case_col or out_bottle_col:
            sc = df[out_case_col] if out_case_col else 0
            sb = df[out_bottle_col] if out_bottle_col else 0
            df["sales"] = ((sc * df[bpc_col]) + sb) / df[bpc_col]

        # ✅ MAP USING SHOP CODE (KEY FIX)
        df["shop_code"] = df[shop_col]

        shop_lookup, _ = get_shop_lookup_and_warehouse_to_bond()
        from core.mapping_utils import get_shop_to_parent_maps
        shop_to_bond, _ = get_shop_to_parent_maps()

        def map_meta(code):
            return shop_lookup.get(code, {})

        wh_col = next((c for c in df.columns if "warehouse" in c.lower() or "wh" == c.lower()), None)
        if wh_col:
            df["warehouse"] = df[wh_col].astype(str).str.strip()
            # Ensure we don't end up with empty strings mapped as valid warehouses
            df["warehouse"] = df["warehouse"].replace({"": "UNKNOWN", "nan": "UNKNOWN", "None": "UNKNOWN"})
        else:
            df["warehouse"] = df["shop_code"].apply(lambda x: map_meta(x).get("warehouse") or "UNKNOWN")
        df["warehouse_code"] = df["shop_code"].apply(lambda x: map_meta(x).get("warehouse_code"))
        
        shop_name_col = next((c for c in df.columns if "shop" in c.lower() and "name" in c.lower()), None)
        if shop_name_col:
            df["shop_name"] = df[shop_name_col].astype(str).str.strip()
        else:
            df["shop_name"] = df["shop_code"].apply(lambda x: map_meta(x).get("shop_name"))
        df["staff"] = df["shop_code"].apply(lambda x: ", ".join(map_meta(x).get("staffs", [])))
        
        df["bond"] = df["shop_code"].apply(lambda x: shop_to_bond.get(str(x).strip()) or map_meta(x).get("bond") or "UNKNOWN")

        # Add debug log for UNKNOWN bonds before removing or aggregating
        unknown_bonds = df[df["bond"] == "UNKNOWN"]
        if not unknown_bonds.empty:
            unique_unknowns = unknown_bonds[["shop_code", "warehouse", "shop_name"]].drop_duplicates()
            for _, row in unique_unknowns.iterrows():
                print(f"[DEBUG] [_compute] UNKNOWN bond for shop_code: '{row['shop_code']}', name: '{row.get('shop_name')}', raw_warehouse: '{row.get('warehouse')}'")

        # ❗ Remove unmapped rows
        df = df[(df["warehouse"] != "UNKNOWN") | (df["bond"] != "UNKNOWN")]

        # end_time = time.time()
        # print(f"[_compute] Finished computation in {end_time - start_time:.2f} seconds. Returning DataFrame with {len(df)} rows.")

        return df[[
            "warehouse", "warehouse_code",
            "shop_code", "shop_name", "staff",
            "opening", "receipt", "sales", "bond"
        ]]

    def process(self, report):
        process_start_time = time.time()
        print(f"[INFO] [process] Starting processing for report ID {report.get('id')}.")

        uploads = report.get("uploads", [])
        config = report.get("config", {})

        start_date_str = config.get("date1")
        end_date_str = config.get("date2")

        # Fallback for older reports
        if not start_date_str or not end_date_str:
            start_date_str = config.get("start_date")
            if not start_date_str:
                report["processed"] = {"daywise": {}, "cumulative": [], "labels": []}
                print(f"[WARN] [process] Report {report.get('id')} has no start_date in config. Aborting.")
                return
            num_days = int(config.get("num_days", 1))
            end_date = datetime.strptime(start_date_str, "%Y-%m-%d") + timedelta(days=num_days - 1)
            end_date_str = end_date.strftime("%Y-%m-%d")
        
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")

        # 🔥 OOM SAFETY LIMIT: Prevent processing more than 95 days at once (Allows full quarter)
        if (end_date - start_date).days > 95:
            end_date = start_date + timedelta(days=95)
            end_date_str = end_date.strftime("%Y-%m-%d")
            config["date2"] = end_date_str
            print(f"[WARN] [process] Report date range exceeds 95 days. Truncating to {end_date_str}.")

        # Filter uploads to only include those within the date range
        relevant_uploads = []
        print(f"\n[DEBUG] === DATE RANGE APPLY TRACE (PROCESS) ===")
        print(f"[DEBUG] Total uploads attached to report: {len(uploads)}")
        for u in uploads:
            file_name = u.get("file", "Unknown")
            if u.get("status") != "uploaded":
                print(f"[DEBUG] -> Skipping {file_name}: Status is '{u.get('status')}' (needs 'uploaded')")
                continue
            if not u.get("date"):
                print(f"[DEBUG] -> Skipping {file_name}: No date assigned")
                continue
            
            upload_date = datetime.strptime(u["date"], "%Y-%m-%d")
            if start_date <= upload_date <= end_date:
                relevant_uploads.append(u)
                print(f"[DEBUG] -> INCLUDED {file_name} for date {u['date']}")
            else:
                print(f"[DEBUG] -> Skipping {file_name} for date {u['date']}: Outside range ({start_date_str} to {end_date_str})")
        
        # Sort by date to ensure correct order
        relevant_uploads.sort(key=lambda x: x["date"])
        
        print(f"[INFO] [process] Processing {len(relevant_uploads)} relevant uploads from {start_date_str} to {end_date_str}.")
        print(f"[DEBUG] ========================================\n")
        
        num_days = (end_date - start_date).days + 1
        labels = self._generate_labels(start_date_str, num_days)

        daywise_opening = {}
        daywise_sales = {}
        daywise_receipt = {}
        cumulative_map = {}

        uploads_by_date = {u["date"]: u for u in relevant_uploads}

        # 🔥 LINK WITH DAILY SOURCE DATA IN DB IF RAW FILES ARE MISSING (Prevents file-not-found errors)
        from services.store import reports as all_reports_store
        reports_list = list(all_reports_store.values())
        
        # Fetching 'data' for all shopwise reports causes OOM errors!
        has_shopwise = any(r.get("type") == "shopwise" for r in reports_list)
        if not has_shopwise:
            try:
                from services.db import supabase
                # Avoid selecting "data" column to prevent OOM
                res = supabase.table("reports").select("id, type, status, config, path, storage_path").eq("type", "shopwise").execute()
                if res.data:
                    reports_list.extend(res.data)
            except Exception as e:
                print(f"[WARN] Failed to fetch shopwise fallback data from DB: {e}")

        total_raw_rows = 0
        total_shrunk_rows = 0

        for i in range(num_days):
            day_start_time = time.time()
            current_date = start_date + timedelta(days=i)
            current_date_str = current_date.strftime("%Y-%m-%d")
            label = labels[i]

            u = uploads_by_date.get(current_date_str)
            fallback_report = None
            
            # 🔥 Find the fallback_report for this date to enable data recovery
            for r in reports_list:
                if r.get("type") == "shopwise" and r.get("status") in ["Processed", "Ready", "Uploaded"]:
                    if r.get("config", {}).get("date") == current_date_str:
                        fallback_report = r
                        break
            
            # 🔥 If upload missing entirely, auto-link
            if not u and fallback_report:
                u = {"date": current_date_str, "file": "Auto-linked from Daily Shopwise", "path": fallback_report.get("path"), "storage_path": fallback_report.get("storage_path")}
                
            if not u:
                print(f"[WARN] [process] Day {i+1}/{num_days}: NO UPLOAD FOUND for date {current_date_str}. It will be skipped.")
                continue
            
            print(f"[INFO] [process] Day {i+1}/{num_days}: Processing date {current_date_str}")

            data = u.get("data")
            # 🔥 Auto-link if data is missing locally but available in daily processed reports
            if not data and fallback_report:
                data = fallback_report.get("data")
                if not data:
                    try:
                        from services.db import supabase
                        res = supabase.table("reports").select("data").eq("id", fallback_report["id"]).execute()
                        if res.data and res.data[0].get("data"):
                            data = res.data[0].get("data")
                            print(f"[INFO] [process] Fetched 'data' from DB for fallback report {fallback_report['id']}.")
                    except Exception as e:
                        print(f"[WARN] Failed to fetch data for fallback report: {e}")
                
            df = None
            if data and len(data) > 0:
                print(f"[INFO] [process] Loading data from 'data' key with {len(data)} records for {current_date_str}.")
                df = pd.DataFrame(data)
            else:
                path = u.get("path")
                storage_path = u.get("storage_path") or (fallback_report.get("storage_path") if fallback_report else None)
                
                # If path is missing but storage_path exists, infer the local path
                if not path and storage_path:
                    filename = os.path.basename(storage_path)
                    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
                    path = os.path.join(temp_dir, filename)
                
                if path:
                    filename = os.path.basename(path)
                    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
                    local_path = os.path.join(temp_dir, filename)
                    
                    if storage_path and not os.path.exists(local_path):
                        try:
                            from services.db import supabase as db_supabase
                            res = db_supabase.storage.from_("raw-reports").download(storage_path)
                            with open(local_path, "wb") as f:
                                f.write(res)
                            print(f"[INFO] Downloaded {storage_path} from Supabase.")
                        except Exception as e:
                            print(f"[WARN] Failed to download fallback file: {e}")

                    if not os.path.exists(path) and os.path.exists(local_path):
                        path = local_path
                        
                if path and os.path.exists(path):
                    print(f"[INFO] [process] Reading data from file: {path} for {current_date_str}")
                    try:
                        df = read_excel_robust(path)
                    except Exception as e:
                        print(f"[WARN] [process] Error reading {path}: {e}")
                else:
                    print(f"[WARN] [process] No data or valid path found for date {current_date_str}. (Tried path: {path}, Storage path: {storage_path})")
                    continue

            if df is None or df.empty:
                print(f"[WARN] [process] DataFrame is empty for date {current_date_str}.")
                continue

            raw_rows = len(df)
            total_raw_rows += raw_rows

            print(f"[INFO] [process] DataFrame for {current_date_str} has {raw_rows} rows before _compute.")

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
            
            # FREE MEMORY
            del df
            import gc
            gc.collect()

            if df_calc.empty:
                print(f"[WARN] [process] DataFrame is empty after _compute for date {current_date_str}.")
                continue

            print(f"[INFO] [process] DataFrame for {current_date_str} has {len(df_calc)} rows after _compute.")

            # ✅ GROUP BY MAPPED WAREHOUSE, BOND, AND SHOP
            grouped = (
                df_calc.groupby(["warehouse", "bond", "shop_code", "shop_name"])[["opening", "receipt", "sales"]]
                .sum()
                .reset_index()
            )
            
            shrunk_rows = len(grouped)
            total_shrunk_rows += shrunk_rows

            for _, row in grouped.iterrows():
                wh = row["warehouse"]
                bond = row["bond"]
                shop_code = row["shop_code"]
                shop_name = row["shop_name"]
                group_key = f"{wh}___{bond}___{shop_code}"
                display_wh = wh if wh != "UNKNOWN" else bond

                opening = round(float(row.get("opening", 0)), 2)
                receipt = round(float(row.get("receipt", 0)), 2)
                sales = round(float(row.get("sales", 0)), 2)

                for store, val in [
                    (daywise_opening, opening),
                    (daywise_receipt, receipt),
                    (daywise_sales, sales),
                ]:
                    if group_key not in store:
                        store[group_key] = {"warehouse": display_wh, "bond": bond, "shop_code": shop_code, "shop_name": shop_name}
                    store[group_key][label] = val

                if group_key not in cumulative_map:
                    cumulative_map[group_key] = {"warehouse": display_wh, "bond": bond, "shop_code": shop_code, "shop_name": shop_name, "opening": opening, "receipt": 0, "sales": 0}

                # 🔥 DO NOT sum opening stock across all days! Opening is the stock on day 1.
                cumulative_map[group_key]["receipt"] += receipt
                cumulative_map[group_key]["sales"] += sales
            
            # FREE MEMORY
            del df_calc
            del grouped
            gc.collect()
            
            day_end_time = time.time()
            print(f"[INFO] [process] Progress: Day {i+1}/{num_days} ({current_date_str}). "
                        f"Aggregated {raw_rows} -> {shrunk_rows} rows. "
                        f"Cumulative unique output rows: {len(cumulative_map)}. "
                        f"Total raw rows processed so far: {total_raw_rows}. Time: {day_end_time - day_start_time:.2f}s.")

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
            shop_code = vals["shop_code"]
            shop_name = vals["shop_name"]
            opening = vals["opening"]
            receipt = vals["receipt"]
            sales = vals["sales"]

            closing = opening + receipt - sales
            diff = closing - opening
            avg_sales = round(float(sales / num_days), 2)

            closing_stock_at_sales_perc = round((closing * 100) / sales, 2) if sales else 0
            perc = round((diff * 100) / opening, 2) if opening else 0

            cumulative_data.append({
                "warehouse": wh,
                "bond": bond,
                "shop_code": shop_code,
                "shop_name": shop_name,
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
        
        process_end_time = time.time()
        print(f"[INFO] [process] SUCCESS! Report ID {report.get('id')} finished. "
                    f"Processed {total_raw_rows} total raw rows across {num_days} days. "
                    f"Final payload contains {len(cumulative_map)} aggregated rows. "
                    f"Total processing time: {process_end_time - process_start_time:.2f} seconds.")

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
        get_report_start = time.time()
        print(f"[INFO] [get_report] ===================================================")
        print(f"[INFO] [get_report] Started get_report. Mode: '{mode}', View: '{view}'")
        
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

        print(f"[INFO] [get_report] Extracted {len(data)} rows from processed data. Selected {len(selected_labels)} labels out of {len(labels)}.")

        result = []

        transform_start = time.time()
        print(f"[INFO] [get_report] Starting base transformation loop...")
        
        for row in data:
            new_row = {
                "warehouse": row["warehouse"], 
                "bond": row.get("bond", "UNKNOWN"),
                "shop_code": row.get("shop_code"),
                "shop_name": row.get("shop_name")
            }
            total = 0

            for i in idxs:
                l = labels[i]
                val = row.get(l, 0)
                new_row[l] = round(float(val), 2)
                total += val

            new_row["total"] = round(float(total), 2)
            result.append(new_row)

        print(f"[INFO] [get_report] Base transformation finished in {time.time() - transform_start:.2f}s")

        _, warehouse_to_bond = get_shop_lookup_and_warehouse_to_bond()

        # 🔥 AGGREGATE DAYWISE
        agg_start = time.time()
        if mode == "bond":
            print(f"[INFO] [get_report] Starting Daywise Aggregation for BOND mode...")
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
                    bnd = warehouse_to_bond.get(wh, "UNKNOWN")

                if bnd == "UNKNOWN" or not bnd:
                    print(f"[DEBUG] cumulative_shopwise (daywise bond mode): UNKNOWN bond. row: {row}")
                    print(f"[WARN] [get_report] (daywise bond mode) UNKNOWN bond for row: {row}")

                if bnd not in bond_map:
                    bond_map[bnd] = {"warehouse": bnd, "bond": bnd, "total": 0}
                    for i in idxs: bond_map[bnd][labels[i]] = 0

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
            print(f"[INFO] [get_report] Daywise BOND aggregation finished in {time.time() - agg_start:.2f}s. Result: {len(result)} rows.")
        elif mode == "shop":
            print(f"[INFO] [get_report] Starting Daywise Aggregation for SHOP mode...")
            shop_map = {}
            for row in result:
                sc = row.get("shop_code", "UNKNOWN")
                if sc not in shop_map:
                    shop_map[sc] = {
                        "warehouse": row.get("warehouse", "UNKNOWN"), 
                        "bond": row.get("bond", "UNKNOWN"), 
                        "shop_code": sc, 
                        "shop_name": row.get("shop_name", "UNKNOWN"), 
                        "total": 0
                    }
                    for i in idxs: shop_map[sc][labels[i]] = 0

                for k, v in row.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"]:
                        if k not in shop_map[sc]:
                            shop_map[sc][k] = 0
                        shop_map[sc][k] += v
            
            for sc, vals in shop_map.items():
                for k, v in vals.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"] and isinstance(v, (int, float)):
                        vals[k] = round(float(v), 2)

            result = list(shop_map.values())
            print(f"[INFO] [get_report] Daywise SHOP aggregation finished in {time.time() - agg_start:.2f}s. Result: {len(result)} rows.")
        else:
            # 🔥 WAREHOUSE MODE
            print(f"[INFO] [get_report] Starting Daywise Aggregation for WAREHOUSE mode...")
            wh_map = {}
            for row in result:
                wh = row.get("warehouse", "UNKNOWN")
                if wh not in wh_map:
                    wh_map[wh] = {"warehouse": wh, "bond": row.get("bond", "UNKNOWN"), "total": 0}
                    for i in idxs: wh_map[wh][labels[i]] = 0

                for k, v in row.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"]:
                        if k not in wh_map[wh]:
                            wh_map[wh][k] = 0
                        wh_map[wh][k] += v
            
            for wh, vals in wh_map.items():
                for k, v in vals.items():
                    if k not in ["warehouse", "bond", "shop_code", "shop_name"] and isinstance(v, (int, float)):
                        vals[k] = round(float(v), 2)

            result = list(wh_map.values())
            print(f"[INFO] [get_report] Daywise WAREHOUSE aggregation finished in {time.time() - agg_start:.2f}s. Result: {len(result)} rows.")

        # cumulative
        if view == "cumulative":
            cum_start = time.time()
            print(f"[INFO] [get_report] Starting CUMULATIVE view processing...")
            
            # 🔥 FORCED DELEGATION: Always rely on combined_shopwise_multi for cumulative accuracy
            from services.registry import get_service
            from services.db import supabase
            start_date_param = kwargs.get("start_date") or report.get("config", {}).get("start_date") or report.get("config", {}).get("date1")
            end_date_param = kwargs.get("end_date") or report.get("config", {}).get("end_date") or report.get("config", {}).get("date2")
            if start_date_param:
                month_prefix = str(start_date_param).split("T")[0][:7]
                res = supabase.table("reports").select("id, type, config, uploads").in_("type", ["shop_sales_cumulative", "combined_shopwise"]).execute()
                
                source_uploads_map = {}
                if res.data:
                    for r in res.data:
                        if r.get("type") == "shop_sales_cumulative":
                            r_start = str(r.get("config", {}).get("date1") or r.get("config", {}).get("start_date") or "").split("T")[0]
                            if r_start[:7] == month_prefix:
                                for u in r.get("uploads", []):
                                    if u.get("status") == "uploaded":
                                        rk = u.get("range_key") or u.get("date") or "1-16"
                                        source_uploads_map[rk] = {**u, "status": "uploaded"}
                
                if source_uploads_map:
                    print(f"\n[DEBUG] === DELEGATING TO COMBINED SHOPWISE MULTI (GET_REPORT) ===")
                    
                    # Ensure local files exist to prevent delegation failure
                    missing_files = []
                    for u in source_uploads_map.values():
                        if u.get("storage_path") and u.get("path"):
                            filename = os.path.basename(u["path"])
                            temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
                            local_p = os.path.join(temp_dir, filename)
                            u["path"] = local_p
                            if not os.path.exists(local_p):
                                missing_files.append((u["storage_path"], local_p))
                    
                    if missing_files:
                        print(f"[DEBUG] Fetching {len(missing_files)} missing files for delegation...")
                        import concurrent.futures
                        def _download(sp, lp):
                            try:
                                res = supabase.storage.from_("raw-reports").download(sp)
                                os.makedirs(os.path.dirname(lp) or ".", exist_ok=True)
                                with open(lp, "wb") as f:
                                    f.write(res)
                            except Exception: pass
                        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                            futures = [executor.submit(_download, sp, lp) for sp, lp in missing_files]
                            concurrent.futures.wait(futures)

                    combined_report_payload = {
                        "id": "temp-combined",
                        "type": "combined_shopwise_multi",
                        "uploads": list(source_uploads_map.values()),
                        "config": {"start_date": start_date_param, "end_date": end_date_param}
                    }
                    try:
                        svc = get_service("combined_shopwise_multi")
                        
                        delegate_kwargs = kwargs.copy()
                        # Force exact dates to prevent kwargs defaulting to None and losing the filter
                        delegate_kwargs["start_date"] = start_date_param
                        delegate_kwargs["end_date"] = end_date_param

                        combined_res = svc.get_report(combined_report_payload, shop_code=kwargs.get("shop_code"), warehouse=warehouse, bond=bond, view="cumulative", mode=mode, **delegate_kwargs)
                        
                        if combined_res and combined_res.get("data"):
                            return {
                                "data": combined_res.get("data"),
                                "labels": selected_labels,
                                "config": report.get("config", {})
                            }
                        else:
                            print(f"[WARN] [get_report] Delegation to combined_shopwise_multi returned empty data. Falling back.")
                    except Exception as e:
                        import traceback
                        print(f"[ERROR] [get_report] Delegation failed: {e}")
                        traceback.print_exc()

            cumulative_data = processed.get("cumulative", [])
            
            if bond:
                cumulative_data = [d for d in cumulative_data if d.get("bond") == bond]
            if warehouse:
                cumulative_data = [d for d in cumulative_data if d.get("warehouse") == warehouse]

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
                        bnd = warehouse_to_bond.get(wh, "UNKNOWN")

                    if bnd == "UNKNOWN" or not bnd:
                        print(f"[DEBUG] cumulative_shopwise (cumulative bond mode): UNKNOWN bond. row: {row}")
                        print(f"[WARN] [get_report] (cumulative bond mode) UNKNOWN bond for row: {row}")

                    if bnd not in bond_map:
                        bond_map[bnd] = {"warehouse": bnd, "bond": bnd, "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}
                    
                    for k, v in row.items():
                        if k not in ["warehouse", "bond", "shop_code", "shop_name"]:
                            if k not in bond_map[bnd]:
                                bond_map[bnd][k] = 0
                            bond_map[bnd][k] += v
                
                # Recalculate percentages correctly after summing
                for b, vals in bond_map.items():
                    for k in ["opening", "receipt", "sales", "closing", "difference", "avg_sales_per_day"]:
                        if k in vals:
                            vals[k] = round(float(vals[k]), 2)

                    vals["closing_stock_at_sales_perc"] = round((vals.get("closing", 0) * 100) / vals["sales"], 2) if vals.get("sales") else 0
                    vals["perc"] = round((vals.get("difference", 0) * 100) / vals["opening"], 2) if vals.get("opening") else 0

                cumulative_data = list(bond_map.values())
            elif mode == "shop":
                shop_map = {}
                for row in cumulative_data:
                    sc = row.get("shop_code", "UNKNOWN")
                    if sc not in shop_map:
                        shop_map[sc] = {
                            "warehouse": row.get("warehouse", "UNKNOWN"), 
                            "bond": row.get("bond", "UNKNOWN"), 
                            "shop_code": sc, 
                            "shop_name": row.get("shop_name", "UNKNOWN"), 
                            "opening": 0, "receipt": 0, "sales": 0, "closing": 0, 
                            "difference": 0, "avg_sales_per_day": 0, 
                            "closing_stock_at_sales_perc": 0, "perc": 0
                        }
                    for k, v in row.items():
                        if k not in ["warehouse", "bond", "shop_code", "shop_name"]:
                            if k not in shop_map[sc]:
                                shop_map[sc][k] = 0
                            shop_map[sc][k] += v
                
                for sc, vals in shop_map.items():
                    for k in ["opening", "receipt", "sales", "closing", "difference", "avg_sales_per_day"]:
                        if k in vals:
                            vals[k] = round(float(vals[k]), 2)

                    vals["closing_stock_at_sales_perc"] = round((vals.get("closing", 0) * 100) / vals["sales"], 2) if vals.get("sales") else 0
                    vals["perc"] = round((vals.get("difference", 0) * 100) / vals["opening"], 2) if vals.get("opening") else 0
                
                cumulative_data = list(shop_map.values())
            else:
                # 🔥 WAREHOUSE MODE
                wh_map = {}
                for row in cumulative_data:
                    wh = row.get("warehouse", "UNKNOWN")
                    if wh not in wh_map:
                        wh_map[wh] = {"warehouse": wh, "bond": row.get("bond", "UNKNOWN"), "opening": 0, "receipt": 0, "sales": 0, "closing": 0, "difference": 0, "avg_sales_per_day": 0, "closing_stock_at_sales_perc": 0, "perc": 0}
                    for k, v in row.items():
                        if k not in ["warehouse", "bond", "shop_code", "shop_name"]:
                            if k not in wh_map[wh]:
                                wh_map[wh][k] = 0
                            wh_map[wh][k] += v
                
                for wh, vals in wh_map.items():
                    for k in ["opening", "receipt", "sales", "closing", "difference", "avg_sales_per_day"]:
                        if k in vals:
                            vals[k] = round(float(vals[k]), 2)

                    vals["closing_stock_at_sales_perc"] = round((vals.get("closing", 0) * 100) / vals["sales"], 2) if vals.get("sales") else 0
                    vals["perc"] = round((vals.get("difference", 0) * 100) / vals["opening"], 2) if vals.get("opening") else 0
                
                cumulative_data = list(wh_map.values())
                
            print(f"[INFO] [get_report] Cumulative processing finished in {time.time() - cum_start:.2f}s.")
            print(f"[INFO] [get_report] Total execution time: {time.time() - get_report_start:.2f}s.")
            print(f"[INFO] [get_report] ===================================================")
            
            return {
                "data": cumulative_data,
                "labels": selected_labels,
                "config": report.get("config", {})
            }

        print(f"[INFO] [get_report] Total execution time: {time.time() - get_report_start:.2f}s.")
        print(f"[INFO] [get_report] ===================================================")
        return {
            "data": result,
            "labels": selected_labels,
            "config": report.get("config", {})
        }