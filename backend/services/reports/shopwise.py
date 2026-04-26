import pandas as pd
from .base import BaseReportService
from core.utils import normalize, clean_df, find_column, find_dynamic, safe_int, read_excel_robust
from .cumulative_warehouse import SHOP_LOOKUP, WAREHOUSE_TO_BOND

class ShopwiseReportService(BaseReportService):
    type_name = "shopwise"

    def upload(self, report, path, file_name, from_date, to_date):
        df = read_excel_robust(path)
        df = normalize(df)
        df = clean_df(df)

        # Enhance data with warehouse and bond info
        shop_col = find_column(df, ["shop", "code"]) or find_column(df, ["code"])
        if shop_col:
            def get_wh(code):
                code_str = str(code).replace(".0", "").strip()
                return SHOP_LOOKUP.get(code_str, {}).get("warehouse")
            
            def get_bond(code):
                code_str = str(code).replace(".0", "").strip()
                return SHOP_LOOKUP.get(code_str, {}).get("bond")

            df["warehouse_info"] = df[shop_col].apply(get_wh)
            df["bond_info"] = df[shop_col].apply(get_bond)

        report["data"] = df.to_dict("records")
        report.setdefault("uploads", []).append({
            "file": file_name,
            "from": from_date,
            "to": to_date
        })

    def process(self, report):
        return

    def _aggregate(self, df, shop_code=None, warehouse=None, bond=None, view="case"):
        brand_col = find_column(df, ["brand"])
        pack_col = find_column(df, ["pack"])
        shop_col = find_column(df, ["shop", "code"]) or find_column(df, ["code"])

        if shop_code and shop_col:
            df = df[df[shop_col].astype(str).str.replace(".0", "", regex=False) == str(shop_code)]
        
        if warehouse and "warehouse_info" in df.columns:
            df = df[df["warehouse_info"] == warehouse]
        
        if bond and "bond_info" in df.columns:
            df = df[df["bond_info"] == bond]

        opening_cases = find_dynamic(df, ["opening", "case"], exclude=["info"])
        opening_bottles = find_dynamic(df, ["opening", "bottle"], exclude=["info"])

        in_cases = (
            find_dynamic(df, ["receipt", "case"], exclude=["info"]) or 
            find_dynamic(df, ["in", "case"], exclude=["info"])
        )
        in_bottles = (
            find_dynamic(df, ["receipt", "bottle"], exclude=["info"]) or 
            find_dynamic(df, ["in", "bottle"], exclude=["info"])
        )

        out_cases = (
            find_dynamic(df, ["sales", "case"], exclude=["info"]) or 
            find_dynamic(df, ["out", "case"], exclude=["info"])
        )
        out_bottles = (
            find_dynamic(df, ["sales", "bottle"], exclude=["info"]) or 
            find_dynamic(df, ["out", "bottle"], exclude=["info"])
        )

        closing_cases = find_dynamic(df, ["closing", "case"], exclude=["info"])
        closing_bottles = find_dynamic(df, ["closing", "bottle"], exclude=["info"])

        bottles_per_case = find_dynamic(df, ["bottle", "per", "case"], exclude=["info"]) or find_dynamic(df, ["bottles_per_case"], exclude=["info"])

        if df.empty:
            return []

        grouped = df.groupby([brand_col, pack_col])
        result = []

        for (brand, pack), g in grouped:
            s = g.sum(numeric_only=True)
            if view == "case":
                result.append({
                    "brand": brand,
                    "pack": f"{pack}",
                    "opening": safe_int(s.get(opening_cases, 0)) if opening_cases else 0,
                    "inward": safe_int(s.get(in_cases, 0)) if in_cases else 0,
                    "outward": safe_int(s.get(out_cases, 0)) if out_cases else 0,
                    "closing": safe_int(s.get(closing_cases, 0)) if closing_cases else 0,
                })
            else:
                bpc = safe_int(g[bottles_per_case].iloc[0]) if bottles_per_case else 1
                result.append({
                    "brand": brand,
                    "pack": f"{pack}",
                    "opening": safe_int(s.get(opening_cases, 0)) * bpc + safe_int(s.get(opening_bottles, 0)),
                    "inward": safe_int(s.get(in_cases, 0)) * bpc + safe_int(s.get(in_bottles, 0)),
                    "outward": safe_int(s.get(out_cases, 0)) * bpc + safe_int(s.get(out_bottles, 0)),
                    "closing": safe_int(s.get(closing_cases, 0)) * bpc + safe_int(s.get(closing_bottles, 0)),
                })
        return result

    def get_report(self, report, shop_code=None, warehouse=None, bond=None, view="case", **kwargs):
        data = report.get("data") or []
        if not data:
            return {"data": [], "uploads": report.get("uploads", [])}
        df = pd.DataFrame(data)
        df = normalize(df)
        result = self._aggregate(df, shop_code=shop_code, warehouse=warehouse, bond=bond, view=view)
        return {"data": result, "uploads": report.get("uploads", [])}

    def get_filters(self, report):
        data = report.get("data") or []
        if not data:
            return {"shops": [], "warehouses": [], "bonds": [], "mapping": {}}
        df = pd.DataFrame(data)
        df = normalize(df)
        
        # Shops
        code_col = find_column(df, ["shop", "code"]) or find_column(df, ["code"])
        name_col = find_column(df, ["shop", "name"]) or find_column(df, ["name"])
        
        shops = []
        if code_col and name_col:
            shops = (
                df[[code_col, name_col]]
                .drop_duplicates()
                .rename(columns={code_col: "shop_code", name_col: "shop_name"})
                .to_dict("records")
            )
            
        # Warehouses
        warehouses = []
        if "warehouse_info" in df.columns:
            warehouses = df["warehouse_info"].dropna().unique().tolist()
            
        # Bonds
        bonds = []
        if "bond_info" in df.columns:
            bonds = df["bond_info"].dropna().unique().tolist()

        # Build cascading mapping
        # { bond: { warehouse: [shop_codes] } }
        cascading = {}
        if all(col in df.columns for col in ["bond_info", "warehouse_info"]) and code_col:
            for _, row in df[["bond_info", "warehouse_info", code_col]].drop_duplicates().iterrows():
                b = row["bond_info"]
                w = row["warehouse_info"]
                s = str(row[code_col]).replace(".0", "").strip()
                
                if pd.isna(b) or pd.isna(w): continue
                
                if b not in cascading: cascading[b] = {}
                if w not in cascading[b]: cascading[b][w] = []
                if s not in cascading[b][w]: cascading[b][w].append(s)

        return {
            "shops": shops,
            "warehouses": sorted(warehouses),
            "bonds": sorted(bonds),
            "mapping": cascading
        }
