import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, Checkbox, message } from "antd";
import { getJson, replaceJson, updateJsonKey, deleteJsonKey } from "../api";

const { Option } = Select;

// Options for selecting which entity to manage
const JSON_OPTIONS = [
  { label: "Bonds", value: "bonds" },
  { label: "Shops", value: "shops" },
  { label: "Warehouses", value: "warehouses" },
  { label: "Bond Mapping", value: "bond_mapping" },
  { label: "Warehouse Mapping", value: "warehouse_mapping" },
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
      { name: "bond", label: "Bond", component: Input, required: true },
      { name: "staffs", label: "Staffs", component: Input },
      { name: "shops", label: "Shops", component: Input },
    ],
  },
  warehouse_mapping: {
    label: "Warehouse Mapping",
    fields: [
      { name: "warehouse", label: "Warehouse", component: Input, required: true },
      { name: "code", label: "Warehouse Code", component: Input },
      { name: "shops", label: "Shops", component: Input },
    ],
  },
};

export default function JsonCrud() {
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState({});
  const [auxData, setAuxData] = useState({ bonds: [], shops: [] }); // for dropdowns
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [form] = Form.useForm();

  const loadData = async (name) => {
    try {
      const resp = await getJson(name);
      const raw = resp.data || {};
      // Transform raw data into flat records matching ENTITY_CONFIG fields
      const transformed = {};
      const config = ENTITY_CONFIG[name];
      // Prepare shop lookup for mapping entities
      let shopLookup = {};
      if (name === "bond_mapping" || name === "warehouse_mapping") {
        const shopsResp = await getJson("shops");
        Object.entries(shopsResp.data || {}).forEach(([k, v]) => {
          shopLookup[k] = v.shop_name || "";
        });
      }
      if (config) {
        Object.entries(raw).forEach(([k, v]) => {
          const record = {};
          config.fields.forEach(f => {
            if (f.name === "code" || f.name === "bond_id" || f.name === "warehouse_code" || f.name === "bond") {
              // identifier fields use the key (including bond name for bond_mapping)
              record[f.name] = k;
            } else if (f.name === "name") {
              if (name === "shops") {
                record[f.name] = v.shop_name || "";
              } else if (name === "warehouses") {
                record[f.name] = v.warehouse_code || "";
              } else {
                record[f.name] = v.name || "";
              }
            } else if (f.name === "address") {
              record[f.name] = v.address || "";
            } else if (f.name === "shops") {
              // Store raw IDs for editing and display names for table
              if (Array.isArray(v.shops)) {
                record["_shopsIds"] = v.shops;
                record[f.name] = v.shops.map(id => shopLookup[id] || id);
              } else {
                record["_shopsIds"] = [];
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

  // Load main data when selection changes
  useEffect(() => {
    if (selected) loadData(selected);
  }, [selected]);

  // Load auxiliary data (bonds and shops) for dropdowns when needed
  useEffect(() => {
    const fetchAux = async () => {
      if (selected === "bond_mapping" || selected === "warehouse_mapping") {
        const [bondsResp, shopsResp] = await Promise.all([
          getJson("bonds"),
          getJson("shops"),
        ]);
        const bondOptions = Object.keys(bondsResp.data || {});
        const shopOptions = Object.entries(shopsResp.data || {}).map(([k, v]) => ({
          key: k,
          label: v.shop_name || k,
        }));
        setAuxData({ bonds: bondOptions, shops: shopOptions });
      }
    };
    fetchAux();
  }, [selected]);

  const handleAdd = () => {
    setEditingKey(null);
    form.resetFields();
    setModalVisible(true);
  };

      const handleEdit = (record) => {
    setEditingKey(record.key);
    // Populate form with the existing values for the selected entity
    const config = ENTITY_CONFIG[selected];
    if (config) {
      const values = {};
      config.fields.forEach(f => {
        if ((selected === "bond_mapping" || selected === "warehouse_mapping") && f.name === "shops") {
          // use stored raw IDs for checkbox group
          values[f.name] = record["_shopsIds"] || [];
        } else {
          const val = record[f.name];
          values[f.name] = Array.isArray(val) ? JSON.stringify(val, null, 2) : val;
        }
      });
      form.setFieldsValue(values);
    }
    setModalVisible(true);
  };

  const handleDelete = async (key) => {
    try {
      await deleteJsonKey(selected, key);
      message.success("Deleted");
      loadData(selected);
    } catch (e) {
      message.error("Delete failed");
    }
  };

  const onFinish = async (values) => {
    // Build the payload object from the form values
    const payload = { ...values };
    // Determine the key for the entry – use the first required field as identifier
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
      setModalVisible(false);
      loadData(selected);
    } catch (e) {
      message.error("Save failed");
    }
  };

  // Dynamically build columns based on selected entity configuration
  const columns = selected
    ? [
        ...ENTITY_CONFIG[selected].fields.map(f => ({
          title: f.label,
          dataIndex: f.name,
          key: f.name,
          // Render handles both flat and nested value structures
          render: (_, record) => {
            // Direct field on record (for add/edit) or nested under record.value
            return record[f.name] ?? (record.value && record.value[f.name]) ?? (record.value && record.value.shop_name && f.name === 'name' ? record.value.shop_name : null);
          },
        })),
        {
          title: "Actions",
          key: "actions",
          render: (_, record) => (
            <>
              <Button size="small" onClick={() => handleEdit(record)} style={{ marginRight: 8 }}>Edit</Button>
              <Button size="small" danger onClick={() => handleDelete(record.key)}>Delete</Button>
            </>
          ),
        },
      ]
    : [];

  const tableData = Object.entries(data).map(([k, v]) => ({ key: k, ...v }));

  return (
    <div>
      <h2>JSON CRUD Management</h2>
      <Select
        style={{ width: 300, marginBottom: 16 }}
        placeholder="Select JSON file"
        onChange={setSelected}
        value={selected}
      >
        {JSON_OPTIONS.map(opt => (
          <Option key={opt.value} value={opt.value}>{opt.label}</Option>
        ))}
      </Select>
      {selected && (
        <>
          <Button type="primary" onClick={handleAdd} style={{ marginBottom: 16 }}>Add Entry</Button>
          <Table columns={columns} dataSource={tableData} rowKey="key" pagination={false} />
        </>
      )}
      <Modal
        title={editingKey ? "Edit Entry" : "Add Entry"}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {selected && ENTITY_CONFIG[selected].fields.map(f => (
            <Form.Item
              key={f.name}
              name={f.name}
              label={f.label}
              rules={f.required ? [{ required: true, message: `${f.label} required` }] : []}
            >
              {(() => {
                if (selected === "bond_mapping" && f.name === "bond") {
                  return (
                    <Select>
                      {auxData.bonds.map(b => (
                        <Option key={b} value={b}>{b}</Option>
                      ))}
                    </Select>
                  );
                }
                if ((selected === "bond_mapping" || selected === "warehouse_mapping") && f.name === "shops") {
                  const options = auxData.shops.map(s => ({ label: s.label, value: s.key }));
                  return (
                    <Checkbox.Group options={options} />
                  );
                }
                return <f.component />;
              })()}
            </Form.Item>
          ))}
          <Form.Item>
            <Button type="primary" htmlType="submit">Save</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
