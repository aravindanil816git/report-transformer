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

        # Determine the key for this upload and store exact start/end day bounds
        start_day, end_day = None, None
        key = None
        lowered = file_name.lower()
        
        # 1. Parse start and end day from filename (e.g. "1-16", "17-30", "17-20")
        match = re.search(r"\b(\d{1,2})\s*(?:-|to|–|—|_)\s*(\d{1,2})\b", lowered)
        if match:
            start_day = int(match.group(1))
            end_day = int(match.group(2))
            key = f"{start_day}-{end_day}"
            
        # 2. Fallback to report config date
        if not key:
            config_date = report.get("config", {}).get("date1") or report.get("config", {}).get("start_date")
            if config_date:
                try:
                    day = int(pd.to_datetime(config_date).day)
                    if day <= 16:
                        start_day, end_day = 1, 16
                    else:
                        start_day, end_day = 17, 31
                except Exception:
                    pass
            
            # 3. Fallback to standard range patterns
            if start_day is None or end_day is None:
                if re.search(r"\b1\s*(?:-|to|–|—|_)\s*1[562]\b", lowered) or "1-16" in lowered or "1-15" in lowered or "1-12" in lowered:
                    start_day, end_day = 1, 16
                elif re.search(r"\b1[67]\s*(?:-|to|–|—|_)\s*3[01]\b", lowered) or "17-30" in lowered or "17-31" in lowered or "16-30" in lowered or "16-31" in lowered:
                    start_day, end_day = 17, 31
                else:
                    start_day, end_day = 1, 16  # Default fallback
            
            key = f"{start_day}-{end_day}"

        # Ensure the uploads list exists
        report.setdefault("uploads", [])
        
        upload_entry = {
            "date": key,
            "range_key": key,
            "start_day": start_day,
            "end_day": end_day,
            "file": file_name,
            "path": path,
            "status": "uploaded",
            "data": df.replace({pd.NA: None}).astype(object).where(pd.notnull(df), None).to_dict("records")
        }

        # Find existing entry for this date key (or range key) and replace it.
        updated = False
        for u in report["uploads"]:
            if u.get("date") == key or u.get("range_key") == key:
                u.update(upload_entry)
                updated = True
                break
        if not updated:
            # Append a new upload entry
            report["uploads"].append(upload_entry)
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
        start_date = kwargs.get("start_date")
        end_date = kwargs.get("end_date")
        view_param = kwargs.get("view", view)
        mode = kwargs.get("mode", "warehouse")
        
        # Parse selected date filter range bounds
        sel_start_day = None
        sel_end_day = None
        if start_date and end_date:
            try:
                sel_start_day = int(pd.to_datetime(start_date).day)
                sel_end_day = int(pd.to_datetime(end_date).day)
            except Exception:
                pass
        
        # Build DataFrames from each upload entry
        dfs = []
        for u in uploads:
            r_key = u.get("range_key") or u.get("date", "default")
            
            # Determine day range bounds for this upload
            u_start_day = u.get("start_day")
            u_end_day = u.get("end_day")
            
            if u_start_day is None or u_end_day is None:
                # Fallback to parsing from range_key
                match = re.search(r"(\d{1,2})\s*-\s*(\d{1,2})", str(r_key))
                if match:
                    u_start_day = int(match.group(1))
                    u_end_day = int(match.group(2))
                else:
                    if r_key == "1-16":
                        u_start_day, u_end_day = 1, 16
                    elif r_key in ["17-31", "17-30"]:
                        u_start_day, u_end_day = 17, 31
                    else:
                        u_start_day, u_end_day = 1, 31
            
            # Filter: include if the upload's range overlaps with the selected filter bounds
            if sel_start_day is not None and sel_end_day is not None:
                if u_end_day < sel_start_day or u_start_day > sel_end_day:
                    continue
                
            data = u.get("data")
            if isinstance(data, list) and data:
                df = pd.DataFrame(data)
                if not df.empty:
                    df['range_key'] = r_key
                    dfs.append(df)
            else:
                # 🔥 READ DIRECTLY FROM PATH IF DB PAYLOAD DROPPED THE DATA ARRAY
                path = u.get("path")
                storage_path = u.get("storage_path")
                # Fallback: Reconstruct storage_path if missing from legacy records
                if not storage_path and u.get("file"):
                    filename = u.get("file")
                    path_val = u.get("path") or ""
                    import os
                    basename = os.path.basename(path_val)
                    if basename.endswith(filename) and len(basename) > len(filename) + 1:
                        # Extract source report ID prefix from filename e.g. "9ea4adba-848e..._june 1-16.xlsx"
                        source_id = basename[:-(len(filename) + 1)]
                        storage_path = f"{source_id}/{filename}"
                    elif report.get("id"):
                        storage_path = f"{report.get('id')}/{filename}"
                
                if path:
                    import os
                    filename = os.path.basename(path)
                    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
                    local_path = os.path.join(temp_dir, filename)
                    
                    if storage_path and not os.path.exists(local_path):
                        try:
                            from services.db import supabase
                            res_bytes = supabase.storage.from_("raw-reports").download(storage_path)
                            os.makedirs(os.path.dirname(local_path) or ".", exist_ok=True)
                            with open(local_path, "wb") as f:
                                f.write(res_bytes)
                            print(f"[INFO] Downloaded {storage_path} from Supabase storage.")
                        except Exception as e:
                            print(f"[ERROR] Failed to download {storage_path} from storage: {e}")
                    
                    if os.path.exists(local_path):
                        path = local_path
                
                if path and os.path.exists(path):
                    try:
                        df = read_excel_robust(path)
                        df = normalize(df)
                        if not df.empty:
                            df['range_key'] = r_key
                            dfs.append(df)
                    except Exception as e:
                        print(f"[ERROR] [combined_shopwise_multi] Failed to read {path}: {e}")

        if not dfs:
            return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}

        full_df = pd.concat(dfs, ignore_index=True)
        # Normalize in case data was uploaded before the robust upload method was added
        full_df = normalize(full_df)

        brand_col = find_column(full_df, ["brand"]) or find_column(full_df, ["item"])
        pack_col = find_column(full_df, ["pack"]) or find_column(full_df, ["size"])
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

        # Enrichment
        from core.mapping_utils import get_shop_to_parent_maps
        shop_to_bond, _ = get_shop_to_parent_maps()
        full_df["bond_info"] = full_df[shop_col].map(shop_to_bond).fillna("Unknown")
        # Use warehouse from raw data if available, otherwise it's Unknown. Do not use mapping file.
        wh_col = find_column(full_df, ["warehouse"])
        if wh_col:
            full_df["warehouse_info"] = full_df[wh_col].astype(str).str.strip()
        else:
            full_df["warehouse_info"] = "Unknown"

        # Filtering
        if shop_code:
            full_df = full_df[full_df[shop_col] == str(shop_code).strip()]
        if warehouse:
            full_df = full_df[full_df["warehouse_info"] == warehouse]
        if bond:
            full_df = full_df[full_df["bond_info"] == bond]

        if full_df.empty:
            return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}

        # Dynamic column lookups
        opening_cases = find_dynamic(full_df, ["opening", "case"], exclude=["info"])
        opening_bottles = find_dynamic(full_df, ["opening", "bottle"], exclude=["info"])
        in_cases = find_dynamic(full_df, ["in", "case"], exclude=["info"]) or find_dynamic(full_df, ["receipt", "case"], exclude=["info"])
        in_bottles = find_dynamic(full_df, ["in", "bottle"], exclude=["info"]) or find_dynamic(full_df, ["receipt", "bottle"], exclude=["info"])
        out_cases = find_dynamic(full_df, ["out", "case"], exclude=["info"]) or find_dynamic(full_df, ["sales", "case"], exclude=["info"])
        out_bottles = find_dynamic(full_df, ["out", "bottle"], exclude=["info"]) or find_dynamic(full_df, ["sales", "bottle"], exclude=["info"])
        closing_cases = find_dynamic(full_df, ["closing", "case"], exclude=["info"])
        closing_bottles = find_dynamic(full_df, ["closing", "bottle"], exclude=["info"])
        bottles_per_case = find_dynamic(full_df, ["bottle", "per", "case"], exclude=["info"]) or find_dynamic(full_df, ["bottles_per_case"], exclude=["info"])

        full_df["_opening_cases"] = pd.to_numeric(full_df[opening_cases] if opening_cases else None, errors="coerce").fillna(0)
        full_df["_opening_bottles"] = pd.to_numeric(full_df[opening_bottles] if opening_bottles else None, errors="coerce").fillna(0)
        
        full_df["_in_cases"] = pd.to_numeric(full_df[in_cases] if in_cases else None, errors="coerce").fillna(0)
        full_df["_in_bottles"] = pd.to_numeric(full_df[in_bottles] if in_bottles else None, errors="coerce").fillna(0)
        
        full_df["_out_cases"] = pd.to_numeric(full_df[out_cases] if out_cases else None, errors="coerce").fillna(0)
        full_df["_out_bottles"] = pd.to_numeric(full_df[out_bottles] if out_bottles else None, errors="coerce").fillna(0)
        
        full_df["_closing_cases"] = pd.to_numeric(full_df[closing_cases] if closing_cases else None, errors="coerce").fillna(0)
        full_df["_closing_bottles"] = pd.to_numeric(full_df[closing_bottles] if closing_bottles else None, errors="coerce").fillna(0)
        
        if bottles_per_case:
            full_df["_bpc"] = full_df[bottles_per_case].apply(safe_int)
        else:
            full_df["_bpc"] = 1
        full_df.loc[full_df["_bpc"] <= 0, "_bpc"] = 1

        full_df["_opening_total_bottles"] = (full_df["_opening_cases"] * full_df["_bpc"]) + full_df["_opening_bottles"]
        full_df["_in_total_bottles"] = (full_df["_in_cases"] * full_df["_bpc"]) + full_df["_in_bottles"]
        full_df["_out_total_bottles"] = (full_df["_out_cases"] * full_df["_bpc"]) + full_df["_out_bottles"]
        full_df["_closing_total_bottles"] = (full_df["_closing_cases"] * full_df["_bpc"]) + full_df["_closing_bottles"]

        if "range_key" in full_df.columns:
            full_df = full_df.sort_values(by="range_key")

        # KSBC files might have duplicate rows for the same brand in the same period, causing massive inflated sums. Keep only the latest entry.
        full_df = full_df.drop_duplicates(subset=[shop_col, brand_col, pack_col, "range_key"], keep="last")

        result = []
        grouped = full_df.groupby([shop_col, brand_col, pack_col])
        
        from core.mapping_utils import get_shop_to_parent_maps, get_shop_lookup_and_warehouse_to_bond
        shop_to_bond, _ = get_shop_to_parent_maps()
        shop_lookup, _ = get_shop_lookup_and_warehouse_to_bond()
        
        for (s_code, brand, pack), g in grouped:
            bpc = float(g["_bpc"].iloc[0])
            
            opening_bottles = float(g["_opening_total_bottles"].iloc[0])
            inward_bottles = float(g["_in_total_bottles"].sum())
            outward_bottles = float(g["_out_total_bottles"].sum())
            closing_bottles = float(g["_closing_total_bottles"].iloc[-1])
            
            if closing_bottles == 0 and (opening_bottles > 0 or inward_bottles > 0 or outward_bottles > 0):
                closing_bottles = opening_bottles + inward_bottles - outward_bottles
                
            s_code_str = str(s_code).strip()
            wh_info = str(g["warehouse_info"].iloc[0]) if "warehouse_info" in g.columns else "Unknown"
            
            item = {
                "shop_code": s_code_str,
                "brand": str(brand),
                "pack": str(pack),
                "opening": round(opening_bottles / bpc, 4) if view_param != "bottle" else opening_bottles,
                "inward": round(inward_bottles / bpc, 4) if view_param != "bottle" else inward_bottles,
                "outward": round(outward_bottles / bpc, 4) if view_param != "bottle" else outward_bottles,
                "closing": round(closing_bottles / bpc, 4) if view_param != "bottle" else closing_bottles,
                "warehouse": wh_info,
                "bond": shop_to_bond.get(s_code_str, "Unknown"),
                "shop_name": shop_lookup.get(s_code_str, {}).get("shop_name", "Unknown Shop")
            }
            result.append(item)

        config_out = report.get("config", {})
        if start_date: config_out["start_date"] = start_date
        if end_date: config_out["end_date"] = end_date

        if view_param in ["cumulative", "daywise"]:
            agg_map = {}
            for r in result:
                wh = r["warehouse"]
                bnd = r["bond"]
                sc = r["shop_code"]
                sn = r["shop_name"]
                
                if not bnd or str(bnd).upper() in ["UNKNOWN", "UNMAPPED", "NONE", ""]:
                    print(f"[DEBUG] [combined_shopwise_multi] Missing/Unknown bond for Shop Code: '{sc}', Name: '{sn}', Warehouse: '{wh}', Raw Bond Value: '{bnd}'")
                    bnd = "UNKNOWN"

                if mode == "bond":
                    pk = bnd if bnd else "UNKNOWN"
                elif mode == "shop":
                    pk = f"{wh}_{bnd}_{sc}"
                else: # warehouse
                    pk = wh if wh else "UNKNOWN"
                    
                if pk not in agg_map:
                    agg_map[pk] = {
                        "warehouse": wh if mode != "bond" else pk,
                        "bond": bnd,
                        "shop_code": sc if mode == "shop" else None,
                        "shop_name": sn if mode == "shop" else None,
                        "opening": 0.0,
                        "inward": 0.0,
                        "outward": 0.0,
                        "closing": 0.0
                    }
                
                agg_map[pk]["opening"] += r["opening"]
                agg_map[pk]["inward"] += r["inward"]
                agg_map[pk]["outward"] += r["outward"]
                agg_map[pk]["closing"] += r["closing"]
                
            final_res = []
            for v in agg_map.values():
                v["opening"] = round(v["opening"], 2)
                v["inward"] = round(v["inward"], 2)
                v["outward"] = round(v["outward"], 2)
                v["closing"] = round(v["closing"], 2)
                final_res.append(v)
                
            return {"data": final_res, "uploads": report.get("uploads", []), "config": config_out}

        return {"data": result, "uploads": report.get("uploads", []), "config": config_out}

    def get_filters(self, report):
        # Get bonds and shops from mapping as a base
        filters = get_filters_from_mapping()

        # Override warehouses with data from the report's uploads
        uploads = report.get("uploads", [])
        dfs = []
        for u in uploads:
            data = u.get("data")
            if isinstance(data, list) and data:
                df = pd.DataFrame(data)
                if not df.empty:
                    dfs.append(df)

        if dfs:
            full_df = pd.concat(dfs, ignore_index=True)
            # No need to normalize here, just finding a column
            wh_col = find_column(full_df, ["warehouse"])
            if wh_col:
                warehouses = sorted(full_df[wh_col].dropna().unique().tolist())
                filters["warehouses"] = warehouses

        return filters
