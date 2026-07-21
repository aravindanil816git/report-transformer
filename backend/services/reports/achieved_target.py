import os
import json
import re
from .base import BaseReportService

class AchievedTargetReportService(BaseReportService):
    type_name = "achieved_target"

    def _clean_brand(self, brand):
        """Fuzzy match brands to avoid Chairman's Choice vs Chairmans Choice issues"""
        if not brand or str(brand).strip() in ["nan", "Unknown", ""]:
            return "Unknown"
        cleaned = re.sub(r"['\"]", "", str(brand))
        cleaned = re.sub(r"\s+", " ", cleaned).strip().upper()
        return cleaned

    def process(self, report):
        # Pre-processing is no longer needed; calculation is fully dynamic in get_report
        report["processed"] = {"status": "ready"}
        pass

    def get_report(self, report, **kwargs):
        from services.store import reports as all_reports_store
        from services.registry import get_service

        month = report.get("config", {}).get("month", "")
        if not month:
            return {"data": [], "config": report.get("config", {})}
            
        start_date = kwargs.get("start_date")
        end_date = kwargs.get("end_date")
        
        reports_list = []
        if all_reports_store:
            for r in all_reports_store.values():
                r_type = r.get("type")
                if r_type == "daily_warehouse_offtake":
                    if str(r.get("config", {}).get("date", ""))[:7] == month:
                        reports_list.append(r)
                elif r_type == "shop_sales_cumulative":
                    if str(r.get("config", {}).get("date1", r.get("config", {}).get("start_date", "")))[:7] == month:
                        reports_list.append(r)
        
        # Fallback to Supabase if the server restarted and memory is wiped
        if not reports_list:
            from services.db import supabase
            # Fetch minimal data dynamically to prevent > 2GB OOM Crash
            res_offtake = supabase.table("reports").select("id, type, config").eq("type", "daily_warehouse_offtake").execute()
            if res_offtake.data:
                target_ids = [r["id"] for r in res_offtake.data if str(r.get("config", {}).get("date", ""))[:7] == month]
                if target_ids:
                    res_full = supabase.table("reports").select("id, type, config, processed").in_("id", target_ids).execute()
                    if res_full.data: reports_list.extend(res_full.data)
            
            res_cum = supabase.table("reports").select("id, type, config").eq("type", "shop_sales_cumulative").execute()
            if res_cum.data:
                target_ids = [r["id"] for r in res_cum.data if str(r.get("config", {}).get("date1", r.get("config", {}).get("start_date", "")))[:7] == month]
                if target_ids:
                    res_full = supabase.table("reports").select("id, type, config, uploads").in_("id", target_ids).execute()
                    if res_full.data: reports_list.extend(res_full.data)
        
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        shop_to_bond = {}
        shop_type_lookup = {}
        bond_staffs = {}

        # 1. Load Shops Master for Category (CFD / BAR / KSBC)
        try:
            with open(os.path.join(base_dir, "shopcode_mapping.json"), "r", encoding="utf-8") as f:
                shopcode_mapping = json.load(f)
                for region, shops in shopcode_mapping.items():
                    for shop in shops:
                        code = str(shop.get("shop_code", "")).replace(".0", "").strip()
                        cat = str(shop.get("category", "")).strip().lower()
                        if code:
                            shop_type_lookup[code] = cat
        except Exception as e:
            print(f"Error loading shopcode_mapping.json: {e}")

        # 2. Load Bond Mapping for relations
        try:
            with open(os.path.join(base_dir, "bond_mapping.json"), "r", encoding="utf-8") as f:
                mapping = json.load(f)
                for bnd, data in mapping.items():
                    bond_staffs[bnd] = data.get("staffs", "")
                    for s in data.get("shops", []):
                        scode = str(s.get("shop_code", s)) if isinstance(s, dict) else str(s)
                        scode = scode.replace(".0", "").strip()
                        shop_to_bond[scode] = bnd
        except Exception as e:
            print(f"Error loading bond_mapping.json: {e}")

        achieved_map = {}

        # Dynamic Aggregation across all loaded reports
        print(f"[DEBUG] achieved_target: Starting aggregation for month '{month}'. Start Date: '{start_date}', End Date: '{end_date}'")
        print(f"[DEBUG] achieved_target: Evaluating {len(reports_list)} reports from database/memory.")
        
        type_counts = {}
        for r in reports_list:
            type_counts[r.get("type", "unknown")] = type_counts.get(r.get("type", "unknown"), 0) + 1
        print(f"[DEBUG] achieved_target: Breakdown of evaluated reports: {type_counts}")

        # Deduplicate reports to prevent double/triple counting
        valid_reports = []
        offtake_by_date = {}
        shop_sales_by_month = {}
        
        for r in reports_list:
            r_type = r.get("type")
            if r_type == "daily_warehouse_offtake":
                r_date = r.get("config", {}).get("date", "")
                if str(r_date)[:7] == month:
                    if start_date and end_date and not (start_date <= str(r_date) <= end_date): continue
                    if r.get("processed"):
                        offtake_by_date[r_date] = r

        # Select the single widest cumulative report(s) to avoid double-counting subset reports
        cum_reports = []
        for r in reports_list:
            if r.get("type") == "shop_sales_cumulative":
                r_start = r.get("config", {}).get("date1", r.get("config", {}).get("start_date", ""))
                r_end = r.get("config", {}).get("date2", "")
                if str(r_start)[:7] == month:
                    if start_date and end_date:
                        if start_date <= r_start and r_end <= end_date:
                            cum_reports.append((r, r_start, r_end))
                    else:
                        cum_reports.append((r, r_start, r_end))

        best_cum_reports = {}
        for r, r_start, r_end in cum_reports:
            if r_start not in best_cum_reports:
                best_cum_reports[r_start] = (r, r_end)
            else:
                if r_end > best_cum_reports[r_start][1]:
                    best_cum_reports[r_start] = (r, r_end)

        for r_start, (r, r_end) in best_cum_reports.items():
            shop_sales_by_month[f"{r_start}_{r_end}"] = r

        valid_reports.extend(offtake_by_date.values())
        valid_reports.extend(shop_sales_by_month.values())
        
        print(f"[DEBUG] achieved_target: Deduplicated to {len(offtake_by_date)} offtake reports and {len(shop_sales_by_month)} shop_sales reports. Selected keys: {list(shop_sales_by_month.keys())}")

        # Aggregation maps
        achieved_map = {}
        shop_achieved_map = {}

        for r in valid_reports:
            r_type = r.get("type")
            
            if r_type == "daily_warehouse_offtake":
                r_date = r.get("config", {}).get("date", "")
                
                rows_processed = 0
                rows_skipped = 0
                for row in (r.get("processed") or []):
                    shop_code = str(row.get("shop_code", "")).replace(".0", "").strip()
                    cat = shop_type_lookup.get(shop_code, "ksbc").strip().lower()
                    if cat in ["bar", "cfd"]:
                        brand = self._clean_brand(row.get("brand", "Unknown"))
                        issues = float(row.get("issues", 0))
                        bond = row.get("bond")
                        if not bond or bond in ["UNKNOWN", "UNMAPPED"]:
                            bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += issues
                        
                        # Shop level aggregation
                        if shop_code not in shop_achieved_map: shop_achieved_map[shop_code] = {}
                        if brand not in shop_achieved_map[shop_code]: shop_achieved_map[shop_code][brand] = 0
                        shop_achieved_map[shop_code][brand] += issues
                        
                        rows_processed += 1
                    else:
                        rows_skipped += 1
                print(f"[DEBUG] achieved_target: Parsed {rows_processed} matching rows, skipped {rows_skipped} (non BAR/CFD) from daily_warehouse_offtake (date: {r_date})")
                        
            elif r_type == "shop_sales_cumulative":
                r_start = r.get("config", {}).get("date1", r.get("config", {}).get("start_date", ""))
                r_end = r.get("config", {}).get("date2", "")
                
                svc = get_service("combined_shopwise_multi")
                svc_kwargs = {"view": "case"}
                if start_date: svc_kwargs["start_date"] = start_date
                if end_date: svc_kwargs["end_date"] = end_date
                res = svc.get_report(r, **svc_kwargs)
                rows_processed = 0
                rows_skipped = 0
                for row in res.get("data", []):
                    shop_code = str(row.get("shop_code", "")).replace(".0", "").strip()
                    cat = shop_type_lookup.get(shop_code, "ksbc").strip().lower()
                    if cat not in ["bar", "cfd"]:
                        brand = self._clean_brand(row.get("brand", "Unknown"))
                        outward = float(row.get("outward") or 0)
                        bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += outward
                        
                        # Shop level aggregation
                        if shop_code not in shop_achieved_map: shop_achieved_map[shop_code] = {}
                        if brand not in shop_achieved_map[shop_code]: shop_achieved_map[shop_code][brand] = 0
                        shop_achieved_map[shop_code][brand] += outward
                        
                        rows_processed += 1
                    else:
                        rows_skipped += 1
                print(f"[DEBUG] achieved_target: Parsed {rows_processed} matching rows, skipped {rows_skipped} (non KSBC) from {r_type} (dates: {r_start} to {r_end})")

        targets_map = report.get("config", {}).get("targets", {})
        all_bonds = set(bond_staffs.keys()).union(set(achieved_map.keys())).union(set(targets_map.keys()))
        all_brands = set()
        for b in achieved_map.values(): all_brands.update(b.keys())
        for b in targets_map.values(): all_brands.update(b.keys())

        # Discover brands dynamically if empty
        if not all_brands:
            import pandas as pd
            from core.utils import find_column, normalize
            
            # If no brands found from current month data or saved targets, scan all historical data
            # to ensure the user can set targets for any brand at the start of a month.
            reports_for_brand_discovery = valid_reports
            if not reports_for_brand_discovery:
                # If no reports for the current month, scan all historical reports.
                # This is a heavier operation but ensures brands are available for target setting.
                all_historical_reports = []
                if all_reports_store:
                    for r in all_reports_store.values():
                        if r.get("type") in ["daily_warehouse_offtake", "shop_sales_cumulative"]:
                            all_historical_reports.append(r)
                
                if not all_historical_reports: # Fallback to DB if store is empty
                    from services.db import supabase
                    res = supabase.table("reports").select("id, type, config, processed, uploads").in_("type", ["daily_warehouse_offtake", "shop_sales_cumulative"]).execute()
                    if res.data:
                        all_historical_reports.extend(res.data)
                reports_for_brand_discovery = all_historical_reports

            for r in reports_for_brand_discovery:
                if r.get("type") == "shop_sales_cumulative":
                    for u in (r.get("uploads") or []):
                        if u.get("data"):
                            try:
                                df = pd.DataFrame(u["data"])
                                df = normalize(df)
                                b_col = find_column(df, ["brand"]) or find_column(df, ["item"])
                                if b_col and b_col in df.columns:
                                    for b in df[b_col].dropna().unique():
                                        b_str = self._clean_brand(b)
                                        if b_str != "UNKNOWN": all_brands.add(b_str)
                            except Exception: pass
                elif r.get("type") == "daily_warehouse_offtake" and r.get("processed"):
                    for row in (r.get("processed") or []):
                        b = row.get("brand") or row.get("item")
                        if b:
                            b_str = self._clean_brand(b)
                            if b_str != "UNKNOWN": all_brands.add(b_str)

        all_brands = {b for b in all_brands if b and b != "UNKNOWN"}
        
        # Always include the core default brands so they are available for target entry
        default_core_brands = [
            "BCB NO.1 CLASSIC BRANDY",
            "BLENDERS CHOICE NO.1 BRANDY",
            "CHAIRMANS CHOICE XO BRANDY",
            "K.S 99 LIFE TIME MATURED XXX RUM",
            "MAGIC BLEND RESERVED XXX RUM",
            "MORNING WALKERS XO BRANDY",
            "OLD PEARL NO.1 MATURED XXX RUM"
        ]
        for b in default_core_brands:
            all_brands.add(self._clean_brand(b))

        # Safely align saved target brands
        clean_targets_map = {}
        for bnd, bnd_data in targets_map.items():
            clean_targets_map[bnd] = {}
            for brnd, val in bnd_data.items():
                clean_targets_map[bnd][self._clean_brand(brnd)] = val

        # 1. Bond level rows
        results = []
        for bond in sorted(all_bonds):
            row = {
                "bond": bond,
                "staffs": bond_staffs.get(bond, ""),
                "brands": {}
            }
            for brand in sorted(all_brands):
                row["brands"][brand] = {
                    "achieved": round(achieved_map.get(bond, {}).get(brand, 0), 2),
                    "target": clean_targets_map.get(bond, {}).get(brand, 0)
                }
            results.append(row)

        # 2. Load Shop Names for Shop-Level Details
        shop_names = {}
        try:
            with open(os.path.join(base_dir, "shops.json"), "r", encoding="utf-8") as f:
                shops_data = json.load(f)
                for code, details in shops_data.items():
                    shop_names[str(code).replace(".0", "").strip()] = details.get("shop_name", "Unknown Shop")
        except Exception:
            pass

        # 3. Shop level rows
        shop_results = []
        for shop_code, brands_map in shop_achieved_map.items():
            cat = shop_type_lookup.get(shop_code, "ksbc").upper()
            display_cat = "BAR/CFD" if cat in ["BAR", "CFD"] else "KSBC"
            row = {
                "shop_code": shop_code,
                "shop_name": shop_names.get(shop_code, f"Shop {shop_code}"),
                "bond": shop_to_bond.get(shop_code, "UNKNOWN"),
                "category": display_cat,
                "brands": {}
            }
            for brand in sorted(all_brands):
                row["brands"][brand] = {
                    "achieved": round(brands_map.get(brand, 0), 2),
                    "target": 0
                }
            shop_results.append(row)

        return {
            "data": results,
            "shop_data": shop_results,
            "config": report.get("config", {})
        }