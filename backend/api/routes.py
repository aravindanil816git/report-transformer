from fastapi import APIRouter, UploadFile, File, HTTPException, Path, Body, Query
from fastapi.responses import FileResponse
import shutil
import uuid
import pandas as pd
import os
import math
import time

from services.db import supabase
from services.registry import get_service

from core.utils import read_excel_robust
from core.mapping_utils import get_warehouse_mapping_data, get_bond_mapping_data, get_warehouse_master_data, clear_mapping_caches

router = APIRouter()


RAW_DATA_TYPES = [
    "shopwise",
    "shop_sales_cumulative",
    "daily_warehouse",
    "daily_warehouse_offtake",
    "daily_secondary_sales",
    "warehouse_stock",
]

# ================= GLOBAL CLEANER =================
def fast_clean_records(records):
    """Flat, non-recursive cleaner for massive arrays of dicts to prevent CPU freezing."""
    if not isinstance(records, list):
        return records
    out = []
    for item in records:
        if isinstance(item, dict):
            clean_item = {}
            for k, v in item.items():
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    clean_item[k] = None
                else:
                    clean_item[k] = v
            out.append(clean_item)
        else:
            out.append(item)
    return out

def clean_nan(obj, memo=None):
    if memo is None:
        memo = set()
        
    obj_id = id(obj)
    if obj_id in memo:
        return None  # Break circular reference safely
        
    if isinstance(obj, dict):
        memo.add(obj_id)
        res = {}
        for k, v in obj.items():
            # 🔥 Optimization 4: Skip deep recursion for massive arrays to stop server from freezing
            if k in ["data", "processed", "_live_source"] and isinstance(v, list):
                res[k] = fast_clean_records(v)
            elif k == "uploads" and isinstance(v, list):
                new_uploads = []
                for u in v:
                    if isinstance(u, dict):
                        clean_u = {}
                        for uk, uv in u.items():
                            if uk == "data" and isinstance(uv, list):
                                clean_u[uk] = fast_clean_records(uv)
                            else:
                                clean_u[uk] = clean_nan(uv, memo)
                        new_uploads.append(clean_u)
                    else:
                        new_uploads.append(clean_nan(u, memo))
                res[k] = new_uploads
            else:
                res[k] = clean_nan(v, memo)
        memo.remove(obj_id)
        return res
    elif isinstance(obj, list):
        memo.add(obj_id)
        res = [clean_nan(v, memo) for v in obj]
        memo.remove(obj_id)
        return res
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


# ================= DB HELPERS =================
def get_all_reports(types: list = None, columns: str = "id, name, type, status, config, uploads, created_at, path, file, storage_path"):
    query = supabase.table("reports").select(columns)
    if types:
        query = query.in_("type", types)
    res = query.execute()
    return res.data

def get_report_by_id(rid: str):
    res = supabase.table("reports").select("*").eq("id", rid).execute()
    return res.data[0] if res.data else None

def save_report(report: dict):
    clean_rep = clean_nan(report)
    # 🔥 Optimization 1: Upsert halves the database save time
    supabase.table("reports").upsert(clean_rep).execute()

def delete_report_by_id(rid: str):
    supabase.table("reports").delete().eq("id", rid).execute()


# ================= CACHE CLEANUP =================
def cleanup_temp_folder(days_to_keep=3):
    """Prevents local disk exhaustion by deleting cached files older than X days."""
    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "temp"))
    if not os.path.exists(temp_dir): return
    
    now = time.time()
    for filename in os.listdir(temp_dir):
        file_path = os.path.join(temp_dir, filename)
        if os.path.isfile(file_path):
            if os.stat(file_path).st_mtime < now - (days_to_keep * 86400):
                try: os.remove(file_path)
                except Exception: pass


# ================= FILE HELPERS =================
def ensure_local_file(storage_path, local_path):
    """If the server restarted and the local file is missing, fetch it from Supabase!"""
    if storage_path and local_path and not os.path.exists(local_path):
        try:
            res = supabase.storage.from_("raw-reports").download(storage_path)
            os.makedirs(os.path.dirname(local_path) or ".", exist_ok=True)
            with open(local_path, "wb") as f:
                f.write(res)
        except Exception as e:
            print(f"Warning: Failed to download {storage_path} from Supabase: {e}")

