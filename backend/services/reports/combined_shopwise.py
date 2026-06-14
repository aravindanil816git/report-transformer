import pandas as pd
from .base import BaseReportService
from .shopwise import ShopwiseReportService
from core.utils import safe_int, find_column, find_dynamic
from core.mapping_utils import get_shop_to_parent_maps, get_filters_from_mapping, get_shop_lookup_and_warehouse_to_bond

class CombinedShopwiseReportService(BaseReportService):
    type_name = "combined_shopwise"

    def __init__(self):
        super().__init__()
        self.shopwise_svc = ShopwiseReportService()
        self.shop_to_bond, self.shop_to_warehouse = get_shop_to_parent_maps()

    def upload(self, report, path, file_name, date=None, **kwargs):
        pass

    def process(self, report):
        return

    def get_report(self, report, shop_code=None, warehouse=None, bond=None, view="case", start_idx=None, end_idx=None, **kwargs):
        from services.store import reports
        source_report = None
        for r in reports.values():
            if r.get("type") == "shop_sales_cumulative":
                source_report = r
                break
                
        # Fallback to Supabase if the server restarted and memory is wiped
        if not source_report:
            from services.db import supabase
            res = supabase.table("reports").select("id, type, data, uploads, config").eq("type", "shop_sales_cumulative").execute()
            if res.data:
                source_report = res.data[0]

        source_data = source_report.get("data") if source_report else None
        if not source_data and source_report:
            # Check uploads for data (combined_shopwise_multi format)
            source_data = []
            for u in source_report.get("uploads", []):
                if u.get("data"):
                    source_data.extend(u["data"])

        if not source_data:
            return {"data": [], "uploads": source_report.get("uploads", []) if source_report else [], "config": report.get("config", {})}

        full_df = pd.DataFrame(source_data)

        brand_col = find_column(full_df, ["brand"]) or find_column(full_df, ["item"])
        pack_col = find_column(full_df, ["pack"]) or find_column(full_df, ["size"])
        shop_col = "shop_code_internal"

        # Data in the cumulative report might not have the standardized column name
        if "shop_code_internal" not in full_df.columns:
            code_col = find_column(full_df, ["shop_code"])
            if code_col:
                full_df["shop_code_internal"] = full_df[code_col].astype(str).str.replace(".0", "", regex=False).str.strip()
            else:
                return {"data": [], "uploads": [], "config": report.get("config", {})}

        # --- Data Enrichment ---
        # Use warehouse from raw data if available, otherwise it's Unknown. Do not use mapping file.
        wh_col = find_column(full_df, ["warehouse"])
        if wh_col:
            full_df["warehouse_info"] = full_df[wh_col].astype(str).str.strip()
        else:
            full_df["warehouse_info"] = "Unknown"
            
        _, warehouse_to_bond = get_shop_lookup_and_warehouse_to_bond()
        full_df["bond_info"] = full_df[shop_col].map(self.shop_to_bond)
        full_df["bond_info"] = full_df["bond_info"].fillna(full_df["warehouse_info"].map(warehouse_to_bond)).fillna("Unknown")

        # --- Filters ---
        if shop_code:
            full_df = full_df[full_df[shop_col] == str(shop_code).strip()]
        if warehouse:
            full_df = full_df[full_df["warehouse_info"] == warehouse]
        if bond:
            full_df = full_df[full_df["bond_info"] == bond]

        if full_df.empty:
            return {"data": [], "uploads": source_report.get("uploads", []), "config": report.get("config", {})}

        # Find columns using the exact names from the debug log
        opening_cases = find_dynamic(full_df, ["shop_opening_cases"])
        opening_bottles = find_dynamic(full_df, ["shop_opening_bottles"])
        in_cases = find_dynamic(full_df, ["shop_in_cases"])
        in_bottles = find_dynamic(full_df, ["shop_in_bottles"])
        out_cases = find_dynamic(full_df, ["shop_out_cases"])
        out_bottles = find_dynamic(full_df, ["shop_out_bottles"])
        closing_cases = find_dynamic(full_df, ["shop_closing_cases"])
        closing_bottles = find_dynamic(full_df, ["shop_closing_bottles"])
        bottles_per_case = find_dynamic(full_df, ["bottle_per_case"])
        
        result = []
        for _, row in full_df.iterrows():
            bpc = safe_int(row.get(bottles_per_case)) if bottles_per_case else 1
            if bpc <= 0: bpc = 1

            if view == "case":
                opening = (safe_int(row.get(opening_cases, 0))) + (safe_int(row.get(opening_bottles, 0)) / bpc)
                inward = (safe_int(row.get(in_cases, 0))) + (safe_int(row.get(in_bottles, 0)) / bpc)
                outward = (safe_int(row.get(out_cases, 0))) + (safe_int(row.get(out_bottles, 0)) / bpc)
                closing = (safe_int(row.get(closing_cases, 0))) + (safe_int(row.get(closing_bottles, 0)) / bpc)
                
                # The closing from the cumulative report might be the correct one to use
                final_closing = closing if closing is not None else opening + inward - outward

                result.append({
                    "shop_code": row[shop_col],
                    "brand": row.get(brand_col),
                    "pack": row.get(pack_col),
                    "opening": round(opening, 4),
                    "inward": round(inward, 4),
                    "outward": round(outward, 4),
                    "closing": round(final_closing, 4),
                })
            else: # bottle view
                opening = (safe_int(row.get(opening_cases, 0)) * bpc) + safe_int(row.get(opening_bottles, 0))
                inward = (safe_int(row.get(in_cases, 0)) * bpc) + safe_int(row.get(in_bottles, 0))
                outward = (safe_int(row.get(out_cases, 0)) * bpc) + safe_int(row.get(out_bottles, 0))
                closing = (safe_int(row.get(closing_cases, 0)) * bpc) + safe_int(row.get(closing_bottles, 0))

                final_closing = closing if closing is not None else opening + inward - outward

                result.append({
                    "shop_code": row[shop_col],
                    "brand": row.get(brand_col),
                    "pack": row.get(pack_col),
                    "opening": opening,
                    "inward": inward,
                    "outward": outward,
                    "closing": final_closing,
                })

        return {"data": result, "uploads": source_report.get("uploads", []), "config": report.get("config", {})}

    def get_filters(self, report):
        from services.store import reports
        
        # Get bonds and shops from mapping as a base
        filters = get_filters_from_mapping()

        # Find the source report to extract warehouses from its data
        source_report = None
        for r in reports.values():
            if r.get("type") == "shop_sales_cumulative":
                source_report = r
                break
                
        # Fallback to Supabase if the server restarted and memory is wiped
        if not source_report:
            from services.db import supabase
            res = supabase.table("reports").select("id, type, data").eq("type", "shop_sales_cumulative").execute()
            if res.data:
                source_report = res.data[0]

        # Override warehouses with data from the source report
        if source_report:
            source_data = source_report.get("data")
            if not source_data:
                source_data = []
                for u in source_report.get("uploads", []):
                    if u.get("data"):
                        source_data.extend(u["data"])
            
            if source_data:
                full_df = pd.DataFrame(source_data)
                wh_col = find_column(full_df, ["warehouse"])
                if wh_col:
                    warehouses = sorted(full_df[wh_col].dropna().unique().tolist())
                    filters["warehouses"] = warehouses
                
        return filters
