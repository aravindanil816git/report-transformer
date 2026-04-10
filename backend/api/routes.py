from fastapi import APIRouter, UploadFile, File
import shutil
import uuid
import pandas as pd
import os
from datetime import datetime, timedelta

from services.store import reports
from services.registry import get_service

router = APIRouter()


# ================= HELPER =================
def generate_days(start_date, num_days):
    start = datetime.strptime(start_date, "%Y-%m-%d")
    return [
        (start + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(num_days)
    ]


# ================= CREATE REPORT =================
@router.post("/reports")
def create_report(name: str, type: str, start_date: str = None, num_days: int = None):
    rid = str(uuid.uuid4())

    if type in ["cumulative_shopwise", "cumulative_warehouse"]:
        days = generate_days(start_date, int(num_days))
        uploads = [
            {"date": d, "file": None, "status": "pending", "data": None}
            for d in days
        ]
        config = {"start_date": start_date, "num_days": int(num_days)}
    else:
        uploads = []
        config = {}

    reports[rid] = {
        "id": rid,
        "name": name,
        "type": type,
        "status": "Created",
        "uploads": uploads,
        "data": None,
        "processed": None,
        "config": config
    }

    return reports[rid]


# ================= LIST REPORTS =================
@router.get("/reports")
def list_reports():
    return list(reports.values())


# ================= UPLOAD =================
@router.post("/upload/{rid}")
async def upload(
    rid: str,
    file: UploadFile = File(...),
    from_date: str = "",
    to_date: str = "",
    date: str = ""
):
    report = reports[rid]

    # save file temporarily
    path = f"temp_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # ================= CUMULATIVE =================
    if report["type"] in ["cumulative_shopwise", "cumulative_warehouse"]:

        from core.utils import normalize, clean_df

        df = pd.read_excel(path)
        df = normalize(df)
        df = clean_df(df)

        # store data for that specific date
        for u in report["uploads"]:
            if u["date"] == date:
                u["file"] = file.filename
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                break

        # update overall report status
        uploaded_count = sum(
            1 for u in report["uploads"] if u.get("status") == "uploaded"
        )

        if uploaded_count > 0:
            report["status"] = "Uploaded"

    # ================= NORMAL REPORTS =================
    else:
        svc = get_service(report["type"])
        svc.upload(report, path, file.filename, from_date, to_date)
        report["status"] = "Uploaded"

    # cleanup temp file
    try:
        os.remove(path)
    except:
        pass

    return {"status": "uploaded"}


# ================= PROCESS =================
@router.post("/process/{rid}")
def process(rid: str):
    report = reports[rid]
    svc = get_service(report["type"])

    svc.process(report)

    report["status"] = "Processed"

    return {"status": "processed"}


# ================= GET REPORT =================
@router.get("/report/{rid}")
def get_report(
    rid: str,
    shop_code: str = None,
    view: str = "daywise",
    start_idx: int = None,
    end_idx: int = None
):
    report = reports.get(rid)

    if not report:
        return {"data": [], "uploads": []}

    svc = get_service(report["type"])

    return svc.get_report(
        report,
        shop_code=shop_code,
        view=view,
        start_idx=start_idx,
        end_idx=end_idx
    )


# ================= FILTERS =================
@router.get("/shops/{rid}")
def get_shops(rid: str):
    report = reports.get(rid)
    if not report:
        return []

    svc = get_service(report["type"])
    filters = svc.get_filters(report)

    return filters.get("shops", [])


@router.get("/warehouses/{rid}")
def get_warehouses(rid: str):
    report = reports.get(rid)
    if not report:
        return []

    svc = get_service(report["type"])
    filters = svc.get_filters(report)

    return filters.get("warehouses", [])