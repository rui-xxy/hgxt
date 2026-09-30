import type {
  EnergyResult,
  MaterialsResult,
  SulfuricSummaryResult,
  TankLevelsResult,
  WorkshopOverviewResult,
} from '@hgxt/shared';
import { request } from './client';

export function sulfuricSummary(days = 30): Promise<SulfuricSummaryResult> {
  return request(`/production/sulfuric?days=${days}`);
}
export function workshopOverview(days = 30): Promise<WorkshopOverviewResult> {
  return request(`/production/workshops?days=${days}`);
}
export function energySummary(days = 30): Promise<EnergyResult> {
  return request(`/production/energy?days=${days}`);
}
export function materialsSummary(): Promise<MaterialsResult> {
  return request('/production/materials');
}
export function tankLevels(): Promise<TankLevelsResult> {
  return request('/production/tanks');
}
