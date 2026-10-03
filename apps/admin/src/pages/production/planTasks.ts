import type { PlanTask } from '@hgxt/shared';

export type TaskTab = 'week' | 'next' | 'late';
export type TaskFilters = {
  status: PlanTask['status'] | '';
  matter: string;
  department: string;
  importance: string;
  owner: string;
  dueFrom: string;
  dueTo: string;
  progress: string;
  completionNote: string;
};

export const TASK_PAGE_SIZE = 15;
export const EMPTY_TASK_VALUE = '__empty__';
export const EMPTY_TASK_FILTERS: TaskFilters = {
  status: '', matter: '', department: '', importance: '', owner: '',
  dueFrom: '', dueTo: '', progress: '', completionNote: '',
};

function contains(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function equals(value: string, filter: string): boolean {
  return !filter || (filter === EMPTY_TASK_VALUE ? !value.trim() : value === filter);
}

export function filterPlanTasks(tasks: PlanTask[], tab: TaskTab, filters: TaskFilters): PlanTask[] {
  return tasks.filter((task) => {
    if (tab === 'week' && task.period !== '本周') return false;
    if (tab === 'next' && task.period !== '下周') return false;
    if (tab === 'late' && task.status !== 'late') return false;
    if (filters.status && task.status !== filters.status) return false;
    if (!contains(task.matter, filters.matter) || !contains(task.department, filters.department)
      || !contains(task.owner, filters.owner) || !contains(task.completionNote, filters.completionNote)) return false;
    if (!equals(task.importance, filters.importance) || !equals(task.progress, filters.progress)) return false;
    if (filters.dueFrom && (!task.dueDate || task.dueDate < filters.dueFrom)) return false;
    if (filters.dueTo && (!task.dueDate || task.dueDate > filters.dueTo)) return false;
    return true;
  });
}
