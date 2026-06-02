import pandas as pd
from .base import BaseReportService
from core.utils import normalize, find_dynamic

class WarehouseStockService(BaseReportService):
    type_name = "warehouse_stock"

    def process(self, report):
        # Aggregate all raw warehouse uploads into a single unified view
        uploads = report.get("uploads", [])
        combined_data = []
        
        for u in uploads:
            if u.get("status") == "uploaded" and u.get("data"):
                df = pd.DataFrame(u["data"])
                
                if df.empty:
                    continue

                # Find the actual header row (skips metadata/junk rows at the top of raw exports)
                cols_str = " ".join([str(x).upper() for x in df.columns])
                header_idx = -1
                
                if "ITEM CODE" not in cols_str and "SUPPLIER" not in cols_str:
                    for i in range(min(20, len(df))):
                        row_str = " ".join([str(x).upper() for x in df.iloc[i].values])
                        if "ITEM CODE" in row_str or "SUPPLIER" in row_str:
                            header_idx = i
                            break
                    
                    if header_idx >= 0:
                        row1 = df.iloc[header_idx].values
                        row2 = df.iloc[header_idx + 1].values if header_idx + 1 < len(df) else []
                        row2_str = " ".join([str(x).upper() for x in row2])
                        
                        is_two_row_header = "CASE" in row2_str or "BOTTLE" in row2_str
                        
                        if is_two_row_header:
                            new_cols = []
                            last_valid_r1 = ""
                            for j in range(len(df.columns)):
                                r1_val = str(row1[j]).strip() if j < len(row1) and pd.notnull(row1[j]) else ""
                                if r1_val and r1_val.lower() != "nan" and not r1_val.lower().startswith("unnamed"):
                                    last_valid_r1 = r1_val
                                else:
                                    r1_val = last_valid_r1
                                    
                                r2_val = str(row2[j]).strip() if j < len(row2) and pd.notnull(row2[j]) else ""
                                if r2_val.lower() == "nan": r2_val = ""
                                
                                col_name = f"{r1_val} {r2_val}".strip() if r2_val else r1_val
                                new_cols.append(col_name if col_name else f"unnamed_{j}")
                                
                            df.columns = new_cols
                            df = df.iloc[header_idx+2:].reset_index(drop=True)
                        else:
                            df.columns = [str(x) if pd.notnull(x) and str(x).lower() != 'nan' else f"unnamed_{j}" for j, x in enumerate(row1)]
                            df = df.iloc[header_idx+1:].reset_index(drop=True)

                # Normalize column names (lowercase, replaces spaces with underscores)
                df = normalize(df)
                
                # Drop empty footer rows
                df = df.dropna(how='all')

                # Remove 'TOTAL' rows to prevent double counting
                mask = df.astype(str).apply(lambda x: x.str.strip().str.upper().isin(["TOTAL", "GRAND TOTAL"])).any(axis=1)
                df = df[~mask].reset_index(drop=True)

                # Ensure metric columns are cast to floats so downstream aggregations sum correctly instead of returning 0
                for col in df.columns:
                    c_low = str(col).lower()
                    if any(k in c_low for k in ["inward", "outward", "opening", "closing", "breakage", "dead", "case", "bottle"]):
                        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

                # Create standard aliases for downstream reports (like monthly_stock_sales) 
                # which might strictly search for "in" instead of "inward"
                in_c = find_dynamic(df, ["inward", "case"])
                in_b = find_dynamic(df, ["inward", "bottle"])
                if in_c: df["in_case"] = df[in_c]
                if in_b: df["in_bottle"] = df[in_b]

                # Tag the row with its source warehouse if not explicitly in the Excel file
                df["_source_warehouse"] = u.get("warehouse")
                
                # Convert back to dicts, replacing NaNs with None for JSON serialization
                df = df.replace({pd.NA: None}).where(pd.notnull(df), None)
                cleaned_records = df.to_dict("records")
                combined_data.extend(cleaned_records)
                
                # Overwrite the raw upload with the cleaned headers to fix downstream 0 values
                u["data"] = cleaned_records
        
        report["processed"] = combined_data

    def get_report(self, report, **kwargs):
        return {
            "data": report.get("processed", []),
            "uploads": report.get("uploads", []),
            "config": report.get("config", {})
        }