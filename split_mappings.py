import json
import os

def split_mapping(input_path, output_bond_path, output_wh_path, output_shopcode_path=None,
                  output_shops_path=None, output_warehouses_path=None, output_bonds_path=None):
    with open(input_path, 'r') as f:
        data = json.load(f)

    shop_master = {}
    warehouse_master = {}
    bond_master = {}
    warehouse_map = {}
    bond_map = {}
    shopcode_data = {}

    if "bonds" in data:
        for bond_name, bond_data in data["bonds"].items():
            bond_master[bond_name] = {
                "staffs": bond_data.get("staffs")
            }
            bond_shop_codes = []

            for wh_name, wh_data in bond_data.get("warehouses", {}).items():
                if wh_data.get("warehouse_code") is not None:
                    warehouse_master.setdefault(wh_name, {})["warehouse_code"] = wh_data.get("warehouse_code")
                else:
                    warehouse_master.setdefault(wh_name, {})

                wh_shop_codes = []
                for shop_code, shop_data in wh_data.get("shops", {}).items():
                    shop_code = str(shop_code)
                    shop_master.setdefault(shop_code, {
                        "shop_name": shop_data.get("shop_name")
                    })
                    if shop_code not in bond_shop_codes:
                        bond_shop_codes.append(shop_code)
                    if shop_code not in wh_shop_codes:
                        wh_shop_codes.append(shop_code)

                current_codes = warehouse_map.setdefault(wh_name, [])
                for code in wh_shop_codes:
                    if code not in current_codes:
                        current_codes.append(code)

            bond_map[bond_name] = {
                "staffs": bond_data.get("staffs"),
                "shops": bond_shop_codes
            }
            shopcode_data[bond_name] = [
                {"shop_code": code, "shop_name": shop_master[code].get("shop_name")}
                for code in bond_shop_codes
            ]
    else:
        for wh_name, wh_data in data.items():
            if wh_name == "bonds":
                continue
            warehouse_map[wh_name] = [str(code) for code in wh_data.get("shops", {}).keys()]
            warehouse_master.setdefault(wh_name, {})

    if output_bonds_path is not None:
        with open(output_bonds_path, 'w') as f:
            json.dump(bond_master, f, indent=2)

    if output_shops_path is not None:
        with open(output_shops_path, 'w') as f:
            json.dump(shop_master, f, indent=2)

    if output_warehouses_path is not None:
        with open(output_warehouses_path, 'w') as f:
            json.dump(warehouse_master, f, indent=2)

    if bond_map:
        with open(output_bond_path, 'w') as f:
            json.dump(bond_map, f, indent=2)

    if output_shopcode_path is not None:
        with open(output_shopcode_path, 'w') as f:
            json.dump(shopcode_data, f, indent=2)

    with open(output_wh_path, 'w') as f:
        json.dump(warehouse_map, f, indent=2)

# Backend
print("Splitting backend mapping...")
split_mapping(
    'backend/mapping.json',
    'backend/bond_mapping.json',
    'backend/warehouse_mapping.json',
    'backend/shopcode_mapping.json',
    output_shops_path='backend/shops.json',
    output_warehouses_path='backend/warehouses.json',
    output_bonds_path='backend/bonds.json'
)

# Frontend
print("Splitting frontend mapping...")
# Note: frontend/src/data/mapping.json might have a different structure (flat wh -> shops)
# Let's check it first or just use the same logic
split_mapping(
    'frontend/src/data/mapping.json',
    'frontend/src/data/bond_mapping.json',
    'frontend/src/data/warehouse_mapping.json',
    'frontend/src/data/shopcode_mapping.json',
    output_shops_path='frontend/src/data/shops.json',
    output_warehouses_path='frontend/src/data/warehouses.json',
    output_bonds_path='frontend/src/data/bonds.json'
)