# ================= SYNC DATA =================
def sync_cumulative_report(report, all_reports=None):
    if report.get("type") not in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        return
    
    # Target to allowed source types
    source_map = {
        "cumulative_shopwise": ["shopwise", "cumulative_shopwise"],
        "cumulative_warehouse": ["daily_warehouse_offtake", "cumulative_warehouse"],
        "dailywise_secondary_sales_cum": ["daily_warehouse_offtake", "dailywise_secondary_sales_cum"],
        "brandwise_cum_secondary_sales": ["daily_warehouse_offtake", "brandwise_cum_secondary_sales"],
        "combined_shopwise": ["shop_sales_cumulative", "combined_shopwise"]
    }
    allowed_sources = source_map.get(report["type"], [])
    
    # 🔥 30-DAY SCALE OPTIMIZATION: If all days are already uploaded, skip downloading the massive historical database into RAM
    pending_dates = [u.get("date") for u in report.get("uploads", []) if u.get("status") != "uploaded" and u.get("date")]
    if not pending_dates and report.get("type") != "combined_shopwise":
        return

    if all_reports is None:
        all_reports = get_all_reports(types=allowed_sources, columns="id, name, type, status, config, uploads, created_at, path, file, storage_path, data")
        
    original_status = report.get("status")
    
    # primary source mapping for daily reports
    primary_source_map = {
        "cumulative_shopwise": "shopwise",
        "cumulative_warehouse": "daily_warehouse_offtake",
        "dailywise_secondary_sales_cum": "daily_warehouse_offtake",
        "brandwise_cum_secondary_sales": "daily_warehouse_offtake",
        "combined_shopwise": "shop_sales_cumulative"
    }
    primary_source = primary_source_map.get(report["type"])
    
    # Build global map of available data by date
    available_data = {}
    
    for r in all_reports:
        if r.get("id") == report.get("id"): continue
        if r.get("status") not in ["Ready", "Processed", "Uploaded"]: continue
        if r.get("type") not in allowed_sources: continue
        
        # 1. check config date (daily reports)
        d = r.get("config", {}).get("date")
        if d:
            source_data = None
            if r.get("type") == "daily_secondary_sales":
                # For daily_secondary_sales, data is scattered in uploads. We need to combine it.
                combined_data = []
                for u_source in r.get("uploads", []):
                    if u_source.get("status") == "uploaded" and u_source.get("data"):
                        combined_data.extend(u_source["data"])
                if combined_data:
                    source_data = combined_data
            elif r.get("data"):
                source_data = r.get("data")

            if source_data and (r.get("type") == primary_source or d not in available_data):
                available_data[d] = source_data

        # 2. check uploads (cumulative reports)
        for u in r.get("uploads", []):
            ud = u.get("date")
            if ud and u.get("status") == "uploaded" and u.get("data"):
                # Daily reports take priority
                if ud not in available_data:
                   available_data[ud] = u["data"]
                   
    # Special-case range-based shop sales cumulative uploads for combined_shopwise reports.
    # These uploads are stored by range (e.g. 1-16 / 17-30) instead of daily dates,
    # so the normal per-day mapping cannot link them. If we find a matching
    # shop_sales_cumulative source report for the same date range, reuse its
    # uploaded range entries directly.
    if report.get("type") == "combined_shopwise":
        source_uploads_map = {}
        for r in all_reports:
            if r.get("id") == report.get("id"): continue
            if r.get("type") != "shop_sales_cumulative": continue
            if r.get("status") not in ["Ready", "Processed", "Uploaded"]: continue
            r_month = str(r.get("config", {}).get("date1") or "")[:7]
            rep_month = str(report.get("config", {}).get("date1") or report.get("config", {}).get("start_date") or "")[:7]
            if r_month and rep_month and r_month == rep_month:
                # Accumulate uploads from ALL matching shop_sales_cumulative reports for the month
                for u in r.get("uploads", []):
                    if u.get("status") == "uploaded" and u.get("data"):
                        rk = u.get("range_key") or u.get("date") or "1-16"
                        source_uploads_map[rk] = {**u, "status": "uploaded"}

        if source_uploads_map:
            report["uploads"] = list(source_uploads_map.values())
            if report.get("status") != "Processed":
                report["status"] = "Ready"
            return

    # Now update current report
    changed = False
    for u in report.get("uploads", []):
        if u.get("status") != "uploaded":
            dt = u.get("date")
            if dt in available_data:
                u["status"] = "uploaded"
                u["data"] = available_data[dt]
                u["file"] = "Auto-synced from system"
                changed = True
                
    if changed:
        # Update report status
        up_count = sum(1 for u in report["uploads"] if u.get("status") == "uploaded")
        if up_count == len(report["uploads"]) and len(report["uploads"]) > 0:
            if report.get("status") != "Processed":
                report["status"] = "Ready"
        elif up_count > 0:
            if report.get("status") != "Processed":
                report["status"] = "Uploaded"
                
    if changed or report.get("status") != original_status:
        save_report(report)


