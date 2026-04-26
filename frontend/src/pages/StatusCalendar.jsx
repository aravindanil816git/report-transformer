import React, { useEffect, useState } from 'react';
import { Calendar, Badge, Card, Tag, Space, Typography, Row, Col, Modal, List, Divider, Tooltip, Table } from 'antd';
import dayjs from 'dayjs';
import { listReports } from '../api';
import { REPORT_REGISTRY } from '../reports';

const { Title, Text } = Typography;

const EXPECTED_DAILY_REPORTS = [
  { key: 'shopwise', label: REPORT_REGISTRY.shopwise.label },
  { key: 'daily_warehouse', label: REPORT_REGISTRY.daily_warehouse.label },
  { key: 'daily_warehouse_offtake', label: REPORT_REGISTRY.daily_warehouse_offtake.label },
  { key: 'daily_secondary_sales', label: REPORT_REGISTRY.daily_secondary_sales.label },
];

const EXPECTED_CUMULATIVE_REPORTS = [
  { key: 'cumulative_shopwise', label: REPORT_REGISTRY.cumulative_shopwise.label },
  { key: 'cumulative_warehouse', label: REPORT_REGISTRY.cumulative_warehouse.label },
];

const EXPECTED_MONTHLY_REPORTS = [
  { key: 'monthly_stock_sales', label: REPORT_REGISTRY.monthly_stock_sales.label },
  { key: 'month_comparative', label: REPORT_REGISTRY.month_comparative.label },
];

