import pandas as pd
import json
import os
from datetime import datetime
from dateutil.relativedelta import relativedelta
from .base import BaseReportService
from core.utils import read_excel_robust, find_column
import concurrent.futures
import re

# Helper to find the header row
def find_header_row(df, keywords):
    for i, row in enumerate(df.itertuples(index=False)):
        row_str = ' '.join(map(str, row)).lower()
        if all(keyword.lower() in row_str for keyword in keywords):
            return i
    return None

# Helper to parse a single file
def _parse_pi_file(upload_entry):
    if not upload_entry or upload_entry.get("status") != "uploaded" or not upload_entry.get("path"):
        return None

    try:
        # Use a more robust way to resolve path
        temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
        file_path = os.path.join(temp_dir, os.path.basename(upload_entry["path"]))
        
        if not os.path.exists(file_path):
            # Maybe the path in DB is already absolute
            file_path = upload_entry["path"]
            if not os.path.exists(file_path):
                 print(f"File not found for shop {upload_entry.get('shop_code')}: {upload_entry.get('path')}")
                 return None

        # Read top part for metadata
        df_meta = read_excel_robust(file_path, header=None, nrows=10)
        warehouse = "Unknown"
        for i in range(len(df_meta)):
            row_str = " ".join([str(x) for x in df_meta.iloc[i].values if str(x) != "nan"])
            match = re.search(r"Warehouse\s*:\s*([^,]+)", row_str, re.IGNORECASE)
            if match:
                # Extract only the warehouse name like WH-KOLLAM
                wh_full = match.group(1).strip()
                wh_match = re.search(r"(WH-\w+)", wh_full)
                if wh_match:
                    warehouse = wh_match.group(1)
                else:
                    warehouse = wh_full.split(' ')[0] # Fallback
                break

        # Read data part
        df_full = read_excel_robust(file_path, header=None)
        header_row_index = find_header_row(df_full, ["Brand Code", "Product Brand"])

        if header_row_index is None:
            header_row_index = find_header_row(df_full, ["Brand"])

        if header_row_index is None:
            return None

        # The actual headers might be split across two rows
        header1 = df_full.iloc[header_row_index].fillna('')
        header2 = df_full.iloc[header_row_index + 1].fillna('') if header_row_index + 1 < len(df_full) else pd.Series(['']*len(header1))
        
        # Combine headers
        new_columns = []
        for i in range(len(header1)):
            h1 = str(header1[i]).replace('\n', ' ').strip()
            h2 = str(header2[i]).replace('\n', ' ').strip()
            if h1 and h2 and h1 != h2:
                new_columns.append(f"{h1} {h2}")
            elif h1:
                new_columns.append(h1)
            else:
                new_columns.append(h2)

        df = df_full.iloc[header_row_index + 2:].copy()
        df.columns = new_columns
        df = df.dropna(how='all')

        # Normalize column names
        df.columns = [str(c).lower().replace('(c/s)', '').replace(' ', '_').strip() for c in df.columns]
        
        # Find columns dynamically
        bc_col = find_column(df, ["brand", "code"]) or find_column(df, ["item", "code"])
        pb_col = find_column(df, ["product", "brand"]) or find_column(df, ["brand", "name"]) or find_column(df, ["item", "name"])
        if not pb_col:
            for c in df.columns:
                if "brand" in c and "code" not in c:
                    pb_col = c
                    break

        l3ms_col = find_column(df, ["previous"]) or find_column(df, ["3", "month"]) or find_column(df, ["l3ms"])
        rl_col = find_column(df, ["rl"])
        rq_col = find_column(df, ["rq"])
        mq_col = find_column(df, ["mq"])

        # Filter out empty rows robustly
        sr_col = find_column(df, ["sr", "no"]) or find_column(df, ["sl", "no"])
        if bc_col:
            df = df[df[bc_col].notna() & (df[bc_col] != "")]
        elif sr_col:
            df = df[pd.to_numeric(df[sr_col], errors='coerce').notna()]
        
        rename_dict = {}
        if bc_col: rename_dict[bc_col] = 'brand_code'
        if pb_col: rename_dict[pb_col] = 'product_brand'
        if l3ms_col: rename_dict[l3ms_col] = 'l3ms'
        if rl_col: rename_dict[rl_col] = 'rl'
        if rq_col: rename_dict[rq_col] = 'rq'
        if mq_col: rename_dict[mq_col] = 'mq'
        
        df = df.rename(columns=rename_dict)
        required_cols = list(rename_dict.values())
        df = df[[col for col in required_cols if col in df.columns]]

        # Add metadata
        df['shop_code'] = upload_entry.get("shop_code")
        df['shop_name'] = upload_entry.get("shop_name", "Unknown")
        df['warehouse'] = warehouse
        
        # Convert to numeric
        for col in ['l3ms', 'rl', 'rq', 'mq']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        return df
    except Exception as e:
        print(f"Error parsing file for shop {upload_entry.get('shop_code')}: {e}")
        return None

