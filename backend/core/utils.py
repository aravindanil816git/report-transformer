import pandas as pd

def normalize(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df

def clean_df(df: pd.DataFrame) -> pd.DataFrame:
    return df.replace([float("inf"), float("-inf")], 0).fillna(0)

def find_column(df: pd.DataFrame, keywords):
    for c in df.columns:
        if all(k in c.lower() for k in keywords):
            return c
    return None

def find_dynamic(df: pd.DataFrame, keys):
    for c in df.columns:
        if all(k in c for k in keys):
            return c
    return None

def safe_int(x):
    try:
        return int(float(x))
    except Exception:
        return 0
