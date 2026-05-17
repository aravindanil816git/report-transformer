import json
from functools import lru_cache
import os

# Get the directory of the current file (mapping_utils.py)
CORE_DIR = os.path.dirname(os.path.abspath(__file__))
# Go up one level to the backend directory
BACKEND_DIR = os.path.dirname(CORE_DIR)
MAPPING_FILE_PATH = os.path.join(BACKEND_DIR, "mapping.json")
WAREHOUSE_MAPPING_PATH = os.path.join(BACKEND_DIR, "warehouse_mapping.json")
BOND_MAPPING_PATH = os.path.join(BACKEND_DIR, "bond_mapping.json")
SHOPCODE_MAPPING_PATH = os.path.join(BACKEND_DIR, "shopcode_mapping.json")
SHOPS_MASTER_PATH = os.path.join(BACKEND_DIR, "shops.json")
WAREHOUSES_MASTER_PATH = os.path.join(BACKEND_DIR, "warehouses.json")
BONDS_MASTER_PATH = os.path.join(BACKEND_DIR, "bonds.json")


def _load_json(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"DEBUG: JSON file not found at {path}")
        return {}
    except json.JSONDecodeError as e:
        print(f"DEBUG: Invalid JSON at {path}: {e}")
        return {}


@lru_cache(maxsize=1)
def get_mapping_data():
    """Loads and caches the raw backend mapping.json data using an absolute path."""
    data = _load_json(MAPPING_FILE_PATH)
    if data:
        print(f"DEBUG: Successfully loaded mapping.json from {MAPPING_FILE_PATH}")
        return data
    return {"bonds": {}}


@lru_cache(maxsize=1)
def get_shop_master_data():
    """Loads the central shop master data."""
    data = _load_json(SHOPS_MASTER_PATH)
    if data:
        return data

    raw = get_mapping_data()
    shop_master = {}
    for bond_data in raw.get("bonds", {}).values():
        for wh_data in bond_data.get("warehouses", {}).values():
            for shop_code, shop_data in wh_data.get("shops", {}).items():
                shop_master[str(shop_code)] = {
                    "shop_name": shop_data.get("shop_name")
                }
    return shop_master


@lru_cache(maxsize=1)
def get_warehouse_master_data():
    """Loads the central warehouse master data."""
    data = _load_json(WAREHOUSES_MASTER_PATH)
    if data:
        return data

    raw = get_mapping_data()
    warehouse_master = {}
    for bond_data in raw.get("bonds", {}).values():
        for wh_name, wh_data in bond_data.get("warehouses", {}).items():
            warehouse_master.setdefault(wh_name, {})["warehouse_code"] = wh_data.get("warehouse_code")
    return warehouse_master


@lru_cache(maxsize=1)
def get_bond_master_data():
    """Loads the central bond master data."""
    data = _load_json(BONDS_MASTER_PATH)
    if data:
        return data

    raw = get_mapping_data()
    bond_master = {}
    for bond_name, bond_data in raw.get("bonds", {}).items():
        bond_master[bond_name] = {
            "staffs": bond_data.get("staffs")
        }
    return bond_master


@lru_cache(maxsize=1)
def get_bond_mapping_data():
    """Loads bond -> shops mapping with compatibility objects."""
    data = _load_json(BOND_MAPPING_PATH)
    shop_master = get_shop_master_data()
    warehouse_master = get_warehouse_master_data()
    warehouse_lookup = {}
    for wh_name, wh_data in get_warehouse_mapping_data().items():
        for code in [shop.get("shop_code") for shop in wh_data.get("shops", [])]:
            warehouse_lookup[code] = wh_name

    if data:
        bond_map = {}
        for bond_name, bond_data in data.items():
            bond_map[bond_name] = {
                "staffs": bond_data.get("staffs"),
                "shops": [
                    {
                        "shop_code": code,
                        "shop_name": shop_master.get(code, {}).get("shop_name"),
                        "warehouse": warehouse_lookup.get(code),
                        "staffs": bond_data.get("staffs")
                    }
                    for code in bond_data.get("shops", [])
                ]
            }
        return bond_map

    raw = get_mapping_data()
    bond_map = {}
    for bond_name, bond_data in raw.get("bonds", {}).items():
        shops = []
        for wh_name, wh_data in bond_data.get("warehouses", {}).items():
            for shop_code, shop_data in wh_data.get("shops", {}).items():
                shops.append({
                    "shop_code": str(shop_code),
                    "shop_name": shop_data.get("shop_name"),
                    "warehouse": wh_name,
                    "staffs": shop_data.get("staffs")
                })
        bond_map[bond_name] = {
            "staffs": bond_data.get("staffs"),
            "shops": shops
        }
    return bond_map


@lru_cache(maxsize=1)
def get_warehouse_mapping_data():
    """Loads warehouse -> shops mapping with compatibility objects."""
    data = _load_json(WAREHOUSE_MAPPING_PATH)
    shop_master = get_shop_master_data()
    warehouse_master = get_warehouse_master_data()
    if data:
        warehouse_map = {}
        for wh_name, shop_codes in data.items():
            warehouse_map[wh_name] = {
                "warehouse_code": warehouse_master.get(wh_name, {}).get("warehouse_code"),
                "shops": [
                    {
                        "shop_code": code,
                        "shop_name": shop_master.get(code, {}).get("shop_name")
                    }
                    for code in shop_codes
                ]
            }
        return warehouse_map

    raw = get_mapping_data()
    warehouse_map = {}
    for bond_data in raw.get("bonds", {}).values():
        for wh_name, wh_data in bond_data.get("warehouses", {}).items():
            shops = []
            for shop_code, shop_data in wh_data.get("shops", {}).items():
                shops.append({
                    "shop_code": str(shop_code),
                    "shop_name": shop_data.get("shop_name"),
                    "staffs": shop_data.get("staffs")
                })
            warehouse_map[wh_name] = {
                "warehouse_code": wh_data.get("warehouse_code"),
                "shops": shops
            }
    return warehouse_map


