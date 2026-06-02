# pandas is required for data handling; import lazily to avoid import errors if unavailable during module load
try:
    import pandas as pd
except ImportError:
    pd = None
import os
from .base import BaseReportService
from core.utils import normalize, clean_df, find_column, find_dynamic, safe_int, read_excel_robust
from core.mapping_utils import get_shop_lookup_and_warehouse_to_bond

class ShopwiseReportService(BaseReportService):
    type_name = "shopwise"

    def _shrink_data(self, df):
        """Pre-aggregates raw data to prevent massive JSON payloads (Cloudflare 520 errors) and RAM exhaustion."""
        if df.empty:
            return df

        code_col, name_col = self._detect_shop_cols(df)
        wh_col = self._detect_warehouse_col(df)
        brand_col = find_column(df, ["brand"])
        pack_col = find_column(df, ["pack"])

        opening_cases = find_dynamic(df, ["opening", "case"], exclude=["info"])
        opening_bottles = find_dynamic(df, ["opening", "bottle"], exclude=["info"])
        in_cases = find_dynamic(df, ["receipt", "case"], exclude=["info"]) or find_dynamic(df, ["shop", "in", "case"], exclude=["info"]) or find_dynamic(df, ["inward", "case"], exclude=["info"]) or find_dynamic(df, ["in", "case"], exclude=["info"])
        in_bottles = find_dynamic(df, ["receipt", "bottle"], exclude=["info"]) or find_dynamic(df, ["shop", "in", "bottle"], exclude=["info"]) or find_dynamic(df, ["inward", "bottle"], exclude=["info"]) or find_dynamic(df, ["in", "bottle"], exclude=["info"])
        out_cases = find_dynamic(df, ["sales", "case"], exclude=["info"]) or find_dynamic(df, ["shop", "out", "case"], exclude=["info"]) or find_dynamic(df, ["outward", "case"], exclude=["info"]) or find_dynamic(df, ["out", "case"], exclude=["info"])
        out_bottles = find_dynamic(df, ["sales", "bottle"], exclude=["info"]) or find_dynamic(df, ["shop", "out", "bottle"], exclude=["info"]) or find_dynamic(df, ["outward", "bottle"], exclude=["info"]) or find_dynamic(df, ["out", "bottle"], exclude=["info"])
        closing_cases = find_dynamic(df, ["closing", "case"], exclude=["info"])
        closing_bottles = find_dynamic(df, ["closing", "bottle"], exclude=["info"])

        metrics = [opening_cases, opening_bottles, in_cases, in_bottles, out_cases, out_bottles, closing_cases, closing_bottles]
        metric_cols = [c for c in metrics if c and c in df.columns]
        
        cat_cols = [c for c in df.columns if c not in metric_cols]

        for c in metric_cols:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
        for c in cat_cols:
            df[c] = df[c].astype(str).fillna("Unknown")

        if metric_cols and cat_cols:
            df = df.groupby(cat_cols, as_index=False)[metric_cols].sum()
        return df

    def upload(self, report, path, file_name, from_date, to_date):
        df = read_excel_robust(path)
        df = normalize(df)
        df = clean_df(df)

        # Robust detection of shop columns
        code_col, name_col = self._detect_shop_cols(df)
        wh_col = self._detect_warehouse_col(df)

        # Pre-detect data columns to keep only what's necessary
        brand_col = find_column(df, ["brand"])
        pack_col = find_column(df, ["pack"])
        opening_cases = find_dynamic(df, ["opening", "case"], exclude=["info"])
        opening_bottles = find_dynamic(df, ["opening", "bottle"], exclude=["info"])
        in_cases = find_dynamic(df, ["receipt", "case"], exclude=["info"]) or find_dynamic(df, ["shop", "in", "case"], exclude=["info"]) or find_dynamic(df, ["inward", "case"], exclude=["info"]) or find_dynamic(df, ["in", "case"], exclude=["info"])
        in_bottles = find_dynamic(df, ["receipt", "bottle"], exclude=["info"]) or find_dynamic(df, ["shop", "in", "bottle"], exclude=["info"]) or find_dynamic(df, ["inward", "bottle"], exclude=["info"]) or find_dynamic(df, ["in", "bottle"], exclude=["info"])
        out_cases = find_dynamic(df, ["sales", "case"], exclude=["info"]) or find_dynamic(df, ["shop", "out", "case"], exclude=["info"]) or find_dynamic(df, ["outward", "case"], exclude=["info"]) or find_dynamic(df, ["out", "case"], exclude=["info"])
        out_bottles = find_dynamic(df, ["sales", "bottle"], exclude=["info"]) or find_dynamic(df, ["shop", "out", "bottle"], exclude=["info"]) or find_dynamic(df, ["outward", "bottle"], exclude=["info"]) or find_dynamic(df, ["out", "bottle"], exclude=["info"])
        closing_cases = find_dynamic(df, ["closing", "case"], exclude=["info"])
        closing_bottles = find_dynamic(df, ["closing", "bottle"], exclude=["info"])
        bottles_per_case = find_dynamic(df, ["bottle", "per", "case"], exclude=["info"]) or find_dynamic(df, ["bottles_per_case"], exclude=["info"])

        if code_col:
            shop_lookup, _ = get_shop_lookup_and_warehouse_to_bond()
            # Create standardized internal columns for reliability
            df["shop_code_internal"] = df[code_col].astype(str).str.replace(".0", "", regex=False).str.strip()
            if name_col:
                df["shop_name_internal"] = df[name_col].astype(str).str.strip()
            else:
                # Try to lookup name if code found but name not found
                s_code = df["shop_code_internal"].iloc[0] if not df.empty else None
                if s_code and s_code in shop_lookup:
                     df["shop_name_internal"] = df["shop_code_internal"].apply(lambda x: shop_lookup.get(x, {}).get("shop_name", x))
                else:
                     df["shop_name_internal"] = df["shop_code_internal"]

            # For Shopwise report, use raw data for warehouse if available.
            # Do NOT use SHOP_LOOKUP for warehouse/bond here as per requirements.
            if wh_col:
                df["warehouse_info"] = df[wh_col].astype(str).str.strip()
            else:
                df["warehouse_info"] = "Unknown"
            
            # Remove bond info for this report type as per requirements
            df["bond_info"] = "N/A"

        # 🔥 INJECT DATE TO PRESERVE DATE-WISE FILTERING AFTER SHRINKING
        df["report_date"] = from_date

        # Drop unneeded columns to prevent massive JSON payload and Cloudflare 520 timeouts
        cols_to_keep = {
            code_col, name_col, "shop_code_internal", "shop_name_internal",
            wh_col, "warehouse_info", "bond_info", brand_col, pack_col,
            opening_cases, opening_bottles, in_cases, in_bottles,
            out_cases, out_bottles, closing_cases, closing_bottles, bottles_per_case, "report_date"
        }
        valid_cols = [c for c in cols_to_keep if c and c in df.columns]
        df = df[valid_cols]

        # 🔥 CRITICAL FIX: Shrink the individual file's data FIRST before appending it to the payload
        df = self._shrink_data(df)

        # Convert NaNs to None to ensure clean JSON serialization and reduce payload size
        df = df.astype(object).where(pd.notna(df), None)

        new_data = df.to_dict("records")
        if "data" not in report or not report["data"]:
            report["data"] = new_data
        else:
            report["data"].extend(new_data)
            
            # Shrink combined data again to prevent unlimited growth across 30 uploads
            combined_df = pd.DataFrame(report["data"])
            combined_df = self._shrink_data(combined_df)
            combined_df = combined_df.astype(object).where(pd.notna(combined_df), None)
            report["data"] = combined_df.to_dict("records")

        # Do not store raw data in the database payload to prevent 520 errors.
        # We simply record the upload metadata so it can be processed directly from storage later.
        report.setdefault("uploads", []).append({
            "file": file_name,
            "path": path,
            "from": from_date,
            "to": to_date
        })

    def _detect_shop_cols(self, df):
        # Standardize search for Shop Code
        code_col = None
        
        # 1. Check for previously standardized column
        if "shop_code_internal" in df.columns:
            return "shop_code_internal", ("shop_name_internal" if "shop_name_internal" in df.columns else None)

        # 2. Priority match for "Licensee No" (very common)
        for c in df.columns:
            cl = c.lower()
            if ("license" in cl and "no" in cl) or cl == "shop_code":
                code_col = c
                break
        
        # 3. Check for specific shop code keywords
        if not code_col:
            for c in df.columns:
                cl = c.lower()
                # Must contain 'shop' and 'code', but avoid common false positives
                if "shop" in cl and "code" in cl and "product" not in cl and "brand" not in cl:
                    code_col = c
                    break
            
        # 4. Fallback to just "Code" if no other code columns exist
        if not code_col:
            potential = []
            for c in df.columns:
                cl = c.lower()
                if cl == "code" or cl == "shop":
                    potential.append(c)
                elif "code" in cl and all(x not in cl for x in ["product", "brand", "item", "warehouse", "bond", "pack", "serial", "hsn"]):
                    potential.append(c)
            if potential:
                code_col = potential[0]

        # Standardize search for Shop Name
        name_col = None
        for c in df.columns:
            cl = c.lower()
            if cl == "shop_name" or ("shop" in cl and "name" in cl):
                name_col = c
                break
        
        if not name_col:
            for c in df.columns:
                cl = c.lower()
                if "name" in cl and all(x not in cl for x in ["brand", "warehouse", "item", "product", "staff", "bond", "packing", "dist", "category", "user"]):
                    name_col = c
                    break
        
        return code_col, name_col

    def _detect_warehouse_col(self, df):
        for c in df.columns:
            cl = c.lower()
            if "warehouse" in cl or "wh" == cl:
                return c
        return None

    def process(self, report):
        # Allow fixing existing bloated reports by clicking "Process Report"
        data = report.get("data") or []
        if not data:
            return
        df = pd.DataFrame(data)
        df = self._shrink_data(df)
        df = df.astype(object).where(pd.notna(df), None)
        report["data"] = df.to_dict("records")

    def _aggregate(self, df, shop_code=None, warehouse=None, bond=None, view="case"):
        brand_col = find_column(df, ["brand"])
        pack_col = find_column(df, ["pack"])
        
        shop_col, _ = self._detect_shop_cols(df)

        if not shop_col:
            return []

        # Create a clean working copy
        df_local = df.copy()
        df_local[shop_col] = df_local[shop_col].astype(str).str.replace(".0", "", regex=False).str.strip()

        # Re-verify bond/warehouse info
        if "warehouse_info" not in df_local.columns:
            wh_col = self._detect_warehouse_col(df_local)
            if wh_col:
                df_local["warehouse_info"] = df_local[wh_col].astype(str).str.strip()
            else:
                df_local["warehouse_info"] = "Unknown"
        if "bond_info" not in df_local.columns:
             df_local["bond_info"] = "N/A"

        # Apply filters
        if shop_code:
            df_local = df_local[df_local[shop_col] == str(shop_code).strip()]
        if warehouse:
            df_local = df_local[df_local["warehouse_info"] == warehouse]
        if bond:
            df_local = df_local[df_local["bond_info"] == bond]
        if start_date and "report_date" in df_local.columns:
            df_local = df_local[df_local["report_date"] >= start_date]
        if end_date and "report_date" in df_local.columns:
            df_local = df_local[df_local["report_date"] <= end_date]

        if df_local.empty:
            return []
        
        opening_cases = find_dynamic(df_local, ["opening", "case"], exclude=["info"])
        opening_bottles = find_dynamic(df_local, ["opening", "bottle"], exclude=["info"])

        in_cases = (
            find_dynamic(df_local, ["receipt", "case"], exclude=["info"]) or 
            find_dynamic(df_local, ["shop", "in", "case"], exclude=["info"]) or
            find_dynamic(df_local, ["inward", "case"], exclude=["info"]) or
            find_dynamic(df_local, ["in", "case"], exclude=["info"])
        )
        in_bottles = (
            find_dynamic(df_local, ["receipt", "bottle"], exclude=["info"]) or 
            find_dynamic(df_local, ["shop", "in", "bottle"], exclude=["info"]) or
            find_dynamic(df_local, ["inward", "bottle"], exclude=["info"]) or
            find_dynamic(df_local, ["in", "bottle"], exclude=["info"])
        )

        out_cases = (
            find_dynamic(df_local, ["sales", "case"], exclude=["info"]) or 
            find_dynamic(df_local, ["shop", "out", "case"], exclude=["info"]) or
            find_dynamic(df_local, ["outward", "case"], exclude=["info"]) or
            find_dynamic(df_local, ["out", "case"], exclude=["info"])
        )
        out_bottles = (
            find_dynamic(df_local, ["sales", "bottle"], exclude=["info"]) or 
            find_dynamic(df_local, ["shop", "out", "bottle"], exclude=["info"]) or
            find_dynamic(df_local, ["outward", "bottle"], exclude=["info"]) or
            find_dynamic(df_local, ["out", "bottle"], exclude=["info"])
        )

        closing_cases = find_dynamic(df_local, ["closing", "case"], exclude=["info"])
        closing_bottles = find_dynamic(df_local, ["closing", "bottle"], exclude=["info"])

        bottles_per_case = find_dynamic(df_local, ["bottle", "per", "case"], exclude=["info"]) or find_dynamic(df_local, ["bottles_per_case"], exclude=["info"])

        # Grouping
        grouped = df_local.groupby([shop_col, brand_col, pack_col])
        result = []

        for (s_code, brand, pack), g in grouped:
            s = g.sum(numeric_only=True)
            bpc = safe_int(g[bottles_per_case].iloc[0]) if bottles_per_case else 1
            if bpc <= 0: bpc = 1

            s_code_str = str(s_code).replace(".0", "").strip()

            if view == "case":
                opening = safe_int(s.get(opening_cases, 0)) + (safe_int(s.get(opening_bottles, 0)) / bpc)
                inward = safe_int(s.get(in_cases, 0)) + (safe_int(s.get(in_bottles, 0)) / bpc)
                outward = safe_int(s.get(out_cases, 0)) + (safe_int(s.get(out_bottles, 0)) / bpc)
                closing = safe_int(s.get(closing_cases, 0)) + (safe_int(s.get(closing_bottles, 0)) / bpc)

                result.append({
                    "shop_code": s_code_str,
                    "brand": brand,
                    "pack": str(pack),
                    "opening": round(opening, 4),
                    "inward": round(inward, 4),
                    "outward": round(outward, 4),
                    "closing": round(closing, 4),
                })
            else:
                result.append({
                    "shop_code": s_code_str,
                    "brand": brand,
                    "pack": str(pack),
                    "opening": safe_int(s.get(opening_cases, 0)) * bpc + safe_int(s.get(opening_bottles, 0)),
                    "inward": safe_int(s.get(in_cases, 0)) * bpc + safe_int(s.get(in_bottles, 0)),
                    "outward": safe_int(s.get(out_cases, 0)) * bpc + safe_int(s.get(out_bottles, 0)),
                    "closing": safe_int(s.get(closing_cases, 0)) * bpc + safe_int(s.get(closing_bottles, 0)),
                })
        return result

    def get_report(self, report, shop_code=None, warehouse=None, bond=None, view="case", start_date=None, end_date=None, **kwargs):
        data = report.get("data") or []
        if not data:
            return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}
        df = pd.DataFrame(data)
        result = self._aggregate(df, shop_code=shop_code, warehouse=warehouse, bond=bond, view=view, start_date=start_date, end_date=end_date)
        return {"data": result, "uploads": report.get("uploads", []), "config": report.get("config", {})}

    def get_filters(self, report):
        data = report.get("data") or []
        if not data:
            return {"shops": [], "warehouses": [], "mapping": {}}
        df = pd.DataFrame(data)
        
        code_col, name_col = self._detect_shop_cols(df)
        shops_map = {} # shop_code -> shop_name
        
        if code_col:
            # Clean codes and names from data
            df_clean = df.dropna(subset=[code_col]).copy()
            df_clean[code_col] = df_clean[code_col].astype(str).str.replace(".0", "", regex=False).str.strip()
            
            unique_rows = df_clean[[code_col] + ([name_col] if name_col else [])].drop_duplicates()
            for _, row in unique_rows.iterrows():
                s_code = row[code_col]
                if not s_code or s_code.lower() == "nan": continue
                
                s_name = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) and str(row[name_col]).lower() != "nan" else s_code
                shops_map[s_code] = s_name
            
        shop_lookup, _ = get_shop_lookup_and_warehouse_to_bond()

        # Enrich names from shop_lookup
        for s_code in list(shops_map.keys()):
            if s_code in shop_lookup:
                shops_map[s_code] = shop_lookup[s_code].get("shop_name", shops_map[s_code])
        
        shops = [{"shop_code": k, "shop_name": v} for k, v in shops_map.items()]

        # Ensure warehouse info is present for mapping
        if code_col:
             if "warehouse_info" not in df.columns:
                 df["warehouse_info"] = df[code_col].astype(str).str.replace(".0", "", regex=False).str.strip().apply(lambda x: shop_lookup.get(x, {}).get("warehouse"))

        warehouses = sorted(df["warehouse_info"].dropna().unique().tolist()) if "warehouse_info" in df.columns else []

        # Build cascading mapping (Warehouse -> Shop)
        cascading = {}
        if "warehouse_info" in df.columns and code_col:
            temp_map_df = df[["warehouse_info", code_col]].drop_duplicates()
            for _, row in temp_map_df.iterrows():
                w = row["warehouse_info"]
                s = str(row[code_col]).replace(".0", "").strip()
                
                if not s or s.lower() == "nan": continue
                
                w_val = w if pd.notna(w) and str(w).lower() != "nan" else "UNMAPPED"
                
                if w_val not in cascading: cascading[w_val] = []
                if s not in cascading[w_val]: cascading[w_val].append(s)

        return {
            "shops": sorted(shops, key=lambda x: x["shop_code"]),
            "warehouses": warehouses,
            "mapping": cascading
        }
