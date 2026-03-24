from fastapi import APIRouter, UploadFile, File
import shutil
import uuid
from services.store import reports
from services.registry import get_service

router = APIRouter()

@router.post("/reports")
def create_report(name: str, type: str):
    rid = str(uuid.uuid4())
    reports[rid] = {
        "id": rid,
        "name": name,
        "type": type,
        "status": "Created",
        "uploads": [],
        "data": None,
        "processed": None
    }
    return reports[rid]

@router.get("/reports")
def list_reports():
    return list(reports.values())

@router.post("/upload/{rid}")
async def upload(rid: str, file: UploadFile = File(...), from_date: str = "", to_date: str = ""):
    path = f"temp_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    report = reports[rid]
    svc = get_service(report["type"])
    svc.upload(report, path, file.filename, from_date, to_date)

    report["status"] = "Uploaded"
    return {"status": "uploaded"}

@router.post("/process/{rid}")
def process(rid: str):
    report = reports[rid]
    svc = get_service(report["type"])
    svc.process(report)
    report["status"] = "Processed"
    return {"status": "processed"}

@router.get("/report/{rid}")
def get_report(rid: str, shop_code: str = None, view: str = "case"):
    report = reports.get(rid)
    if not report:
        return {"data": [], "uploads": []}
    svc = get_service(report["type"])
    return svc.get_report(report, shop_code=shop_code, view=view)

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
