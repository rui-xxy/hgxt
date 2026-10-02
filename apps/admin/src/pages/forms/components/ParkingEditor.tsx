import { Button, Input, Modal } from 'antd';
import { useState } from 'react';
import { PlusIcon, TrashIcon } from '../../../components/icons';
import { emptyParking, type ParkingRecord } from './parking';

interface Props {
  initial: ParkingRecord[];
  date: string;
  onSave: (records: ParkingRecord[]) => void;
  onClose: () => void;
}

export function ParkingEditor({ initial, date, onSave, onClose }: Props) {
  const [records, setRecords] = useState<ParkingRecord[]>(initial.length ? initial : [emptyParking(date)]);
  const patch = (index: number, part: Partial<ParkingRecord>) => setRecords((current) => current.map((record, i) => i === index ? { ...record, ...part } : record));
  return <Modal title="编辑停车记录" open onCancel={onClose} onOk={() => onSave(records)} okText="保存记录" cancelText="取消" destroyOnHidden width={560}>
    <div className="forms-parking-editor">
      {records.map((record, index) => <div className="forms-parking-card" key={index}>
        <div className="forms-parking-card-head"><strong>记录 {index + 1}</strong><Button type="text" danger size="small" icon={<TrashIcon />} aria-label={`删除记录 ${index + 1}`} onClick={() => setRecords((current) => current.filter((_, i) => i !== index))} /></div>
        <div className="forms-parking-grid">
          <label>开始日期<Input type="date" value={record.startDate} onChange={(e) => patch(index, { startDate: e.target.value })} /></label>
          <label>开始时间<Input type="time" value={record.startTime} onChange={(e) => patch(index, { startTime: e.target.value })} /></label>
          <label>结束日期<Input type="date" value={record.endDate} onChange={(e) => patch(index, { endDate: e.target.value })} /></label>
          <label>结束时间<Input type="time" value={record.endTime} onChange={(e) => patch(index, { endTime: e.target.value })} /></label>
        </div>
        <label>原因<Input value={record.reason} placeholder="请输入停车原因" onChange={(e) => patch(index, { reason: e.target.value })} /></label>
      </div>)}
      <Button block type="dashed" icon={<PlusIcon />} onClick={() => setRecords((current) => [...current, emptyParking(date)])}>新增停车记录</Button>
    </div>
  </Modal>;
}
