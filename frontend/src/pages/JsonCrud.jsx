import React, { useEffect, useState } from "react";
import { Table, Button, Form, Input, Select, Checkbox, message, Row, Col, Card, Space, Tabs, Radio, Typography, Badge } from "antd";
import { getJson, replaceJson, updateJsonKey, deleteJsonKey } from "../api";

const { Title, Text } = Typography;
const { Option } = Select;

// Options for selecting which entity to manage
const JSON_OPTIONS = [
  { label: "Shops", value: "shops" },
  { label: "Bonds", value: "bonds" },
  { label: "Warehouses", value: "warehouses" },
  { label: "Bond Mapping", value: "bond_mapping" },
  { label: "Bond Clusters", value: "clusters" },
  { label: "Warehouse Clusters", value: "warehouse_clusters" },
];

// Configuration for each entity – defines the fields shown in the table and the form
const ENTITY_CONFIG = {
  bonds: {
    label: "Bonds",
    fields: [
      { name: "bond_id", label: "Bond ID", component: Input, required: true },
      { name: "description", label: "Description", component: Input },
    ],
  },
  shops: {
    label: "Shops",
    fields: [
      { name: "code", label: "Shop Code", component: Input, required: true },
      { name: "name", label: "Shop Name", component: Input, required: true },
      { name: "bond", label: "Bond", component: Select },
      { name: "category", label: "Category", component: Input },
      { name: "warehouse", label: "Warehouse", component: Select },
      { name: "address", label: "Address", component: Input },
    ],
  },
  warehouses: {
    label: "Warehouses",
    fields: [
      { name: "code", label: "Warehouse Code", component: Input, required: true },
      { name: "name", label: "Warehouse Name", component: Input, required: true },
    ],
  },
  bond_mapping: {
    label: "Bond Mapping",
    fields: [
      { name: "bond", label: "Bond", component: Select, required: true },
      { name: "staffs", label: "Staffs", component: Input },
      { name: "shops", label: "Shops", component: Select },
    ],
  },
  clusters: {
    label: "Bond Clusters",
    fields: [
      { name: "cluster", label: "Cluster Name", component: Input, required: true },
      { name: "bonds", label: "Bonds", component: Select },
    ],
  },
  warehouse_clusters: {
    label: "Warehouse Clusters",
    fields: [
      { name: "cluster", label: "Cluster Name", component: Input, required: true },
      { name: "warehouses", label: "Warehouses", component: Select },
    ],
  },
};

