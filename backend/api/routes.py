from fastapi import APIRouter, UploadFile, File, HTTPException, Path, Body
from fastapi.responses import FileResponse
import shutil
import uuid
import pandas as pd
import os
import math

from services.store import reports
from services.registry import get_service

from core.utils import read_excel_robust
from core.mapping_utils import get_warehouse_mapping_data, get_bond_mapping_data, get_warehouse_master_data

router = APIRouter()


# ================= GLOBAL CLEANER =================
def clean_nan(obj):
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


# ================= SYNC DATA =================
def sync_cumulative_report(report):
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
    
    for r in reports.values():
        if r.get("id") == report.get("id"): continue
        if r.get("status") not in ["Ready", "Processed", "Uploaded"]: continue
        if r.get("type") not in allowed_sources: continue
        
        # 1. check config date (daily reports)
        d = r.get("config", {}).get("date")
        if d and r.get("data"):
            # Prioritize primary source or first found
            if r.get("type") == primary_source or d not in available_data:
                available_data[d] = r["data"]
            
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
        for r in reports.values():
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
    reports[rid] = report

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
        reports[brandwise_rid] = brandwise_report
        sync_cumulative_report(brandwise_report)

        # Auto-process brandwise report
        svc = get_service("brandwise_cum_secondary_sales")
        svc.process(brandwise_report)
        brandwise_report["status"] = "Processed"

    # 🔥 Try to auto-link data immediately
    sync_cumulative_report(report)

    # 🔥 AUTO PROCESS FOR MONTHLY REPORT
    if type in ["monthly_stock_sales", "achieved_target"]:
        svc = get_service(type)

        report["all_reports"] = [
            r for r in reports.values() if r["id"] != rid
        ]

        svc.process(report)

        report["status"] = "Processed"

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
    "warehouse_mapping": os.path.join(BASE_DIR, "backend", "warehouse_mapping.json"),
    "shopcode_mapping": os.path.join(BASE_DIR, "backend", "shopcode_mapping.json"),
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
    return {"status": "replaced"}

@router.put("/json/{name}/{key}")
def update_json_key(name: str, key: str, payload: dict = Body(...)):
    """Update or add a top‑level key in the JSON file."""
    data = _load_json(name)
    data[key] = payload
    _save_json(name, data)
    return {"status": "updated", "key": key}

@router.delete("/json/{name}/{key}")
def delete_json_key(name: str, key: str):
    """Delete a top‑level key from the JSON file."""
    data = _load_json(name)
    if key in data:
        del data[key]
        _save_json(name, data)
        return {"status": "deleted", "key": key}
    raise HTTPException(status_code=404, detail="Key not found")


# ================= LIST REPORTS =================
@router.get("/reports")
def list_reports():
    clean = []

    for r in reports.values():
        # 🔥 Dynamic sync for cumulative reports to catch new daily uploads
        sync_cumulative_report(r)
        
        r_copy = dict(r)

        uploads = []
        for u in r_copy.get("uploads", []):
            u_copy = dict(u)
            u_copy.pop("data", None)
            uploads.append(u_copy)

        r_copy["uploads"] = uploads
        clean.append(r_copy)

    return clean_nan(clean)


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
    report = reports.get(rid)
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
    report = reports.get(rid)
    if not report: return {}
    
    svc = get_service(report["type"])
    if hasattr(svc, "get_filters"):
        return svc.get_filters(report)
    return {}