# ================= CREATE REPORT =================
@router.post("/reports")
def create_report(
    name: str,
    type: str,
    date: str = None,
    date1: str = None,
    date2: str = None
):
    rid = str(uuid.uuid4())

    uploads = []
    config = {}

    # 🔥 DAILY SECONDARY
    if type == "daily_secondary_sales":
        # Use master warehouse data instead of static mapping
        from core.mapping_utils import get_warehouse_master_data

        master_data = get_warehouse_master_data()
        # master_data is a dict where keys are warehouse identifiers
        uploads = [
            {
                "warehouse": wh,
                "file": None,
                "path": None,
                "status": "pending",
                "data": None
            }
            for wh in master_data.keys()
        ]

        config = {"date": date}

    # 🔥 DAILY WAREHOUSE
    elif type == "daily_warehouse":
        from core.mapping_utils import get_warehouse_master_data

        master_data = get_warehouse_master_data()
        uploads = [
            {
                "warehouse": wh,
                "file": None,
                "status": "pending",
                "data": None
            }
            for wh in master_data.keys()
        ]

        config = {"date": date}

    # 🔥 DAILY WAREHOUSE OFFTAKE
    elif type == "daily_warehouse_offtake":
        config = {"date": date}

    # 🔥 SHOPWISE
    elif type == "shopwise":
        config = {"date": date}

    elif type == "shop_sales_cumulative":
        config = {"date1": date1, "date2": date2}

    # 🔥 MONTHLY STOCK SALES & ACHIEVED TARGET
    elif type in ["monthly_stock_sales", "achieved_target"]:
        config = {"month": str(date)[:7] if date else None}

    # 🔥 WAREHOUSE STOCK
    elif type == "warehouse_stock":
        from core.mapping_utils import get_warehouse_master_data
        master_data = get_warehouse_master_data()
        uploads = [
            {
                "warehouse": wh,
                "file": None,
                "status": "pending",
                "data": None
            }
            for wh in master_data.keys()
        ]
        config = {"date": date}

    # 🔥 MONTH COMPARATIVE
    elif type == "month_comparative":
        config = {"date1": date1, "date2": date2}

    # 🔥 CUMULATIVE REPORTS
    elif type in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        from datetime import datetime, timedelta
        start = datetime.strptime(date1, "%Y-%m-%d")
        end = datetime.strptime(date2, "%Y-%m-%d")
        num_days = (end - start).days + 1

        uploads = []
        for i in range(num_days):
            dt_str = (start + timedelta(days=i)).strftime("%Y-%m-%d")
            uploads.append({
                "date": dt_str,
                "file": None,
                "status": "pending",
                "data": None
            })

        config = {
            "start_date": date1,
            "end_date": date2,
            "num_days": num_days
        }

    report = {
        "id": rid,
        "name": name,
        "type": type,
        "status": "Created",
        "uploads": uploads,
        "processed": None,
        "config": config
    }
    save_report(report)

    # Auto-create brandwise report from dailywise
    if type == "dailywise_secondary_sales_cum":
        brandwise_rid = str(uuid.uuid4())
        brandwise_report = {
            "id": brandwise_rid,
            "name": name,
            "type": "brandwise_cum_secondary_sales",
            "status": "Created",
            "uploads": [u.copy() for u in uploads],
            "processed": None,
            "config": config.copy()
        }
        save_report(brandwise_report)
        sync_cumulative_report(brandwise_report)

    # 🔥 Try to auto-link data immediately
    sync_cumulative_report(report)

    # 🔥 AUTO PROCESS FOR MONTHLY REPORT
    if type in ["monthly_stock_sales", "achieved_target"]:
        svc = get_service(type)

        report["all_reports"] = [
            r for r in get_all_reports(columns="id, name, type, status, config, uploads, created_at, path, file, storage_path, data, processed") if r["id"] != rid
        ]

        svc.process(report)

        report["status"] = "Processed"
        report.pop("all_reports", None)
        save_report(report)

    return clean_nan(report)

