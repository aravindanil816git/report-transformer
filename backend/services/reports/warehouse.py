import pandas as pd
import re
from .base import BaseReportService
from core.utils import clean_df


class WarehouseReportService(BaseReportService):
    type_name = "daily_warehouse"

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

        df = pd.read_excel(path, header=[4, 5])

        df.columns = [
            "_".join([str(i) for i in col if str(i) != "nan"])
            .lower()
            for col in df.columns
        ]

        df = df.dropna(how="all")
        df = clean_df(df)

        df = df.loc[:, ~df.columns.duplicated()]

        if len(df) > 0:
            df = df.iloc[:-1]

        df["warehouse"] = warehouse

        return df

    # ================= SAFE COLUMN FIND =================
    def _normalize(self, col):
        return re.sub(r"[^a-z0-9]", "", col.lower())

    def _find_col(self, df, keywords):
        for col in df.columns:
            c = self._normalize(col)
            if all(k in c for k in keywords):
                return col
        return None

    # ================= PROCESS CORE =================
    def _process_cleanup(self, df):

        item_name = self._find_col(df, ["item", "name"])
        product_code = self._find_col(df, ["product", "code"])

        physical = self._find_col(df, ["physical", "case"])
        allotted = self._find_col(df, ["allotable", "case"])
        pending = self._find_col(df, ["pending", "case"])

        if not pending:
            pending = self._find_col(df, ["dead", "case"])

        wh_price = self._find_col(df, ["wh", "price"])
        landed_cost = self._find_col(df, ["total", "value"])

        # 🔥 DEBUG (remove later if needed)
        print("---- DEBUG START ----")
        print("COLUMNS:", df.columns.tolist())
        print("item_name:", item_name)
        print("product_code:", product_code)
        print("physical:", physical)
        print("allotted:", allotted)
        print("pending:", pending)
        print("wh_price:", wh_price)
        print("landed_cost:", landed_cost)
        print("---- DEBUG END ----")

        # 🔥 CRITICAL CHECK
        if not item_name or not product_code:
            print("❌ Critical columns missing — skipping")
            return []

        cols = []
        rename = {}

        def add(col, name):
            if col:
                cols.append(col)
                rename[col] = name

        add(item_name, "item_name")
        add(product_code, "product_code")
        add(physical, "physical")
        add(allotted, "allotted")
        add(pending, "pending")
        add(wh_price, "wh_price")
        add(landed_cost, "landed_cost")

        if not cols:
            print("⚠️ No valid columns found")
            return []

        df = df[cols].rename(columns=rename)

        # 🔥 CLEAN NUMERIC
        for col in ["physical", "allotted", "pending", "wh_price", "landed_cost"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        return df.to_dict("records")

    # ================= PROCESS =================
    def process(self, report):
        final = []

        report_date = report.get("config", {}).get("date")

        for u in report.get("uploads", []):
            if u.get("status") != "uploaded":
                continue

            path = u.get("path")
            if not path:
                continue

            # 🔥 PARSE AGAIN (CORRECT WAY)
            df = self._parse_cleanup_excel(path)

            if df.empty:
                print("⚠️ Parsed DF empty for:", path)
                continue

            warehouse = u.get("warehouse")

            items = self._process_cleanup(df)

            print("ITEM COUNT:", len(items))  # DEBUG

            final.append({
                "warehouse": warehouse,
                "date": report_date,
                "items": items
            })

        report["processed"] = final

    # ================= RESPONSE =================
    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []) or [],
            "uploads": report.get("uploads", []) or [],
            "config": report.get("config", {})
        }