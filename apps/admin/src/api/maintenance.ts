import { request } from './client';

/** Excel「维修日志主表」的登记值；repairHours 优先为工作时间扣除午休后的计算值。 */
export interface MaintenanceRecord {
  id: string;
  sourceRow: number | null;
  sourceDateText: string;
  date: string | null;
  reportYear: number;
  reportMonth: number;
  personnel: string;
  department: string;
  location: string;
  workshop: string;
  equipmentName: string;
  equipmentModel: string;
  workContent: string;
  workTimeText: string;
  replacedParts: string;
  faultType: string;
  faultCause: string;
  repairHours: number | null;
  isRework: boolean;
  remarks: string;
}

export type MaintenanceRecordInput = Omit<MaintenanceRecord, 'id' | 'sourceRow' | 'repairHours'> & { repairHours?: number | null };

/** 匿名登记用的联想选项行：仅分类字段（后端 /maintenance/options 返回） */
export type MaintenanceOptionsRow = Pick<
  MaintenanceRecord,
  'personnel' | 'department' | 'location' | 'workshop' | 'equipmentName' | 'equipmentModel' | 'faultType' | 'faultCause'
>;

export const maintenanceApi = {
  // 维修记录受登录与页面权限保护；匿名登记只读取下方的公开联想选项。
  list(): Promise<MaintenanceRecord[]> {
    return request('/maintenance/records');
  },
  listYear(year: number): Promise<MaintenanceRecord[]> {
    return request(`/maintenance/records?year=${year}`);
  },
  // 匿名可读的选项数据（不含工作内容等明细）
  options(): Promise<MaintenanceOptionsRow[]> {
    return request('/maintenance/options', { auth: false });
  },
  create(input: MaintenanceRecordInput): Promise<MaintenanceRecord> {
    return request('/maintenance/records', { method: 'POST', body: input, auth: false });
  },
  update(id: string, input: MaintenanceRecordInput): Promise<MaintenanceRecord> {
    return request(`/maintenance/records/${id}`, { method: 'PATCH', body: input });
  },
  remove(id: string): Promise<{ id: string }> {
    return request(`/maintenance/records/${id}`, { method: 'DELETE' });
  },
};
