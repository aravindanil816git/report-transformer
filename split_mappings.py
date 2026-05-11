import json
import os

def split_mapping(input_path, output_bond_path, output_wh_path):
    with open(input_path, 'r') as f:
        data = json.load(f)
    
    bond_to_wh = {}
    wh_to_shops = {}
    
    if "bonds" in data:
        for bond_name, bond_data in data["bonds"].items():
            wh_list = []
            if "warehouses" in bond_data:
                for wh_name, wh_data in bond_data["warehouses"].items():
                    wh_list.append(wh_name)
                    # For warehouse_mapping, we store the full data excluding the shop mapping if we want
                    # but the user said "warehouse -> shops"
                    wh_to_shops[wh_name] = {
                        "warehouse_name": wh_data.get("warehouse_name"),
                        "warehouse_code": wh_data.get("warehouse_code"),
                        "shops": wh_data.get("shops", {})
                    }
            
            bond_to_wh[bond_name] = {
                "staffs": bond_data.get("staffs"),
                "warehouses": wh_list
            }
    else:
        # Handle frontend mapping structure which seems to be flat wh -> shops
        for wh_name, wh_data in data.items():
            if wh_name == "bonds": continue
            wh_to_shops[wh_name] = wh_data

    if bond_to_wh:
        with open(output_bond_path, 'w') as f:
            json.dump(bond_to_wh, f, indent=2)
    
    with open(output_wh_path, 'w') as f:
        json.dump(wh_to_shops, f, indent=2)

# Backend
print("Splitting backend mapping...")
split_mapping('backend/mapping.json', 'backend/bond_mapping.json', 'backend/warehouse_mapping.json')

# Frontend
print("Splitting frontend mapping...")
# Note: frontend/src/data/mapping.json might have a different structure (flat wh -> shops)
# Let's check it first or just use the same logic
split_mapping('frontend/src/data/mapping.json', 'frontend/src/data/bond_mapping.json', 'frontend/src/data/warehouse_mapping.json')
