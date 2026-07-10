import os
import json
import calendar
from datetime import datetime
from .base import BaseReportService

class MonthlySummaryReportService(BaseReportService):
    type_name = "monthly_summary"

    def process(self, report):
        all_reports = report.pop("all_reports", [])
        config = report.get("config", {})
        report["processed"] = self._compute_summary(config, all_reports)

    def get_report(self, report, **kwargs):
        start_date = kwargs.get("start_date")
        end_date = kwargs.get("end_date")
        start_date2 = kwargs.get("start_date2")
        end_date2 = kwargs.get("end_date2")
        
        if start_date or end_date or start_date2 or end_date2:
            from services.db import supabase
            dependency_types = ["daily_warehouse_offtake", "shop_sales_cumulative", "combined_shopwise", "cumulative_shopwise"]
            res = supabase.table("reports").select("id, name, type, status, config, uploads, created_at, path, file, storage_path, processed").in_("type", dependency_types).execute()
            all_reports = res.data or []
            return self._compute_summary(report.get("config", {}), all_reports, start_date, end_date, start_date2, end_date2)
            
        return report.get("processed", {"data": [], "meta": {}})

    def _compute_summary(self, config, all_reports, start_date=None, end_date=None, start_date2=None, end_date2=None):
        target_month_str = config.get("month")
        
        if not target_month_str:
            return {"data": [], "meta": {}}
            
        # Calculate Current and Previous Months
        target_month = datetime.strptime(target_month_str, "%Y-%m")
        if target_month.month == 1:
            prev_month = target_month.replace(year=target_month.year - 1, month=12)
        else:
            prev_month = target_month.replace(month=target_month.month - 1)
            
        prev_month_str = prev_month.strftime("%Y-%m")
        
        # --- Config & Mapping Lookups ---
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        
        # 1. Leaves (Calculate net days)
        leaves = {}
        leaves_path = os.path.join(base_dir, "leaves.json")
        if os.path.exists(leaves_path):
            try:
                with open(leaves_path, "r") as f:
                    leaves = json.load(f)
            except Exception: pass
            
        wh_leaves = leaves.get("warehouse", [])
        sh_leaves = leaves.get("shop", [])
        
        # Calculate leave counts and total calendar days
        if start_date and end_date:
            curr_wh_leave = len([d for d in wh_leaves if start_date <= str(d) <= end_date])
            curr_sh_leave = len([d for d in sh_leaves if start_date <= str(d) <= end_date])
            curr_dim = (datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")).days + 1
        else:
            curr_wh_leave = len([d for d in wh_leaves if str(d).startswith(target_month_str)])
            curr_sh_leave = len([d for d in sh_leaves if str(d).startswith(target_month_str)])
            _, curr_dim = calendar.monthrange(target_month.year, target_month.month)
            
        if start_date2 and end_date2:
            prev_wh_leave = len([d for d in wh_leaves if start_date2 <= str(d) <= end_date2])
            prev_sh_leave = len([d for d in sh_leaves if start_date2 <= str(d) <= end_date2])
            prev_dim = (datetime.strptime(end_date2, "%Y-%m-%d") - datetime.strptime(start_date2, "%Y-%m-%d")).days + 1
        else:
            prev_wh_leave = len([d for d in wh_leaves if str(d).startswith(prev_month_str)])
            prev_sh_leave = len([d for d in sh_leaves if str(d).startswith(prev_month_str)])
            _, prev_dim = calendar.monthrange(prev_month.year, prev_month.month)
            
        curr_net_wh_days = max(0, curr_dim - curr_wh_leave)
        prev_net_wh_days = max(0, prev_dim - prev_wh_leave)
        
        curr_net_sh_days = max(0, curr_dim - curr_sh_leave)
        prev_net_sh_days = max(0, prev_dim - prev_sh_leave)
        
        # 2. Shop Categories (CFD / BAR / KSBC)
        shop_categories = {}
        try:
            with open(os.path.join(base_dir, "shopcode_mapping.json"), "r", encoding="utf-8") as f:
                scm = json.load(f)
                for region, shops in scm.items():
                    for s in shops:
                        code = str(s.get("shop_code", "")).replace(".0", "").strip()
                        cat = str(s.get("category", "")).strip().upper()
                        if code:
                            shop_categories[code] = cat
        except Exception:
            pass

        # 3. Bond Mapping (shop_code -> bond)
        shop_to_bond = {}
        try:
            with open(os.path.join(base_dir, "bond_mapping.json"), "r", encoding="utf-8") as f:
                mapping = json.load(f)
                for bnd, data in mapping.items():
                    for s in data.get("shops", []):
                        scode = str(s.get("shop_code", s)) if isinstance(s, dict) else str(s)
                        scode = scode.replace(".0", "").strip()
                        if scode:
                            shop_to_bond[scode] = bnd
        except Exception:
            pass
        
        # 4. Cluster Mapping (bond -> cluster)
        bond_to_cluster = {}
        try:
            with open(os.path.join(base_dir, "clusters.json"), "r", encoding="utf-8") as f:
                clusters_data = json.load(f)
                for c_name, c_bonds in clusters_data.items():
                    for b in c_bonds:
                        bond_to_cluster[str(b).upper().strip()] = c_name
        except Exception:
            pass

        # --- Data Collection Logic ---
        # Deduplicate reports dynamically
        offtake_by_date = {}
        shop_sales_by_range = {}
        
        for r in all_reports:
            r_type = r.get("type")
            status = r.get("status")
            if status not in ["Processed", "Ready", "Uploaded"]: continue
            
            if r_type == "daily_warehouse_offtake":
                r_date = str(r.get("config", {}).get("date", ""))
                if start_date and end_date:
                    if start_date <= r_date <= end_date:
                        offtake_by_date[r_date] = ("curr", r)
                else:
                    if r_date.startswith(target_month_str):
                        offtake_by_date[r_date] = ("curr", r)
                        
                if start_date2 and end_date2:
                    if start_date2 <= r_date <= end_date2:
                        offtake_by_date[r_date] = ("prev", r)
                else:
                    if r_date.startswith(prev_month_str):
                        offtake_by_date[r_date] = ("prev", r)
                
            elif r_type in ["shop_sales_cumulative", "combined_shopwise", "cumulative_shopwise"]:
                r_start = str(r.get("config", {}).get("date1", r.get("config", {}).get("start_date", "")))
                r_end = str(r.get("config", {}).get("date2", ""))
                
                period = None
                if start_date and end_date:
                    if start_date <= r_start <= end_date:
                        period = "curr"
                else:
                    if r_start.startswith(target_month_str):
                        period = "curr"
                        
                if start_date2 and end_date2:
                    if start_date2 <= r_start <= end_date2:
                        period = "prev"
                else:
                    if r_start.startswith(prev_month_str):
                        period = "prev"
                
                if period:
                    range_key = f"{period}_{r_start}_{r_end}"
                    existing = shop_sales_by_range.get(range_key)
                    if not existing or len(r.get("uploads", [])) > len(existing[1].get("uploads", [])):
                        shop_sales_by_range[range_key] = (period, r)
        
        # --- Print Condensed Debug Logs of Files Used ---
        print("\n=== [DEBUG] Monthly Summary Data Sources ===")
        
        curr_liq_files = [f"{v[1].get('file') or v[1].get('name')} ({v[1].get('config', {}).get('date1') or v[1].get('config', {}).get('start_date')} to {v[1].get('config', {}).get('date2') or v[1].get('config', {}).get('end_date')})" 
                           for k, v in shop_sales_by_range.items() if v[0] == "curr"]
        prev_liq_files = [f"{v[1].get('file') or v[1].get('name')} ({v[1].get('config', {}).get('date1') or v[1].get('config', {}).get('start_date')} to {v[1].get('config', {}).get('date2') or v[1].get('config', {}).get('end_date')})" 
                           for k, v in shop_sales_by_range.items() if v[0] == "prev"]
        
        print(f"Shop Liquidation Month 1 (Current): {', '.join(curr_liq_files) if curr_liq_files else 'None'}")
        print(f"Shop Liquidation Month 2 (Previous): {', '.join(prev_liq_files) if prev_liq_files else 'None'}")
        
        curr_offtake_dates = sorted([str(v[1].get('config', {}).get('date', '')) for k, v in offtake_by_date.items() if v[0] == "curr"])
        prev_offtake_dates = sorted([str(v[1].get('config', {}).get('date', '')) for k, v in offtake_by_date.items() if v[0] == "prev"])
        
        if curr_offtake_dates:
            print(f"Secondary Sales Month 1 (Current): {len(curr_offtake_dates)} daily files spanning {curr_offtake_dates[0]} to {curr_offtake_dates[-1]}")
        else:
            print("Secondary Sales Month 1 (Current): None")
            
        if prev_offtake_dates:
            print(f"Secondary Sales Month 2 (Previous): {len(prev_offtake_dates)} daily files spanning {prev_offtake_dates[0]} to {prev_offtake_dates[-1]}")
        else:
            print("Secondary Sales Month 2 (Previous): None")
            
        print("============================================\n")

        def get_default_metrics():
            return {
                "curr": {"shop_liq": 0, "sec_sales": 0, "fed_bar": 0, "total": 0},
                "prev": {"shop_liq": 0, "sec_sales": 0, "fed_bar": 0, "total": 0}
            }
            
        bond_data = {}

        # Parse Combined Shopwise (For Shop Liquidation)
        from services.registry import get_service
        combined_svc = get_service("combined_shopwise_multi")
        if combined_svc:
            for range_key, (period, r) in shop_sales_by_range.items():
                try:
                    svc_kwargs = {"view": "case"}
                    if period == "curr" and start_date and end_date:
                        svc_kwargs["start_date"] = start_date
                        svc_kwargs["end_date"] = end_date
                    elif period == "prev" and start_date2 and end_date2:
                        svc_kwargs["start_date"] = start_date2
                        svc_kwargs["end_date"] = end_date2
                        
                    res = combined_svc.get_report(r, **svc_kwargs)
                    for row in res.get("data", []):
                        sc = str(row.get("shop_code", "")).replace(".0", "").strip()
                        if not sc or sc.lower() == "nan": continue
                        
                        outward = float(row.get("outward", 0) or 0)
                        bond = shop_to_bond.get(sc, "UNKNOWN")
                        
                        if bond not in bond_data: bond_data[bond] = get_default_metrics()
                        bond_data[bond][period]["shop_liq"] += outward
                except Exception as e:
                    print(f"[ERROR] monthly_summary shop_liq: {e}")

        # Parse Secondary Sales & FED/BAR from daily_warehouse_offtake (Shop Level)
        for r_date, (period, r) in offtake_by_date.items():
            for row in (r.get("processed") or []):
                sc = str(row.get("shop_code", "")).replace(".0", "").strip()
                if not sc or sc.lower() == "nan": continue
                
                issues = float(row.get("issues", 0) or 0)
                bond = shop_to_bond.get(sc, "UNKNOWN")
                cat = shop_categories.get(sc, "KSBC").upper()
                
                if bond not in bond_data: bond_data[bond] = get_default_metrics()
                bond_data[bond][period]["sec_sales"] += issues
                
                if cat in ["CFD", "BAR"]:
                    bond_data[bond][period]["fed_bar"] += issues
                            
        # --- Calculate Totals & Variances ---
        results = []
        for bond, metrics in bond_data.items():
            c = metrics["curr"]
            p = metrics["prev"]
            
            c["total"] = c["shop_liq"] + c["fed_bar"]
            p["total"] = p["shop_liq"] + p["fed_bar"]
            
            # Build flattened row dynamically for frontend ease
            row_out = {
                "bond": bond,
                "cluster": bond_to_cluster.get(str(bond).upper().strip(), "UNMAPPED CLUSTER"),
            }
            
            for metric in ["shop_liq", "sec_sales", "fed_bar", "total"]:
                row_out[f"curr_{metric}"] = round(c[metric], 2)
                row_out[f"prev_{metric}"] = round(p[metric], 2)
                row_out[f"var_{metric}"] = round(c[metric] - p[metric], 2)
                row_out[f"pct_{metric}"] = round(((c[metric] - p[metric]) / p[metric]) * 100, 1) if p[metric] else 0
                
            results.append(row_out)
            
        return {
            "data": sorted(results, key=lambda x: (x.get("cluster", "UNMAPPED CLUSTER"), x["bond"])),
            "meta": {
                "curr_month": target_month_str,
                "prev_month": prev_month_str,
                "curr_wh_days": curr_net_wh_days,
                "prev_wh_days": prev_net_wh_days,
                "curr_sh_days": curr_net_sh_days,
                "prev_sh_days": prev_net_sh_days,
                "curr_start_date": start_date,
                "curr_end_date": end_date,
                "prev_start_date": start_date2,
                "prev_end_date": end_date2
            }
        }