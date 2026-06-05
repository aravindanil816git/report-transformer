from .base import BaseReportService
import pandas as pd
import re


class MonthlyStockSalesService(BaseReportService):
    type_name = "monthly_stock_sales"

    def _get_warehouse_stock_inward(self, data):
        if not data: 
            print("[DEBUG] _get_warehouse_stock_inward: No data provided", flush=True)
            return 0
        try:
            df = pd.DataFrame(data)
            df = df.dropna(how="all").reset_index(drop=True)
            
            from core.utils import find_dynamic
            import re
            
            print(f"[DEBUG] _get_warehouse_stock_inward: DataFrame loaded with {len(df)} rows. Columns: {list(df.columns)}", flush=True)

            # Check if data is already cleaned by warehouse_stock.py (headers promoted to columns)
            in_cases_col = find_dynamic(df, ["inward", "case"]) or find_dynamic(df, ["in", "case"])
            if not in_cases_col and "in_case" in df.columns: in_cases_col = "in_case"
            
            in_bottles_col = find_dynamic(df, ["inward", "bottle"]) or find_dynamic(df, ["in", "bottle"])
            if not in_bottles_col and "in_bottle" in df.columns: in_bottles_col = "in_bottle"
            
            if in_cases_col or in_bottles_col:
                print(f"[DEBUG] _get_warehouse_stock_inward: Found cleaned columns. Cases: {in_cases_col}, Bottles: {in_bottles_col}", flush=True)
                pack_col = find_dynamic(df, ["pack"])
                if not pack_col and "pack" in df.columns: pack_col = "pack"
                
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
                print(f"[DEBUG] _get_warehouse_stock_inward: Cleaned columns total inward cases calculated: {total_cases}", flush=True)
                return round(total_cases, 2)
            
            # Find the header row that contains "INWARD"
            header_idx = -1
            for i, row in df.iterrows():
                row_str = " ".join([str(x) for x in row.values if pd.notnull(x)]).upper()
                if ("INWARD" in row_str or "RECEIPT" in row_str) and ("OUTWARD" in row_str or "ISSUE" in row_str or "SALES" in row_str):
                    header_idx = i
                    break
                    
            if header_idx == -1:
                print(f"[DEBUG] _get_warehouse_stock_inward: Could not find header row with INWARD/RECEIPT and OUTWARD/ISSUE/SALES.", flush=True)
                return 0
            
            row1 = df.iloc[header_idx].astype(str).str.upper().tolist()
            row2 = df.iloc[header_idx + 1].astype(str).str.upper().tolist() if header_idx + 1 < len(df) else []
            
            inward_case_col, inward_bottle_col, pack_col = None, None, None
            for col_idx, val in enumerate(row1):
                if "INWARD" in val or "RECEIPT" in val:
                    inward_case_col = col_idx
                    if col_idx + 1 < len(row2) and ("BOTTLE" in row2[col_idx + 1] or "BTL" in row2[col_idx + 1]):
                        inward_bottle_col = col_idx + 1
                if "PACKING" in val or "PACK" in val:
                    pack_col = col_idx
                    
            if inward_case_col is None: 
                print(f"[DEBUG] _get_warehouse_stock_inward: inward_case_col is None after parsing headers.", flush=True)
                return 0
            
            print(f"[DEBUG] _get_warehouse_stock_inward: Found raw columns. inward_case_col: {inward_case_col}, inward_bottle_col: {inward_bottle_col}, pack_col: {pack_col}", flush=True)
            total_cases = 0
            for i in range(header_idx + 2, len(df)):
                row = df.iloc[i]
                val0 = str(row.values[0]).upper() if len(row.values) > 0 else ""
                val1 = str(row.values[1]).upper() if len(row.values) > 1 else ""
                if "TOTAL" in val0 or "TOTAL" in val1:
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
                
            print(f"[DEBUG] _get_warehouse_stock_inward: Raw columns total inward cases calculated: {total_cases}", flush=True)
            return round(total_cases, 2)
        except Exception as e:
            print(f"[ERROR] Error parsing warehouse_stock inward: {e}", flush=True)
            return 0

    def process(self, report):
        from .daily_secondary_sales import DailySecondarySalesService
        dss_svc = DailySecondarySalesService()

        month = report.get("config", {}).get("month")

        all_reports = report.get("all_reports", [])
        
        print(f"=== DEBUG START: MONTHLY STOCK PROCESS ===", flush=True)
        print(f"Target Month: {month}", flush=True)
        print(f"Total reports fetched from DB: {len(all_reports)}", flush=True)
        if not month: month = ""
        
        def matches_month(d_str, m_str):
            if not d_str or not m_str: return False
            d = str(d_str).strip()
            m = str(m_str).strip()
            if d.startswith(m): return True
            if len(m) == 7 and '-' in m:
                y, mo = m.split('-')
                if y in d and mo in d: return True
            return d == m

        # 🔥 collect relevant reports
        warehouse_reports = [
            r for r in all_reports
            if r.get("type") == "daily_warehouse"
        ]

        warehouse_stock_reports = [
            r for r in all_reports
            if r.get("type") == "warehouse_stock" and (
                matches_month(r.get("config", {}).get("date"), month) or 
                matches_month(r.get("config", {}).get("month"), month) or
                (prev_month and matches_month(r.get("config", {}).get("date"), prev_month)) or
                (prev_month and matches_month(r.get("config", {}).get("month"), prev_month))
            )
        ]
        
        # Sort to prioritize current month over previous month if both exist
        warehouse_stock_reports.sort(key=lambda x: str(x.get("config", {}).get("date") or ""), reverse=True)

        secondary_reports = [
            r for r in all_reports
            if r.get("type") == "daily_secondary_sales"
        ]

        offtake_reports = [
            r for r in all_reports
            if r.get("type") == "daily_warehouse_offtake"
        ]

        # 🔥 flatten
        warehouse_data = []
        for r in warehouse_reports:
            rep_date = r.get("config", {}).get("date", "")
            for item in (r.get("processed", []) or []):
                new_item = dict(item)
                if "date" not in new_item and rep_date:
                    new_item["date"] = rep_date
                warehouse_data.append(new_item)

        secondary_data = []
        for r in secondary_reports:
            rep_date = r.get("config", {}).get("date", "")
            for item in (r.get("processed", []) or []):
                new_item = dict(item)
                if "date" not in new_item and rep_date:
                    new_item["date"] = rep_date
                secondary_data.append(new_item)

        # 🔥 filter by month
        warehouse_data = [
            d for d in warehouse_data
            if matches_month(d.get("date"), month)
        ]

        secondary_data = [
            d for d in secondary_data
            if matches_month(d.get("date"), month)
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

        sec_warehouses = []
        for r in secondary_reports:
            if matches_month(r.get("config", {}).get("date"), month):
                for u in r.get("uploads", []):
                    if u.get("status") == "uploaded" and u.get("warehouse"):
                        sec_warehouses.append(u.get("warehouse"))

        offtake_warehouses = []
        for r in offtake_reports:
            if matches_month(r.get("config", {}).get("date"), month):
                for row in (r.get("processed") or []):
                    if row.get("warehouse"):
                        offtake_warehouses.append(row.get("warehouse"))

        # 🔥 all warehouses
        raw_warehouses = (
            [d.get("warehouse") for d in warehouse_data if d.get("warehouse")] +
            [d.get("warehouse") for d in secondary_data if d.get("warehouse")] +
            ws_warehouses +
            sec_warehouses +
            offtake_warehouses
        )

        from core.mapping_utils import get_warehouse_master_data
        # Sort master keys by length descending to prevent partial match conflicts
        master_wh_keys = sorted([str(k).upper() for k in get_warehouse_master_data().keys()], key=len, reverse=True)

        def clean_wh(w_name):
            if not w_name: return ""
            w = str(w_name).strip().upper()
            for mk in master_wh_keys:
                if mk in w:
                    return mk
            if w.startswith("WH-"):
                return w.split(" ")[0]
            return w

        warehouses = sorted(set(clean_wh(w) for w in raw_warehouses if clean_wh(w)))

        print(f"Total unique warehouses to process: {len(warehouses)}", flush=True)

        result = []

        for w in warehouses:
            wh_days = sorted(
                [d for d in warehouse_data if clean_wh(d.get("warehouse")) == clean_wh(w)],
                key=lambda x: str(x.get("date") or "")
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

            print(f"--- DEBUG MONTHLY INWARD: {w} ---", flush=True)
            # ✅ INWARD (Calculate from Warehouse Stock, fallback to Daily Warehouse if not uploaded)
            inward = 0
            used_new_inward = False
            for ws_report in warehouse_stock_reports:
                for u in ws_report.get("uploads", []):
                    if clean_wh(u.get("warehouse")) == clean_wh(w):
                        if u.get("status") == "uploaded":
                            data = u.get("data")
                            df = None
                            if data and len(data) > 0:
                                df = pd.DataFrame(data)
                            else:
                                path = u.get("path")
                                if path and __import__("os").path.exists(path):
                                    try:
                                        from core.utils import read_excel_robust
                                        df = read_excel_robust(path)
                                    except Exception as e:
                                        print(f"Error reading raw warehouse_stock file for {w}: {e}", flush=True)
                            
                            inw_val = self._get_warehouse_stock_inward(df.to_dict("records") if df is not None and not df.empty else None)
                            print(f"Found warehouse_stock file for {w}, report ID: {ws_report.get('id')}, date: {ws_report.get('config', {}).get('date')}, file: {u.get('file')}, inward parsed: {inw_val}", flush=True)
                            inward += inw_val
                            used_new_inward = True
                            break
                        else:
                            print(f"Found warehouse_stock upload for {w} but status is '{u.get('status')}', not 'uploaded'.", flush=True)
                if used_new_inward:
                    break
            
            if not used_new_inward and valid_wh_days:
                inward = sum(sum(float(i.get("physical") or 0) for i in d.get("items", [])) for d in valid_wh_days[1:])
                print(f"No warehouse_stock found, calculated inward from daily_warehouse for {w}: {inward}", flush=True)
            else:
                print(f"Final inward for {w}: {inward}", flush=True)

            total = op + inward

            print(f"--- DEBUG MONTHLY SALES: {w} ---", flush=True)
            # ✅ SALES
            def _get_sales(d):
                for k in ["TOTAL", "total", "Total", "issues", "ISSUES"]:
                    if k in d:
                        try: return float(d[k])
                        except: pass
                return 0

            sales = 0
            for d in secondary_data:
                if clean_wh(d.get("warehouse")) == clean_wh(w):
                    s_val = _get_sales(d)
                    print(f"Found secondary_data record for {w}, date: {d.get('date')}, extracted sales: {s_val}, raw record keys: {[k for k in d.keys() if 'TOTAL' in str(k).upper() or 'ISSUE' in str(k).upper()]}", flush=True)
                    sales += s_val
            
            # Fallback for sales if not found in processed
            if sales == 0:
                print(f"Sales is 0 from secondary data, trying Daily Warehouse Offtake for {w}...", flush=True)
                for o_rep in offtake_reports:
                    if matches_month(o_rep.get("config", {}).get("date"), month):
                        for row in (o_rep.get("processed") or []):
                            if clean_wh(row.get("warehouse")) == clean_wh(w):
                                sales += float(row.get("issues") or 0)

            if sales == 0:
                print(f"Sales is 0 from processed data, trying fallback raw files for {w}...", flush=True)
                for sec_report in secondary_reports:
                    if matches_month(sec_report.get("config", {}).get("date"), month):
                        for u in sec_report.get("uploads", []):
                            if clean_wh(u.get("warehouse")) == clean_wh(w):
                                if u.get("status") == "uploaded":
                                    data = u.get("data")
                                    df = None
                                    if data and len(data) > 0:
                                        df = pd.DataFrame(data)
                                    else:
                                        path = u.get("path")
                                        if path and __import__("os").path.exists(path):
                                            try:
                                                from core.utils import read_excel_robust
                                                df = read_excel_robust(path)
                                            except Exception as e:
                                                print(f"Error reading raw secondary file for {w}: {e}", flush=True)
                                    
                                    if df is not None and not df.empty:
                                        try:
                                            totals = dss_svc._find_grand_total(df)
                                            print(f"Fallback raw file parsed for {w}: {u.get('file')}, found totals: {totals}", flush=True)
                                            if totals:
                                                sales += float(totals.get("TOTAL", 0))
                                        except Exception as e:
                                            print(f"Fallback raw file error for {w}, file: {u.get('file')}, error: {e}", flush=True)
                                    else:
                                        print(f"Fallback raw file for {w} had no data and could not be loaded from path.", flush=True)
                                else:
                                    print(f"Found secondary_report upload for {w} but status is '{u.get('status')}', not 'uploaded'.", flush=True)
            else:
                print(f"Final sales for {w}: {sales}", flush=True)

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