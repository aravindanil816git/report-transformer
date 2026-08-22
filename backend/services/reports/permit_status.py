import os
import json
import re
from datetime import datetime
from dateutil.relativedelta import relativedelta
import pandas as pd
from .base import BaseReportService

STANDARD_BRANDS_CONFIG = [
    {
        "name": "Old Pearl Rum",
        "matches": ["OLD PEARL", "PEARL RUM", "PEARL NO.1"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "Royal Old fort rum",
        "matches": ["ROYAL OLD FORT", "OLD FORT"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "Magic Blend rum",
        "matches": ["MAGIC BLEND"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "Blenders Choice brandy",
        "matches": ["BLENDER", "BLENDERS CHOICE"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "BCB classic brandy",
        "matches": ["BCB"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "Morning Walkers Brandy",
        "matches": ["MORNING WALKER", "MORNING WALKERS"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "Chairmans choice",
        "matches": ["CHAIRMAN", "CHAIRMAN'S CHOICE"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    },
    {
        "name": "KS 99 rum",
        "matches": ["KS 99", "K.S 99", "KS.99", "K.S. 99"],
        "packs": ["1000ml", "750ml", "500ml", "375ml", "180ml"]
    }
]

def _load_warehouses_list():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    path = os.path.join(base_dir, "warehouses.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return list(data.keys())
        except Exception:
            pass
    return []

def _load_warehouse_mapping():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    path = os.path.join(base_dir, "warehouse_mapping.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def match_brand(raw_str):
    if not raw_str:
        return None
    raw_upper = str(raw_str).upper()
    for b in STANDARD_BRANDS_CONFIG:
        for m in b["matches"]:
            if m in raw_upper:
                return b["name"]
    return None

def match_pack_size(brand_name, raw_pack, raw_item):
    combined = f"{raw_pack or ''} {raw_item or ''}".upper()
    if "1000" in combined or "1 LTR" in combined or "1LTR" in combined or "150" in combined:
        return "1000ml"
    if "750" in combined:
        return "750ml"
    if "500" in combined:
        return "500ml"
    if "375" in combined:
        return "375ml"
    if "180" in combined:
        return "180ml"
    if "80" in combined:
        return "750ml"
    if "120" in combined:
        return "500ml"
    if "200" in combined:
        return "375ml"
    if "100" in combined:
        return "180ml"
    return "180ml"

def _parse_date_to_month(date_val):
    if not date_val:
        return None
    s = str(date_val).strip()
    if not s:
        return None

    m = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/ ](?:[A-Za-z]{3}|\d{1,2})[-/ ]\d{4})', s)
    if m:
        s = m.group(1)

    if len(s) >= 7 and re.match(r'^\d{4}-\d{2}', s):
        return s[:7]

    try:
        dt = pd.to_datetime(s, dayfirst=True)
        if not pd.isna(dt):
            return dt.strftime("%Y-%m")
    except Exception:
        pass
    return None

class PermitStatusService(BaseReportService):
    type_name = "permit_status"

    def process(self, report):
        all_reports = report.pop("all_reports", [])
        config = report.get("config", {})
        report["processed"] = self._compute_permit_status(config, all_reports)

    def get_report(self, report, **kwargs):
        selected_date = kwargs.get("date") or report.get("config", {}).get("date") or datetime.today().strftime("%Y-%m-%d")
        selected_wh = kwargs.get("warehouse") or report.get("config", {}).get("warehouse")
        config = report.get("config", {})
        config["date"] = selected_date
        if selected_wh:
            config["warehouse"] = selected_wh

        from services.db import supabase
        sec_types = [
            "daily_warehouse_offtake",
            "daily_secondary_sales",
            "daily_warehouse",
            "shop_sales_cumulative",
            "combined_shopwise",
            "cumulative_shopwise",
            "cumulative_warehouse",
            "brandwise_cum_secondary_sales",
            "dailywise_secondary_sales_cum"
        ]
        res = supabase.table("reports").select("id, name, type, status, config, uploads, created_at, path, file, storage_path, processed, data").in_("type", sec_types).execute()
        all_reports = res.data or []
        
        return self._compute_permit_status(config, all_reports)

    def get_all_warehouses_report(self, report, **kwargs):
        selected_date = kwargs.get("date") or report.get("config", {}).get("date") or datetime.today().strftime("%Y-%m-%d")
        config = report.get("config", {})
        config["date"] = selected_date

        from services.db import supabase
        sec_types = [
            "daily_warehouse_offtake",
            "daily_secondary_sales",
            "daily_warehouse",
            "shop_sales_cumulative",
            "combined_shopwise",
            "cumulative_shopwise",
            "cumulative_warehouse",
            "brandwise_cum_secondary_sales",
            "dailywise_secondary_sales_cum"
        ]
        res = supabase.table("reports").select("id, name, type, status, config, uploads, created_at, path, file, storage_path, processed, data").in_("type", sec_types).execute()
        all_reports = res.data or []
        
        warehouses_list = _load_warehouses_list()
        results = {}

        for wh in warehouses_list:
            wh_config = dict(config)
            wh_config["warehouse"] = wh
            results[wh] = self._compute_permit_status(wh_config, all_reports)

        return {
            "date": selected_date,
            "warehouses": warehouses_list,
            "reports_by_warehouse": results
        }

    def _extract_items(self, r):
        items = []
        
        # 1. Prefer raw data array first as it contains explicit 'Pack' columns
        data = r.get("data")
        if isinstance(data, list) and len(data) > 0:
            for entry in data:
                if isinstance(entry, dict):
                    wh = entry.get("warehouse") or entry.get("warehouse_name") or entry.get("wh_name") or entry.get("Warehouse Name")
                    if "items" in entry and isinstance(entry["items"], list):
                        for sub_item in entry["items"]:
                            if isinstance(sub_item, dict):
                                item_copy = dict(sub_item)
                                if wh and "warehouse" not in item_copy:
                                    item_copy["warehouse"] = wh
                                items.append(item_copy)
                    else:
                        item_copy = dict(entry)
                        if wh and "warehouse" not in item_copy:
                            item_copy["warehouse"] = wh
                        items.append(item_copy)
                elif isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
                    items.extend(data["data"])

        # 2. Fallback to processed if data is empty
        if not items:
            proc = r.get("processed")
            if isinstance(proc, dict):
                if "data" in proc:
                    proc = proc["data"]
                elif "matrix" in proc:
                    proc = proc["matrix"]

            if isinstance(proc, list):
                for entry in proc:
                    if isinstance(entry, dict):
                        wh = entry.get("warehouse") or entry.get("warehouse_name") or entry.get("wh_name")
                        if "items" in entry and isinstance(entry["items"], list):
                            for sub_item in entry["items"]:
                                if isinstance(sub_item, dict):
                                    item_copy = dict(sub_item)
                                    if wh and "warehouse" not in item_copy:
                                        item_copy["warehouse"] = wh
                                    items.append(item_copy)
                        else:
                            item_copy = dict(entry)
                            if wh and "warehouse" not in item_copy:
                                item_copy["warehouse"] = wh
                            items.append(item_copy)

        # 3. Fallback to uploads
        if not items:
            uploads = r.get("uploads") or []
            for u in uploads:
                if isinstance(u, dict) and "data" in u and isinstance(u["data"], list):
                    items.extend(u["data"])

        return items

    def _parse_row(self, row):
        if not isinstance(row, dict):
            return None, None, 0.0, None, None, None

        norm_row = {str(k).lower().strip(): v for k, v in row.items() if k is not None}

        brand = None
        for k in ["brand", "item_name", "product_brand", "item", "description", "product_name", "brand_name", "product brand", "item name"]:
            if k in norm_row and norm_row[k]:
                brand = str(norm_row[k]).strip()
                break

        pack = None
        for k in ["pack", "pack_size", "size", "pack_name", "pack size"]:
            if k in norm_row and norm_row[k]:
                pack = str(norm_row[k]).strip()
                break

        qty = 0.0
        for k in ["issues", "cases", "issue cases", "allotted", "allotable", "allottable", "issue_case", "issue_cases", "qty", "quantity", "out_case", "inv_qty", "out_qty", "physical"]:
            if k in norm_row and norm_row[k] is not None:
                try:
                    val = float(norm_row[k])
                    if val > 0:
                        qty = val
                        break
                except (ValueError, TypeError):
                    pass

        row_date = None
        for k in ["date", "inv/gtn date", "inv_date", "gtn_date", "invoice_date", "issue_date", "from", "to", "day"]:
            if k in norm_row and norm_row[k]:
                parsed_m = _parse_date_to_month(norm_row[k])
                if parsed_m:
                    row_date = parsed_m
                    break

        shop_code = None
        for k in ["shop_code", "licensee_no", "licensee no.", "shop", "license_no", "licensee name", "licensee"]:
            if k in norm_row and norm_row[k]:
                shop_code = str(norm_row[k]).replace(".0", "").strip()
                break

        row_wh = None
        for k in ["warehouse", "warehouse_name", "wh_name", "wh", "warehouse name", "warehouse code"]:
            if k in norm_row and norm_row[k]:
                row_wh = str(norm_row[k]).strip()
                break

        return brand, pack, qty, row_date, shop_code, row_wh

    def _compute_permit_status(self, config, all_reports):
        logs = []
        warehouses_list = _load_warehouses_list()
        wh_mapping = _load_warehouse_mapping()

        selected_wh = config.get("warehouse")
        if not selected_wh and warehouses_list:
            selected_wh = warehouses_list[0]

        wh_shops_set = set()
        if selected_wh and selected_wh in wh_mapping:
            wh_shops_set = set(str(s).strip() for s in wh_mapping[selected_wh])

        clean_target_wh = str(selected_wh or "").strip().upper()
        short_target_wh = clean_target_wh.replace("WH-", "").replace("WH_", "")

        ref_date_str = config.get("date") or datetime.today().strftime("%Y-%m-%d")
        try:
            ref_date = datetime.strptime(ref_date_str[:10], "%Y-%m-%d")
        except Exception:
            ref_date = datetime.today()

        logs.append(f"INFO: Selected Warehouse filter: '{selected_wh}'")
        logs.append(f"INFO: Point-of-time selected date: {ref_date_str[:10]}")

        # Determine last 3 full months prior to reference date
        m3_date = ref_date - relativedelta(months=1)
        m2_date = ref_date - relativedelta(months=2)
        m1_date = ref_date - relativedelta(months=3)

        m1_key = m1_date.strftime("%Y-%m")
        m2_key = m2_date.strftime("%Y-%m")
        m3_key = m3_date.strftime("%Y-%m")

        m1_label = m1_date.strftime("%b.%Y").upper()
        m2_label = m2_date.strftime("%b.%Y").upper()
        m3_label = m3_date.strftime("%b.%Y").upper()

        maint_threshold = float(config.get("maint_threshold", 40.0))
        target_threshold = float(config.get("target_threshold", 125.0))
        pending_permits = config.get("pending_permits", {})

        # Master grid initialization
        data_map = {}
        for b_cfg in STANDARD_BRANDS_CONFIG:
            b_name = b_cfg["name"]
            for p in b_cfg["packs"]:
                key = (b_name, p)
                data_map[key] = {"m1": 0.0, "m2": 0.0, "m3": 0.0, "allotable": 0.0}

        # 1. Gather Secondary Sales for M1, M2, M3
        offtake_reports = [
            r for r in all_reports
            if r.get("type") in [
                "daily_warehouse_offtake",
                "daily_secondary_sales",
                "shop_sales_cumulative",
                "combined_shopwise",
                "cumulative_shopwise",
                "cumulative_warehouse",
                "brandwise_cum_secondary_sales",
                "dailywise_secondary_sales_cum"
            ]
        ]

        sec_reports_matched_count = 0
        m1_sales_total = 0.0
        m2_sales_total = 0.0
        m3_sales_total = 0.0

        for r in offtake_reports:
            r_cfg = r.get("config", {}) or {}
            r_id = r.get("id")
            r_name = r.get("name") or "Unnamed Report"
            r_type = r.get("type")

            r_date = r_cfg.get("date") or r_cfg.get("date1") or r_cfg.get("start_date") or (r.get("created_at", "")[:10] if r.get("created_at") else "")
            r_month = _parse_date_to_month(r_date) or _parse_date_to_month(r_name) or ""

            rows = self._extract_items(r)
            if not rows:
                continue

            r_matched_m1 = 0.0
            r_matched_m2 = 0.0
            r_matched_m3 = 0.0
            row_count = 0

            for row in rows:
                raw_brand, raw_pack, qty, row_date, shop_code, row_wh = self._parse_row(row)
                if not raw_brand or qty <= 0:
                    continue

                # Filter by selected warehouse
                if selected_wh:
                    wh_match = False
                    if shop_code and shop_code in wh_shops_set:
                        wh_match = True
                    elif row_wh:
                        u_wh = str(row_wh).upper()
                        if clean_target_wh in u_wh or short_target_wh in u_wh:
                            wh_match = True
                    if not wh_match:
                        continue

                b_name = match_brand(raw_brand)
                if not b_name:
                    continue

                p_name = match_pack_size(b_name, raw_pack, raw_brand)
                key = (b_name, p_name)
                if key not in data_map:
                    data_map[key] = {"m1": 0.0, "m2": 0.0, "m3": 0.0, "allotable": 0.0}

                effective_month = row_date if row_date else r_month

                if effective_month == m1_key:
                    data_map[key]["m1"] += qty
                    r_matched_m1 += qty
                    m1_sales_total += qty
                    row_count += 1
                elif effective_month == m2_key:
                    data_map[key]["m2"] += qty
                    r_matched_m2 += qty
                    m2_sales_total += qty
                    row_count += 1
                elif effective_month == m3_key:
                    data_map[key]["m3"] += qty
                    r_matched_m3 += qty
                    m3_sales_total += qty
                    row_count += 1

            if row_count > 0:
                sec_reports_matched_count += 1
                logs.append(f"SOURCE (Secondary Sales): Report '{r_name}' [ID: {r_id}, Type: {r_type}] -> Matched {row_count} rows for {selected_wh} (M1={round(r_matched_m1, 2)}, M2={round(r_matched_m2, 2)}, M3={round(r_matched_m3, 2)})")

        logs.append(f"SUMMARY: Secondary Sales totals for {selected_wh} -> {m1_label}: {round(m1_sales_total, 2)} cases, {m2_label}: {round(m2_sales_total, 2)} cases, {m3_label}: {round(m3_sales_total, 2)} cases.")

        # 2. Gather Allotable Stock from daily_warehouse reports
        warehouse_reports = [r for r in all_reports if r.get("type") == "daily_warehouse"]
        
        matching_wh_reports = []
        for r in warehouse_reports:
            r_cfg = r.get("config", {}) or {}
            r_date = r_cfg.get("date") or (r.get("created_at", "")[:10] if r.get("created_at") else "")
            if r_date and r_date[:10] <= ref_date_str[:10]:
                matching_wh_reports.append((r_date[:10], r))

        allotable_total = 0.0
        if matching_wh_reports:
            matching_wh_reports.sort(key=lambda x: x[0], reverse=True)
            best_date = matching_wh_reports[0][0]
            same_day_wh = [r for d, r in matching_wh_reports if d == best_date]

            for r in same_day_wh:
                r_id = r.get("id")
                r_name = r.get("name") or "Warehouse Report"
                wh_items = self._extract_items(r)
                wh_item_count = 0
                wh_qty_total = 0.0

                for item in wh_items:
                    raw_name, raw_pack, qty, _, shop_code, row_wh = self._parse_row(item)
                    if not raw_name:
                        continue

                    # Filter by selected warehouse
                    if selected_wh:
                        wh_match = False
                        if shop_code and shop_code in wh_shops_set:
                            wh_match = True
                        elif row_wh:
                            u_wh = str(row_wh).upper()
                            if clean_target_wh in u_wh or short_target_wh in u_wh:
                                wh_match = True
                        if not wh_match:
                            continue

                    b_name = match_brand(raw_name)
                    if not b_name:
                        continue

                    p_name = match_pack_size(b_name, raw_pack, raw_name)
                    key = (b_name, p_name)
                    if key not in data_map:
                        data_map[key] = {"m1": 0.0, "m2": 0.0, "m3": 0.0, "allotable": 0.0}

                    data_map[key]["allotable"] += qty
                    wh_qty_total += qty
                    allotable_total += qty
                    wh_item_count += 1

                if wh_item_count > 0:
                    logs.append(f"SOURCE (Warehouse Stock): Report '{r_name}' [ID: {r_id}] -> Matched {wh_item_count} items for {selected_wh} (Allotable Stock: {round(wh_qty_total, 2)} cases)")

        # Format output rows in order of STANDARD_BRANDS_CONFIG
        result_rows = []
        for b_cfg in STANDARD_BRANDS_CONFIG:
            b_name = b_cfg["name"]
            for p_name in b_cfg["packs"]:
                key_tuple = (b_name, p_name)
                vals = data_map.get(key_tuple, {"m1": 0.0, "m2": 0.0, "m3": 0.0, "allotable": 0.0})

                m1_val = round(vals["m1"], 2)
                m2_val = round(vals["m2"], 2)
                m3_val = round(vals["m3"], 2)

                avg_3m = round((m1_val + m2_val + m3_val) / 3.0, 2)
                maint_stock = round(avg_3m * (maint_threshold / 100.0), 2)
                allotable = round(vals["allotable"], 2)
                variance = round(allotable - maint_stock, 2)
                trigger_status = "APPLY FOR PERMIT" if variance < 0 else "STOCK OK"

                perm_key = f"{b_name}_{p_name}"
                pending_permit = pending_permits.get(perm_key, 0)

                target_stock = round(avg_3m * (target_threshold / 100.0), 2)
                required_stock = round(target_stock - allotable, 2)

                result_rows.append({
                    "key": perm_key,
                    "brand": b_name,
                    "pack": p_name,
                    "m1": m1_val,
                    "m2": m2_val,
                    "m3": m3_val,
                    "avg_3m": avg_3m,
                    "maint_stock": maint_stock,
                    "allotable": allotable,
                    "variance": variance,
                    "trigger_status": trigger_status,
                    "pending_permit": pending_permit,
                    "target_stock": target_stock,
                    "required_stock": required_stock,
                })

        logs.append(f"SUCCESS: Generated Permit Status report dataset for {selected_wh} with {len(result_rows)} line items (Total Allotable Stock: {round(allotable_total, 2)} cases).")

        for l in logs:
            print(f"[PERMIT_STATUS_LOG] {l}")

        return {
            "data": result_rows,
            "month_labels": [m1_label, m2_label, m3_label],
            "warehouses": warehouses_list,
            "logs": logs,
            "config": {
                "date": ref_date_str,
                "warehouse": selected_wh,
                "maint_threshold": maint_threshold,
                "target_threshold": target_threshold,
                "pending_permits": pending_permits
            }
        }