# ================= JSON CRUD ENDPOINTS =================
import json
import os
# Resolve file paths relative to this file's directory using os.path (avoids pathlib dependency)
# BASE_DIR should point to the project root (two levels up from this file)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ALLOWED_JSON_FILES = {
    "bond_mapping": os.path.join(BASE_DIR, "backend", "bond_mapping.json"),
    "bonds": os.path.join(BASE_DIR, "backend", "bonds.json"),
    "shops": os.path.join(BASE_DIR, "backend", "shops.json"),
    "warehouses": os.path.join(BASE_DIR, "backend", "warehouses.json"),
}

def _load_json(name: str):
    path = ALLOWED_JSON_FILES.get(name)
    if not path:
        raise HTTPException(status_code=404, detail="JSON file not found")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"File {path} not found")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_json(name: str, data):
    path = ALLOWED_JSON_FILES.get(name)
    if not path:
        raise HTTPException(status_code=404, detail="JSON file not found")
    # Ensure directory exists
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@router.get("/json/{name}")
def get_json(name: str = Path(..., description="One of the allowed JSON identifiers")):
    """Return the full content of a JSON file."""
    return _load_json(name)

@router.post("/json/{name}")
def replace_json(name: str, payload: dict = Body(...)):
    """Replace the entire JSON file with the provided payload."""
    _save_json(name, payload)
    clear_mapping_caches()
    return {"status": "replaced"}

@router.put("/json/{name}/{key}")
def update_json_key(name: str, key: str, payload: dict = Body(...)):
    """Update or add a top‑level key in the JSON file."""
    data = _load_json(name)
    
    # Handle programmatic key renaming and cascading (e.g., Shop Code changed)
    if name == "shops":
        new_key = str(payload.get("shop_code", payload.get("code", key)))
        if new_key != str(key):
            if key in data:
                del data[key]
            
            # Cascade update to bond_mapping
            try:
                bond_mapping = _load_json("bond_mapping")
                bond_changed = False
                for bond_name, bond_data in bond_mapping.items():
                    shops_list = bond_data.get("shops", [])
                    for i, shop_id in enumerate(shops_list):
                        if isinstance(shop_id, dict) and str(shop_id.get("shop_code")) == str(key):
                            shops_list[i]["shop_code"] = new_key
                            bond_changed = True
                        elif str(shop_id) == str(key):
                            shops_list[i] = new_key
                            bond_changed = True
                if bond_changed:
                    _save_json("bond_mapping", bond_mapping)
            except Exception as e:
                print(f"DEBUG: Failed to cascade update: {e}")
                
            key = new_key

    data[key] = payload
    _save_json(name, data)
    clear_mapping_caches()
    return {"status": "updated", "key": key}

@router.delete("/json/{name}/{key}")
def delete_json_key(name: str, key: str):
    """Delete a top‑level key from the JSON file."""
    data = _load_json(name)
    if key in data:
        del data[key]
        _save_json(name, data)
        
        # Cascade delete from relationships programmatically
        if name == "shops":
            try:
                bond_mapping = _load_json("bond_mapping")
                bond_changed = False
                for bond_name, bond_data in bond_mapping.items():
                    original_len = len(bond_data.get("shops", []))
                    bond_data["shops"] = [
                        s for s in bond_data.get("shops", []) 
                        if (str(s.get("shop_code")) if isinstance(s, dict) else str(s)) != str(key)
                    ]
                    if len(bond_data["shops"]) < original_len:
                        bond_changed = True
                if bond_changed:
                    _save_json("bond_mapping", bond_mapping)
            except Exception as e:
                print(f"DEBUG: Failed to cascade delete: {e}")
                
        clear_mapping_caches()
        return {"status": "deleted", "key": key}
    raise HTTPException(status_code=404, detail="Key not found")


# ================= LIST REPORTS =================
def ensure_defaults_exist():
    from datetime import datetime
    current_year = datetime.now().year
    current_month = datetime.now().strftime("%Y-%m")
    month_name = datetime.now().strftime("%B %Y")
    
    # 🔥 Optimization 2: Only fetch what is needed for existence check
    res = supabase.table("reports").select("name, type").execute()
    all_reports = res.data
    
    yearly_defaults = [
        "cumulative_shopwise",
        "cumulative_warehouse",
        "combined_shopwise",
        "dailywise_secondary_sales_cum"
    ]
    for dtype in yearly_defaults:
        name = f"Default - {current_year}"
        exists = any(r.get("type") == dtype and r.get("name") == name for r in all_reports)
        if not exists:
            create_report(name=name, type=dtype, date1=f"{current_year}-01-01", date2=f"{current_year}-12-31")
            
    monthly_defaults = [
        "achieved_target",
        "monthly_stock_sales"
    ]
    for dtype in monthly_defaults:
        name = f"Default - {month_name}"
        exists = any(r.get("type") == dtype and r.get("name") == name for r in all_reports)
        if not exists:
            create_report(name=name, type=dtype, date=f"{current_month}-01")

