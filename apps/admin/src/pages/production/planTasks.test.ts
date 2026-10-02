import { describe, expect, it } from 'vitest';
import type { PlanTask } from '@hgxt/shared';
import { EMPTY_TASK_FILTERS, EMPTY_TASK_VALUE, filterPlanTasks } from './planTasks';

const tasks: PlanTask[] = [
  { period: '本周', status: 'doing', matter: '检查水滑石设备', department: '水滑石生产部', owner: '汪金虎', importance: '重要', dueDate: '2026-10-02', progress: '进行中', completionNote: '' },
  { period: '下周', status: 'todo', matter: 'SULFUR 硫酸管道维护', department: '硫酸生产部', owner: '杨旭', importance: '日常', dueDate: '2026-10-08', progress: '', completionNote: '待配件到货' },
  { period: '其他', status: 'late', matter: '水滑石报告', department: '水滑石生产部,品质部', owner: '汪金虎', importance: '', dueDate: '2026-09-29', progress: '进行中', completionNote: '等待复核' },
];

describe('计划与完成事项筛选', () => {
  it('周期标签与多列表头条件叠加，日期区间包含起止日', () => {
    expect(filterPlanTasks(tasks, 'next', EMPTY_TASK_FILTERS)).toEqual([tasks[1]]);
    expect(filterPlanTasks(tasks, 'late', EMPTY_TASK_FILTERS)).toEqual([tasks[2]]);
    expect(filterPlanTasks(tasks, 'late', {
      ...EMPTY_TASK_FILTERS, department: '水滑石', owner: '汪', dueFrom: '2026-09-29', dueTo: '2026-09-29',
    })).toEqual([tasks[2]]);
  });

  it('支持空值选项和不区分大小写的文字搜索', () => {
    expect(filterPlanTasks(tasks, 'late', { ...EMPTY_TASK_FILTERS, importance: EMPTY_TASK_VALUE })).toEqual([tasks[2]]);
    expect(filterPlanTasks(tasks, 'next', { ...EMPTY_TASK_FILTERS, progress: EMPTY_TASK_VALUE, completionNote: '配件' })).toEqual([tasks[1]]);
    expect(filterPlanTasks(tasks, 'next', { ...EMPTY_TASK_FILTERS, matter: 'sulfur' })).toEqual([tasks[1]]);
  });
});
