from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import shutil
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

reports = {}

# ================= HELPERS =================

def normalize(df):
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df

def clean_df(df):
    return df.replace([float("inf"), float("-inf")], 0).fillna(0)

def find_column(df, keywords):
    for c in df.columns:
        if all(k in c.lower() for k in keywords):
            return c
    return None

def find_dynamic(df, keys):
    for c in df.columns:
        if all(k in c for k in keys):
            return c
    return None

def safe_int(x):
    try:
        return int(float(x))
    except:
        return 0

# ================= CLEANUP =================

def parse_cleanup_excel(path):
    df_raw = pd.read_excel(path, header=None)

    warehouse = None
    for i in range(6):
        row = " ".join([str(x) for x in df_raw.iloc[i].values if str(x) != "nan"]).lower()
        if "rfl" in row:
            warehouse = row.split("/")[-1].strip().upper()

    df = pd.read_excel(path, header=[4, 5])

    df.columns = [
        "_".join([str(i) for i in col if str(i) != "nan"]).lower().replace(" ", "_")
        for col in df.columns
    ]

    df = df.dropna(how="all")
    df = clean_df(df)

    df["warehouse"] = warehouse

    return df

def process_cleanup(df):
    allocated = find_dynamic(df, ["alloc"])
    pending = find_dynamic(df, ["pending"])
    instock = find_dynamic(df, ["physical"])

    cols = [c for c in [allocated, pending, instock, "warehouse"] if c]
    df = df[cols]

    rename = {}
    if allocated: rename[allocated] = "Allocated"
    if pending: rename[pending] = "Pending"
    if instock: rename[instock] = "Instock"

    return df.rename(columns=rename)

# ================= CRUD =================

@app.post("/reports")
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

@app.get("/reports")
def list_reports():
    return list(reports.values())

# ================= UPLOAD =================

@app.post("/upload/{rid}")
async def upload(
    rid: str,
    file: UploadFile = File(...),
    from_date: str = "",
    to_date: str = ""
):
    path = f"temp_{file.filename}"

    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    report = reports[rid]

    # ===== SHOPWISE =====
    if report["type"] == "shopwise":
        df = pd.read_excel(path)
        df = normalize(df)
        df = clean_df(df)
        report["data"] = df.to_dict("records")

    # ===== DAILY WAREHOUSE =====
    else:
        df = parse_cleanup_excel(path)
        report["uploads"].append({
            "file": file.filename,
            "from": from_date,
            "to": to_date,
            "data": df.to_dict("records")
        })

    report["status"] = "Uploaded"
    return {"status": "uploaded"}

# ================= PROCESS =================

@app.post("/process/{rid}")
def process(rid: str):
    report = reports[rid]

    if report["type"] == "cleanup":
        dfs = [pd.DataFrame(u["data"]) for u in report["uploads"]]

        if not dfs:
            return {"status": "no data"}

        combined = pd.concat(dfs, ignore_index=True)
        processed = process_cleanup(combined)

        report["processed"] = processed.to_dict("records")

    report["status"] = "Processed"
    return {"status": "processed"}

# ================= SHOPS =================

@app.get("/shops/{rid}")
def get_shops(rid: str):
    report = reports.get(rid)

    if not report or not report["data"]:
        return []

    df = pd.DataFrame(report["data"])
    df = normalize(df)

    code_col = find_column(df, ["shop", "code"]) or find_column(df, ["code"])
    name_col = find_column(df, ["shop", "name"]) or find_column(df, ["name"])

    if not code_col or not name_col:
        return []

    return df[[code_col, name_col]].drop_duplicates().rename(columns={
        code_col: "shop_code",
        name_col: "shop_name"
    }).to_dict("records")

# ================= WAREHOUSES =================

@app.get("/warehouses/{rid}")
def get_warehouses(rid: str):
    report = reports.get(rid)

    if not report or not report.get("processed"):
        return []

    df = pd.DataFrame(report["processed"])

    return [{"warehouse": w} for w in df["warehouse"].dropna().unique()]

# ================= REPORT =================

@app.get("/report/{rid}")
def get_report(rid: str, shop_code: str = None, view: str = "case"):
    report = reports.get(rid)

    if not report:
        return {"data": [], "uploads": []}

    # ===== DAILY WAREHOUSE =====
    if report["type"] == "cleanup":
        return {
            "data": report.get("processed", []),
            "uploads": report["uploads"]
        }

    # ===== SHOPWISE =====
    df = pd.DataFrame(report["data"])
    df = normalize(df)

    brand_col = find_column(df, ["brand"])
    pack_col = find_column(df, ["pack"])
    shop_col = find_column(df, ["shop", "code"])

    if shop_code and shop_col:
        df = df[df[shop_col].astype(str) == str(shop_code)]

    # detect columns
    opening_cases = find_dynamic(df, ["opening", "case"])
    opening_bottles = find_dynamic(df, ["opening", "bottle"])

    in_cases = find_dynamic(df, ["receipt", "case"]) or find_dynamic(df, ["in", "case"])
    in_bottles = find_dynamic(df, ["receipt", "bottle"]) or find_dynamic(df, ["in", "bottle"])

    out_cases = find_dynamic(df, ["sales", "case"]) or find_dynamic(df, ["out", "case"])
    out_bottles = find_dynamic(df, ["sales", "bottle"]) or find_dynamic(df, ["out", "bottle"])

    closing_cases = find_dynamic(df, ["closing", "case"])
    closing_bottles = find_dynamic(df, ["closing", "bottle"])

    bottles_per_case = find_dynamic(df, ["bottle", "per", "case"]) or find_dynamic(df, ["bottles_per_case"])

    grouped = df.groupby([brand_col, pack_col])

    result = []

    for (brand, pack), g in grouped:
        s = g.sum(numeric_only=True)

        if view == "case":
            result.append({
                "brand": brand,
                "pack": f"{pack} ML",
                "opening": safe_int(s.get(opening_cases, 0)),
                "inward": safe_int(s.get(in_cases, 0)),
                "outward": safe_int(s.get(out_cases, 0)),
                "closing": safe_int(s.get(closing_cases, 0)),
            })
        else:
            bpc = safe_int(g[bottles_per_case].iloc[0]) if bottles_per_case else 1

            result.append({
                "brand": brand,
                "pack": f"{pack} ML",
                "opening": safe_int(s.get(opening_cases, 0)) * bpc + safe_int(s.get(opening_bottles, 0)),
                "inward": safe_int(s.get(in_cases, 0)) * bpc + safe_int(s.get(in_bottles, 0)),
                "outward": safe_int(s.get(out_cases, 0)) * bpc + safe_int(s.get(out_bottles, 0)),
                "closing": safe_int(s.get(closing_cases, 0)) * bpc + safe_int(s.get(closing_bottles, 0)),
            })

    return {
        "data": result,
        "uploads": report["uploads"]
    }