@router.get("/shops/{rid}")
def get_shops(rid: str, warehouse: str = None):
    report = reports.get(rid)
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
    report = reports[rid]

    path = f"temp_{rid}_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 🔥 AUTO-DETECT WAREHOUSE IF KEY IS MISSING
    detected_key = key
    if not detected_key or detected_key == "auto":
        possible_warehouses = [u["warehouse"] for u in report.get("uploads", []) if "warehouse" in u]
        if possible_warehouses:
            try:
                # We read the first few lines manually to be more robust
                df_raw = read_excel_robust(path, header=None, nrows=10)
                for i in range(len(df_raw)):
                    row_str = " ".join([str(x) for x in df_raw.iloc[i].values if str(x) != "nan"]).upper()
                    if "WAREHOUSE" in row_str:
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
                u["data"] = df.to_dict("records")
                match_found = True
                break

    elif report["type"] == "daily_warehouse":
        for u in report["uploads"]:
            if u["warehouse"].strip().upper() == detected_key.strip().upper():
                report_date = report.get("config", {}).get("date")
                u["file"] = file.filename
                u["from"] = report_date
                u["to"] = report_date
                u["status"] = "uploaded"
                u["path"] = path
                match_found = True
                break

    elif report["type"] == "shopwise":
        svc = get_service("shopwise")
        report_date = report.get("config", {}).get("date")
        svc.upload(report, path, file.filename, report_date, report_date)
        report["path"] = path
        report["file"] = file.filename
        report["status"] = "Ready"
        return {"status": "uploaded"}

    elif report["type"] == "shop_sales_cumulative":
        # Use the combined_shopwise service (now multi‑upload) for handling the upload
        svc = get_service("combined_shopwise")
        # Let the upload service infer the correct range key from the file name
        # or the file contents instead of forcing a key from the report date range.
        svc.upload(report, path, file.filename)
        report["path"] = path
        report["file"] = file.filename
        report["status"] = "Ready"

        # If a combined_shopwise report exists for the same date range, sync it immediately.
        for other in reports.values():
            if other.get("id") == rid:
                continue
            if other.get("type") == "combined_shopwise":
                sync_cumulative_report(other)
                # Auto-process the linked report so the user doesn't have to manually click it
                get_service("combined_shopwise").process(other)
                other["status"] = "Processed"

        return {"status": "uploaded"}

    elif report["type"] == "daily_warehouse_offtake":
        svc = get_service("daily_warehouse_offtake")
        svc.upload(report, path, file.filename, report.get("config", {}).get("date"))
        report["path"] = path
        report["file"] = file.filename
        report["status"] = "Ready"
        return {"status": "uploaded"}

    elif report["type"] in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        for u in report["uploads"]:
            if u["date"] == key:
                df = read_excel_robust(path)
                u["file"] = file.filename
                u["path"] = path
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

    return {"status": "uploaded"}


# ================= PROCESS =================
@router.post("/process/{rid}")
def process(rid: str):
    report = reports[rid]

    if report["type"] in ["monthly_stock_sales", "achieved_target"]:
        report["all_reports"] = list(reports.values())

    if report["type"] == "month_comparative":
        daily_reports = [
            r for r in reports.values()
            if r["type"] == "daily_secondary_sales"
        ]

        combined = []
        for d in daily_reports:
            combined.extend(d.get("processed", []))

        report["_live_source"] = combined

    if report.get("type") in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        sync_cumulative_report(report)

    svc = get_service(report["type"])
    svc.process(report)

    report["status"] = "Processed"

    return {"status": "processed"}


# ================= UPDATE CONFIG =================
@router.put("/reports/{rid}/config")
def update_report_config(rid: str, payload: dict = Body(...)):
    report = reports.get(rid)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.setdefault("config", {}).update(payload)
    return {"status": "success", "config": report["config"]}


# ================= LIVE COMPARISON =================
@router.get("/compare-live")
def compare_live(date1: str, date2: str):
    daily_reports = [
        r for r in reports.values()
        if r["type"] == "daily_secondary_sales" and r.get("status") == "Processed"
    ]

    combined = []
    for d in daily_reports:
        combined.extend(d.get("processed", []))

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
    end_idx: int = None
):
    report = reports.get(rid)

    if not report:
        return {"data": []}

    if report.get("type") in ["cumulative_shopwise", "cumulative_warehouse", "combined_shopwise", "dailywise_secondary_sales_cum", "brandwise_cum_secondary_sales"]:
        sync_cumulative_report(report)

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

    return clean_nan(result)


# ================= DELETE REPORT =================
@router.delete("/reports/{rid}")
def delete_report(rid: str):
    if rid in reports:
        del reports[rid]
        return {"status": "deleted"}
    return {"status": "error", "message": "Report not found"}


# ================= DOWNLOAD RAW =================
@router.get("/download-raw/{rid}")
def download_raw(rid: str, key: str = None):
    report = reports.get(rid)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    path = None
    filename = "download.xlsx"

    if key:
        for u in report.get("uploads", []):
            if u.get("warehouse") == key or u.get("date") == key:
                path = u.get("path")
                filename = u.get("file", "download.xlsx")
                break
    else:
        # Fallback to single file types
        path = report.get("path")
        filename = report.get("file", "download.xlsx")

    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(path, filename=filename)
