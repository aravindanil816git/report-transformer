import pandas as pd
import re
from datetime import datetime, timedelta
from .base import BaseReportService
from core.utils import normalize, clean_df


class CumulativeShopwiseReportService(BaseReportService):
    type_name = "cumulative_shopwise"

    def _clean_warehouse(self, val):
        if not val:
            return None
        val = str(val).upper()
        match = re.search(r"(WH-[A-Z]+)", val)
        return match.group(1) if match else val

    def _generate_labels(self, start_date, num_days):
        start = datetime.strptime(start_date, "%Y-%m-%d")
        return [
            (start + timedelta(days=i)).strftime("%d-%b (%a)")
            for i in range(num_days)
        ]

    def upload(self, report, path, file_name, date=None, **kwargs):
        df = pd.read_excel(path)
        df = normalize(df)
        df = clean_df(df)

        for u in report.get("uploads", []):
            if u["date"] == date:
                u["file"] = file_name
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                break

    def _compute(self, df):
        wh_col = next((c for c in df.columns if "warehouse" in c), None)
        bpc_col = next((c for c in df.columns if "bottle" in c and "case" in c), None)

        open_case_col = next((c for c in df.columns if "opening" in c and "case" in c), None)
        open_bottle_col = next((c for c in df.columns if "opening" in c and "bottle" in c), None)

        in_case_col = next((c for c in df.columns if "shop_in" in c and "case" in c), None)
        in_bottle_col = next((c for c in df.columns if "shop_in" in c and "bottle" in c), None)

        out_case_col = next((c for c in df.columns if "out" in c and "case" in c), None)
        out_bottle_col = next((c for c in df.columns if "out" in c and "bottle" in c), None)

        if not all([wh_col, bpc_col, open_case_col, open_bottle_col]):
            return pd.DataFrame()

        df[bpc_col] = pd.to_numeric(df[bpc_col], errors="coerce").fillna(1)

        for col in [
            open_case_col, open_bottle_col,
            in_case_col, in_bottle_col,
            out_case_col, out_bottle_col
        ]:
            if col:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        df["opening"] = ((df[open_case_col] * df[bpc_col]) + df[open_bottle_col]) / df[bpc_col]
        df["receipt"] = ((df[in_case_col] * df[bpc_col]) + df[in_bottle_col]) / df[bpc_col] if in_case_col and in_bottle_col else 0
        df["sales"] = ((df[out_case_col] * df[bpc_col]) + df[out_bottle_col]) / df[bpc_col] if out_case_col and out_bottle_col else 0

        df["warehouse"] = df[wh_col].apply(self._clean_warehouse)

        return df[["warehouse", "opening", "receipt", "sales"]]

    def process(self, report):
        uploads = report.get("uploads", [])
        config = report.get("config", {})

        start_date = config.get("start_date")
        num_days = int(config.get("num_days", 1))

        if not start_date:
            report["processed"] = {"daywise": {}, "cumulative": [], "labels": []}
            return

        labels = self._generate_labels(start_date, num_days)

        daywise_opening = {}
        daywise_sales = {}
        daywise_receipt = {}
        cumulative_map = {}

        for idx, u in enumerate(uploads):
            if u.get("status") != "uploaded":
                continue

            df = pd.DataFrame(u.get("data", []))
            if df.empty:
                continue

            df = normalize(df)
            df_calc = self._compute(df)

            if df_calc.empty:
                continue

            grouped = (
                df_calc.groupby("warehouse")[["opening", "receipt", "sales"]]
                .sum()
                .reset_index()
            )

            label = labels[idx]

            for _, row in grouped.iterrows():
                wh = row["warehouse"]

                opening = round(row.get("opening", 0))
                receipt = round(row.get("receipt", 0))
                sales = round(row.get("sales", 0))

                for store, val in [
                    (daywise_opening, opening),
                    (daywise_receipt, receipt),
                    (daywise_sales, sales),
                ]:
                    if wh not in store:
                        store[wh] = {"warehouse": wh}
                    store[wh][label] = val

                if wh not in cumulative_map:
                    cumulative_map[wh] = {"opening": 0, "receipt": 0, "sales": 0}

                cumulative_map[wh]["opening"] += opening
                cumulative_map[wh]["receipt"] += receipt
                cumulative_map[wh]["sales"] += sales

        # fill missing days
        for store in [daywise_opening, daywise_sales, daywise_receipt]:
            for wh in store:
                for label in labels:
                    if label not in store[wh]:
                        store[wh][label] = 0

        cumulative_data = []
        for wh, vals in cumulative_map.items():
            opening = vals["opening"]
            receipt = vals["receipt"]
            sales = vals["sales"]

            closing = opening + receipt - sales
            diff = closing - opening
            avg_sales = round(sales / num_days)

            cumulative_data.append({
                "warehouse": wh,
                "opening": opening,
                "receipt": receipt,
                "sales": sales,
                "closing": closing,
                "difference": diff,
                "avg_sales_per_day": avg_sales
            })

        report["processed"] = {
            "daywise_opening": list(daywise_opening.values()),
            "daywise_sales": list(daywise_sales.values()),
            "daywise_receipt": list(daywise_receipt.values()),
            "cumulative": cumulative_data,
            "labels": labels
        }

    def get_report(self, report, view="daywise_opening", **kwargs):
        processed = report.get("processed") or {}

        return {
            "data": processed.get(view, []),
            "labels": processed.get("labels", []),
            "uploads": report.get("uploads", []),
            "config": report.get("config", {})
        }