import pandas as pd
import re

def normalize(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [
            "_".join([str(level).strip() for level in col if str(level).strip() and "Unnamed" not in str(level)])
            for col in df.columns.values
        ]
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df

def clean_df(df: pd.DataFrame) -> pd.DataFrame:
    return df.replace([float("inf"), float("-inf")], 0).fillna(0)

def find_column(df: pd.DataFrame, keywords):
    for c in df.columns:
        if all(k in c.lower() for k in keywords):
            return c
    return None

def find_dynamic(df: pd.DataFrame, keys, exclude=None):
    for c in df.columns:
        if all(k in c for k in keys):
            # Strict check for short common words like 'in' and 'out' to avoid false positives (e.g., 'in' in 'opening')
            is_valid = True
            for k in keys:
                if k in ["in", "out"]:
                    if not re.search(rf"(^|_){k}(_|$)", c):
                        is_valid = False
                        break
            if not is_valid:
                continue

            if exclude and any(e in c for e in exclude):
                continue
            return c
    return None

def safe_int(x):
    try:
        return int(float(x))
    except Exception:
        return 0

def read_excel_robust(path, **kwargs):
    """
    Reads an Excel file, with a fallback to HTML if it's an HTML table disguised as XLS.
    """
    engine = kwargs.pop("engine", None)
    if not engine:
        if str(path).lower().endswith(".xls"):
            engine = "xlrd"
        else:
            engine = "openpyxl"
    
    try:
        return pd.read_excel(path, engine=engine, **kwargs)
    except Exception as e:
        if "Expected BOF record" in str(e) or "Unsupported format" in str(e):
            try:
                # read_html returns a list of DataFrames
                html_kwargs = {k: v for k, v in kwargs.items() if k not in ["engine", "nrows"]}
                
                # IMPORTANT: For KSBC HTML files, they often contain multiple tables.
                # We read the file as a string to preserve all content.
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    html_content = f.read()
                
                import io
                import re
                
                # 🔥 SANITIZE MALFORMED KSBC HTML
                # KSBC often omits <tr> after </tr>, which confuses parsers.
                # We fix </td></tr><td... into </td></tr><tr><td...
                html_content = re.sub(r'</td></tr>\s*<td', '</td></tr><tr><td', html_content)
                html_content = re.sub(r'</th></tr>\s*<td', '</th></tr><tr><td', html_content)
                html_content = re.sub(r'</td></tr>\s*<th', '</td></tr><tr><th', html_content)
                html_content = re.sub(r'</th></tr>\s*<th', '</th></tr><tr><th', html_content)
                # Also handle cases where rows start directly with <td> without <tr> at all
                html_content = re.sub(r'</table>\s*<table[^>]*>\s*<td', '</table><table><tr><td', html_content)
                # And handle the case inside <thead> or similar structures if present
                html_content = re.sub(r'</tr>\s*<td', '</tr><tr><td', html_content)
                html_content = re.sub(r'</tr>\s*<th', '</tr><tr><th', html_content)
                
                # First, try reading without strict header constraints
                dfs = pd.read_html(io.StringIO(html_content))
                if dfs:
                    # 1. Identify the most likely data table
                    target_df = None
                    for t in dfs:
                        t_str = t.to_string().upper()
                        if any(k in t_str for k in ["ITEM NAME", "PRODUCT CODE", "WAREHOUSE"]):
                            target_df = t
                            break
                    
                    df = target_df if target_df is not None else pd.concat(dfs, ignore_index=True)
                    
                    # 2. Extract Warehouse metadata if missing from the table but present in HTML
                    if "WAREHOUSE" not in df.to_string().upper():
                        match = re.search(r"Warehouse\s*:\s*(?:<b>)?([^<,]+)", html_content, re.IGNORECASE)
                        if match:
                            wh_text = f"Warehouse : {match.group(1).strip()}"
                            df = pd.concat([pd.DataFrame([wh_text]), df], ignore_index=True)
                    
                    # 3. Handle 'header' argument for HTML fallback
                    header = kwargs.get("header")
                    if header is not None:
                        try:
                            # Instead of re-reading with strict headers which often fails on malformed HTML,
                            # we search for a table that has headers containing our keywords.
                            # If the current df already has them in the first few rows, we promote them.
                            for i in range(min(10, len(df))):
                                row_str = " ".join([str(x) for x in df.iloc[i]]).upper()
                                if "ITEM NAME" in row_str or "PRODUCT CODE" in row_str:
                                    # Found the header row! 
                                    # If header was a list like [4,5], we should probably combine rows.
                                    # For simplicity and robustness, we'll promote this row and the next as MultiIndex if possible.
                                    if i + 1 < len(df):
                                        new_cols = []
                                        for col_idx in range(df.shape[1]):
                                            p1 = str(df.iloc[i, col_idx])
                                            p2 = str(df.iloc[i+1, col_idx])
                                            new_cols.append((p1, p2) if p2.lower() != 'nan' else p1)
                                        df.columns = pd.MultiIndex.from_tuples([c if isinstance(c, tuple) else (c, '') for c in new_cols])
                                        df = df.drop(df.index[i:i+2]).reset_index(drop=True)
                                    else:
                                        df.columns = df.iloc[i]
                                        df = df.drop(df.index[i]).reset_index(drop=True)
                                    break
                        except:
                            pass
                    
                    if "nrows" in kwargs:
                        df = df.head(kwargs["nrows"])
                    return df
            except Exception as ex:
                print(f"DEBUG: HTML fallback failed: {ex}")
                pass
        raise e