@router.get("/reports")
def list_reports(
    type: str = Query(None, description="Filter by report type"),
    exclude_raw: bool = Query(False, description="Exclude raw data reports"),
    skip: int = Query(0, description="Pagination skip"),
    limit: int = Query(100, description="Pagination limit")
):
    # Run a quick background cleanup of old temp files so the disk never fills up
    cleanup_temp_folder(days_to_keep=3)

    ensure_defaults_exist()
    clean = []

    # 🔥 Optimization 3: DO NOT fetch 'data' or 'processed' columns! They are massive over the network.
    query = supabase.table("reports").select("id, name, type, status, config, uploads, created_at")
    
    if type:
        query = query.eq("type", type)
        
    res = query.execute()
    all_reps = res.data
    
    if exclude_raw:
        all_reps = [r for r in all_reps if r.get("type") not in RAW_DATA_TYPES and r.get("type") != "month_comparative"]
        
    total = len(all_reps)
    paginated = all_reps[skip : skip + limit]

    for r in paginated:
        
        r_copy = dict(r)

        uploads = []
        for u in r_copy.get("uploads", []):
            if isinstance(u, dict):
                u_copy = dict(u)
                u_copy.pop("data", None)
                uploads.append(u_copy)

        r_copy["uploads"] = uploads
        clean.append(r_copy)

    return clean_nan({
        "items": clean,
        "total": total,
        "skip": skip,
        "limit": limit
    })


# ================= FILTERS =================
@router.get("/warehouses/all")
def get_all_warehouses():
    """Return the list of all warehouse identifiers from the master data file.
    Previously this used a static mapping; now it reads the central warehouses.json
    via ``get_warehouse_master_data`` which loads the JSON defined in
    ``backend/warehouses.json``.
    """
    master = get_warehouse_master_data()
    # master is a dict where keys are warehouse IDs
    return sorted(master.keys())

@router.get("/warehouses/{rid}")
def get_warehouses(rid: str):
    report = get_report_by_id(rid)
    if not report: return []
    
    # 🔥 For Shopwise, get dynamic filters from data
    if report.get("type") == "shopwise":
        svc = get_service("shopwise")
        filters = svc.get_filters(report)
        return filters.get("warehouses", [])

    # Return all warehouses defined for this report
    if report.get("uploads"):
        whs = [u.get("warehouse") for u in report["uploads"] if u.get("warehouse")]
        if whs: return whs
    
    # fallback to simplified warehouse mapping if no uploads list
    return list(get_warehouse_mapping_data().keys())

@router.get("/filters/{rid}")
def get_report_filters(rid: str):
    report = get_report_by_id(rid)
    if not report: return {}
    
    svc = get_service(report["type"])
    if hasattr(svc, "get_filters"):
        return svc.get_filters(report)
    return {}

@router.get("/shops/{rid}")
def get_shops(rid: str, warehouse: str = None):
    report = get_report_by_id(rid)
    if not report: return []
    
    warehouse_mapping = get_warehouse_mapping_data()
    bond_mapping = get_bond_mapping_data()
    found_shops = []
    target_wh = warehouse.upper() if warehouse else None

    # Check warehouse-level shop listing first
    for wh_name, wh_data in warehouse_mapping.items():
        if not target_wh or target_wh in wh_name.upper() or wh_name.upper() in target_wh:
            for shop in wh_data.get("shops", []):
                found_shops.append({
                    "value": shop["shop_code"],
                    "label": f"{shop['shop_code']} - {shop['shop_name']}"
                })

    # Then check bond-level fallbacks if no warehouse matches
    if not found_shops:
        for bond_name, bond_data in bond_mapping.items():
            if not target_wh or target_wh in bond_name.upper() or bond_name.upper() in target_wh:
                for shop in bond_data.get("shops", []):
                    found_shops.append({
                        "value": shop["shop_code"],
                        "label": f"{shop['shop_code']} - {shop['shop_name']}"
                    })

    return found_shops


