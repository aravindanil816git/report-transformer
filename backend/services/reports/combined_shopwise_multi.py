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
    def _parse_days(self, filename=None, upload_meta=None, default_start=1, default_end=16, config=None, **kwargs):
        meta = {}
        if config and isinstance(config, dict):
            meta.update(config)
        if upload_meta and isinstance(upload_meta, dict):
            meta.update(upload_meta)

        if meta:
            if meta.get("start_day") and meta.get("end_day"):
                try:
                    s_day = int(meta["start_day"])
                    e_day = int(meta["end_day"])
                    if 1 <= s_day <= 31 and 1 <= e_day <= 31:
                        return s_day, e_day
                except Exception:
                    pass

            d1 = meta.get("from") or meta.get("date1")
            d2 = meta.get("to") or meta.get("date2")
            if d1 and d2:
                try:
                    start_day = int(pd.to_datetime(d1).day)
                    end_day = int(pd.to_datetime(d2).day)
                    if 1 <= start_day <= 31 and 1 <= end_day <= 31:
                        return start_day, end_day
                except Exception:
                    pass

            rk = meta.get("range_key")
            if rk and isinstance(rk, str) and "-" in rk and not (len(rk) >= 10 and rk[0:4].isdigit()):
                parts = rk.split("-")
                try:
                    s_day, e_day = int(parts[0]), int(parts[1])
                    if 1 <= s_day <= 31 and 1 <= e_day <= 31:
                        return s_day, e_day
                except Exception:
                    pass

            dt = meta.get("date") or meta.get("range_key")
            if dt and isinstance(dt, str) and len(dt) >= 10 and dt[0:4].isdigit():
                try:
                    d_day = int(pd.to_datetime(dt[:10]).day)
                    return d_day, d_day
                except Exception:
                    pass

        if not filename:
            return default_start, default_end

        import os
        name = os.path.basename(filename)
        if len(name) > 37 and name[36] == '_':
            name = name[37:]
        clean = name.lower()

        # Strip (23) style duplicate counters
        clean = re.sub(r"\(\d+\)", "", clean)

        # Check for date pattern like 4-7-26 or 15-7-2026 or 8-7-26 (D-M-YY or D-M-YYYY)
        date_match = re.search(r"(?:^|[^0-9])(\d{1,2})[-/](\d{1,2})[-/](?:20)?\d{2}(?:$|[^0-9])", clean)
        if date_match:
            day = int(date_match.group(1))
            month = int(date_match.group(2))
            if month > 12 and day <= 12:
                day = month
            if day <= 16:
                return 1, max(1, day)
            else:
                return 17, min(31, day)

        # Strip 4-digit years
        clean = re.sub(r"\b20\d\d\b", "", clean)
        clean = re.sub(r"(\d+)\s*(?:st|nd|rd|th)", r"\1", clean)

        # Match explicit range 'X to Y' or 'X-Y'
        m = re.search(r"(\d{1,2})\s*(?:-|to|\buntil\b)\s*(\d{1,2})", clean)
        if m:
            d1, d2 = int(m.group(1)), int(m.group(2))
            if 1 <= d1 <= 31 and 1 <= d2 <= 31:
                if d1 > d2: d1, d2 = d2, d1
                return d1, d2

        if any(k in clean for k in ["17", "30", "31"]):
            return 17, 31
        return 1, 16

    def upload(self, report, path, file_name, date=None, **kwargs):
        """Read an Excel file and store it in ``report['uploads']``.

        The caller may provide a ``date`` argument or a ``range_key`` in
        ``kwargs``. If neither is supplied we fall back to inferring the range
        from the file name (looking for "1-16" or "17-30"). The DataFrame is
        stored under that key, overwriting any existing entry.
        """
        # Determine the key for this upload and store exact start/end day bounds
        start_day, end_day = self._parse_days(file_name, upload_meta=kwargs, config=report.get("config", {}))
        key = f"{start_day}-{end_day}"

        # Ensure the uploads list exists
        report.setdefault("uploads", [])
        
        storage_path = kwargs.get("storage_path")
        
        upload_entry = {
            "date": key,
            "range_key": key,
            "start_day": start_day,
            "end_day": end_day,
            "file": file_name,
            "path": path,
            "storage_path": storage_path,
            "status": "uploaded"
        }

        # Find existing entry for this date key (or range key) and replace it.
        updated = False
        for u in report["uploads"]:
            if u.get("date") == key or u.get("range_key") == key:
                u.update(upload_entry)
                # Ensure we also remove any legacy data key if overwriting
                u.pop("data", None)
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

    def _select_uploads(self, uploads, sel_start_day=None, sel_end_day=None):
        if not uploads:
            return []

        uploads_meta = []
        for u in uploads:
            u_start_day, u_end_day = self._parse_days(u.get("file") or u.get("path"), upload_meta=u)
            u_copied = dict(u)
            u_copied["start_day"] = u_start_day
            u_copied["end_day"] = u_end_day
            uploads_meta.append(u_copied)

        if sel_start_day is None or sel_end_day is None:
            set1 = [u for u in uploads_meta if u["start_day"] <= 16 and u["end_day"] <= 16]
            set2 = [u for u in uploads_meta if u["start_day"] > 16 or u["end_day"] > 16]
            res = []
            if set1:
                res.append(sorted(set1, key=lambda x: x["end_day"])[-1])
            if set2:
                latest_set2 = sorted(set2, key=lambda x: x["end_day"])[-1]
                if not res or latest_set2["file"] != res[0]["file"]:
                    res.append(latest_set2)
            return res

        # 1. If requested end day <= 16 (e.g. range 1-12 or 1-16):
        if sel_end_day <= 16:
            candidates = [u for u in uploads_meta if u.get("status") == "uploaded" and u["start_day"] <= sel_end_day and u["end_day"] <= sel_end_day]
            if candidates:
                # Check if there is a cumulative upload covering from ~1 to sel_end_day (e.g. 1-16)
                cum = [u for u in candidates if u["start_day"] <= sel_start_day and u["end_day"] == sel_end_day]
                if cum:
                    return [sorted(cum, key=lambda x: x["end_day"])[-1]]
                else:
                    # Collect non-overlapping sequential daily uploads (e.g. 1-1 + 2-2 + ... 16-16)
                    sorted_cand = sorted(candidates, key=lambda x: (x["start_day"], x["end_day"]))
                    res = []
                    curr_end = 0
                    for u in sorted_cand:
                        if u["start_day"] > curr_end:
                            res.append(u)
                            curr_end = u["end_day"]
                        elif u["end_day"] > curr_end:
                            if res and res[-1]["start_day"] == u["start_day"]:
                                res[-1] = u
                            else:
                                res.append(u)
                            curr_end = u["end_day"]
                    return res if res else [sorted(candidates, key=lambda x: x["end_day"])[-1]]
            else:
                uploaded_meta = [u for u in uploads_meta if u.get("status") == "uploaded"]
                if uploaded_meta:
                    return [sorted(uploaded_meta, key=lambda x: abs(x["end_day"] - sel_end_day))[0]]
                return []

        # 2. If requested start day > 16 (e.g. 17-19, 17-20, 17-30):
        if sel_start_day > 16:
            candidates = [u for u in uploads_meta if u.get("status") == "uploaded" and u["start_day"] >= sel_start_day and u["end_day"] <= sel_end_day]
            if not candidates:
                candidates = [u for u in uploads_meta if u.get("status") == "uploaded" and u["start_day"] <= sel_start_day and u["end_day"] >= sel_start_day]
            
            if candidates:
                exact = [u for u in candidates if u["start_day"] == sel_start_day and u["end_day"] == sel_end_day]
                if exact:
                    return [sorted(exact, key=lambda x: x["end_day"])[-1]]
                sorted_cand = sorted(candidates, key=lambda x: (x["start_day"], x["end_day"]))
                return [sorted_cand[-1]]
            return []

        # 3. If requested end day > 16 and start day <= 16 (e.g. 1-17, 1-25, 1-30, 1-31):
        if sel_start_day <= 2 and sel_end_day >= 28:
            full_month = [u for u in uploads_meta if u["start_day"] <= sel_start_day and u["end_day"] >= sel_end_day]
            if full_month:
                return [sorted(full_month, key=lambda x: x["end_day"])[-1]]

        # Select Set 1 (ending <= sel_end_day, capped at 16) and Set 2 (ending <= sel_end_day)
        set1 = [u for u in uploads_meta if u["start_day"] <= 16 and u["end_day"] <= 16]
        set2 = [u for u in uploads_meta if u["start_day"] >= 16 or u["end_day"] > 16]

        res = []
        if set1:
            valid_set1 = [u for u in set1 if u["end_day"] <= sel_end_day]
            if valid_set1:
                res.append(sorted(valid_set1, key=lambda x: x["end_day"])[-1])
            else:
                res.append(sorted(set1, key=lambda x: x["end_day"])[-1])

        if set2:
            valid_set2 = [u for u in set2 if u["start_day"] <= sel_end_day]
            if valid_set2:
                cum_set2 = [u for u in valid_set2 if u["start_day"] <= 17 and u["end_day"] == sel_end_day]
                if cum_set2:
                    latest_set2 = sorted(cum_set2, key=lambda x: x["end_day"])[-1]
                    if not res or latest_set2["file"] != res[0]["file"]:
                        res.append(latest_set2)
                else:
                    sorted_set2 = sorted(valid_set2, key=lambda x: (x["start_day"], x["end_day"]))
                    match_s2 = [u for u in sorted_set2 if u["end_day"] <= sel_end_day]
                    best_s2 = match_s2[-1] if match_s2 else sorted_set2[0]
                    if not res or best_s2["file"] != res[0]["file"]:
                        res.append(best_s2)

        return res

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
        
        print(f"[DEBUG] get_report query: start_date={start_date}, end_date={end_date}, parsed sel_start_day={sel_start_day}, sel_end_day={sel_end_day}")

        selected_uploads = self._select_uploads(uploads, sel_start_day, sel_end_day)
        print(f"[DEBUG] Selected uploads for range {sel_start_day}-{sel_end_day}: {[u.get('file') for u in selected_uploads]}")

        # Build DataFrames from selected upload entries
        dfs = []
        for u in selected_uploads:
            r_key = u.get("range_key") or u.get("date", "default")
            u_start_day = u.get("start_day")
            u_end_day = u.get("end_day")
            print(f"[DEBUG] Processing selected upload: '{u.get('file')}' (key={r_key})")
                
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
        shop_to_bond, shop_to_wh = get_shop_to_parent_maps()
        full_df["bond_info"] = full_df[shop_col].map(shop_to_bond).fillna("Unknown")
        
        wh_col = find_column(full_df, ["warehouse"])
        if wh_col:
            full_df["warehouse_info"] = full_df[wh_col].astype(str).str.strip()
        else:
            full_df["warehouse_info"] = full_df[shop_col].map(shop_to_wh).fillna("Unknown")

        # Helper clean functions
        def clean_wh_name(val):
            if not val: return ""
            v = str(val).upper().strip()
            v = re.sub(r"^WH[-_/\s]+", "", v)
            v = re.sub(r"\s+FL.*$", "", v)
            v = re.sub(r"[-_/].*$", "", v)
            return v.strip()

        def clean_bond_name(val):
            if not val: return ""
            return str(val).upper().replace("-", "").replace("_", "").replace(" ", "").strip()

        # Filtering
        if shop_code:
            full_df = full_df[full_df[shop_col] == str(shop_code).strip()]
        if warehouse:
            c_target = clean_wh_name(warehouse)
            def matches_wh(row):
                r_wh = str(row.get("warehouse_info", ""))
                s_code = str(row.get(shop_col, "")).strip()
                c_raw = clean_wh_name(r_wh)
                c_map = clean_wh_name(shop_to_wh.get(s_code, ""))
                if c_raw and (c_target == c_raw or c_target in c_raw or c_raw in c_target):
                    return True
                if c_map and (c_target == c_map or c_target in c_map or c_map in c_target):
                    return True
                return False

            full_df = full_df[full_df.apply(matches_wh, axis=1)]

        if bond:
            c_target = clean_bond_name(bond)
            def matches_bond(row):
                r_bond = str(row.get("bond_info", ""))
                s_code = str(row.get(shop_col, "")).strip()
                c_raw = clean_bond_name(r_bond)
                c_map = clean_bond_name(shop_to_bond.get(s_code, ""))
                if c_raw and (c_target == c_raw or c_target in c_raw or c_raw in c_target):
                    return True
                if c_map and (c_target == c_map or c_target in c_map or c_map in c_target):
                    return True
                return False

            full_df = full_df[full_df.apply(matches_bond, axis=1)]

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
                
            return {"data": final_res, "uploads": selected_uploads, "config": config_out}

        return {"data": result, "uploads": selected_uploads, "config": config_out}

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
