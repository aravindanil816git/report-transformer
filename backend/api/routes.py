from fastapi import APIRouter, UploadFile, File
import shutil
import uuid
import pandas as pd
import os
import math

from services.store import reports
from services.registry import get_service

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

    # 🔥 MONTH COMPARATIVE
    elif type == "month_comparative":
        config = {"date1": date1, "date2": date2}

    reports[rid] = {
        "id": rid,
        "name": name,
        "type": type,
        "status": "Created",
        "uploads": uploads,
        "processed": None,
        "config": config
    }

    return clean_nan(reports[rid])


# ================= LIST REPORTS =================
@router.get("/reports")
def list_reports():
    clean = []

    for r in reports.values():
        r_copy = dict(r)

        # 🔥 remove raw data (prevents NaN crash + heavy payload)
        uploads = []
        for u in r_copy.get("uploads", []):
            u_copy = dict(u)
            u_copy.pop("data", None)
            uploads.append(u_copy)

        r_copy["uploads"] = uploads
        clean.append(r_copy)

    return clean_nan(clean)


# ================= UPLOAD =================
@router.post("/upload/{rid}")
async def upload(
    rid: str,
    file: UploadFile = File(...),
    key: str = ""   # warehouse key
):
    report = reports[rid]

    path = f"temp_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 🔥 DAILY SECONDARY
    if report["type"] == "daily_secondary_sales":

        for u in report["uploads"]:
            if u["warehouse"].strip().upper() == key.strip().upper():

                df = pd.read_excel(path)

                # 🔥 STRONG CLEANING (CRITICAL)
                df = df.replace({pd.NA: None})
                df = df.astype(object).where(pd.notnull(df), None)

                u["file"] = file.filename
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                break

        uploaded = sum(1 for u in report["uploads"] if u["status"] == "uploaded")

        # 🔥 STATUS LOGIC
        if uploaded > 0:
            report["status"] = "Uploaded"

        if uploaded == len(report["uploads"]):
            report["status"] = "Ready"

    # 🔥 OTHER REPORT TYPES
    else:
        svc = get_service(report["type"])
        svc.upload(report, path, file.filename)
        report["status"] = "Uploaded"

    try:
        os.remove(path)
    except:
        pass

    return {"status": "uploaded"}


# ================= PROCESS =================
@router.post("/process/{rid}")
def process(rid: str):
    report = reports[rid]

    # 🔥 MONTH COMPARATIVE DEPENDENCY
    if report["type"] == "month_comparative":
    # 🔥 collect ALL daily reports
        daily_reports = [
            r for r in reports.values()
            if r["type"] == "daily_secondary_sales"
        ]

        # 🔥 merge all processed data
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
def get_report(rid: str):
    report = reports.get(rid)

    if not report:
        return {"data": []}

    svc = get_service(report["type"])
    result = svc.get_report(report)

    return clean_nan(result)   # 🔥 CRITICAL FIX