# ================= UPLOAD =================
@router.post("/upload/{rid}")
async def upload(
    rid: str,
    file: UploadFile = File(...),
    key: str = ""
):
    report = get_report_by_id(rid)
    if not report: raise HTTPException(status_code=404, detail="Report not found")

    temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "temp"))
    os.makedirs(temp_dir, exist_ok=True)
    path = os.path.join(temp_dir, f"{rid}_{file.filename}")

    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 🔥 PUSH TO SUPABASE STORAGE
    storage_path = f"{rid}/{file.filename}"
    try:
        supabase.storage.from_("raw-reports").upload(
            path=storage_path, 
            file=path, 
            file_options={"x-upsert": "true"}
        )
    except Exception as e:
        print(f"Supabase storage upload error: {e}")

    # 🔥 AUTO-DETECT WAREHOUSE IF KEY IS MISSING
    detected_key = key
    if not detected_key or detected_key == "auto":
        possible_warehouses = [u["warehouse"] for u in report.get("uploads", []) if "warehouse" in u]
        if possible_warehouses:
            try:
                # We read the first few lines manually to be more robust
                df_raw = read_excel_robust(path, header=None, nrows=20)
                for i in range(len(df_raw)):
                    row_str = " ".join([str(x) for x in df_raw.iloc[i].values if str(x) != "nan"]).upper()
                    # Sort by length descending to match longest warehouse name first (to avoid partial matches)
                    for wh in sorted(possible_warehouses, key=len, reverse=True):
                        if wh.upper() in row_str:
                            detected_key = wh
                            print(f"DEBUG: Auto-detected warehouse: {detected_key}")
                            break
                    if detected_key and detected_key != "auto":
                        break
            except Exception as e:
                print(f"DEBUG: Error auto-detecting: {e}")

    match_found = False
    if report["type"] == "daily_secondary_sales":
        for u in report["uploads"]:
            if u["warehouse"].strip().upper() == detected_key.strip().upper():
                df = read_excel_robust(path)
                df = df.replace({pd.NA: None})
                df = df.astype(object).where(pd.notnull(df), None)
                report_date = report.get("config", {}).get("date")
                u["file"] = file.filename
                u["path"] = path
                u["from"] = report_date
                u["to"] = report_date
                u["status"] = "uploaded"
                u["storage_path"] = storage_path
                u["data"] = df.to_dict("records")
                match_found = True
                break

    elif report["type"] in ["daily_warehouse", "warehouse_stock"]:
        for u in report["uploads"]:
            if u["warehouse"].strip().upper() == detected_key.strip().upper():
                report_date = report.get("config", {}).get("date") or report.get("config", {}).get("month")
                u["file"] = file.filename
                u["from"] = report_date
                u["to"] = report_date
                u["status"] = "uploaded"
                u["path"] = path
                u["storage_path"] = storage_path
                if report["type"] == "warehouse_stock":
                    df = read_excel_robust(path)
                    df = df.replace({pd.NA: None}).astype(object).where(pd.notnull(df), None)
                    u["data"] = df.to_dict("records")
                match_found = True
                break

    elif report["type"] == "shopwise":
        svc = get_service("shopwise")
        report_date = report.get("config", {}).get("date")
        svc.upload(report, path, file.filename, report_date, report_date)
        report["path"] = path
        report["file"] = file.filename
        report["storage_path"] = storage_path
        report["status"] = "Ready"
        save_report(report)
        return {"status": "uploaded"}

    elif report["type"] == "shop_sales_cumulative":
        # Use the combined_shopwise service (now multi‑upload) for handling the upload
        svc = get_service("combined_shopwise")
        # Let the upload service infer the correct range key from the file name
        # or the file contents instead of forcing a key from the report date range.
        svc.upload(report, path, file.filename)
        report["path"] = path
        report["file"] = file.filename
        report["storage_path"] = storage_path
        report["status"] = "Ready"
        save_report(report)

        # If a combined_shopwise report exists for the same date range, sync it immediately.
        for other in get_all_reports(types=["combined_shopwise"], columns="id, name, type, status, config, uploads, created_at, path, file, storage_path, data"):
            if other.get("id") == rid:
                continue
            if other.get("type") == "combined_shopwise":
                sync_cumulative_report(other)
                # Auto-process the linked report so the user doesn't have to manually click it
                get_service("combined_shopwise").process(other)
                other["status"] = "Processed"
                save_report(other)

        return {"status": "uploaded"}

    elif report["type"] == "daily_warehouse_offtake":
        svc = get_service("daily_warehouse_offtake")
        svc.upload(report, path, file.filename, report.get("config", {}).get("date"))
        report["path"] = path
        report["file"] = file.filename
        report["storage_path"] = storage_path
        report["status"] = "Ready"
        save_report(report)
        return {"status": "uploaded"}

    elif report["type"] in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        for u in report["uploads"]:
            if u["date"] == key:
                df = read_excel_robust(path)
                u["file"] = file.filename
                u["path"] = path
                u["storage_path"] = storage_path
                u["status"] = "uploaded"
                u["data"] = df.replace({pd.NA: None}).astype(object).where(pd.notnull(df), None).to_dict("records")
                match_found = True
                break

    if not match_found:
        if key == "auto":
            return {"status": "error", "message": f"Could not detect warehouse for {file.filename}"}
        else:
            return {"status": "error", "message": f"Target '{key}' not found"}

    uploaded = sum(1 for u in report["uploads"] if u.get("status") == "uploaded")

    if uploaded > 0:
        report["status"] = "Uploaded"

    if uploaded == len(report["uploads"]):
        report["status"] = "Ready"

    save_report(report)
    return {"status": "uploaded"}


