import os
import json
from .base import BaseReportService

class AchievedTargetReportService(BaseReportService):
    type_name = "achieved_target"

    def process(self, report):
        from services.registry import get_service
        
        month = report.get("config", {}).get("month", "")
        if not month:
            report["processed"] = {}
            return

        all_reports = report.get("all_reports", [])
        
        # Load mappings to get bonds and identify "bar" / "cfd" shops
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        shop_to_bond = {}
        shop_type_lookup = {}
        try:
            with open(os.path.join(base_dir, "shopcode_mapping.json"), "r", encoding="utf-8") as f:
                mapping = json.load(f)
                for bnd, shops in mapping.items():
                    for s in shops:
                        code = str(s.get("shop_code", "")).strip()
                        shop_to_bond[code] = bnd
                        shop_type_lookup[code] = str(s.get("type", "")).strip().lower()
                        shop_type_lookup[code] = str(s.get("category", "")).strip().lower()
        except Exception as e:
            print(f"Error loading shopcode_mapping.json: {e}")

        achieved_map = {}

        # 1. Cumulative Shopwise Achieved (via combined_shopwise)
        # 1. Cumulative Shop Sales Achieved (BAR & CFD only)
        for r in all_reports:
            if r["type"] == "combined_shopwise":
                r_month = str(r.get("config", {}).get("date1", r.get("config", {}).get("start_date", "")))[:7]
                if r_month == month:
                    svc = get_service("combined_shopwise")
                    res = svc.get_report(r, view="case")
                    for row in res.get("data", []):
                        shop_code = str(row.get("shop_code", ""))
                        
                        # Only include category "bar" or "cfd"
                        shop_type = shop_type_lookup.get(shop_code, "")
                        if shop_type not in ["bar", "cfd"]:
                            continue
                            
                        brand = row.get("brand", "Unknown")
                        outward_val = row.get("outward") or 0
                        outward = float(outward_val)
                        
                        bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += outward

        # 2. Secondary Sales Achieved (type bar and cfd)
        for r in all_reports:
            if r["type"] == "daily_secondary_sales":
                r_month = str(r.get("config", {}).get("date", ""))[:7]
                if r_month == month:
                    for row in r.get("processed", []):
                        shop_code = str(row.get("shop_code", row.get("shop", "")))
                        shop_type = shop_type_lookup.get(shop_code, "")
                        
                        # Only include type "bar" or "cfd"
                        if shop_type in ["bar", "cfd"]:
                            brand = row.get("brand", "Unknown")
                            cases_val = row.get("cases") or row.get("sales") or row.get("outward") or 0
                            cases = float(cases_val)
                            
                            bond = shop_to_bond.get(shop_code, "UNKNOWN")
                            if bond not in achieved_map: achieved_map[bond] = {}
                            if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                            achieved_map[bond][brand] += cases

        # 2. Cumulative Secondary Sales Achieved (BAR & CFD only)
        for r in all_reports:
            if r["type"] == "daily_warehouse_offtake":
                r_month = str(r.get("config", {}).get("date", ""))[:7]
                if r_month == month:
                    for row in r.get("processed", []):
                        shop_code = str(row.get("shop_code", ""))
                        
                        # Only include category "bar" or "cfd"
                        shop_type = shop_type_lookup.get(shop_code, "")
                        if shop_type not in ["bar", "cfd"]:
                            continue
                            
                        brand = row.get("brand", "Unknown")
                        issues = float(row.get("issues", 0))
                        
                        bond = shop_to_bond.get(shop_code, "UNKNOWN")
                        if bond not in achieved_map: achieved_map[bond] = {}
                        if brand not in achieved_map[bond]: achieved_map[bond][brand] = 0
                        achieved_map[bond][brand] += issues

        report["processed"] = achieved_map

    def get_report(self, report, **kwargs):
        achieved_map = report.get("processed", {})
        targets_map = report.get("config", {}).get("targets", {})

        # Load bond staffs
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        bond_staffs = {}
        all_bonds_master = set()
        try:
            with open(os.path.join(base_dir, "bond_mapping.json"), "r", encoding="utf-8") as f:
                mapping = json.load(f)
                for bnd, data in mapping.items():
                    bond_staffs[bnd] = data.get("staffs", "")
                    all_bonds_master.add(bnd)
        except Exception as e:
            print(f"Error loading bond_mapping.json: {e}")

        all_bonds = all_bonds_master.union(set(achieved_map.keys())).union(set(targets_map.keys()))
        all_brands = set()
        for b in achieved_map.values(): all_brands.update(b.keys())
        for b in targets_map.values(): all_brands.update(b.keys())

        # Gather brands from the whole system to display columns if current month is empty
        if not all_brands:
            from services.store import reports as all_reports_store
            import pandas as pd
            from core.utils import find_column, normalize
            
            for r in all_reports_store.values():
                if r.get("type") in ["combined_shopwise", "combined_shopwise_multi", "shop_sales_cumulative"]:
                    for u in r.get("uploads", []):
                        if u.get("data"):
                            try:
                                df = pd.DataFrame(u["data"])
                                df = normalize(df)
                                b_col = find_column(df, ["brand"]) or find_column(df, ["item"])
                                if b_col:
                                    for b in df[b_col].dropna().unique():
                                        b_str = str(b).strip()
                                        if b_str and b_str != "nan" and b_str != "Unknown":
                                            all_brands.add(b_str)
                            except Exception:
                                pass
                elif r.get("type") == "daily_warehouse_offtake" and r.get("processed"):
                    for row in r.get("processed", []):
                        b = row.get("brand") or row.get("item")
                        if b and str(b).strip() != "nan" and str(b).strip() != "Unknown": 
                            all_brands.add(str(b).strip())

        all_brands = {b for b in all_brands if b and str(b).strip() != "Unknown"}

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
                    "target": targets_map.get(bond, {}).get(brand, 0)
                }
            results.append(row)

        return {
            "data": results,
            "config": report.get("config", {})
        }