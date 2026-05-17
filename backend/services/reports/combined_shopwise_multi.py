# pandas is required for data handling; import lazily to avoid import errors if unavailable
try:
    import pandas as pd
except ImportError:
    pd = None
import re
from .base import BaseReportService
from .shopwise import ShopwiseReportService
from core.utils import safe_int, find_column, find_dynamic, normalize, clean_df, read_excel_robust
from core.mapping_utils import get_shop_to_parent_maps, get_filters_from_mapping


class CombinedShopwiseMultiReportService(BaseReportService):
    """Service to handle two (or more) shopwise uploads per month.

    Categorizes the file into the first set ("1-16") or the second set ("17-31")
    based on the report's date configuration or the file name. Overwrites any 
    existing file for that set so that the latest upload is always used.
    """

    type_name = "combined_shopwise_multi"

    def __init__(self):
        super().__init__()
        self.shopwise_svc = ShopwiseReportService()
        self.shop_to_bond, self.shop_to_warehouse = get_shop_to_parent_maps()

    # ---------------------------------------------------------------------
    # Upload handling
    # ---------------------------------------------------------------------
    def upload(self, report, path, file_name, date=None, **kwargs):
        """Read an Excel file and store it in ``report['uploads']``.

        The caller may provide a ``date`` argument or a ``range_key`` in
        ``kwargs``. If neither is supplied we fall back to inferring the range
        from the file name (looking for "1-16" or "17-30"). The DataFrame is
        stored under that key, overwriting any existing entry.
        """
        # Load the Excel file
        df = read_excel_robust(path)
        df = clean_df(normalize(df))

        # Determine the key for this upload
        key = None
        
        # 1. Use the report's config date to categorize into sets
        config_date = report.get("config", {}).get("date1")
        if config_date:
            try:
                day = int(pd.to_datetime(config_date).day)
                key = "1-16" if day <= 16 else "17-31"
            except Exception:
                pass
                
        # 2. Fallback to parsing filename
        if not key:
            lowered = file_name.lower()
            if re.search(r"\b1\s*(?:-|to|–|—|_)\s*1[562]\b", lowered) or "1-16" in lowered or "1-15" in lowered or "1-12" in lowered:
                key = "1-16"
            elif re.search(r"\b1[67]\s*(?:-|to|–|—|_)\s*3[01]\b", lowered) or "17-30" in lowered or "17-31" in lowered or "16-30" in lowered or "16-31" in lowered:
                key = "17-31"
            else:
                key = "1-16" # Default to first set

        # Ensure the uploads list exists
        report.setdefault("uploads", [])
        
        # Find existing entry for this date key (or range key) and replace it.
        # This ensures the latest upload for a set (e.g. 1-16) overwrites older ones (like 1-12).
        updated = False
        for u in report["uploads"]:
            if u.get("date") == key or u.get("range_key") == key:
                u["date"] = key
                u["range_key"] = key
                u["file"] = file_name
                u["path"] = path
                u["status"] = "uploaded"
                u["data"] = df.replace({pd.NA: None}).astype(object).where(pd.notnull(df), None).to_dict("records")
                updated = True
                break
        if not updated:
            # Append a new upload entry
            report["uploads"].append({
                "date": key,
                "range_key": key,
                "file": file_name,
                "path": path,
                "status": "uploaded",
                "data": df.replace({pd.NA: None}).astype(object).where(pd.notnull(df), None).to_dict("records")
            })
        return report

    # ---------------------------------------------------------------------
    # Processing logic
    # ---------------------------------------------------------------------
    def process(self, report):
        """No pre-processing needed as aggregation happens dynamically in get_report."""
        pass

    # ---------------------------------------------------------------------
    # API exposure
    # ---------------------------------------------------------------------
    def get_report(self, report, shop_code=None, warehouse=None, bond=None, view="case", start_idx=None, end_idx=None, **kwargs):
        uploads = report.get("uploads", [])
        
        # Build DataFrames from each upload entry
        dfs = []
        for u in uploads:
            data = u.get("data")
            if isinstance(data, list) and data:
                df = pd.DataFrame(data)
                if not df.empty:
                    df['range_key'] = u.get("date", "default")
                    dfs.append(df)

        if not dfs:
            return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}

        full_df = pd.concat(dfs, ignore_index=True)
        # Normalize in case data was uploaded before the robust upload method was added
        full_df = normalize(full_df)

        brand_col = find_column(full_df, ["brand"])
        pack_col = find_column(full_df, ["pack"])
        shop_col = "shop_code_internal"

        if not brand_col or brand_col not in full_df.columns:
            brand_col = "brand"
            full_df[brand_col] = "Unknown"
        if not pack_col or pack_col not in full_df.columns:
            pack_col = "pack"
            full_df[pack_col] = "Unknown"

        if shop_col not in full_df.columns:
            code_col = find_column(full_df, ["shop", "code"]) or find_column(full_df, ["license"])
            if code_col:
                full_df[shop_col] = (
                    full_df[code_col]
                    .astype(str)
                    .str.replace(".0", "", regex=False)
                    .str.strip()
                )
            else:
                return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}

        full_df = full_df[full_df[shop_col].notna() & (full_df[shop_col] != "nan") & (full_df[shop_col] != "")]

        print(f"[DEBUG] combined_shopwise_multi: Rows for 104012 before filtering: {len(full_df[full_df[shop_col] == '104012'])}")

        # Enrichment
        full_df["bond_info"] = full_df[shop_col].map(self.shop_to_bond).fillna("Unknown")
        full_df["warehouse_info"] = full_df[shop_col].map(self.shop_to_warehouse).fillna("Unknown")

        # Filtering
        if shop_code:
            full_df = full_df[full_df[shop_col] == str(shop_code).strip()]
        if warehouse:
            full_df = full_df[full_df["warehouse_info"] == warehouse]
        if bond:
            full_df = full_df[full_df["bond_info"] == bond]
            
        print(f"[DEBUG] combined_shopwise_multi: Rows for 104012 after filtering: {len(full_df[full_df[shop_col] == '104012'])}")

        if full_df.empty:
            return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}

        # Dynamic column lookups
        opening_cases = find_dynamic(full_df, ["opening", "case"])
        opening_bottles = find_dynamic(full_df, ["opening", "bottle"])
        in_cases = find_dynamic(full_df, ["in", "case"]) or find_dynamic(full_df, ["receipt", "case"])
        in_bottles = find_dynamic(full_df, ["in", "bottle"]) or find_dynamic(full_df, ["receipt", "bottle"])
        out_cases = find_dynamic(full_df, ["out", "case"]) or find_dynamic(full_df, ["sales", "case"])
        out_bottles = find_dynamic(full_df, ["out", "bottle"]) or find_dynamic(full_df, ["sales", "bottle"])
        closing_cases = find_dynamic(full_df, ["closing", "case"])
        closing_bottles = find_dynamic(full_df, ["closing", "bottle"])
        bottles_per_case = find_dynamic(full_df, ["bottle", "case"])

        full_df["_opening_cases"] = pd.to_numeric(full_df[opening_cases] if opening_cases else None, errors="coerce").fillna(0)
        full_df["_opening_bottles"] = pd.to_numeric(full_df[opening_bottles] if opening_bottles else None, errors="coerce").fillna(0)
        
        full_df["_in_cases"] = pd.to_numeric(full_df[in_cases] if in_cases else None, errors="coerce").fillna(0)
        full_df["_in_bottles"] = pd.to_numeric(full_df[in_bottles] if in_bottles else None, errors="coerce").fillna(0)
        
        full_df["_out_cases"] = pd.to_numeric(full_df[out_cases] if out_cases else None, errors="coerce").fillna(0)
        full_df["_out_bottles"] = pd.to_numeric(full_df[out_bottles] if out_bottles else None, errors="coerce").fillna(0)
        
        full_df["_closing_cases"] = pd.to_numeric(full_df[closing_cases] if closing_cases else None, errors="coerce").fillna(0)
        full_df["_closing_bottles"] = pd.to_numeric(full_df[closing_bottles] if closing_bottles else None, errors="coerce").fillna(0)
        
        full_df["_bpc"] = pd.to_numeric(full_df[bottles_per_case] if bottles_per_case else None, errors="coerce").fillna(1)
        full_df.loc[full_df["_bpc"] <= 0, "_bpc"] = 1

        full_df["_opening_total_bottles"] = (full_df["_opening_cases"] * full_df["_bpc"]) + full_df["_opening_bottles"]
        full_df["_in_total_bottles"] = (full_df["_in_cases"] * full_df["_bpc"]) + full_df["_in_bottles"]
        full_df["_out_total_bottles"] = (full_df["_out_cases"] * full_df["_bpc"]) + full_df["_out_bottles"]
        full_df["_closing_total_bottles"] = (full_df["_closing_cases"] * full_df["_bpc"]) + full_df["_closing_bottles"]

        if "range_key" in full_df.columns:
            full_df = full_df.sort_values(by="range_key")

        result = []
        grouped = full_df.groupby([shop_col, brand_col, pack_col])
        
        for (s_code, brand, pack), g in grouped:
            bpc = g["_bpc"].iloc[0]
            
            opening_bottles = g["_opening_total_bottles"].iloc[0]
            inward_bottles = g["_in_total_bottles"].sum()
            outward_bottles = g["_out_total_bottles"].sum()
            closing_bottles = g["_closing_total_bottles"].iloc[-1]
            
            if closing_bottles == 0 and (opening_bottles > 0 or inward_bottles > 0 or outward_bottles > 0):
                closing_bottles = opening_bottles + inward_bottles - outward_bottles
                
            if view == "case":
                result.append({
                    "shop_code": s_code,
                    "brand": brand,
                    "pack": pack,
                    "opening": round(opening_bottles / bpc, 4),
                    "inward": round(inward_bottles / bpc, 4),
                    "outward": round(outward_bottles / bpc, 4),
                    "closing": round(closing_bottles / bpc, 4),
                })
            else:
                result.append({
                    "shop_code": s_code,
                    "brand": brand,
                    "pack": pack,
                    "opening": opening_bottles,
                    "inward": inward_bottles,
                    "outward": outward_bottles,
                    "closing": closing_bottles,
                })

        return {"data": result, "uploads": report.get("uploads", []), "config": report.get("config", {})}

    def get_filters(self, report):
        return get_filters_from_mapping()
