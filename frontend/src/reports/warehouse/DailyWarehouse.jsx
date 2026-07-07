import { useEffect, useState, useMemo } from "react";
import { Table, Select, Button, Space, Row, Col, message } from "antd";
import { useParams } from "react-router-dom";
import { getReport, getJson } from "../../api";
import { exportToExcel, exportUnifiedWithDropdown, exportToPdf, exportClusterPdf } from "../../utils/exportUtils";
import DownloadDropdown from "../../components/DownloadDropdown";
import dayjs from "dayjs";

export default function CleanupReport() {
  const { id } = useParams();

  const [report, setReport] = useState(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [selectedPack, setSelectedPack] = useState("all");
  const [data, setData] = useState([]);

  const config = report?.config || {};
  const uploads = report?.uploads || [];

  const periodLabel = useMemo(() => {
    const froms = uploads.map(u => u.from).filter(Boolean);
    const tos = uploads.map(u => u.to).filter(Boolean);
    
    if (froms.length && tos.length) {
      return `As on : ${dayjs(froms[0]).format("DD-MM-YYYY")}`;
    }
    
    if (config.date) {
      return `As On : ${dayjs(config.date).format("DD-MM-YYYY")}`;
    }
    
    return "";
  }, [uploads, config]);

  const uploadDateLabel = useMemo(() => {
    const dates = uploads.map(u => u.from).filter(Boolean);
    if (dates.length) return `UPLOAD DATE : ${dayjs(dates[0]).format("DD-MM-YYYY")}`;
    if (config.date) return `UPLOAD DATE : ${dayjs(config.date).format("DD-MM-YYYY")}`;
    return "";
  }, [uploads, config]);

  // ✅ ALWAYS RUN
  useEffect(() => {
    getReport(id).then((res) => {
      setReport(res.data || {});
    });
  }, [id]);

  // ✅ ALWAYS RUN
  useEffect(() => {
    if (!report || !selectedWarehouse) {
      setData([]);
      return;
    }

    const found = (report.data || []).find(
      (d) => d.warehouse === selectedWarehouse
    );

    let items = found?.items || [];

    if (selectedPack !== "all") {
      items = items.filter(item => item.pack === selectedPack);
    }

    setData(items);
  }, [selectedWarehouse, selectedPack, report]);

  const warehouses = (report?.uploads || [])
    .filter(u => u.status === "uploaded")
    .map((u) => u.warehouse);

  const packs = Array.from(new Set(
    (report?.data?.find(d => d.warehouse === selectedWarehouse)?.items || [])
      .map(item => item.pack)
      .filter(Boolean)
  )).sort();

  const columns = [
    {
      title: "Item Name",
      dataIndex: "item_name",
    },
    {
      title: "Pack",
      dataIndex: "pack",
    },
    {
      title: "Physical Stock",
      dataIndex: "physical",
    },
    {
      title: "Allotable Stock",
      dataIndex: "allotted",
    },
    {
      title: "Pending Stock",
      dataIndex: "pending",
    },
  ];

  // ✅ DOWNLOAD
  const handleDownload = (format, mode) => {
    if (format === "xlsx") {
      if (mode === "current") {
        if (!selectedWarehouse) {
          message.warning("Please select a warehouse first to download Current View.");
          return;
        }

        const exportData = data.map(item => ({
          "Item Name": item.item_name,
          "Pack": item.pack,
          "Physical Stock": item.physical,
          "Allotable Stock": item.allotted,
          "Pending Stock": item.pending,
        }));

        const totalPhysical = data.reduce((sum, item) => sum + (Number(item.physical) || 0), 0);
        const totalAllotted = data.reduce((sum, item) => sum + (Number(item.allotted) || 0), 0);
        const totalPending = data.reduce((sum, item) => sum + (Number(item.pending) || 0), 0);

        exportData.push({
          "Item Name": "Total",
          "Pack": "",
          "Physical Stock": totalPhysical,
          "Allotable Stock": totalAllotted,
          "Pending Stock": totalPending,
        });

        exportToExcel(
          exportData,
          {
            Warehouse: selectedWarehouse,
            "Report Period": periodLabel
          },
          `physical_stock_report_${selectedWarehouse}.xlsx`,
          "Physical Stock"
        );
      } else if (mode === "unified") {
        if (!report?.data) return;

        // Flatten all items across all warehouses
        const exportData = report.data.flatMap(whData =>
          (whData.items || []).map(item => ({
            Warehouse: whData.warehouse,
            "Item Name": item.item_name,
            "Pack": item.pack,
            "Physical Stock": item.physical,
            "Allotable Stock": item.allotted,
            "Pending Stock": item.pending,
          }))
        );

        exportUnifiedWithDropdown({
          data: exportData,
          warehouses: warehouses,
          reportTitle: "Warehouse Physical Stock Report",
          periodLabel: periodLabel,
          filename: "physical_stock_report_unified.xlsx",
          sheetName: "Physical Stock",
          sumCols: ["Physical Stock", "Allotable Stock", "Pending Stock"]
        });
      }
    } else if (format === "pdf") {
      if (mode === "current") {
        if (!selectedWarehouse) {
          message.warning("Please select a warehouse first to download Current View.");
          return;
        }

        const columns = ["Item Name", "Pack", "Physical Stock", "Allotable Stock", "Pending Stock"];
        const exportData = data.map(item => ({
          "Item Name": item.item_name,
          "Pack": item.pack,
          "Physical Stock": item.physical,
          "Allotable Stock": item.allotted,
          "Pending Stock": item.pending,
        }));

        const totalPhysical = data.reduce((sum, item) => sum + (Number(item.physical) || 0), 0);
        const totalAllotted = data.reduce((sum, item) => sum + (Number(item.allotted) || 0), 0);
        const totalPending = data.reduce((sum, item) => sum + (Number(item.pending) || 0), 0);

        exportData.push({
          "Item Name": "Total",
          "Pack": "",
          "Physical Stock": totalPhysical,
          "Allotable Stock": totalAllotted,
          "Pending Stock": totalPending,
        });

        exportToPdf({
          title: "Warehouse Physical Stock Report",
          periodLabel: periodLabel,
          columns,
          data: exportData,
          filename: `physical_stock_report_${selectedWarehouse}.pdf`,
          metadataWarehouse: selectedWarehouse,
          zeroMargin: true
        });
      } else if (mode === "unified") {
        if (!report?.data) return;

        const columns = ["Item Name", "Pack", "Physical Stock", "Allotable Stock", "Pending Stock"];
        const exportData = report.data.flatMap(whData =>
          (whData.items || []).map(item => ({
            Warehouse: whData.warehouse,
            "Item Name": item.item_name,
            "Pack": item.pack,
            "Physical Stock": item.physical,
            "Allotable Stock": item.allotted,
            "Pending Stock": item.pending,
          }))
        );

        exportToPdf({
          title: "Warehouse Physical Stock Report",
          periodLabel: periodLabel,
          columns,
          data: exportData,
          groupByField: "Warehouse",
          sumCols: ["Physical Stock", "Allotable Stock", "Pending Stock"],
          filename: "physical_stock_report_unified.pdf",
          zeroMargin: true
        });
      } else if (mode === "cluster") {
        if (!report?.data) return;

        getJson("warehouse_clusters")
          .then(res => {
            const clusters = res.data;
            const columns = ["Item Name", "Pack", "Physical Stock", "Allotable Stock", "Pending Stock"];
            const exportData = report.data.flatMap(whData =>
              (whData.items || []).map(item => ({
                Warehouse: whData.warehouse,
                "Item Name": item.item_name,
                "Pack": item.pack,
                "Physical Stock": item.physical,
                "Allotable Stock": item.allotted,
                "Pending Stock": item.pending,
              }))
            );

            exportClusterPdf({
              title: "Warehouse Physical Stock Report",
              periodLabel: periodLabel,
              columns,
              data: exportData,
              groupByField: "Warehouse",
              sumCols: ["Physical Stock", "Allotable Stock", "Pending Stock"],
              clusters,
              filenamePrefix: "physical_stock",
              zeroMargin: true
            });
          })
          .catch(err => {
            console.error("Error loading cluster info:", err);
          });
      }
    }
  };

  const downloadAllWarehouses = async () => {
    if (!report?.data) return;

    for (const whData of report.data) {
      const exportData = whData.items.map(item => ({
        "Item Name": item.item_name,
        "Pack": item.pack,
        "Physical Stock (Case)": item.physical,
        "Allotted Stock (Case)": item.allotted,
        "Pending Stock (Case)": item.pending,
      }));

      exportToExcel(
        exportData,
        {
          Warehouse: whData.warehouse
        },
        `physical_stock_${whData.warehouse}.xlsx`,
        "Physical Stock"
      );
      
      // Small delay to help browser handle multiple downloads
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2>Warehouse Physical Stock Report</h2>
        <div>
        <Space>
          <Button type="default" onClick={downloadAllWarehouses} disabled={!report?.data}>
            Download All Warehouses
          </Button>
          <Select
            placeholder="Select Warehouse"
            style={{ width: 250 }}
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            options={warehouses.map((w) => ({
              label: w,
              value: w,
            }))}
          />
          <Select
            placeholder="Select Pack"
            style={{ width: 150 }}
            value={selectedPack}
            onChange={setSelectedPack}
            options={[
              { label: "All Packs", value: "all" },
              ...packs.map(p => ({ label: p, value: p }))
            ]}
          />
          <DownloadDropdown onDownload={handleDownload} disabled={!report?.data || report.data.length === 0} />
        </Space>
        </div>
      </div>

      <div style={{ marginBottom: 0, padding: "8px 12px", backgroundColor: "#ADC9E6", border: "1px solid #999", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{periodLabel}</span>
        {/* <span style={{ color: "#d00", fontWeight: "bold", fontSize: 16 }}>{uploadDateLabel}</span> */}
      </div>

      {/* 🔥 Table */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey={(r) => `${r.item_name}-${r.pack}`}
        pagination={false}
        summary={(pageData) => {
          let totalPhysical = 0;
          let totalAllotted = 0;
          let totalPending = 0;

          pageData.forEach(({ physical, allotted, pending }) => {
            totalPhysical += Number(physical || 0);
            totalAllotted += Number(allotted || 0);
            totalPending += Number(pending || 0);
          });

          return (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ backgroundColor: "#fafafa", fontWeight: "bold" }}>
                <Table.Summary.Cell index={0} colSpan={2}>GRAND TOTAL</Table.Summary.Cell>
                <Table.Summary.Cell index={1}>{totalPhysical}</Table.Summary.Cell>
                <Table.Summary.Cell index={2}>{totalAllotted}</Table.Summary.Cell>
                <Table.Summary.Cell index={3}>{totalPending}</Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
    </div>
  );
}