# ================= PROCESS =================
@router.post("/process/{rid}")
def process(rid: str):
    report = get_report_by_id(rid)
    if not report: raise HTTPException(status_code=404, detail="Report not found")

    # 🔥 RESTORE FILES FROM SUPABASE IF MISSING LOCALLY BEFORE PROCESSING
    if report.get("storage_path") and report.get("path"):
        ensure_local_file(report["storage_path"], report["path"])
    for u in report.get("uploads", []):
        if u.get("storage_path") and u.get("path"):
            ensure_local_file(u["storage_path"], u["path"])

    if report["type"] == "monthly_stock_sales":
        report["all_reports"] = get_all_reports(types=["daily_warehouse", "warehouse_stock", "daily_secondary_sales"], columns="id, name, type, status, config, uploads, created_at, path, file, storage_path, data, processed")
    elif report["type"] == "achieved_target":
        report["all_reports"] = get_all_reports(types=["daily_secondary_sales", "daily_warehouse_offtake", "combined_shopwise", "combined_shopwise_multi", "shop_sales_cumulative"], columns="id, name, type, status, config, uploads, created_at, path, file, storage_path, data, processed")

    if report["type"] == "month_comparative":
        daily_reports = get_all_reports(types=["daily_secondary_sales"], columns="id, type, status, processed")

        combined = []
        for d in daily_reports:
            combined.extend(d.get("processed") or [])

        report["_live_source"] = combined

    original_start = None
    original_num = None
    original_end = None

    if report.get("type") in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        sync_cumulative_report(report)
        
        # Enforce Lazy Processing limits universally for all cumulative reports
        config = report.get("config", {})
        d1 = config.get("date1")
        d2 = config.get("date2")
        
        original_start = config.get("start_date")
        original_num = config.get("num_days")
        original_end = config.get("end_date")
        
        from datetime import datetime, timedelta
        
        if not d1 or not d2:
            d1 = original_start
            d2 = original_end

        if d1 and d2:
            # Safely extract just the date part in case an ISO timestamp is passed
            d1_clean = str(d1).split('T')[0].split(' ')[0]
            d2_clean = str(d2).split('T')[0].split(' ')[0]
            try:
                start_date = datetime.strptime(d1_clean, "%Y-%m-%d")
                end_date = datetime.strptime(d2_clean, "%Y-%m-%d")
                
                # 🔥 OOM SAFETY LIMIT: Universally prevent processing more than 35 days
                if (end_date - start_date).days > 35:
                    end_date = start_date + timedelta(days=35)
                    
                config["start_date"] = start_date.strftime("%Y-%m-%d")
                config["num_days"] = (end_date - start_date).days + 1
                config["end_date"] = end_date.strftime("%Y-%m-%d")
            except ValueError:
                pass # Ignore malformed dates

    try:
        svc = get_service(report["type"])
        svc.process(report)
    finally:
        # Safely restore original bounds so the frontend DatePicker doesn't get trapped if an error occurs
        if report.get("type") in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
            config = report.get("config", {})
            if original_start:
                config["start_date"] = original_start
                config["num_days"] = original_num
                config["end_date"] = original_end
                
        # 🔥 Prevent circular references & memory bloat
        report.pop("all_reports", None)
        report.pop("_live_source", None)

    report["status"] = "Processed"
    save_report(report)

    return {"status": "processed"}


