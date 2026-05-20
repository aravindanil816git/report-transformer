import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
shopcode_path = os.path.join(BASE_DIR, "shopcode_mapping.json")
shops_path = os.path.join(BASE_DIR, "shops.json")

with open(shopcode_path, "r", encoding="utf-8") as f:
    shopcode_data = json.load(f)

with open(shops_path, "r", encoding="utf-8") as f:
    shops_master = json.load(f)

count = 0
for region, shops in shopcode_data.items():
    for shop in shops:
        code = str(shop.get("shop_code"))
        if code not in shops_master:
            shops_master[code] = {}
        
        # Format exactly as requested (without region)
        shops_master[code]["shop_code"] = code
        shops_master[code]["shop_name"] = shop.get("shop_name", "")
        shops_master[code]["category"] = shop.get("category", "KSBC")
        
        # Clean up legacy UI keys if they exist
        shops_master[code].pop("code", None)
        shops_master[code].pop("name", None)
        count += 1

with open(shops_path, "w", encoding="utf-8") as f:
    json.dump(shops_master, f, indent=2, ensure_ascii=False)

print("Successfully migrated {} shops into the flat format in shops.json!".format(count))