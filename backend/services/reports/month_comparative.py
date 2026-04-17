from .base import BaseReportService


class MonthComparativeService(BaseReportService):
    type_name = "month_comparative"

    def process(self, report):
        base = report.get("_live_source", [])

        d1 = report["config"]["date1"]
        d2 = report["config"]["date2"]

        d1_map = {d["warehouse"]: d for d in base if d["date"] == d1}
        d2_map = {d["warehouse"]: d for d in base if d["date"] == d2}

        result = []

        for w in sorted(set(d1_map) | set(d2_map)):
            a = d1_map.get(w, {})
            b = d2_map.get(w, {})

            # 🔥 CURRENT (d1)
            stn1 = a.get("STN", 0)
            gtn1 = a.get("GTN", 0)
            total1 = a.get("TOTAL", 0)
            cfed1 = a.get("CFED", 0)
            bar1 = a.get("BAR", 0)

            final1 = total1 + cfed1 + bar1

            # 🔥 PREVIOUS (d2)
            stn2 = b.get("STN", 0)
            gtn2 = b.get("GTN", 0)
            total2 = b.get("TOTAL", 0)
            cfed2 = b.get("CFED", 0)
            bar2 = b.get("BAR", 0)

            final2 = total2 + cfed2 + bar2

            diff = final1 - final2
            pct = (diff / final2 * 100) if final2 else 0

            result.append({
                "warehouse": w,

                # current
                "stn1": round(stn1),
                "gtn1": round(gtn1),
                "total1": round(total1),
                "cfed1": round(cfed1),
                "bar1": round(bar1),
                "final1": round(final1),

                # previous
                "stn2": round(stn2),
                "gtn2": round(gtn2),
                "total2": round(total2),
                "cfed2": round(cfed2),
                "bar2": round(bar2),
                "final2": round(final2),

                # diff
                "diff": round(diff),
                "pct": round(pct),
            })

        report["processed"] = result

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []),
            "date1": report["config"]["date1"],
            "date2": report["config"]["date2"],
        }