# ================= UPDATE CONFIG =================
@router.put("/reports/{rid}/config")
def update_report_config(rid: str, payload: dict = Body(...)):
    report = get_report_by_id(rid)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.setdefault("config", {}).update(payload)
    save_report(report)
    return {"status": "success", "config": report["config"]}


# ================= LIVE COMPARISON =================
@router.get("/compare-live")
def compare_live(date1: str, date2: str):
    daily_reports = [
        r for r in get_all_reports(types=["daily_secondary_sales"], columns="id, type, status, processed")
        if r.get("status") == "Processed"
    ]

    combined = []
    for d in daily_reports:
        combined.extend(d.get("processed") or [])

    svc = get_service("month_comparative")
    
    # Create a dummy report object for the service
    dummy_report = {
        "config": {"date1": date1, "date2": date2},
        "_live_source": combined
    }
    
    svc.process(dummy_report)
    
    return {
        "data": dummy_report.get("processed", []),
        "date1": date1,
        "date2": date2
    }


# ================= GET REPORT =================
@router.get("/report/{rid}")
def get_report(
    rid: str, 
    shop_code: str = None, 
    view: str = "case",
    warehouse: str = None,
    bond: str = None,
    mode: str = "warehouse",
    start_idx: int = None,
        end_idx: int = None,
        start_date: str = None,
        end_date: str = None
):
    report = get_report_by_id(rid)

    if not report:
        return {"data": []}

    if report.get("type") in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        sync_cumulative_report(report)
        
        # Lazy processing on-the-fly if dates are provided via GET query
        if start_date and end_date:
            if start_date == "RESET" and end_date == "RESET":
                report.setdefault("config", {})["date1"] = None
                report.setdefault("config", {})["date2"] = None
            else:
                report.setdefault("config", {})["date1"] = start_date
                report.setdefault("config", {})["date2"] = end_date
            save_report(report)
            try:
                process(rid)
                report = get_report_by_id(rid)
            except Exception as e:
                print(f"Error during lazy process: {e}")

    svc = get_service(report["type"])
    
    # Pass all relevant filters
    kwargs = {}
    if shop_code: kwargs["shop_code"] = shop_code
    if view: kwargs["view"] = view
    if warehouse: kwargs["warehouse"] = warehouse
    if bond: kwargs["bond"] = bond
    if mode: kwargs["mode"] = mode
    if start_idx is not None: kwargs["start_idx"] = start_idx
    if end_idx is not None: kwargs["end_idx"] = end_idx
    
    result = svc.get_report(report, **kwargs)
    result["name"] = report.get("name")
    result["type"] = report.get("type")

    return clean_nan(result)


# ================= DELETE REPORT =================
@router.delete("/reports/{rid}")
def delete_report(rid: str):
    report = get_report_by_id(rid)
    if report:
        # 🔥 CLEAN UP LOCAL AND SUPABASE STORAGE FILES
        storage_paths = set()
        local_paths = set()

        if report.get("storage_path"): storage_paths.add(report["storage_path"])
        if report.get("path"): local_paths.add(report["path"])

        for u in report.get("uploads", []):
            if u.get("storage_path"): storage_paths.add(u["storage_path"])
            if u.get("path"): local_paths.add(u["path"])

        if storage_paths:
            try:
                supabase.storage.from_("raw-reports").remove(list(storage_paths))
            except Exception as e:
                print(f"Warning: Failed to delete files from Supabase Storage: {e}")

        for path in local_paths:
            if path and os.path.exists(path):
                try: os.remove(path)
                except: pass

        delete_report_by_id(rid)
        return {"status": "deleted"}
    return {"status": "error", "message": "Report not found"}


# ================= DOWNLOAD RAW =================
@router.get("/download-raw/{rid}")
def download_raw(rid: str, key: str = None):
    report = get_report_by_id(rid)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    path = None
    storage_path = None
    filename = "download.xlsx"

    if key:
        for u in report.get("uploads", []):
            if u.get("warehouse") == key or u.get("date") == key:
                path = u.get("path")
                storage_path = u.get("storage_path")
                filename = u.get("file", "download.xlsx")
                break
    else:
        # Fallback to single file types
        path = report.get("path")
        storage_path = report.get("storage_path")
        filename = report.get("file", "download.xlsx")

    if storage_path and path:
        ensure_local_file(storage_path, path)

    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(path, filename=filename)
