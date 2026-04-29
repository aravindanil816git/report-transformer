import pandas as pd
from .base import BaseReportService
from .shopwise import ShopwiseReportService
from .cumulative_warehouse import SHOP_LOOKUP
from core.utils import safe_int, find_column, find_dynamic

class CombinedShopwiseReportService(BaseReportService):
    type_name = "combined_shopwise"

    def __init__(self):
        super().__init__()
        self.shopwise_svc = ShopwiseReportService()

    def upload(self, report, path, file_name, date=None, **kwargs):
        # Similar to other cumulative reports, we might not upload directly here
        # but rather sync from daily shopwise reports.
        pass

    def process(self, report):
        # Process is called after all data is synced
        return

    def get_report(self, report, shop_code=None, warehouse=None, bond=None, view="case", start_idx=None, end_idx=None, **kwargs):
        uploads = report.get("uploads", [])
        # Filter for uploaded ones and sort by date
        valid_uploads = [u for u in uploads if u.get("status") == "uploaded" and u.get("data")]
        if not valid_uploads:
            return {"data": [], "uploads": uploads}

        valid_uploads.sort(key=lambda x: x["date"])

        # Apply date range filtering if indices provided
        if start_idx is not None and end_idx is not None:
            # Note: valid_uploads is already sorted by date
            valid_uploads = valid_uploads[max(0, start_idx):min(len(valid_uploads), end_idx + 1)]

        if not valid_uploads:
             return {"data": [], "uploads": uploads}
        
        # Aggregate across all dates
        # Logic: 
        # Opening = Opening of first available date
        # Closing = Closing of last available date
        # Inward = Sum of Inward across all dates
        # Outward = Sum of Outward across all dates

        combined_data = []
        for u in valid_uploads:
            df = pd.DataFrame(u["data"])
            # Use ShopwiseReportService's detection logic
            code_col, _ = self.shopwise_svc._detect_shop_cols(df)
            if not code_col: continue

            # Standardize
            df["shop_code_internal"] = df[code_col].astype(str).str.replace(".0", "", regex=False).str.strip()
            df["date_internal"] = u["date"]
            combined_data.append(df)

        if not combined_data:
            return {"data": [], "uploads": uploads}

        full_df = pd.concat(combined_data, ignore_index=True)
        
        # Identify necessary columns
        brand_col = find_column(full_df, ["brand"])
        pack_col = find_column(full_df, ["pack"])
        shop_col = "shop_code_internal"

        # Filters
        if shop_code:
            full_df = full_df[full_df[shop_col] == str(shop_code).strip()]
        
        # Add warehouse/bond info if missing
        if "warehouse_info" not in full_df.columns:
             full_df["warehouse_info"] = full_df[shop_col].apply(lambda x: SHOP_LOOKUP.get(x, {}).get("warehouse"))
        if "bond_info" not in full_df.columns:
             full_df["bond_info"] = full_df[shop_col].apply(lambda x: SHOP_LOOKUP.get(x, {}).get("bond"))

        if warehouse:
            full_df = full_df[full_df["warehouse_info"] == warehouse]
        if bond:
            full_df = full_df[full_df["bond_info"] == bond]

        if full_df.empty:
            return {"data": [], "uploads": uploads}

        # Find columns
        opening_cases = find_dynamic(full_df, ["opening", "case"], exclude=["info"])
        opening_bottles = find_dynamic(full_df, ["opening", "bottle"], exclude=["info"])
        in_cases = (
            find_dynamic(full_df, ["receipt", "case"], exclude=["info"]) or 
            find_dynamic(full_df, ["shop", "in", "case"], exclude=["info"]) or
            find_dynamic(full_df, ["inward", "case"], exclude=["info"]) or
            find_dynamic(full_df, ["in", "case"], exclude=["info"])
        )
        in_bottles = (
            find_dynamic(full_df, ["receipt", "bottle"], exclude=["info"]) or 
            find_dynamic(full_df, ["shop", "in", "bottle"], exclude=["info"]) or
            find_dynamic(full_df, ["inward", "bottle"], exclude=["info"]) or
            find_dynamic(full_df, ["in", "bottle"], exclude=["info"])
        )
        out_cases = (
            find_dynamic(full_df, ["sales", "case"], exclude=["info"]) or 
            find_dynamic(full_df, ["shop", "out", "case"], exclude=["info"]) or
            find_dynamic(full_df, ["outward", "case"], exclude=["info"]) or
            find_dynamic(full_df, ["out", "case"], exclude=["info"])
        )
        out_bottles = (
            find_dynamic(full_df, ["sales", "bottle"], exclude=["info"]) or 
            find_dynamic(full_df, ["shop", "out", "bottle"], exclude=["info"]) or
            find_dynamic(full_df, ["outward", "bottle"], exclude=["info"]) or
            find_dynamic(full_df, ["out", "bottle"], exclude=["info"])
        )
        closing_cases = find_dynamic(full_df, ["closing", "case"], exclude=["info"])
        closing_bottles = find_dynamic(full_df, ["closing", "bottle"], exclude=["info"])
        bottles_per_case = find_dynamic(full_df, ["bottle", "per", "case"], exclude=["info"]) or find_dynamic(full_df, ["bottles_per_case"], exclude=["info"])

        # Group by shop, brand, pack
        grouped = full_df.groupby([shop_col, brand_col, pack_col])
        result = []

        for (s_code, brand, pack), g in grouped:
            g = g.sort_values("date_internal")
            bpc = safe_int(g[bottles_per_case].iloc[0]) if bottles_per_case else 1
            if bpc <= 0: bpc = 1

            # Cumulative values
            # Opening: from first date
            first_row = g.iloc[0]
            # Closing: from last date
            last_row = g.iloc[-1]
            
            # Sum for inward and outward
            total_in_cases = g[in_cases].sum() if in_cases else 0
            total_in_bottles = g[in_bottles].sum() if in_bottles else 0
            total_out_cases = g[out_cases].sum() if out_cases else 0
            total_out_bottles = g[out_bottles].sum() if out_bottles else 0

            s_code_str = str(s_code).replace(".0", "").strip()

            if view == "case":
                opening = safe_int(first_row.get(opening_cases, 0)) + (safe_int(first_row.get(opening_bottles, 0)) / bpc)
                inward = safe_int(total_in_cases) + (safe_int(total_in_bottles) / bpc)
                outward = safe_int(total_out_cases) + (safe_int(total_out_bottles) / bpc)
                closing = safe_int(last_row.get(closing_cases, 0)) + (safe_int(last_row.get(closing_bottles, 0)) / bpc)

                result.append({
                    "shop_code": s_code_str,
                    "brand": brand,
                    "pack": f"{pack}",
                    "opening": round(opening, 4),
                    "inward": round(inward, 4),
                    "outward": round(outward, 4),
                    "closing": round(closing, 4),
                })
            else:
                opening = safe_int(first_row.get(opening_cases, 0)) * bpc + safe_int(first_row.get(opening_bottles, 0))
                inward = safe_int(total_in_cases) * bpc + safe_int(total_in_bottles)
                outward = safe_int(total_out_cases) * bpc + safe_int(total_out_bottles)
                closing = safe_int(last_row.get(closing_cases, 0)) * bpc + safe_int(last_row.get(closing_bottles, 0))

                result.append({
                    "shop_code": s_code_str,
                    "brand": brand,
                    "pack": f"{pack}",
                    "opening": opening,
                    "inward": inward,
                    "outward": outward,
                    "closing": closing,
                })

        return {"data": result, "uploads": uploads}

    def get_filters(self, report):
        # We can reuse the filter logic from ShopwiseReportService but we need to combine data first
        uploads = report.get("uploads", [])
        valid_uploads = [u for u in uploads if u.get("status") == "uploaded" and u.get("data")]
        if not valid_uploads:
            return {"shops": [], "warehouses": [], "bonds": [], "mapping": {}}
        
        # Just use the first one for filters to avoid heavy processing, 
        # or better yet, use the same logic as shopwise.py but on a sample
        df = pd.DataFrame(valid_uploads[0]["data"])
        return self.shopwise_svc.get_filters({"data": df.to_dict("records")})
