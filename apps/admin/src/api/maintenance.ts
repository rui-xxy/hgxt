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

export const maintenanceApi = {
  list(): Promise<MaintenanceRecord[]> {
    return request('/maintenance/records');
  },
  listYear(year: number): Promise<MaintenanceRecord[]> {
    return request(`/maintenance/records?year=${year}`);
  },
  create(input: MaintenanceRecordInput): Promise<MaintenanceRecord> {
    return request('/maintenance/records', { method: 'POST', body: input });
  },
  update(id: string, input: MaintenanceRecordInput): Promise<MaintenanceRecord> {
    return request(`/maintenance/records/${id}`, { method: 'PATCH', body: input });
  },
  remove(id: string): Promise<{ id: string }> {
    return request(`/maintenance/records/${id}`, { method: 'DELETE' });
  },
};
