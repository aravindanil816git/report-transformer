import pandas as pd
from .base import BaseReportService
from core.utils import normalize, clean_df, find_column, find_dynamic, safe_int

class ShopwiseReportService(BaseReportService):
    type_name = "shopwise"

    def upload(self, report, path, file_name, from_date, to_date):
        df = pd.read_excel(path)
        df = normalize(df)
        df = clean_df(df)
        report["data"] = df.to_dict("records")
        report.setdefault("uploads", []).append({
            "file": file_name,
            "from": from_date,
            "to": to_date
        })

    def process(self, report):
        return

    def _aggregate(self, df, shop_code=None, view="case"):
        brand_col = find_column(df, ["brand"])
        pack_col = find_column(df, ["pack"])
        shop_col = find_column(df, ["shop", "code"])

        if shop_code and shop_col:
            df = df[df[shop_col].astype(str) == str(shop_code)]

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
                    "opening": safe_int(s.get(opening_cases, 0)) if opening_cases else 0,
                    "inward": safe_int(s.get(in_cases, 0)) if in_cases else 0,
                    "outward": safe_int(s.get(out_cases, 0)) if out_cases else 0,
                    "closing": safe_int(s.get(closing_cases, 0)) if closing_cases else 0,
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
        return result

    def get_report(self, report, shop_code=None, view="case"):
        data = report.get("data") or []
        if not data:
            return {"data": [], "uploads": report.get("uploads", [])}
        df = pd.DataFrame(data)
        df = normalize(df)
        result = self._aggregate(df, shop_code=shop_code, view=view)
        return {"data": result, "uploads": report.get("uploads", [])}

    def get_filters(self, report):
        data = report.get("data") or []
        if not data:
            return {"shops": []}
        df = pd.DataFrame(data)
        df = normalize(df)
        code_col = find_column(df, ["shop", "code"]) or find_column(df, ["code"])
        name_col = find_column(df, ["shop", "name"]) or find_column(df, ["name"])
        if not code_col or not name_col:
            return {"shops": []}
        shops = (
            df[[code_col, name_col]]
            .drop_duplicates()
            .rename(columns={code_col: "shop_code", name_col: "shop_name"})
            .to_dict("records")
        )
        return {"shops": shops}