export default function JsonCrud() {
  const [selected, setSelected] = useState("shops");
  const [data, setData] = useState({});
  const [rawJson, setRawJson] = useState({});
  const [rawJsonText, setRawJsonText] = useState("");
  const [auxData, setAuxData] = useState({ bonds: [], shops: [], warehouses: [] }); // for dropdowns
  const [shopToBond, setShopToBond] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [activeMode, setActiveMode] = useState("visual"); // "visual" or "raw"
  const [form] = Form.useForm();

  // Load auxiliary data (bonds, shops, warehouses, bond_mapping)
  const init = async () => {
    try {
      const [bondsResp, shopsResp, warehousesResp, bondMappingResp] = await Promise.all([
        getJson("bonds"),
        getJson("shops"),
        getJson("warehouses"),
        getJson("bond_mapping"),
      ]);
      const bondOptions = Object.keys(bondsResp.data || {});
      const shopOptions = Object.entries(shopsResp.data || {}).map(([k, v]) => ({
        key: k,
        label: v.shop_name || k,
      }));
      const warehouseOptions = Object.keys(warehousesResp.data || {});
      setAuxData({ bonds: bondOptions, shops: shopOptions, warehouses: warehouseOptions });

      const shopLookup = {};
      shopOptions.forEach(s => {
        shopLookup[s.key] = s.label;
      });

      const shopToBondMap = {};
      Object.entries(bondMappingResp.data || {}).forEach(([bondName, bondData]) => {
        const shopsList = bondData.shops || [];
        shopsList.forEach(shopId => {
          const code = typeof shopId === "object" ? shopId?.shop_code : shopId;
          if (code) {
            shopToBondMap[String(code)] = bondName;
          }
        });
      });
      setShopToBond(shopToBondMap);

      return { shopLookup, shopToBondMap };
    } catch (e) {
      console.error("Failed to load auxiliary data", e);
      return { shopLookup: {}, shopToBondMap: {} };
    }
  };

  const loadData = async (name, customLookup = null) => {
    try {
      const resp = await getJson(name);
      const raw = resp.data || {};
      setRawJson(raw);
      setRawJsonText(JSON.stringify(raw, null, 2));

      let shopLookup = customLookup?.shopLookup;
      let shopToBondMap = customLookup?.shopToBondMap || shopToBond;
      if (!shopLookup) {
        shopLookup = {};
        auxData.shops.forEach(s => {
          shopLookup[s.key] = s.label;
        });
      }

      const transformed = {};
      const config = ENTITY_CONFIG[name];
      if (config) {
        Object.entries(raw).forEach(([k, v]) => {
          const record = {};
          config.fields.forEach(f => {
            if (f.name === "bond" && name === "shops") {
              record[f.name] = shopToBondMap[k] || "";
            } else if (f.name === "code" || f.name === "bond_id" || f.name === "warehouse_code" || f.name === "bond" || f.name === "cluster") {
              record[f.name] = k;
            } else if (f.name === "name") {
              if (name === "shops") {
                record[f.name] = v.name || v.shop_name || "";
              } else if (name === "warehouses") {
                record[f.name] = v.warehouse_code || "";
              } else {
                record[f.name] = v.name || "";
              }
            } else if (f.name === "address") {
              record[f.name] = v.address || "";
            } else if (f.name === "shops") {
              if (Array.isArray(v.shops)) {
                record["_shopsIds"] = v.shops;
                record[f.name] = v.shops.map(id => shopLookup[id] || id);
              } else {
                record["_shopsIds"] = [];
                record[f.name] = [];
              }
            } else if (f.name === "bonds" || f.name === "warehouses") {
              if (Array.isArray(v)) {
                record["_" + f.name + "Ids"] = v;
                record[f.name] = v;
              } else {
                record["_" + f.name + "Ids"] = [];
                record[f.name] = [];
              }
            } else if (f.name === "staffs") {
              record[f.name] = v.staffs || "";
            } else {
              record[f.name] = v[f.name] || "";
            }
          });
          transformed[k] = record;
        });
      }
      setData(transformed);
    } catch (e) {
      message.error("Failed to load JSON");
    }
  };

  useEffect(() => {
    const run = async () => {
      if (selected) {
        const lookup = await init();
        await loadData(selected, lookup);
        setEditingKey(null);
        form.resetFields();
      }
    };
    run();
  }, [selected]);

  const handleAdd = () => {
    setEditingKey(null);
    form.resetFields();
  };

  const handleEdit = (record) => {
    setEditingKey(record.key);
    const config = ENTITY_CONFIG[selected];
    if (config) {
      const values = {};
      config.fields.forEach(f => {
        if (selected === "bond_mapping" && f.name === "shops") {
          values[f.name] = record["_shopsIds"] || [];
        } else if (selected === "clusters" && f.name === "bonds") {
          values[f.name] = record["_bondsIds"] || [];
        } else if (selected === "warehouse_clusters" && f.name === "warehouses") {
          values[f.name] = record["_warehousesIds"] || [];
        } else {
          const val = record[f.name];
          values[f.name] = Array.isArray(val) ? JSON.stringify(val, null, 2) : val;
        }
      });
      form.setFieldsValue(values);
    }
  };

  const handleDelete = async (key) => {
    try {
      await deleteJsonKey(selected, key);
      message.success("Deleted");
      
      // Also delete from bond_mapping and shopcode_mapping if selected === "shops"
      if (selected === "shops") {
        // Update bond_mapping.json
        const bondMappingResp = await getJson("bond_mapping");
        const bondMapping = bondMappingResp.data || {};
        let bondChanged = false;
        Object.keys(bondMapping).forEach(bName => {
          const list = bondMapping[bName].shops || [];
          const index = list.indexOf(key);
          if (index > -1) {
            list.splice(index, 1);
            bondChanged = true;
          }
        });
        if (bondChanged) {
          await replaceJson("bond_mapping", bondMapping);
        }

        // Update shopcode_mapping.json
        const shopcodeMappingResp = await getJson("shopcode_mapping");
        const shopcodeMapping = shopcodeMappingResp.data || {};
        let scChanged = false;
        Object.keys(shopcodeMapping).forEach(bName => {
          const list = shopcodeMapping[bName] || [];
          const initialLen = list.length;
          shopcodeMapping[bName] = list.filter(s => String(s.shop_code) !== String(key));
          if (shopcodeMapping[bName].length !== initialLen) {
            scChanged = true;
          }
        });
        if (scChanged) {
          await replaceJson("shopcode_mapping", shopcodeMapping);
        }
      }

      if (editingKey === key) {
        handleAdd();
      }
      const lookup = await init();
      loadData(selected, lookup);
    } catch (e) {
      message.error("Delete failed");
    }
  };

  const onFinish = async (values) => {
    let payload = { ...values };
    let selectedBond = null;

    if (selected === "shops") {
      selectedBond = payload.bond;
      payload.shop_code = payload.code;
      payload.shop_name = payload.name;
      delete payload.code;
      delete payload.name;
      delete payload.bond; // Shops payload on server does not accept 'bond' field
    }

    if (selected === "clusters") {
      payload = values.bonds || [];
    } else if (selected === "warehouse_clusters") {
      payload = values.warehouses || [];
    }

    const config = ENTITY_CONFIG[selected];
    const keyField = config?.fields.find(f => f.required)?.name || "key";
    const entryKey = values[keyField];
    try {
      if (editingKey) {
        await updateJsonKey(selected, editingKey, payload);
        message.success("Updated");
      } else {
        await updateJsonKey(selected, entryKey, payload);
        message.success("Added");
      }

      // Update Mappings
      if (selected === "shops") {
        const shopCode = entryKey;
        const shopName = values.name;
        const category = values.category || "KSBC";

        // Update bond_mapping.json
        const bondMappingResp = await getJson("bond_mapping");
        const bondMapping = bondMappingResp.data || {};
        let bondChanged = false;

        // Remove from all existing bonds in bond_mapping
        Object.keys(bondMapping).forEach(bName => {
          const list = bondMapping[bName].shops || [];
          const index = list.indexOf(shopCode);
          if (index > -1) {
            list.splice(index, 1);
            bondChanged = true;
          }
        });

        // Add to selected bond
        if (selectedBond) {
          if (!bondMapping[selectedBond]) {
            bondMapping[selectedBond] = { staffs: "", shops: [] };
          }
          const list = bondMapping[selectedBond].shops || [];
          if (!list.includes(shopCode)) {
            list.push(shopCode);
            bondChanged = true;
          }
        }

        if (bondChanged) {
          await replaceJson("bond_mapping", bondMapping);
        }

        // Update shopcode_mapping.json
        const shopcodeMappingResp = await getJson("shopcode_mapping");
        const shopcodeMapping = shopcodeMappingResp.data || {};
        let scChanged = false;

        // Remove from all existing bonds in shopcode_mapping
        Object.keys(shopcodeMapping).forEach(bName => {
          const list = shopcodeMapping[bName] || [];
          const initialLen = list.length;
          shopcodeMapping[bName] = list.filter(s => String(s.shop_code) !== String(shopCode));
          if (shopcodeMapping[bName].length !== initialLen) {
            scChanged = true;
          }
        });

        // Add to selected bond
        if (selectedBond) {
          if (!shopcodeMapping[selectedBond]) {
            shopcodeMapping[selectedBond] = [];
          }
          shopcodeMapping[selectedBond].push({
            shop_code: shopCode,
            shop_name: shopName,
            category: category
          });
          scChanged = true;
        }

        if (scChanged) {
          await replaceJson("shopcode_mapping", shopcodeMapping);
        }
      }

      // Update shopcode_mapping.json when updating bond_mapping directly
      if (selected === "bond_mapping") {
        const bondName = entryKey;
        const newShopCodes = values.shops || [];

        const shopsResp = await getJson("shops");
        const shopsMaster = shopsResp.data || {};

        const shopcodeMappingResp = await getJson("shopcode_mapping");
        const shopcodeMapping = shopcodeMappingResp.data || {};

        // Remove these shop codes from all other bonds in shopcode_mapping
        Object.keys(shopcodeMapping).forEach(bName => {
          if (bName !== bondName) {
            const list = shopcodeMapping[bName] || [];
            shopcodeMapping[bName] = list.filter(s => !newShopCodes.includes(String(s.shop_code)));
          }
        });

        // Build the new shop list for the current bond
        const newShopObjects = newShopCodes.map(code => {
          const shopInfo = shopsMaster[code] || {};
          return {
            shop_code: code,
            shop_name: shopInfo.name || shopInfo.shop_name || code,
            category: shopInfo.category || "KSBC"
          };
        });

        shopcodeMapping[bondName] = newShopObjects;
        await replaceJson("shopcode_mapping", shopcodeMapping);
      }

      const lookup = await init();
      await loadData(selected, lookup);
      setEditingKey(entryKey);
    } catch (e) {
      message.error("Save failed");
    }
  };

  const handleSaveRaw = async () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      await replaceJson(selected, parsed);
      message.success("Raw JSON updated successfully!");
      const lookup = await init();
      await loadData(selected, lookup);
    } catch (e) {
      message.error("Invalid JSON: " + e.message);
    }
  };

  const columns = selected
    ? [
        ...ENTITY_CONFIG[selected].fields.map(f => ({
          title: f.label,
          dataIndex: f.name,
          key: f.name,
          ellipsis: true,
          render: (_, record) => {
            const val = record[f.name] ?? (record.value && record.value[f.name]) ?? (record.value && record.value.shop_name && f.name === 'name' ? record.value.shop_name : null);
            if (Array.isArray(val)) {
              return val.join(", ");
            }
            return val;
          },
        })),
        {
          title: "Actions",
          key: "actions",
          width: 80,
          render: (_, record) => (
            <Button
              size="small"
              danger
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(record.key);
              }}
            >
              Delete
            </Button>
          ),
        },
      ]
    : [];

  const tableData = Object.entries(data).map(([k, v]) => ({ key: k, ...v }));
  
  // Real-time local search filter
  const filteredData = tableData.filter(record => {
    if (!searchText) return true;
    const term = searchText.toLowerCase();
    return Object.entries(record).some(([k, v]) => {
      if (k.startsWith("_")) return false;
      if (Array.isArray(v)) {
        return v.some(val => String(val).toLowerCase().includes(term));
      }
      return String(v).toLowerCase().includes(term);
    });
  });

  return (
    <div style={{ padding: "10px 20px" }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>JSON Data Settings</Title>
          <Text type="secondary">Manage mapping mappings, clusters, shops, bonds, and warehouses</Text>
        </Col>
        <Col>
          <Radio.Group value={activeMode} onChange={(e) => setActiveMode(e.target.value)} buttonStyle="solid">
            <Radio.Button value="visual">🎨 Visual Editor</Radio.Button>
            <Radio.Button value="raw">📝 Raw JSON Editor</Radio.Button>
          </Radio.Group>
        </Col>
      </Row>

      <Tabs
        activeKey={selected}
        onChange={setSelected}
        items={JSON_OPTIONS.map(opt => ({
          key: opt.value,
          label: (
            <span>
              {opt.label}{" "}
              {selected === opt.value && (
                <Badge count={tableData.length} style={{ backgroundColor: "#1890ff" }} />
              )}
            </span>
          ),
        }))}
      />

      {activeMode === "visual" ? (
        <Row gutter={24}>
          {/* Left Column: Search & Table */}
          <Col span={14}>
            <Card bordered={false} style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: 16 }}>
                <Input
                  placeholder="🔍 Search entries..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  style={{ flex: 1 }}
                />
                <Button type="primary" onClick={handleAdd}>
                  ➕ Add New Entry
                </Button>
              </div>

              <style>{`
                .selected-row td {
                  background-color: #e6f7ff !important;
                  font-weight: 500;
                  border-left: 3px solid #1890ff;
                }
              `}</style>

              <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="key"
                pagination={{ pageSize: 12, showSizeChanger: true }}
                onRow={(record) => ({
                  onClick: () => handleEdit(record),
                  style: { cursor: "pointer" },
                })}
                rowClassName={(record) => (record.key === editingKey ? "selected-row" : "")}
                style={{
                  border: "1px solid #f0f0f0",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              />
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  Showing {filteredData.length} of {tableData.length} entries. Click any row to view details or edit.
                </Text>
              </div>
            </Card>
          </Col>

          {/* Right Column: Editor Panel */}
          <Col span={10}>
            <Card
              title={editingKey ? `✏️ Edit Entry: ${editingKey}` : "➕ Create New Entry"}
              bordered={false}
              style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
              extra={
                editingKey && (
                  <Button type="link" danger onClick={() => handleDelete(editingKey)}>
                    Delete Record
                  </Button>
                )
              }
            >
              <Form form={form} layout="vertical" onFinish={onFinish}>
                {ENTITY_CONFIG[selected].fields.map(f => (
                  <Form.Item
                    key={f.name}
                    name={f.name}
                    label={f.label}
                    rules={f.required ? [{ required: true, message: `${f.label} is required` }] : []}
                  >
                    {(() => {
                      if (selected === "shops" && f.name === "bond") {
                        return (
                          <Select showSearch allowClear placeholder="Select a bond">
                            {auxData.bonds.map(b => (
                              <Option key={b} value={b}>{b}</Option>
                            ))}
                          </Select>
                        );
                      }
                      if (selected === "bond_mapping" && f.name === "bond") {
                        return (
                          <Select showSearch placeholder="Select a bond">
                            {auxData.bonds.map(b => (
                              <Option key={b} value={b}>{b}</Option>
                            ))}
                          </Select>
                        );
                      }
                      if (selected === "shops" && f.name === "warehouse") {
                        return (
                          <Select showSearch allowClear placeholder="Select a warehouse">
                            {auxData.warehouses.map(w => (
                              <Option key={w} value={w}>{w}</Option>
                            ))}
                          </Select>
                        );
                      }
                      if (selected === "bond_mapping" && f.name === "shops") {
                        const options = auxData.shops.map(s => ({ label: s.label, value: s.key }));
                        return (
                          <Select
                            mode="multiple"
                            allowClear
                            placeholder="Select shops..."
                            optionFilterProp="label"
                            options={options}
                            showSearch
                          />
                        );
                      }
                      if (selected === "clusters" && f.name === "bonds") {
                        const options = auxData.bonds.map(b => ({ label: b, value: b }));
                        return (
                          <Select
                            mode="multiple"
                            allowClear
                            placeholder="Select bonds..."
                            optionFilterProp="label"
                            options={options}
                            showSearch
                          />
                        );
                      }
                      if (selected === "warehouse_clusters" && f.name === "warehouses") {
                        const options = auxData.warehouses.map(w => ({ label: w, value: w }));
                        return (
                          <Select
                            mode="multiple"
                            allowClear
                            placeholder="Select warehouses..."
                            optionFilterProp="label"
                            options={options}
                            showSearch
                          />
                        );
                      }
                      // Default input field
                      return <f.component placeholder={`Enter ${f.label.toLowerCase()}`} />;
                    })()}
                  </Form.Item>
                ))}
                
                <Form.Item style={{ marginBottom: 0 }}>
                  <Space>
                    <Button type="primary" htmlType="submit">
                      💾 Save Record
                    </Button>
                    <Button onClick={handleAdd}>
                      Clear / New
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            </Card>
          </Col>
        </Row>
      ) : (
        <Card bordered={false} style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">Edit the raw JSON data directly. Please make sure the JSON syntax is valid before saving.</Text>
          </div>
          <Input.TextArea
            value={rawJsonText}
            onChange={(e) => setRawJsonText(e.target.value)}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "13px",
              minHeight: "450px",
              marginBottom: 16,
              borderRadius: "8px",
            }}
          />
          <Space>
            <Button type="primary" onClick={handleSaveRaw}>
              💾 Save Raw JSON
            </Button>
            <Button onClick={() => setRawJsonText(JSON.stringify(rawJson, null, 2))}>
              Reset Changes
            </Button>
          </Space>
        </Card>
      )}
    </div>
  );
}
