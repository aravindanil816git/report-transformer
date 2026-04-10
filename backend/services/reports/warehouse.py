import pandas as pd
import re
from .base import BaseReportService
from core.utils import clean_df


class WarehouseReportService(BaseReportService):
    type_name = "cleanup"

    # ================= PARSE =================
    def _parse_cleanup_excel(self, path):
        df_raw = pd.read_excel(path, header=None)

        warehouse = None
        for i in range(6):
            row = " ".join(
                [str(x) for x in df_raw.iloc[i].values if str(x) != "nan"]
            )

            if "warehouse" in row.lower():
                match = re.search(
                    r"warehouse\s*:\s*([^/]+)", row, re.IGNORECASE
                )
                if match:
                    warehouse = match.group(1).strip().upper()

        # Multi-header read
        df = pd.read_excel(path, header=[4, 5])

        # Flatten columns safely
        df.columns = [
            "_".join([str(i) for i in col if str(i) != "nan"])
            .lower()
            .replace(" ", "_")
            for col in df.columns
        ]

        df = df.dropna(how="all")
        df = clean_df(df)

        # 🔥 Remove duplicate columns
        df = df.loc[:, ~df.columns.duplicated()]

        if len(df) > 0:
            df = df.iloc[:-1]

        df["warehouse"] = warehouse

        return df

    # ================= UPLOAD =================
    def upload(self, report, path, file_name, from_date, to_date):
        df = self._parse_cleanup_excel(path)

        report.setdefault("uploads", []).append(
            {
                "file": file_name,
                "from": from_date,
                "to": to_date,
                "data": df.to_dict("records"),
            }
        )

    # ================= COLUMN FIND =================
    def _find_pair(self, df, keyword):
        case_col = None
        bottle_col = None

        for col in df.columns:
            c = col.lower()

            if keyword in c:
                # STRICT matching
                if "case" in c and "total" not in c:
                    case_col = col
                elif "bottle" in c and "total" not in c:
                    bottle_col = col

        return case_col, bottle_col

    # ================= PROCESS =================
    def _process_cleanup(self, df):
        # 🔍 Find columns safely
        phys_case, phys_bottle = self._find_pair(df, "physical")
        alloc_case, alloc_bottle = self._find_pair(df, "allotable")
        pend_case, pend_bottle = self._find_pair(df, "pending")

        wh_price = next(
            (c for c in df.columns if "price" in c and "wh" in c), None
        )

        landed_cost = next(
            (c for c in df.columns if "landed" in c or "total_value" in c),
            None,
        )

        item_name = next((c for c in df.columns if "item" in c and "name" in c), None)
        product_code = next((c for c in df.columns if "product" in c and "code" in c), None)




        cols = []
        rename = {}

        def add(col, name):
            if col and col in df.columns:
                cols.append(col)
                rename[col] = name

        # ===== STOCK =====

        add(item_name, "Item Name")
        add(product_code, "Product Code")

        add(phys_case, "Physical Case")
        add(phys_bottle, "Physical Bottle")

        add(alloc_case, "Allotable Case")
        add(alloc_bottle, "Allotable Bottle")

        add(pend_case, "Pending Case")
        add(pend_bottle, "Pending Bottle")

        # ===== PRICE =====
        add(wh_price, "WH Price")
        add(landed_cost, "Landed Cost")

        # ===== WAREHOUSE =====
        if "warehouse" in df.columns:
            cols.append("warehouse")

        df = df[cols].rename(columns=rename)
        NUMERIC_COLUMNS = [
            "Physical Case",
            "Physical Bottle",
            "Allotable Case",
            "Allotable Bottle",
            "Pending Case",
            "Pending Bottle",
            "WH Price",
            "Landed Cost",
        ]

        for col in NUMERIC_COLUMNS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)


        return df

    # ================= PROCESS ENTRY =================
    def process(self, report):
        dfs = [
            pd.DataFrame(u.get("data", []))
            for u in report.get("uploads", [])
        ]

        if not dfs:
            report["processed"] = []
            return

        combined = pd.concat(dfs, ignore_index=True)

        # 🔥 Remove duplicates again (safety)
        combined = combined.loc[:, ~combined.columns.duplicated()]

        processed = self._process_cleanup(combined)

        report["processed"] = processed.to_dict("records")

    # ================= RESPONSE =================
    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []) or [],
            "uploads": report.get("uploads", []) or [],
        }

    # ================= FILTER =================
    def get_filters(self, report):
        data = report.get("processed") or []

        if not data:
            return {"warehouses": []}

        df = pd.DataFrame(data)

        if "warehouse" not in df.columns:
            return {"warehouses": []}

        warehouses = [
            {"warehouse": w}
            for w in df["warehouse"].dropna().unique()
        ]

        return {"warehouses": warehouses}