@lru_cache(maxsize=1)
def get_shopcode_mapping_data():
    """Loads bond -> shop name mapping."""
    data = _load_json(SHOPCODE_MAPPING_PATH)
    if data:
        return data

    bond_mapping = get_bond_mapping_data()
    shop_master = get_shop_master_data()
    shopcode_map = {}
    for bond_name, bond_data in bond_mapping.items():
        shopcode_map[bond_name] = [
            {
                "shop_code": code,
                "shop_name": shop_master.get(code, {}).get("shop_name")
            }
            for code in bond_data.get("shops", [])
        ]
    return shopcode_map


@lru_cache(maxsize=1)
def get_shop_lookup_and_warehouse_to_bond():
    """Builds shop lookup and warehouse-to-bond lookup from simplified mappings."""
    bond_mapping = get_bond_mapping_data()
    warehouse_mapping = get_warehouse_mapping_data()
    shop_master = get_shop_master_data()
    warehouse_master = get_warehouse_master_data()

    shop_to_warehouse = {}
    for wh_name, wh_data in warehouse_mapping.items():
        for code in [shop.get("shop_code") for shop in wh_data.get("shops", [])]:
                shop_to_warehouse[str(code)] = wh_name

        shop_to_bond = {}
        warehouse_to_bond = {}
        
        for bond_name, bond_info in bond_mapping.items():
            for shop in bond_info.get('shops', []):
                if isinstance(shop, dict):
                    shop_code = str(shop.get('shop_code'))
                else:
                    shop_code = str(shop)
                shop_to_bond[shop_code] = bond_name
                
                wh_name = shop_to_warehouse.get(shop_code)
                if wh_name:
                    warehouse_to_bond[wh_name] = bond_name

        shop_lookup = {}
        all_shop_codes = set(shop_to_warehouse.keys()).union(set(shop_to_bond.keys()))
        
        for shop_code in all_shop_codes:
            wh_name = shop_to_warehouse.get(shop_code)
            bond_name = shop_to_bond.get(shop_code)
            staffs = bond_mapping.get(bond_name, {}).get('staffs') if bond_name else None
            
            shop_lookup[shop_code] = {
                "warehouse": wh_name,
                "bond": bond_name,
                "shop_name": shop_master.get(shop_code, {}).get('shop_name'),
                "staffs": staffs,
                "warehouse_code": warehouse_master.get(wh_name, {}).get('warehouse_code') if wh_name else None
            }

    return shop_lookup, warehouse_to_bond


@lru_cache(maxsize=1)
def get_shop_to_parent_maps():
    """
    Parses the mapping data to create shop-to-bond and shop-to-warehouse lookups.
    """
    shop_lookup, _ = get_shop_lookup_and_warehouse_to_bond()
    shop_to_bond = {}
    shop_to_warehouse = {}

    for shop_code, shop_data in shop_lookup.items():
        shop_to_bond[shop_code] = shop_data.get("bond")
        shop_to_warehouse[shop_code] = shop_data.get("warehouse")

    return shop_to_bond, shop_to_warehouse


def get_filters_from_mapping():
    """
    Generates filter options (shops, warehouses, bonds, mapping) directly
    from the simplified mapping files.
    """
    warehouse_mapping = get_warehouse_mapping_data()
    bond_mapping = get_bond_mapping_data()
    shop_master = get_shop_master_data()

    all_shops = []
    all_warehouses = set()
    bond_to_warehouses_map = {}
    warehouse_to_shops_map = {}

    shop_to_warehouse = {}
    for wh_name, shop_codes in warehouse_mapping.items():
        for code in shop_codes:
            shop_to_warehouse[code] = wh_name

    for bond_name, bond_data in bond_mapping.items():
        warehouses = set()
        for shop in bond_data.get("shops", []):
            if isinstance(shop, dict):
                wh = shop.get("warehouse")
            else:
                wh = shop_to_warehouse.get(shop)
            if wh:
                warehouses.add(wh)
        bond_to_warehouses_map[bond_name] = sorted(list(warehouses))

    for wh_name, wh_data in warehouse_mapping.items():
        all_warehouses.add(wh_name)
        shop_codes = [shop.get("shop_code") for shop in wh_data.get("shops", [])]
        warehouse_to_shops_map[wh_name] = shop_codes
        for shop_code in shop_codes:
            all_shops.append({
                "shop_code": shop_code,
                "shop_name": shop_master.get(shop_code, {}).get("shop_name", "Unknown")
            })

    unique_shops = {s["shop_code"]: s for s in all_shops}

    return {
        "shops": list(unique_shops.values()),
        "warehouses": sorted(list(all_warehouses)),
        "bonds": sorted(list(bond_to_warehouses_map.keys())),
        "mapping": warehouse_to_shops_map,
        "bond_mapping": bond_to_warehouses_map
    }