class PiVarianceReportService(BaseReportService):
    type_name = "pi_variance"

    def __init__(self):
        super().__init__()
        self.brand_mapping = self._load_brand_mapping()

    def _load_brand_mapping(self):
        try:
            mapping_path = os.path.join(os.path.dirname(__file__), "..", "brand_pi_mapping.json")
            with open(mapping_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def process(self, report):
        report_month_str = report.get("config", {}).get("month")
        if not report_month_str:
            report["processed"] = {"error": "Report month not configured."}
            return

        report_month = datetime.strptime(report_month_str, "%Y-%m")
        prev_month = report_month - relativedelta(months=1)
        prev_month_str = prev_month.strftime("%Y-%m")

        all_raw_reports = report.get("all_reports", [])

        # Find the raw reports for current and previous months
        raw_report_cm = next((r for r in all_raw_reports if r.get("config", {}).get("month") == report_month_str), None)
        raw_report_lm = next((r for r in all_raw_reports if r.get("config", {}).get("month") == prev_month_str), None)

        if not raw_report_cm:
            report["processed"] = {"error": f"No raw data found for {report_month_str}"}
            return

        # Process files
        with concurrent.futures.ThreadPoolExecutor() as executor:
            cm_futures = [executor.submit(_parse_pi_file, u) for u in raw_report_cm.get("uploads", [])]
            cm_dfs = [f.result() for f in cm_futures if f.result() is not None]
            
            lm_dfs = []
            if raw_report_lm:
                lm_futures = [executor.submit(_parse_pi_file, u) for u in raw_report_lm.get("uploads", [])]
                lm_dfs = [f.result() for f in lm_futures if f.result() is not None]

        if not cm_dfs:
            report["processed"] = {"error": f"Could not parse any valid files for {report_month_str}"}
            return
            
        df_cm = pd.concat(cm_dfs, ignore_index=True)
        if df_cm.empty:
            report["processed"] = {"error": f"Data extracted from files is empty for {report_month_str}"}
            return

        df_lm = pd.concat(lm_dfs, ignore_index=True) if lm_dfs else pd.DataFrame()

        # Map brands safely
        if 'product_brand' in df_cm.columns:
            df_cm['brand_short'] = df_cm['product_brand'].map(self.brand_mapping).fillna('OTHER')
        else:
            df_cm['brand_short'] = 'OTHER'

        if not df_lm.empty:
            if 'product_brand' in df_lm.columns:
                df_lm['brand_short'] = df_lm['product_brand'].map(self.brand_mapping).fillna('OTHER')
            else:
                df_lm['brand_short'] = 'OTHER'

        # --- Aggregation and Pivoting ---
        metrics = ['l3ms', 'rl', 'rq', 'mq']
        
        def pivot_data(df, suffix):
            if df.empty:
                return pd.DataFrame()
            
            pivot = df.pivot_table(
                index=['warehouse', 'shop_code', 'shop_name'],
                columns='brand_short',
                values=metrics,
                aggfunc='sum'
            ).fillna(0)
            
            pivot.columns = [f"{col[1]}_{col[0]}{suffix}" for col in pivot.columns]
            return pivot

        pivot_cm = pivot_data(df_cm, "_cm")
        pivot_lm = pivot_data(df_lm, "_lm")

        # Merge CM and LM data
        if not pivot_lm.empty:
            final_df = pivot_cm.merge(pivot_lm, on=['warehouse', 'shop_code', 'shop_name'], how='left').fillna(0)
        else:
            final_df = pivot_cm
            # Add empty LM columns if no LM data
            for col in pivot_cm.columns:
                final_df[col.replace('_cm', '_lm')] = 0

        # Calculate variance
        brands = df_cm['brand_short'].unique()
        for brand in brands:
            for metric in metrics:
                cm_col = f"{brand}_{metric}_cm"
                lm_col = f"{brand}_{metric}_lm"
                var_col = f"{brand}_{metric}_var"
                if cm_col in final_df.columns and lm_col in final_df.columns:
                    final_df[var_col] = final_df[cm_col] - final_df[lm_col]

        final_df = final_df.reset_index()
        report["processed"] = final_df.to_dict('records')

    def get_report(self, report, **kwargs):
        processed_data = report.get("processed", [])
        if isinstance(processed_data, dict) and "error" in processed_data:
             return {"data": [], "config": report.get("config", {}), "error": processed_data["error"]}
        
        if not processed_data:
            return {"data": [], "config": report.get("config", {})}

        df = pd.DataFrame(processed_data)
        
        # Extract unique warehouses and brands for frontend filters/columns
        warehouses = sorted(df['warehouse'].unique().tolist())
        
        brands = sorted(list(set([
            col.split('_')[0] for col in df.columns if col not in ['warehouse', 'shop_code', 'shop_name']
        ])))

        return {
            "data": df.to_dict('records'), 
            "config": report.get("config", {}),
            "meta": {
                "warehouses": warehouses,
                "brands": brands
            }
        }