export default function StatusCalendar() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listReports();
      setReports(res.data || []);
    } catch (e) {
      console.error("Failed to load reports", e);
    }
    setLoading(false);
  };

  const getDayData = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    
    const dailyReports = reports.filter(r => 
      ['daily_secondary_sales', 'shopwise', 'daily_warehouse', 'daily_warehouse_offtake'].includes(r.type) && 
      r.config?.date === dateStr
    );

    const cumulativeReports = reports.filter(r => {
      if (!['cumulative_shopwise', 'cumulative_warehouse'].includes(r.type)) return false;
      const start = r.config?.start_date;
      const end = r.config?.end_date;
      return start && end && dateStr >= start && dateStr <= end;
    });

    const otherReports = reports.filter(r => {
      if (['daily_secondary_sales', 'shopwise', 'daily_warehouse', 'daily_warehouse_offtake', 'cumulative_shopwise', 'cumulative_warehouse'].includes(r.type)) return false;
      
      const config = r.config || {};
      if (config.date === dateStr) return true;
      if (config.month && dateStr.startsWith(config.month)) return true;
      if (config.date1 && config.date2 && dateStr >= config.date1 && dateStr <= config.date2) return true;
      
      return false;
    });

    return { dailyReports, cumulativeReports, otherReports };
  };

  const disabledDate = (current) => {
    return current && current > dayjs().endOf('day');
  };

  const dateCellRender = (date) => {
    if (disabledDate(date)) return null;

    const { dailyReports } = getDayData(date);
    
    const trackedDaily = ['shopwise', 'daily_warehouse', 'daily_warehouse_offtake', 'daily_secondary_sales'];
    
    let completeCount = 0;
    let anyCreated = false;

    trackedDaily.forEach(type => {
      const r = dailyReports.find(report => report.type === type);
      if (r) {
        anyCreated = true;
        let isComplete = false;
        if (['daily_secondary_sales', 'daily_warehouse'].includes(r.type)) {
          const totalFiles = r.uploads?.length || 0;
          const uploadedFiles = r.uploads?.filter(u => u.status === 'uploaded').length || 0;
          isComplete = totalFiles > 0 && uploadedFiles === totalFiles;
        } else {
          isComplete = r.status === 'Ready' || r.status === 'Processed' || (r.uploads && r.uploads.length > 0);
        }
        if (isComplete) completeCount++;
      }
    });

    let finalStatus = 'default';
    if (anyCreated) {
      finalStatus = (completeCount === trackedDaily.length) ? 'success' : 'warning';
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Badge status={finalStatus} dot style={{ transform: 'scale(2.5)' }} />
      </div>
    );
  };

  const onSelect = (date) => {
    if (disabledDate(date)) return;
    setSelectedDate(date);
    setModalVisible(true);
  };

  const renderModalContent = () => {
    if (!selectedDate) return null;
    const { dailyReports, cumulativeReports, otherReports } = getDayData(selectedDate);
    
    const dailyData = EXPECTED_DAILY_REPORTS.map(type => {
      const r = dailyReports.find(report => report.type === type.key);
      if (!r) {
        return {
          key: type.key,
          type: 'DAILY',
          name: type.label,
          status: 'NOT CREATED',
          uploads: '0 / 1',
          color: 'default'
        };
      }

      let uploadedCount = 0;
      let totalNeeded = 0;
      if (['daily_secondary_sales', 'daily_warehouse'].includes(r.type)) {
        totalNeeded = r.uploads?.length || 0;
        uploadedCount = r.uploads?.filter(u => u.status === 'uploaded').length || 0;
      } else {
        totalNeeded = 1;
        uploadedCount = (r.status === 'Ready' || r.status === 'Processed' || (r.uploads && r.uploads.length > 0)) ? 1 : 0;
      }

      return {
        key: r.id,
        type: 'DAILY',
        name: type.label,
        status: r.status,
        uploads: `${uploadedCount} / ${totalNeeded}`,
        color: uploadedCount === totalNeeded ? 'success' : 'warning'
      };
    });

    const cumulativeData = EXPECTED_CUMULATIVE_REPORTS.map(type => {
      const r = reports.find(report => report.type === type.key && 
        selectedDate.format('YYYY-MM-DD') >= report.config?.start_date && 
        selectedDate.format('YYYY-MM-DD') <= report.config?.end_date);
      
      if (!r) {
        return {
          key: type.key,
          type: 'CUMULATIVE',
          name: type.label,
          status: 'NOT IN RANGE',
          uploads: '-',
          color: 'default'
        };
      }

      const entry = r.uploads?.find(u => u.date === selectedDate.format('YYYY-MM-DD'));
      const isTodayLinked = entry && (entry.status === 'uploaded' || entry.data);
      const uploadedCount = r.uploads?.filter(u => u.status === 'uploaded' || u.data).length || 0;
      const totalNeeded = r.uploads?.length || 0;

      return {
        key: r.id,
        type: 'CUMULATIVE',
        name: type.label,
        status: isTodayLinked ? 'DATA OK' : 'MISSING DATA',
        uploads: `${uploadedCount} / ${totalNeeded} Days`,
        color: isTodayLinked ? 'success' : 'error'
      };
    });

    const otherData = EXPECTED_MONTHLY_REPORTS.map(type => {
      const r = reports.find(report => report.type === type.key && 
        (report.config?.month === selectedDate.format('YYYY-MM') || 
         (report.config?.date1 <= selectedDate.format('YYYY-MM-DD') && report.config?.date2 >= selectedDate.format('YYYY-MM-DD'))));

      if (!r) {
        return {
          key: type.key,
          type: 'MONTHLY',
          name: type.label,
          status: 'NOT CREATED',
          uploads: '-',
          color: 'default'
        };
      }

      return {
        key: r.id,
        type: 'MONTHLY',
        name: type.label,
        status: r.status,
        uploads: r.status === 'Processed' ? '1 / 1' : '0 / 1',
        color: r.status === 'Processed' ? 'success' : 'warning'
      };
    });

    const columns = [
      {
        title: 'Type',
        dataIndex: 'type',
        key: 'type',
        width: 110,
        render: (t) => <Tag color={t === 'DAILY' ? 'blue' : (t === 'CUMULATIVE' ? 'purple' : 'cyan')}>{t}</Tag>
      },
      {
        title: 'Report Name',
        dataIndex: 'name',
        key: 'name',
        render: (n, record) => <Text strong={record.color !== 'default'}>{n}</Text>
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (s, record) => <Badge status={record.color} text={s} />
      },
      {
        title: 'Completion',
        dataIndex: 'uploads',
        key: 'uploads',
        align: 'right',
        render: (u, record) => (
          <Tag color={record.color === 'success' ? 'green' : (record.color === 'error' ? 'red' : (record.color === 'warning' ? 'orange' : 'default'))}>
            {u}
          </Tag>
        )
      }
    ];

    return (
      <Table 
        dataSource={[...dailyData, ...cumulativeData, ...otherData]} 
        columns={columns} 
        pagination={false}
        size="middle"
        bordered
      />
    );
  };

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 24 }}>
        <Col span={10}>
          <Title level={2}>Report Status Calendar</Title>
        </Col>
        <Col span={14} style={{ textAlign: 'right' }}>
          <Space size="middle">
            <Space><Badge status="success" /><Text size="small">Complete</Text></Space>
            <Space><Badge status="warning" /><Text size="small">Partial/Pending</Text></Space>
            <Space><Badge status="default" /><Text size="small">Not Created</Text></Space>
            <Space><Badge status="error" /><Text size="small">Missing Source</Text></Space>
          </Space>
        </Col>
      </Row>
      <Card bodyStyle={{ padding: 0 }}>
        <Calendar dateCellRender={dateCellRender} disabledDate={disabledDate} onSelect={onSelect} />
      </Card>
      <Modal
        title={<Space><span style={{ fontSize: '18px' }}>Detailed Status:</span><Text type="secondary">{selectedDate?.format('DD MMMM YYYY')}</Text></Space>}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={750}
        centered
      >
        {renderModalContent()}
      </Modal>
      <style>{`
        .events { margin: 0; padding: 0; list-style: none; }
        .events li { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.4; }
        .ant-picker-calendar-date-content { height: 85px !important; }
      `}</style>
    </div>
  );
}
