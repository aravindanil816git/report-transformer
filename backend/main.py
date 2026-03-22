from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import shutil
import uuid

app = FastAPI()

# ✅ CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# in-memory store
reports = {}


# =========================
# HELPERS
# =========================

def normalize(df):
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df


def safe_int(x):
    try:
        return int(float(x))
    except:
        return 0


def find_column(df, keywords):
    for c in df.columns:
        if all(k in c for k in keywords):
            return c
    return None


# =========================
# REPORT CRUD
# =========================

@app.post("/reports")
def create_report(name: str):
    rid = str(uuid.uuid4())

    reports[rid] = {
        "id": rid,
        "name": name,
        "status": "Created",
        "uploads": [],
        "data": None
    }

    return reports[rid]


@app.get("/reports")
def list_reports():
    return list(reports.values())


# =========================
# UPLOAD
# =========================

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

    df = pd.read_excel(path)
    df = normalize(df)

    reports[rid]["uploads"].append({
        "file": file.filename,
        "from": from_date,
        "to": to_date
    })

    # store raw (list of dicts)
    reports[rid]["data"] = df.to_dict("records")
    reports[rid]["status"] = "Uploaded"

    return {"status": "uploaded"}


# =========================
# PROCESS
# =========================

@app.post("/process/{rid}")
def process(rid: str):
    reports[rid]["status"] = "Processed"
    return {"status": "processed"}


# =========================
# SHOPS (per report)
# =========================

@app.get("/shops/{rid}")
def get_shops(rid: str):
    report = reports.get(rid)

    if not report or not report["data"]:
        return []

    df = pd.DataFrame(report["data"])
    df = normalize(df)

    shop_code_col = find_column(df, ["shop", "code"])
    shop_name_col = find_column(df, ["shop", "name"])

    if not shop_code_col or not shop_name_col:
        return []

    return df[[shop_code_col, shop_name_col]] \
        .drop_duplicates() \
        .rename(columns={
            shop_code_col: "shop_code",
            shop_name_col: "shop_name"
        }) \
        .to_dict("records")


# =========================
# REPORT (TRANSFORMED)
# =========================

@app.get("/report/{rid}")
def get_report(rid: str, shop_code: str = None, view: str = "case"):
    report = reports.get(rid)

    if not report or not report["data"]:
        return []

    df = pd.DataFrame(report["data"])
    df = normalize(df)

    # detect columns
    brand_col = find_column(df, ["brand"])
    pack_col = find_column(df, ["pack"])
    shop_col = find_column(df, ["shop", "code"])

    # ✅ IMPORTANT
    bpc_col = find_column(df, ["bottle", "case"]) or find_column(df, ["per", "case"])

    opening_cases = find_column(df, ["opening", "case"])
    opening_bottles = find_column(df, ["opening", "bottle"])

    in_cases = find_column(df, ["in", "case"]) or find_column(df, ["receipt", "case"])
    in_bottles = find_column(df, ["in", "bottle"]) or find_column(df, ["receipt", "bottle"])

    out_cases = find_column(df, ["out", "case"]) or find_column(df, ["sale", "case"])
    out_bottles = find_column(df, ["out", "bottle"]) or find_column(df, ["sale", "bottle"])

    closing_cases = find_column(df, ["closing", "case"])
    closing_bottles = find_column(df, ["closing", "bottle"])

    # filter shop
    if shop_code and shop_col:
        df = df[df[shop_col].astype(str) == str(shop_code)]

    grouped = df.groupby([brand_col, pack_col])

    result = []

    for (brand, pack), g in grouped:

        if view == "case":
            s = g.sum(numeric_only=True)

            row = {
                "brand": brand,
                "pack": f"{pack} ML",
                "opening": f"{safe_int(s.get(opening_cases, 0))} case {safe_int(s.get(opening_bottles, 0))} bottle",
                "inward": f"{safe_int(s.get(in_cases, 0))} case {safe_int(s.get(in_bottles, 0))} bottle",
                "outward": f"{safe_int(s.get(out_cases, 0))} case {safe_int(s.get(out_bottles, 0))} bottle",
                "closing": f"{safe_int(s.get(closing_cases, 0))} case {safe_int(s.get(closing_bottles, 0))} bottle",
            }

        else:
            # ✅ CORRECT bottle calculation
            def calc(case_col, bottle_col):
                return g.apply(
                    lambda r: (
                        safe_int(r.get(case_col, 0)) *
                        (safe_int(r.get(bpc_col, 0)) or 1) +
                        safe_int(r.get(bottle_col, 0))
                    ),
                    axis=1
                ).sum()

            row = {
                "brand": brand,
                "pack": f"{pack} ML",
                "opening": int(calc(opening_cases, opening_bottles)),
                "inward": int(calc(in_cases, in_bottles)),
                "outward": int(calc(out_cases, out_bottles)),
                "closing": int(calc(closing_cases, closing_bottles)),
            }

        result.append(row)

    return result