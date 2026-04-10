import pandas as pd
from datetime import datetime, timedelta
from .base import BaseReportService


class CumulativeWarehouseMatrixService(BaseReportService):
    type_name = "cumulative_warehouse"

    def _generate_labels(self, start_date, num_days):
        start = datetime.strptime(start_date, "%Y-%m-%d")
        return [
            (start + timedelta(days=i)).strftime("%d-%b (%a)")
            for i in range(num_days)
        ]

    def upload(self, report, path, file_name, date=None, **kwargs):
        df = pd.read_excel(path, header=0)

        for u in report.get("uploads", []):
            if u["date"] == date:
                u["file"] = file_name
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                break

    def _compute(self, df):
        """
        Extract warehouse + issue_cases and clean
        """

        wh_col = next((c for c in df.columns if "warehouse" in c.lower()), None)
        issue_col = next((c for c in df.columns if "issue" in c.lower() and "case" in c.lower()), None)

        if not wh_col or not issue_col:
            return pd.DataFrame()

        # clean numeric
        df[issue_col] = pd.to_numeric(df[issue_col], errors="coerce").fillna(0)

        # extract WH-* only
        df["warehouse"] = (
            df[wh_col]
            .astype(str)
            .str.upper()
            .str.extract(r"(WH-[A-Z]+)")
        )

        df = df[df["warehouse"].notna()]

        return df[["warehouse", issue_col]].rename(columns={issue_col: "issues"})

    def process(self, report):
        uploads = report.get("uploads", [])
        config = report.get("config", {})

        start_date = config.get("start_date")
        num_days = int(config.get("num_days", 1))

        if not start_date:
            report["processed"] = {}
            return

        labels = self._generate_labels(start_date, num_days)

        final_map = {}
        cumulative_map = {}

        for idx, u in enumerate(uploads):
            if u.get("status") != "uploaded":
                continue

            df = pd.DataFrame(u.get("data", []))
            if df.empty:
                continue

            df_calc = self._compute(df)

            if df_calc.empty:
                continue

            grouped = df_calc.groupby("warehouse")["issues"].sum().reset_index()

            label = labels[idx]

            for _, row in grouped.iterrows():
                wh = row["warehouse"]
                val = round(row["issues"])

                if not wh:
                    continue

                # initialize
                if wh not in final_map:
                    final_map[wh] = {"warehouse": wh}

                # assign day value
                final_map[wh][label] = val

                # cumulative
                if wh not in cumulative_map:
                    cumulative_map[wh] = 0

                cumulative_map[wh] += val

        # fill missing days with 0
        for wh in final_map:
            for label in labels:
                if label not in final_map[wh]:
                    final_map[wh][label] = 0

        # cumulative output
        cumulative = [
            {
                "warehouse": wh,
                "total": total,
                "avg": round(total / num_days)
            }
            for wh, total in cumulative_map.items()
        ]

        report["processed"] = {
            "daywise": list(final_map.values()),
            "cumulative": cumulative,
            "labels": labels
        }

    def get_report(self, report, view="daywise", **kwargs):
        processed = report.get("processed") or {}

        return {
            "data": processed.get(view, []),
            "labels": processed.get("labels", []),
            "uploads": report.get("uploads", []),
            "config": report.get("config", {})
        }