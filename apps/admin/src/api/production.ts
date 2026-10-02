import type {
  AminoSummaryResult,
  DetailedWorkshopCode,
  DetailedWorkshopResult,
  EnergyResult,
  MaterialsResult,
  SulfuricSummaryResult,
  ThermalSummaryResult,
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
export function aminoSummary(days = 30): Promise<AminoSummaryResult> {
  return request(`/production/amino?days=${days}`);
}
export function thermalSummary(days = 30): Promise<ThermalSummaryResult> {
  return request(`/production/thermal?days=${days}`);
}
export function detailedWorkshopSummary(code: DetailedWorkshopCode, days = 30): Promise<DetailedWorkshopResult> {
  return request(`/production/workshops/${code}/detail?days=${days}`);
}
export function energySummary(days = 30): Promise<EnergyResult> {
  return request(`/production/energy?days=${days}`);
}
export function materialsSummary(): Promise<MaterialsResult> {
  return request('/production/materials');
}
export function tankLevels(date?: string): Promise<TankLevelsResult> {
  return request(`/production/tanks${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}
