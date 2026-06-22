import { useEffect, useState, useMemo } from "react";
import { Table, Select, Row, Col, Button, Space } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getWarehouses, getShops, getJson } from "../../api";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportClusterPdf } from "../../utils/exportUtils";
import DownloadDropdown from "../../components/DownloadDropdown";
import dayjs from "dayjs";

export default function CleanupReport() {
  const { id } = useParams();

  const [data, setData] = useState([]);
  const [warehouse, setWarehouse] = useState();
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [config, setConfig] = useState({});

  // ===== LOAD DATA =====
  useEffect(() => {
    getReport(id).then((res) => {
      setData(res.data.data || []);
      setConfig(res.data.config || {});
    });
    
    getWarehouses(id).then(res => {
      setWarehouseOptions((res.data || []).map(wh => ({ value: wh, label: wh })));
    });
  }, [id]);

  // ===== FLATTEN DATA =====
  const flattened = useMemo(() => {
    return data.flatMap((w) =>
      (w.items || []).map((item) => ({
        ...item,
        warehouse_name: w.warehouse,
      }))
    );
  }, [data]);

  // ===== FILTER =====
  const filtered = useMemo(() => {
    if (!warehouse) return flattened;

    return flattened.filter((d) => {
      const dw = (d.warehouse_name || "").toUpperCase();
      const fw = warehouse.toUpperCase();
      return dw.includes(fw) || fw.includes(dw);
    });
  }, [flattened, warehouse]);

  // ===== COLUMNS =====
  const columns = [
    {
      title: "Warehouse",
      dataIndex: "warehouse_name",
      width: 150,
    },
    {
      title: "Item Name",
      dataIndex: "item_name",
      sorter: (a, b) => a.item_name.localeCompare(b.item_name),
    },
    {
      title: "Product Code",
      dataIndex: "product_code",
    },
    {
      title: "WarehousePhysical Stock",
      children: [{ title: "Case", dataIndex: "physical" }],
    },
    {
      title: "Allotted Stock",
      children: [{ title: "Case", dataIndex: "allotted" }],
    },
    {
      title: "Pending Stock",
      children: [{ title: "Case", dataIndex: "pending" }],
    },
    { 
      title: "WH Price", 
      dataIndex: "wh_price",
      render: (v) => v?.toLocaleString(undefined, { minimumFractionDigits: 2 })
    },
    { 
      title: "Landed Cost", 
      dataIndex: "landed_cost",
      render: (v) => v?.toLocaleString(undefined, { minimumFractionDigits: 2 })
    },
  ];

  const reportDate = config.date || config.start_date || new Date().toISOString().split("T")[0];
  const displayReportDate = dayjs(reportDate).format("DD-MM-YYYY");

  // ===== DOWNLOAD =====
  const handleDownload = (format, mode) => {
    if (format === "xlsx") {
      if (mode === "unified") {
        const exportData = flattened.map(item => ({
          Warehouse: item.warehouse_name,
          "Item Name": item.item_name,
          "Product Code": item.product_code,
          "Physical Stock (Case)": item.physical,
          "Allotted Stock (Case)": item.allotted,
          "Pending Stock (Case)": item.pending,
          "WH Price": item.wh_price,
          "Landed Cost": item.landed_cost
        }));

        exportUnifiedWithDropdown({
          data: exportData,
          warehouses: warehouseOptions.map(o => o.value),
          reportTitle: "Warehouse Physical Stock Report (Unified)",
          periodLabel: `Report Period: ${displayReportDate}`,
          filename: "cleanup_report_unified.xlsx",
          sheetName: "Cleanup Report",
          sumCols: ["Physical Stock (Case)", "Allotted Stock (Case)", "Pending Stock (Case)", "WH Price", "Landed Cost"]
        });
      } else {
        const exportData = filtered.map(item => ({
          Warehouse: item.warehouse_name,
          "Item Name": item.item_name,
          "Product Code": item.product_code,
          "Physical Stock (Case)": item.physical,
          "Allotted Stock (Case)": item.allotted,
          "Pending Stock (Case)": item.pending,
          "WH Price": item.wh_price,
          "Landed Cost": item.landed_cost
        }));

        const totalPhysical = filtered.reduce((sum, item) => sum + (Number(item.physical) || 0), 0);
        const totalAllotted = filtered.reduce((sum, item) => sum + (Number(item.allotted) || 0), 0);
        const totalPending = filtered.reduce((sum, item) => sum + (Number(item.pending) || 0), 0);
        const totalWhPrice = filtered.reduce((sum, item) => sum + (Number(item.wh_price) || 0), 0);
        const totalLandedCost = filtered.reduce((sum, item) => sum + (Number(item.landed_cost) || 0), 0);

        exportData.push({
          Warehouse: "Total",
          "Item Name": "",
          "Product Code": "",
          "Physical Stock (Case)": totalPhysical,
          "Allotted Stock (Case)": totalAllotted,
          "Pending Stock (Case)": totalPending,
          "WH Price": totalWhPrice,
          "Landed Cost": totalLandedCost
        });

        const customHeaders = [
          ["Physical Stock Report (Current View)"],
          [`Warehouse: ${warehouse || "All"}, Report Period: ${displayReportDate}`]
        ];

        exportToExcel(
          exportData,
          customHeaders,
          "cleanup_report_current.xlsx",
          "Cleanup Report"
        );
      }
    } else if (format === "pdf") {
      const columns = ["Warehouse", "Item Name", "Product Code", "Physical Stock (Case)", "Allotted Stock (Case)", "Pending Stock (Case)", "WH Price", "Landed Cost"];
      
      if (mode === "current") {
        const exportData = filtered.map(item => ({
          Warehouse: item.warehouse_name,
          "Item Name": item.item_name,
          "Product Code": item.product_code,
          "Physical Stock (Case)": item.physical,
          "Allotted Stock (Case)": item.allotted,
          "Pending Stock (Case)": item.pending,
          "WH Price": item.wh_price,
          "Landed Cost": item.landed_cost
        }));

        const totalPhysical = filtered.reduce((sum, item) => sum + (Number(item.physical) || 0), 0);
        const totalAllotted = filtered.reduce((sum, item) => sum + (Number(item.allotted) || 0), 0);
        const totalPending = filtered.reduce((sum, item) => sum + (Number(item.pending) || 0), 0);
        const totalWhPrice = filtered.reduce((sum, item) => sum + (Number(item.wh_price) || 0), 0);
        const totalLandedCost = filtered.reduce((sum, item) => sum + (Number(item.landed_cost) || 0), 0);

        exportData.push({
          Warehouse: "Total",
          "Item Name": "",
          "Product Code": "",
          "Physical Stock (Case)": totalPhysical,
          "Allotted Stock (Case)": totalAllotted,
          "Pending Stock (Case)": totalPending,
          "WH Price": totalWhPrice,
          "Landed Cost": totalLandedCost
        });

        exportToPdf({
          title: "Warehouse Physical Stock Report",
          periodLabel: `Report Period: ${displayReportDate}`,
          columns,
          data: exportData,
          filename: "cleanup_report_current.pdf",
          metadataWarehouse: warehouse || "All"
        });
      } else if (mode === "unified") {
        const exportData = flattened.map(item => ({
          Warehouse: item.warehouse_name,
          "Item Name": item.item_name,
          "Product Code": item.product_code,
          "Physical Stock (Case)": item.physical,
          "Allotted Stock (Case)": item.allotted,
          "Pending Stock (Case)": item.pending,
          "WH Price": item.wh_price,
          "Landed Cost": item.landed_cost
        }));

        exportToPdf({
          title: "Warehouse Physical Stock Report (Unified)",
          periodLabel: `Report Period: ${displayReportDate}`,
          columns,
          data: exportData,
          groupByField: "Warehouse",
          sumCols: ["Physical Stock (Case)", "Allotted Stock (Case)", "Pending Stock (Case)", "WH Price", "Landed Cost"],
          filename: "cleanup_report_unified.pdf"
        });
      } else if (mode === "cluster") {
        getJson("warehouse_clusters")
          .then(res => {
            const clusters = res.data;
            const exportData = flattened.map(item => ({
              Warehouse: item.warehouse_name,
              "Item Name": item.item_name,
              "Product Code": item.product_code,
              "Physical Stock (Case)": item.physical,
              "Allotted Stock (Case)": item.allotted,
              "Pending Stock (Case)": item.pending,
              "WH Price": item.wh_price,
              "Landed Cost": item.landed_cost
            }));

            exportClusterPdf({
              title: "Warehouse Physical Stock Report",
              periodLabel: `Report Period: ${displayReportDate}`,
              columns,
              data: exportData,
              groupByField: "Warehouse",
              sumCols: ["Physical Stock (Case)", "Allotted Stock (Case)", "Pending Stock (Case)", "WH Price", "Landed Cost"],
              clusters,
              filenamePrefix: "cleanup_report"
            });
          })
          .catch(err => {
            console.error("Error loading cluster info:", err);
          });
      }
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <Select
            placeholder="Select Warehouse"
            showSearch
            allowClear
            style={{ width: 300 }}
            options={warehouseOptions}
            value={warehouse}
            onChange={setWarehouse}
          />
        </Col>
        <Col>
          <DownloadDropdown onDownload={handleDownload} disabled={flattened.length === 0} />
        </Col>
      </Row>

      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>Warehouse Physical Stock report</span>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>Warehouse: {warehouse || "All"} , Report Period: {displayReportDate}</span>
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey={(r, i) => `${r.product_code}_${i}`}
        pagination={false}
        size="small"
        bordered
        summary={(pageData) => {
          let totalPhysical = 0;
          let totalAllotted = 0;
          let totalPending = 0;
          let totalWhPrice = 0;
          let totalLandedCost = 0;

          pageData.forEach(({ physical, allotted, pending, wh_price, landed_cost }) => {
            totalPhysical += Number(physical) || 0;
            totalAllotted += Number(allotted) || 0;
            totalPending += Number(pending) || 0;
            totalWhPrice += Number(wh_price) || 0;
            totalLandedCost += Number(landed_cost) || 0;
          });

          return (
            <Table.Summary.Row style={{ background: "#fafafa", fontWeight: "bold" }}>
              <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
              <Table.Summary.Cell index={1}></Table.Summary.Cell>
              <Table.Summary.Cell index={2}></Table.Summary.Cell>
              <Table.Summary.Cell index={3}>{totalPhysical}</Table.Summary.Cell>
              <Table.Summary.Cell index={4}>{totalAllotted}</Table.Summary.Cell>
              <Table.Summary.Cell index={5}>{totalPending}</Table.Summary.Cell>
              <Table.Summary.Cell index={6}>{totalWhPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Summary.Cell>
              <Table.Summary.Cell index={7}>{totalLandedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
    </div>
  );
}
