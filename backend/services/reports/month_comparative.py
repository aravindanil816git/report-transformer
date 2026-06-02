from .base import BaseReportService


class MonthComparativeService(BaseReportService):
    type_name = "month_comparative"

    def process(self, report):
        base = report.get("_live_source", [])

        d1 = str(report.get("config", {}).get("date1") or "").strip()[:10]
        d2 = str(report.get("config", {}).get("date2") or "").strip()[:10]

        print(f"[DEBUG] MonthComparativeService: Processing for dates {d1} and {d2} with {len(base)} source records.")

        d1_map = {}
        d2_map = {}

        for d in base:
            if not isinstance(d, dict): continue
            w = d.get("warehouse")
            if not w: continue
            
            item_date = str(d.get("date") or "").strip()[:10]
            if item_date == d1:
                d1_map[w] = d
            if item_date == d2:
                d2_map[w] = d
                
        all_warehouses = sorted(list(set(d1_map.keys()) | set(d2_map.keys())))
        
        print(f"[DEBUG] MonthComparativeService: Found {len(d1_map)} records for {d1}, and {len(d2_map)} records for {d2}.")
        print(f"[DEBUG] MonthComparativeService: Unique warehouses across both dates: {len(all_warehouses)}")

        result = []

        for w in all_warehouses:
            a = d1_map.get(w, {})
            b = d2_map.get(w, {})

            # 🔥 CURRENT (d1)
            stn1 = a.get("STN", 0)
            gtn1 = a.get("GTN", 0)
            total1 = stn1 + gtn1
            cfed1 = a.get("CFED", 0)
            bar1 = a.get("BAR", 0)

            final1 = total1 + cfed1 + bar1

            # 🔥 PREVIOUS (d2)
            stn2 = b.get("STN", 0)
            gtn2 = b.get("GTN", 0)
            total2 = stn2 + gtn2
            cfed2 = b.get("CFED", 0)
            bar2 = b.get("BAR", 0)

            final2 = total2 + cfed2 + bar2

            diff = final1 - final2
            pct = (diff / final2 * 100) if final2 else 0

            result.append({
                "warehouse": w,

                # current
                "stn1": round(stn1, 2),
                "gtn1": round(gtn1, 2),
                "total1": round(total1, 2),
                "cfed1": round(cfed1, 2),
                "bar1": round(bar1, 2),
                "final1": round(final1, 2),

                # previous
                "stn2": round(stn2, 2),
                "gtn2": round(gtn2, 2),
                "total2": round(total2, 2),
                "cfed2": round(cfed2, 2),
                "bar2": round(bar2, 2),
                "final2": round(final2, 2),

                # diff
                "diff": round(diff, 2),
                "pct": round(pct, 2),
            })

        report["processed"] = result

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []),
            "date1": report["config"]["date1"],
            "date2": report["config"]["date2"],
        }