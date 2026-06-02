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

        reports_list = list(all_reports_store.values())
        
        # Fallback to Supabase if the server restarted and memory is wiped
        if not reports_list:
            from services.db import supabase
            res = supabase.table("reports").select("id, type, config, uploads, processed, data").execute()
            if res.data:
                reports_list = res.data

        month = report.get("config", {}).get("month", "")
        if not month:
            return {"data": [], "config": report.get("config", {})}
            
        start_date = kwargs.get("start_date")
        end_date = kwargs.get("end_date")
        
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        shop_to_bond = {}
        shop_type_lookup = {}
        bond_staffs = {}

        # 1. Load Shops Master for Category (CFD / BAR)
        try:
            with open(os.path.join(base_dir, "shops.json"), "r", encoding="utf-8") as f:
                shops_master = json.load(f)
                for code, data in shops_master.items():
                    shop_type_lookup[str(code)] = str(data.get("category", "")).strip().lower()
        except Exception as e:
            print(f"Error loading shops.json: {e}")

        # 2. Load Bond Mapping for relations
        try:
            with open(os.path.join(base_dir, "bond_mapping.json"), "r", encoding="utf-8") as f:
                mapping = json.load(f)
                for bnd, data in mapping.items():
                    bond_staffs[bnd] = data.get("staffs", "")
                    for s in data.get("shops", []):
                        scode = str(s.get("shop_code", s)) if isinstance(s, dict) else str(s)
                        shop_to_bond[scode] = bnd
        except Exception as e:
            print(f"Error loading bond_mapping.json: {e}")

        achieved_map = {}

        # Dynamic Aggregation across all loaded reports
        for r in reports_list:
            r_type = r.get("type")
            
            if r_type == "daily_secondary_sales":
                r_date = r.get("config", {}).get("date", "")
                if str(r_date)[:7] != month: continue
                if start_date and end_date and not (start_date <= str(r_date) <= end_date): continue
                
                for row in (r.get("processed") or []):
                    shop_code = str(row.get("shop_code", row.get("shop", "")))
                    if shop_type_lookup.get(shop_code, "") in ["bar", "cfd"]:
                        brand = self._clean_brand(row.get("brand", "Unknown"))
                        cases = float(row.get("cases") or row.get("sales") or row.get("outward") or 0)
                        bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += cases

            elif r_type == "daily_warehouse_offtake":
                r_date = r.get("config", {}).get("date", "")
                if str(r_date)[:7] != month: continue
                if start_date and end_date and not (start_date <= str(r_date) <= end_date): continue
                
                for row in (r.get("processed") or []):
                    shop_code = str(row.get("shop_code", ""))
                    if shop_type_lookup.get(shop_code, "") in ["bar", "cfd"]:
                        brand = self._clean_brand(row.get("brand", "Unknown"))
                        issues = float(row.get("issues", 0))
                        bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += issues
                        
            elif r_type in ["combined_shopwise", "combined_shopwise_multi", "shop_sales_cumulative"]:
                r_start = r.get("config", {}).get("date1", r.get("config", {}).get("start_date", ""))
                r_end = r.get("config", {}).get("date2", "")
                if str(r_start)[:7] != month: continue
                
                # Skip cumulative reports if they contain data outside the selected filter boundary
                if start_date and end_date and r_start and r_end:
                    if not (start_date <= r_start and r_end <= end_date):
                        continue
                
                svc = get_service("combined_shopwise")
                res = svc.get_report(r, view="case")
                for row in res.get("data", []):
                    shop_code = str(row.get("shop_code", ""))
                    if shop_type_lookup.get(shop_code, "") in ["bar", "cfd"]:
                        brand = self._clean_brand(row.get("brand", "Unknown"))
                        outward = float(row.get("outward") or 0)
                        bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += outward

        targets_map = report.get("config", {}).get("targets", {})
        all_bonds = set(bond_staffs.keys()).union(set(achieved_map.keys())).union(set(targets_map.keys()))
        all_brands = set()
        for b in achieved_map.values(): all_brands.update(b.keys())
        for b in targets_map.values(): all_brands.update(b.keys())

        # Discover brands dynamically if empty
        if not all_brands:
            import pandas as pd
            from core.utils import find_column, normalize
            
            for r in reports_list:
                if r.get("type") in ["combined_shopwise", "combined_shopwise_multi", "shop_sales_cumulative"]:
                    for u in (r.get("uploads") or []):
                        if u.get("data"):
                            try:
                                df = pd.DataFrame(u["data"])
                                df = normalize(df)
                                b_col = find_column(df, ["brand"]) or find_column(df, ["item"])
                                if b_col:
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
        
        # Safely align saved target brands
        clean_targets_map = {}
        for bnd, bnd_data in targets_map.items():
            clean_targets_map[bnd] = {}
            for brnd, val in bnd_data.items():
                clean_targets_map[bnd][self._clean_brand(brnd)] = val

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

        return {
            "data": results,
            "config": report.get("config", {})
        }