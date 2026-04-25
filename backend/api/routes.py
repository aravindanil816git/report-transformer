from fastapi import APIRouter, UploadFile, File
import shutil
import uuid
import pandas as pd
import os
import math

from services.store import reports
from services.registry import get_service

from core.utils import read_excel_robust

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
        from services.reports.cumulative_warehouse import WAREHOUSE_TO_BOND

        uploads = [
            {
                "warehouse": wh,
                "file": None,
                "status": "pending",
                "data": None
            }
            for wh in WAREHOUSE_TO_BOND.keys()
        ]

        config = {"date": date}

    # 🔥 DAILY WAREHOUSE
    elif type == "daily_warehouse":
        from services.reports.cumulative_warehouse import WAREHOUSE_TO_BOND

        uploads = [
            {
                "warehouse": wh,
                "file": None,
                "status": "pending",
                "data": None
            }
            for wh in WAREHOUSE_TO_BOND.keys()
        ]

        config = {"date": date}

    # 🔥 SHOPWISE
    elif type == "shopwise":
        config = {"date": date}

    # 🔥 MONTHLY STOCK SALES (FIXED)
    elif type == "monthly_stock_sales":
        config = {"month": date}

    # 🔥 MONTH COMPARATIVE
    elif type == "month_comparative":
        config = {"date1": date1, "date2": date2}

    # 🔥 CUMULATIVE REPORTS
    elif type in ["cumulative_shopwise", "cumulative_warehouse"]:
        from datetime import datetime, timedelta
        start = datetime.strptime(date1, "%Y-%m-%d")
        end = datetime.strptime(date2, "%Y-%m-%d")
        num_days = (end - start).days + 1

        uploads = [
            {
                "date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
                "file": None,
                "status": "pending",
                "data": None
            }
            for i in range(num_days)
        ]

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

    # 🔥 AUTO PROCESS FOR MONTHLY REPORT
    if type == "monthly_stock_sales":
        svc = get_service(type)

        report["all_reports"] = [
            r for r in reports.values() if r["id"] != rid
        ]

        svc.process(report)

        report["status"] = "Processed"

    return clean_nan(report)


# ================= LIST REPORTS =================
@router.get("/reports")
def list_reports():
    clean = []

    for r in reports.values():
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
        return [u["warehouse"] for u in report["uploads"]]
    
    # fallback to mapping if no uploads list
    from services.reports.cumulative_warehouse import MAPPING
    return list(MAPPING.keys())

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
    
    from services.reports.cumulative_warehouse import MAPPING
    
    found_shops = []
    target_wh = warehouse.upper() if warehouse else None
    
    # MAPPING structure is "WH-NAME RFL9": { shops: ... }
    # OR bonds -> warehouses -> shops
    
    # Check top level first
    for wh_name, wh_data in MAPPING.items():
        if wh_name == "bonds": continue
        if not target_wh or target_wh in wh_name.upper() or wh_name.upper() in target_wh:
            for code, s_data in wh_data.get("shops", {}).items():
                found_shops.append({
                    "value": code,
                    "label": f"{code} - {s_data['shop_name']}"
                })
                
    # Then check bonds structure if empty
    if not found_shops:
        for bond, b_data in MAPPING.get("bonds", {}).items():
            for wh, w_data in b_data.get("warehouses", {}).items():
                if not target_wh or wh.upper() in target_wh or target_wh in wh.upper():
                    for code, s_data in w_data.get("shops", {}).items():
                        found_shops.append({
                            "value": code,
                            "label": f"{code} - {s_data['shop_name']}"
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
    possible_warehouses = [u["warehouse"] for u in report.get("uploads", [])]

    if not detected_key or detected_key == "auto":
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
                u["file"] = file.filename
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                match_found = True
                break

    elif report["type"] == "daily_warehouse":
        for u in report["uploads"]:
            if u["warehouse"].strip().upper() == detected_key.strip().upper():
                u["file"] = file.filename
                u["status"] = "uploaded"
                u["path"] = path
                match_found = True
                break

    elif report["type"] == "shopwise":
        svc = get_service("shopwise")
        svc.upload(report, path, file.filename, None, None)
        report["status"] = "Ready"
        return {"status": "uploaded"}

    elif report["type"] in ["cumulative_shopwise", "cumulative_warehouse"]:
        for u in report["uploads"]:
            if u["date"] == key:
                df = read_excel_robust(path)
                u["file"] = file.filename
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

    if report["type"] == "monthly_stock_sales":
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

    svc = get_service(report["type"])
    svc.process(report)

    report["status"] = "Processed"

    return {"status": "processed"}


# ================= GET REPORT =================
@router.get("/report/{rid}")
def get_report(
    rid: str, 
    shop_code: str = None, 
    view: str = "case",
    warehouse: str = None,
    bond: str = None
):
    report = reports.get(rid)

    if not report:
        return {"data": []}

    svc = get_service(report["type"])
    
    # Pass all relevant filters
    kwargs = {}
    if shop_code: kwargs["shop_code"] = shop_code
    if view: kwargs["view"] = view
    if warehouse: kwargs["warehouse"] = warehouse
    if bond: kwargs["bond"] = bond
    
    result = svc.get_report(report, **kwargs)

    return clean_nan(result)


# ================= DELETE REPORT =================
@router.delete("/reports/{rid}")
def delete_report(rid: str):
    if rid in reports:
        del reports[rid]
        return {"status": "deleted"}
    return {"status": "error", "message": "Report not found"}
