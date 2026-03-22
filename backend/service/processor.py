
import pandas as pd

def process_file(file_path):
    df = pd.read_excel(file_path)
    df.columns = [c.strip().lower() for c in df.columns]
    return df

def generate_report(df, shop_code=None, view="case"):
    if shop_code:
        df = df[df["shop_code"] == int(shop_code)]

    grouped = df.groupby(["brand", "pack_size"])

    def format_case(c, b):
        return f"{int(c)} case and {int(b)} bottle"

    def to_bottle(c, b, pack):
        return int(c) * int(pack) + int(b)

    result = {}

    for (brand, pack), g in grouped:
        sums = g.sum(numeric_only=True)

        if view == "case":
            row = {
                "pack": f"{pack} ML",
                "opening": format_case(sums["opening_cases"], sums["opening_bottles"]),
                "inward": format_case(sums["in_cases"], sums["in_bottles"]),
                "outward": format_case(sums["out_cases"], sums["out_bottles"]),
                "closing": format_case(sums["closing_cases"], sums["closing_bottles"]),
            }
        else:
            row = {
                "pack": f"{pack} ML",
                "opening": to_bottle(sums["opening_cases"], sums["opening_bottles"], pack),
                "inward": to_bottle(sums["in_cases"], sums["in_bottles"], pack),
                "outward": to_bottle(sums["out_cases"], sums["out_bottles"], pack),
                "closing": to_bottle(sums["closing_cases"], sums["closing_bottles"], pack),
            }

        result.setdefault(brand, []).append(row)

    return result
