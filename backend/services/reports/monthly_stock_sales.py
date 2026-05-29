from .base import BaseReportService
import pandas as pd
import re


class MonthlyStockSalesService(BaseReportService):
    type_name = "monthly_stock_sales"

    def _get_warehouse_stock_inward(self, data):
        if not data: return 0
        try:
            df = pd.DataFrame(data)
            df = df.dropna(how="all").reset_index(drop=True)
            
            from core.utils import find_dynamic
            import re
            
            # Check if data is already cleaned by warehouse_stock.py (headers promoted to columns)
            in_cases_col = find_dynamic(df, ["inward", "case"]) or find_dynamic(df, ["in", "case"])
            in_bottles_col = find_dynamic(df, ["inward", "bottle"]) or find_dynamic(df, ["in", "bottle"])
            
            if in_cases_col or in_bottles_col:
                pack_col = find_dynamic(df, ["pack"])
                total_cases = 0
                for _, row in df.iterrows():
                    c_val = row.get(in_cases_col, 0)
                    b_val = row.get(in_bottles_col, 0)
                    pack_val = row.get(pack_col, "12") if pack_col else "12"
                    
                    try: c = float(c_val) if pd.notnull(c_val) and str(c_val).strip() else 0
                    except: c = 0
                    try: b = float(b_val) if pd.notnull(b_val) and str(b_val).strip() else 0
                    except: b = 0
                    
                    bpc = 12
                    try:
                        m = re.search(r'^(\d+)', str(pack_val))
                        if m: bpc = int(m.group(1))
                    except: pass
                    if bpc <= 0: bpc = 1
                    
                    total_cases += c + (b / bpc)
                return round(total_cases, 2)
            
            # Find the header row that contains "INWARD"
            header_idx = -1
            for i, row in df.iterrows():
                row_str = " ".join([str(x) for x in row.values if pd.notnull(x)]).upper()
                if "INWARD" in row_str and "OUTWARD" in row_str:
                    header_idx = i
                    break
                    
            if header_idx == -1: return 0
            
            row1 = df.iloc[header_idx].astype(str).str.upper().tolist()
            row2 = df.iloc[header_idx + 1].astype(str).str.upper().tolist() if header_idx + 1 < len(df) else []
            
            inward_case_col, inward_bottle_col, pack_col = None, None, None
            for col_idx, val in enumerate(row1):
                if "INWARD" in val:
                    inward_case_col = col_idx
                    if col_idx + 1 < len(row2) and "BOTTLE" in row2[col_idx + 1]:
                        inward_bottle_col = col_idx + 1
                if "PACKING" in val:
                    pack_col = col_idx
                    
            if inward_case_col is None: return 0
            
            total_cases = 0
            for i in range(header_idx + 2, len(df)):
                row = df.iloc[i]
                if "TOTAL" in str(row.values[0]).upper() or "TOTAL" in str(row.values[1]).upper():
                    continue 
                
                c_val = row.iloc[inward_case_col] if inward_case_col is not None else 0
                b_val = row.iloc[inward_bottle_col] if inward_bottle_col is not None else 0
                pack_val = row.iloc[pack_col] if pack_col is not None else "12"
                
                try: c = float(c_val)
                except: c = 0
                try: b = float(b_val)
                except: b = 0
                
                # Extract Bottles Per Case (BPC) from pack size like "12x750ml"
                bpc = 12
                try:
                    m = re.search(r'^(\d+)', str(pack_val))
                    if m: bpc = int(m.group(1))
                except: pass
                if bpc <= 0: bpc = 1
                
                total_cases += c + (b / bpc)
                
            return round(total_cases, 2)
        except Exception as e:
            print(f"Error parsing warehouse_stock inward: {e}")
            return 0

    def process(self, report):
        month = report.get("config", {}).get("month")

        all_reports = report.get("all_reports", [])
        
        print(f"=== DEBUG START: MONTHLY STOCK PROCESS ===", flush=True)
        print(f"Target Month: {month}", flush=True)
        print(f"Total reports fetched from DB: {len(all_reports)}", flush=True)
        if not month: month = ""

        # 🔥 collect relevant reports
        warehouse_reports = [
            r for r in all_reports
            if r.get("type") == "daily_warehouse"
        ]

        warehouse_stock_reports = [
            r for r in all_reports
            if r.get("type") == "warehouse_stock"
        ]
        
        # Filter stock reports by the exact month (handling both daily and legacy configs)
        warehouse_stock_reports = [
            r for r in warehouse_stock_reports
            if r.get("config", {}).get("date", "").startswith(month) or r.get("config", {}).get("month", "") == month
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

        print(f"Warehouse reports found: {len(warehouse_reports)}", flush=True)
        print(f"Secondary reports found: {len(secondary_reports)}", flush=True)
        print(f"Warehouse data (after filtering for {month}): {len(warehouse_data)} entries", flush=True)
        print(f"Secondary data (after filtering for {month}): {len(secondary_data)} entries", flush=True)

        # 🔥 Collect warehouses from all potential sources
        ws_warehouses = []
        for r in warehouse_stock_reports:
            for u in r.get("uploads", []):
                if u.get("status") == "uploaded" and u.get("warehouse"):
                    ws_warehouses.append(u.get("warehouse"))

        # 🔥 all warehouses
        warehouses = sorted(set(
            [d.get("warehouse") for d in warehouse_data] +
            [d.get("warehouse") for d in secondary_data] +
            ws_warehouses
        ))

        print(f"Total unique warehouses to process: {len(warehouses)}", flush=True)

        result = []

        for w in warehouses:
            wh_days = sorted(
                [d for d in warehouse_data if d.get("warehouse") == w],
                key=lambda x: x.get("date")
            )
            
            valid_wh_days = [d for d in wh_days if d.get("items")]

            print(f"--- DEBUG MONTHLY OP: {w} ---")
            print(f"Total days found: {len(wh_days)}, Valid days (with items): {len(valid_wh_days)}")

            # ✅ OP
            if not valid_wh_days:
                print(f"No valid days found for {w}. Setting OP to 0.")
                op = 0
            else:
                first_day = valid_wh_days[0]
                first_date = first_day.get('date', 'Unknown Date')
                items = first_day.get('items', [])
                print(f"First valid date: {first_date} | Item count: {len(items)}")
                for idx, item in enumerate(items[:3]):
                    print(f"  Item {idx}: {item.get('item_name', 'Unknown')} | physical: '{item.get('physical')}' | type: {type(item.get('physical'))}")
                op = sum(float(i.get("physical") or 0) for i in items)
                print(f"Calculated OP for {w}: {op}")

            # ✅ INWARD (Calculate from Warehouse Stock, fallback to Daily Warehouse if not uploaded)
            inward = 0
            used_new_inward = False
            for ws_report in warehouse_stock_reports:
                for u in ws_report.get("uploads", []):
                    if u.get("warehouse") == w and u.get("status") == "uploaded":
                        inward += self._get_warehouse_stock_inward(u.get("data"))
                        used_new_inward = True
            
            if not used_new_inward and valid_wh_days:
                inward = sum(sum(float(i.get("physical") or 0) for i in d.get("items", [])) for d in valid_wh_days[1:])

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
                "op": round(op, 2),
                "inward": round(inward, 2),
                "total": round(total, 2),
                "sales": round(sales, 2),
                "cl": round(cl, 2),
            })

        report["processed"] = result

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []) or [],
            "config": report.get("config", {}),
        }