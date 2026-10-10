import type {
  FormDTO, FormData, FormPageResult, FormSubmissionDTO,
  FormSubmissionPageResult, SaveFormSubmissionsBody, FormLastValuesResult,
} from '@hgxt/shared';
import { request } from './client';

export function listForms(query: { page: number; pageSize: number; keyword: string; category?: string }): Promise<FormPageResult> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.keyword.trim()) params.set('keyword', query.keyword.trim());
  if (query.category) params.set('category', query.category);
  return request(`/forms?${params}`);
}
export function getForm(id: string): Promise<FormDTO> { return request(`/forms/${id}`); }
export function listSubmissions(id: string, page = 1, pageSize = 1000, filters?: { keyword?: string; progress?: string }): Promise<FormSubmissionPageResult> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters?.keyword) params.set('keyword', filters.keyword);
  if (filters?.progress) params.set('progress', filters.progress);
  return request(`/forms/${id}/submissions?${params}`);
}
export function createSubmission(id: string, data: FormData): Promise<FormSubmissionDTO> {
  return request(`/forms/${id}/submissions`, { method: 'POST', body: { data } });
}
export function latestValues(id: string): Promise<FormLastValuesResult> {
  return request(`/forms/${id}/submissions/latest`);
}
export function saveSubmissions(id: string, body: SaveFormSubmissionsBody): Promise<{ created: number; updated: number; deleted: number }> {
  return request(`/forms/${id}/submissions/batch`, { method: 'POST', body });
}

export interface ControlCatalogItem { id: string; code: string; title: string }
export function controlCatalog(): Promise<ControlCatalogItem[]> { return request('/forms/control/catalog'); }
export function controlRange(from: string, to: string): Promise<{ forms: ControlCatalogItem[]; rows: FormSubmissionDTO[] }> {
  const params = new URLSearchParams({ from, to });
  return request(`/forms/control/range?${params}`);
}
export function patchControlValue(body: { formId: string; date: string; fieldId: string; value: string | number | null }): Promise<FormSubmissionDTO> {
  return request('/forms/control/value', { method: 'POST', body });
}
