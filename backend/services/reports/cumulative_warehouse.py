import pandas as pd
import json
from datetime import datetime, timedelta
from .base import BaseReportService
from core.utils import read_excel_robust


# ✅ LOAD MAPPING
with open("mapping.json") as f:
    MAPPING = json.load(f)

# ✅ FLATTEN LOOKUP
SHOP_LOOKUP = {}
WAREHOUSE_TO_BOND = {}

for bond, b_data in MAPPING["bonds"].items():
    for wh, w_data in b_data["warehouses"].items():
        WAREHOUSE_TO_BOND[wh] = bond

        for shop_code, s_data in w_data["shops"].items():
            SHOP_LOOKUP[shop_code] = {
                "warehouse": wh,
                "bond": bond,
                "shop_name": s_data["shop_name"],
                "staffs": s_data["staffs"]
            }

class CumulativeWarehouseMatrixService(BaseReportService):
    type_name = "cumulative_warehouse"

    def _generate_labels(self, start_date, num_days):
        start = datetime.strptime(start_date, "%Y-%m-%d")
        return [
            (start + timedelta(days=i)).strftime("%d-%b (%a)")
            for i in range(num_days)
        ]

    def upload(self, report, path, file_name, date=None, **kwargs):
        df = read_excel_robust(path)

        for u in report.get("uploads", []):
            if u["date"] == date:
                u["file"] = file_name
                u["status"] = "uploaded"
                u["data"] = df.to_dict("records")
                break

    def _compute(self, df):
        shop_col = next((c for c in df.columns if "license" in c.lower()), None)
        issue_col = next((c for c in df.columns if "issue" in c.lower() and "case" in c.lower()), None)

        if not shop_col or not issue_col:
            return pd.DataFrame()

        # ✅ clean shop code
        df["shop_code"] = (
            df[shop_col]
            .astype(str)
            .str.replace(".0", "", regex=False)
            .str.replace(r"\s+", "", regex=True)
            .str.strip()
        )

        # ✅ clean issues
        df["issues"] = pd.to_numeric(df[issue_col], errors="coerce").fillna(0)

        # ✅ map warehouse
        df["warehouse"] = df["shop_code"].apply(
            lambda x: SHOP_LOOKUP.get(x, {}).get("warehouse")
        )

        # ✅ keep only mapped
        df = df[df["warehouse"].notna()]

        return df[["warehouse", "issues"]]

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

                if wh not in final_map:
                    final_map[wh] = {"warehouse": wh}

                final_map[wh][label] = val

        # ✅ fill missing labels
        for wh in final_map:
            for label in labels:
                if label not in final_map[wh]:
                    final_map[wh][label] = 0

        report["processed"] = {
            "daywise": list(final_map.values()),
            "labels": labels
        }

    def get_report(
        self,
        report,
        shop_code=None,
        view="daywise",
        start_idx=None,
        end_idx=None,
        mode="warehouse",
        **kwargs
    ):
        processed = report.get("processed") or {}
        labels = processed.get("labels", [])
        data = processed.get("daywise", [])

        if (
            start_idx is not None and end_idx is not None and
            0 <= start_idx < len(labels) and
            0 <= end_idx < len(labels) and
            start_idx <= end_idx
        ):
            idxs = list(range(start_idx, end_idx + 1))
            selected_labels = [labels[i] for i in idxs]
        else:
            idxs = list(range(len(labels)))
            selected_labels = labels

        result = []

        for row in data:
            new_row = {"warehouse": row["warehouse"]}
            total = 0

            for i in idxs:
                l = labels[i]
                val = row.get(l, 0)
                new_row[l] = val
                total += val

            new_row["total"] = total
            result.append(new_row)

        # 🔥 BOND MODE
        if mode == "bond":
            bond_map = {}

            for row in result:
                wh = row["warehouse"]
                bond = WAREHOUSE_TO_BOND.get(wh, "UNKNOWN")

                if bond not in bond_map:
                    bond_map[bond] = {"warehouse": bond}
                    for k in row:
                        if k != "warehouse":
                            bond_map[bond][k] = 0

                for k, v in row.items():
                    if k != "warehouse":
                        bond_map[bond][k] += v

            result = list(bond_map.values())

        # cumulative
        if view == "cumulative":
            days = len(idxs) or 1

            return {
                "data": [
                    {
                        "warehouse": r["warehouse"],
                        "total": r["total"],
                        "avg": round(r["total"] / days)
                    }
                    for r in result
                ],
                "labels": selected_labels,
                "config": report.get("config", {})
            }

        return {
            "data": result,
            "labels": selected_labels,
            "config": report.get("config", {})
        }