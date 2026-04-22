from .base import BaseReportService


class MonthlyStockSalesService(BaseReportService):
    type_name = "monthly_stock_sales"

    def process(self, report):
        month = report.get("config", {}).get("month")

        all_reports = report.get("all_reports", [])

        # 🔥 collect relevant reports
        warehouse_reports = [
            r for r in all_reports
            if r.get("type") == "daily_warehouse"
        ]

        secondary_reports = [
            r for r in all_reports
            if r.get("type") == "daily_secondary_sales"
        ]

        # 🔥 flatten
        warehouse_data = []
        for r in warehouse_reports:
            warehouse_data.extend(r.get("processed", []) or [])

        secondary_data = []
        for r in secondary_reports:
            secondary_data.extend(r.get("processed", []) or [])

        # 🔥 filter by month
        warehouse_data = [
            d for d in warehouse_data
            if d.get("date", "").startswith(month)
        ]

        secondary_data = [
            d for d in secondary_data
            if d.get("date", "").startswith(month)
        ]

        # 🔥 all warehouses
        warehouses = sorted(set(
            [d.get("warehouse") for d in warehouse_data] +
            [d.get("warehouse") for d in secondary_data]
        ))

        result = []

        for w in warehouses:
            wh_days = sorted(
                [d for d in warehouse_data if d.get("warehouse") == w],
                key=lambda x: x.get("date")
            )

            # ✅ OP + INWARD
            if not wh_days:
                op = 0
                inward = 0
            else:
                op = sum(i.get("physical", 0) for i in wh_days[0].get("items", []))

                inward = sum(
                    sum(i.get("physical", 0) for i in d.get("items", []))
                    for d in wh_days[1:]
                )

            total = op + inward

            # ✅ SALES
            sales = sum(
                d.get("TOTAL", 0)
                for d in secondary_data
                if d.get("warehouse") == w
            )

            cl = total - sales

            result.append({
                "warehouse": w,
                "op": round(op),
                "inward": round(inward),
                "total": round(total),
                "sales": round(sales),
                "cl": round(cl),
            })

        report["processed"] = result

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []) or [],
            "config": report.get("config", {}),
        }