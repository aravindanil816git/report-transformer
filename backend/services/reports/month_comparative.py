from .base import BaseReportService
from datetime import datetime, timedelta


class MonthComparativeService(BaseReportService):
    type_name = "month_comparative"

    def process(self, report):
        base = report.get("_live_source", [])

        d1 = str(report.get("config", {}).get("date1") or "").strip()[:10]
        d2 = str(report.get("config", {}).get("date2") or "").strip()[:10]

        print(f"[DEBUG] MonthComparativeService: Processing for dates {d1} and {d2} with {len(base)} source records.", flush=True)

        # Determine earliest month to find the "last month" data source
        earliest_month_str = ""
        if d1 and d2:
            try:
                date1_obj = datetime.strptime(d1, "%Y-%m-%d")
                date2_obj = datetime.strptime(d2, "%Y-%m-%d")
                earliest_date = min(date1_obj, date2_obj)
                earliest_month_str = earliest_date.strftime("%Y-%m")
            except ValueError:
                pass # Dates might be malformed

        d1_map = {}
        d2_map = {}
        last_day_of_earliest_month_map = {}

        for d in base:
            if not isinstance(d, dict): continue
            w = d.get("warehouse")
            if not w: continue

            item_date = str(d.get("date") or "").strip()[:10]
            if item_date == d1:
                d1_map[w] = d
            if item_date == d2:
                d2_map[w] = d

            if earliest_month_str and item_date.startswith(earliest_month_str):
                if w in last_day_of_earliest_month_map:
                    if item_date > last_day_of_earliest_month_map[w].get("date", ""):
                        last_day_of_earliest_month_map[w] = d
                else:
                    last_day_of_earliest_month_map[w] = d

        all_warehouses = sorted(list(set(d1_map.keys()) | set(d2_map.keys()) | set(last_day_of_earliest_month_map.keys())))

        print(f"[DEBUG] MonthComparativeService: Found {len(d1_map)} records for {d1}, {len(d2_map)} for {d2}, and {len(last_day_of_earliest_month_map)} for month {earliest_month_str}.", flush=True)
        print(f"[DEBUG] MonthComparativeService: Unique warehouses across all dates: {len(all_warehouses)}", flush=True)

        result = []

        for w in all_warehouses:
            a = d1_map.get(w, {})
            b = d2_map.get(w, {})
            c = last_day_of_earliest_month_map.get(w, {})

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
            
            # 🔥 LAST MONTH (c)
            stn_lm = c.get("STN", 0)
            gtn_lm = c.get("GTN", 0)
            total_lm = stn_lm + gtn_lm
            cfed_lm = c.get("CFED", 0)
            bar_lm = c.get("BAR", 0)
            final_lm = total_lm + cfed_lm + bar_lm

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

                # last month
                "last_month_final": round(final_lm, 2),
            })

        # Find the single latest date from all the last month uploads to use as a label
        if last_day_of_earliest_month_map:
            latest_date_in_earliest_month = max(d.get("date") for d in last_day_of_earliest_month_map.values() if d.get("date"))
            if latest_date_in_earliest_month:
                last_month_date_label = datetime.strptime(latest_date_in_earliest_month, "%Y-%m-%d").strftime("%d %b")
                report["config"]["last_month_date_label"] = last_month_date_label

        report["processed"] = result

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []),
            "date1": report.get("config", {}).get("date1"),
            "date2": report.get("config", {}).get("date2"),
            "last_month_date_label": report.get("config", {}).get("last_month_date_label"),
        }