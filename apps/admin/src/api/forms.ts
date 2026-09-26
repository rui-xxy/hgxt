import type {
  FormDTO, FormData, FormPageResult, FormSubmissionDTO,
  FormSubmissionPageResult, SaveFormSubmissionsBody, FormLastValuesResult,
} from '@hgxt/shared';
import { request } from './client';

export function listForms(query: { page: number; pageSize: number; keyword: string }): Promise<FormPageResult> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.keyword.trim()) params.set('keyword', query.keyword.trim());
  return request(`/forms?${params}`);
}
export function getForm(id: string): Promise<FormDTO> { return request(`/forms/${id}`); }
export function listSubmissions(id: string): Promise<FormSubmissionPageResult> {
  return request(`/forms/${id}/submissions?pageSize=1000`);
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
