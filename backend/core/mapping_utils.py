
import json
from functools import lru_cache
import os

# Get the directory of the current file (mapping_utils.py)
CORE_DIR = os.path.dirname(os.path.abspath(__file__))
# Go up one level to the backend directory
BACKEND_DIR = os.path.dirname(CORE_DIR)
MAPPING_FILE_PATH = os.path.join(BACKEND_DIR, "mapping.json")

@lru_cache(maxsize=1)
def get_mapping_data():
    """Loads and caches the mapping.json data using an absolute path."""
    try:
        with open(MAPPING_FILE_PATH, "r") as f:
            print(f"DEBUG: Attempting to load mapping from: {MAPPING_FILE_PATH}")
            data = json.load(f)
            print("DEBUG: Successfully loaded mapping.json")
            return data
    except FileNotFoundError:
        print(f"DEBUG: ERROR - mapping.json not found at {MAPPING_FILE_PATH}")
        return {"bonds": {}}
    except json.JSONDecodeError as e:
        print(f"DEBUG: ERROR - Failed to decode JSON from {MAPPING_FILE_PATH}: {e}")
        return {"bonds": {}}

def get_shop_to_parent_maps():
    """
    Parses the mapping data to create shop-to-bond and shop-to-warehouse lookups.
    """
    mapping_data = get_mapping_data()
    shop_to_bond = {}
    shop_to_warehouse = {}

    for bond_name, bond_data in mapping_data.get("bonds", {}).items():
        for wh_name, wh_data in bond_data.get("warehouses", {}).items():
            for shop_code in wh_data.get("shops", {}):
                shop_to_bond[str(shop_code)] = bond_name
                shop_to_warehouse[str(shop_code)] = wh_name
    
    return shop_to_bond, shop_to_warehouse

def get_filters_from_mapping():
    """
    Generates filter options (shops, warehouses, bonds, mapping) directly
    from the mapping.json file.
    """
    mapping_data = get_mapping_data()
    
    all_shops = []
    all_warehouses = set()
    bonds_data = mapping_data.get("bonds", {})
    all_bonds = list(bonds_data.keys())
    
    warehouse_to_shops_map = {}
    bond_to_warehouses_map = {}

    for bond_name, bond_data in bonds_data.items():
        warehouses_in_bond = list(bond_data.get("warehouses", {}).keys())
        bond_to_warehouses_map[bond_name] = warehouses_in_bond

        for wh_name, wh_data in bond_data.get("warehouses", {}).items():
            all_warehouses.add(wh_name)
            
            shop_codes_in_wh = list(wh_data.get("shops", {}).keys())
            warehouse_to_shops_map[wh_name] = shop_codes_in_wh
            
            for shop_code, shop_data in wh_data.get("shops", {}).items():
                all_shops.append({
                    "shop_code": str(shop_code),
                    "shop_name": shop_data.get("shop_name", "Unknown")
                })
    
    unique_shops = {s["shop_code"]: s for s in all_shops}
    
    return {
        "shops": list(unique_shops.values()),
        "warehouses": sorted(list(all_warehouses)),
        "bonds": sorted(all_bonds),
        "mapping": warehouse_to_shops_map,
        "bond_mapping": bond_to_warehouses_map
    }
