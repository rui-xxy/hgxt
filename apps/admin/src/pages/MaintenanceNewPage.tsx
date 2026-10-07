import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App as AntApp, AutoComplete, Button, DatePicker, Drawer, Form, Input, InputNumber,
  Segmented, Select, Spin, Switch, TimePicker,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Role } from '@hgxt/shared';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router';
import { maintenanceApi, type MaintenanceRecord, type MaintenanceRecordInput } from '../api/maintenance';
import { useMe } from '../api/hooks';
import { tokenStore } from '../api/client';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon, SaveIcon } from '../components/icons';
import { peopleOf, uniqueOptions } from './MaintenanceData';
import './maintenance.css';

type TimePreset = 'full' | 'morning' | 'afternoon' | 'custom';

interface FormValues {
  date: Dayjs | null;
  reportPeriod: Dayjs | null;
  workContent: string;
  personnel: string[];
  department: string;
  location: string;
  equipmentModel: string;
  workTimeText: string;
  replacedParts: string;
  faultType: string;
  faultCause: string;
  isRework: boolean;
  remarks: string;
}

interface PartsDraft {
  name: string;
  quantity: number;
  unit: string;
}

const COMMON_PARTS: Pick<PartsDraft, 'name' | 'unit'>[] = [
  { name: '软联接膜片', unit: '片' },
  { name: '机械密封', unit: '套' },
  { name: '联轴器弹性圈', unit: '个' },
];

const DRAFT_KEY = 'hgxt:maintenance:draft';
const TODAY = dayjs();
const EMPTY_FORM: FormValues = {
  date: TODAY,
  reportPeriod: TODAY.startOf('month'),
  workContent: '',
  personnel: [],
  department: '',
  location: '',
  equipmentModel: '',
  workTimeText: '',
  replacedParts: '',
  faultType: '',
  faultCause: '',
  isRework: false,
  remarks: '',
};

function parseWorkTime(value: string): [Dayjs, Dayjs] | null {
  const matches = [...value.matchAll(/(\d{1,2})[:：](\d{2})/g)].slice(0, 2);
  if (matches.length !== 2) return null;
  const times = matches.map((match) => ({ hour: Number(match[1]), minute: Number(match[2]) }));
  if (times.some(({ hour, minute }) => hour > 23 || minute > 59)) return null;
  const base = dayjs().startOf('day');
  return times.map(({ hour, minute }) => base.hour(hour).minute(minute)) as [Dayjs, Dayjs];
}

function presetFromTime(range: [Dayjs, Dayjs] | null): TimePreset {
  if (!range) return 'custom';
  const value = `${range[0].format('HH:mm')}–${range[1].format('HH:mm')}`;
  if (value === '08:00–17:00') return 'full';
  if (value === '08:00–12:00') return 'morning';
  if (value === '13:00–17:00') return 'afternoon';
  return 'custom';
}

function valuesFromRecord(record: MaintenanceRecord): FormValues {
  return {
    date: record.date ? dayjs(record.date) : null,
    reportPeriod: dayjs(`${record.reportYear}-${String(record.reportMonth).padStart(2, '0')}-01`),
    workContent: record.workContent,
    personnel: peopleOf(record),
    department: record.department,
    location: record.location,
    equipmentModel: record.equipmentModel,
    workTimeText: record.workTimeText,
    replacedParts: record.replacedParts,
    faultType: record.faultType,
    faultCause: record.faultCause,
    isRework: record.isRework,
    remarks: record.remarks,
  };
}

function readDraft(): FormValues | null {
  try {
    const text = localStorage.getItem(DRAFT_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as Omit<FormValues, 'date' | 'reportPeriod'> & { date: string | null; reportPeriod?: string | null };
    return { ...EMPTY_FORM, ...parsed, date: parsed.date ? dayjs(parsed.date) : null,
      reportPeriod: parsed.reportPeriod ? dayjs(parsed.reportPeriod) : EMPTY_FORM.reportPeriod };
  } catch {
    return null;
  }
}

export function MaintenanceNewPage({ editRecord, onClose, desktop = false }: { editRecord?: MaintenanceRecord; onClose?: () => void; desktop?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = editRecord?.id ?? searchParams.get('edit');
  const exitPath = editId ? '/maintenance/records' : '/forms?category=设备';
  const { message } = AntApp.useApp();
  const me = useMe(!!editId); // 仅编辑模式需要登录态；匿名登记不查 /me（避免 401 触发跳登录）
  const queryClient = useQueryClient();
  const signedIn = !!tokenStore.getAccessToken();
  // 已登录拉全量记录（含「常一起」共事推荐）；匿名拉公开选项行（仅人员/部门/区域等分类字段）
  const query = useQuery({
    queryKey: ['maintenance', signedIn ? 'records' : 'options'],
    queryFn: () => (signedIn ? maintenanceApi.list() : maintenanceApi.options()),
  });
  const records = useMemo(() => (query.data ?? []) as MaintenanceRecord[], [query.data]);
  const existing = editRecord ?? (editId ? records.find((record) => record.id === editId) ?? null : null);
  const [form] = Form.useForm<FormValues>();
  const initializedFor = useRef<string | null>(null);
  const [customTimeMode, setCustomTimeMode] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [picker, setPicker] = useState<'personnel' | 'location' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [partsDraft, setPartsDraft] = useState<PartsDraft>({ name: '', quantity: 1, unit: '个' });
  const selectedDepartment = Form.useWatch('department', form);
  const watchedPersonnel: string[] | undefined = Form.useWatch('personnel', form);
  const selectedPersonnel = useMemo(() => watchedPersonnel ?? [], [watchedPersonnel]);
  const workTimeText: string = Form.useWatch('workTimeText', form) ?? '';
  const timeRange = parseWorkTime(workTimeText);
  const timePreset: TimePreset = customTimeMode ? 'custom' : presetFromTime(timeRange);

  useEffect(() => {
    if (query.isLoading || initializedFor.current === (editId ?? 'new')) return;
    if (editId && !existing) return;
    const values = existing ? valuesFromRecord(existing) : readDraft() ?? EMPTY_FORM;
    form.setFieldsValue(values);
    initializedFor.current = editId ?? 'new';
  }, [query.isLoading, editId, existing, form]);

  const peopleOptions = useMemo(() => uniqueOptions(records.flatMap(peopleOf)).map((value) => ({ value, label: value })), [records]);
  const departmentOptions = useMemo(() => uniqueOptions(records.map((record) => record.department)).map((value) => ({ value, label: value })), [records]);
  const locationOptions = useMemo(() => uniqueOptions(records.filter((record) => !selectedDepartment || record.department === selectedDepartment).map((record) => record.location)).filter((value) => value !== '/' && value !== '／').map((value) => ({ value, label: value })), [records, selectedDepartment]);
  const modelOptions = useMemo(() => uniqueOptions(records.map((record) => record.equipmentModel)).filter((value) => value !== '/' && value !== '／').map((value) => ({ value, label: value })), [records]);
  const typeOptions = useMemo(() => uniqueOptions(records.map((record) => record.faultType)).map((value) => ({ value, label: value })), [records]);
  const causeOptions = useMemo(() => uniqueOptions(records.map((record) => record.faultCause)).map((value) => ({ value, label: value })), [records]);
  const coworkerOptions = useMemo(() => {
    if (selectedPersonnel.length === 0) return [];
    const selected = new Set(selectedPersonnel);
    const counts = new Map<string, number>();
    for (const record of records) {
      const people = peopleOf(record);
      if (!people.some((person) => selected.has(person))) continue;
      for (const person of people) {
        if (!selected.has(person)) counts.set(person, (counts.get(person) ?? 0) + 1);
      }
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 5).map(([value]) => value);
  }, [records, selectedPersonnel]);
  const recentLocations = useMemo(() => {
    const seen = new Set<string>();
    return records.filter((record) => !selectedDepartment || record.department === selectedDepartment)
      .map((record) => record.location.trim())
      .filter((location) => {
        if (!location || location === '/' || location === '／' || seen.has(location)) return false;
        seen.add(location);
        return true;
      }).slice(0, 5);
  }, [records, selectedDepartment]);
  const departmentOfLocation = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const record of records) {
      if (!record.location.trim() || !record.department.trim()) continue;
      const counts = map.get(record.location) ?? new Map<string, number>();
      counts.set(record.department, (counts.get(record.department) ?? 0) + 1);
      map.set(record.location, counts);
    }
    return new Map([...map.entries()].map(([location, counts]) => [location, [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
  }, [records]);

  const mutation = useMutation({
    mutationFn: (input: MaintenanceRecordInput) => editId ? maintenanceApi.update(editId, input) : maintenanceApi.create(input),
    onSuccess: async () => {
      if (!editId) localStorage.removeItem(DRAFT_KEY);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maintenance', 'records'] }),
        queryClient.invalidateQueries({ queryKey: ['maintenance', 'options'] }),
        queryClient.invalidateQueries({ queryKey: ['forms', 'list'] }),
      ]);
      message.success(editId ? '维修记录已更新' : '维修登记已提交');
      if (onClose) onClose();
      else navigate(exitPath);
    },
    onError: (error) => message.error(error.message),
  });

  const setPreset = (preset: TimePreset) => {
    const value = preset === 'full' ? '08:00–17:00'
      : preset === 'morning' ? '08:00–12:00'
        : preset === 'afternoon' ? '13:00–17:00' : null;
    if (value) {
      form.setFieldValue('workTimeText', value);
      setCustomTimeMode(false);
      setTimePickerOpen(false);
    } else {
      setCustomTimeMode(true);
      setTimePickerOpen(true);
    }
  };

  const saveDraft = () => {
    if (editId) return;
    const values = form.getFieldsValue(true);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...values, date: values.date?.format('YYYY-MM-DD') ?? null,
        reportPeriod: values.reportPeriod?.format('YYYY-MM') ?? null }));
      message.success('草稿已保存在此浏览器');
    } catch {
      message.error('草稿保存失败');
    }
  };

  const addPart = () => {
    const name = partsDraft.name.trim();
    if (!name) { message.warning('请填写配件名称'); return; }
    const formatted = `${name}×${partsDraft.quantity}${partsDraft.unit}`;
    const current = form.getFieldValue('replacedParts')?.trim() ?? '';
    form.setFieldValue('replacedParts', current && !['/', '／', '无'].includes(current) ? `${current}、${formatted}` : formatted);
    setPartsDraft({ name: '', quantity: 1, unit: '个' });
    setPartsOpen(false);
  };

  const openPicker = (kind: 'personnel' | 'location') => {
    setPickerSearch('');
    setPicker(kind);
  };
  const togglePerson = (person: string) => {
    const current: string[] = form.getFieldValue('personnel') ?? [];
    form.setFieldValue('personnel', current.includes(person) ? current.filter((value) => value !== person) : [...current, person]);
  };
  const chooseLocation = (location: string) => {
    form.setFieldValue('location', location);
    const department = departmentOfLocation.get(location);
    if (department) form.setFieldValue('department', department);
    setPicker(null);
  };
  const searchedPeople = peopleOptions.map((option) => option.value)
    .filter((person) => person.includes(pickerSearch.trim()));
  const selectedPeople = selectedPersonnel.filter((person) => person.includes(pickerSearch.trim()));
  const suggestedPeople = coworkerOptions.filter((person) => searchedPeople.includes(person));
  const otherPeople = searchedPeople.filter((person) => !selectedPersonnel.includes(person) && !coworkerOptions.includes(person));
  const searchedLocations = locationOptions.map((option) => option.value)
    .filter((location) => location.includes(pickerSearch.trim()));
  const recentMatches = recentLocations.filter((location) => searchedLocations.includes(location));
  const otherLocations = searchedLocations.filter((location) => !recentLocations.includes(location));
  const personOption = (person: string) => <button key={person} type="button"
    className={selectedPersonnel.includes(person) ? 'is-selected' : ''} onClick={() => togglePerson(person)}>
    <span className="maintenance-picker-avatar">{person.slice(0, 1)}</span>
    <span>{person}{me.data?.name === person ? <small>我</small> : null}</span>
    {selectedPersonnel.includes(person) ? <CheckIcon width={18} height={18} /> : null}
  </button>;
  const locationOption = (location: string) => <button key={location} type="button" onClick={() => chooseLocation(location)}>
    <span className="maintenance-picker-avatar">{location.slice(0, 1)}</span>
    <span>{location}<small>{departmentOfLocation.get(location)}</small></span>
  </button>;

  const submit = (values: FormValues) => {
    const date = values.date?.format('YYYY-MM-DD') ?? null;
    const dateUnchanged = !!existing && date === existing.date;
    // 只编辑某一字段时，其余 Excel 文本原样保留（包括尾随空格与占位符）。
    const textValue = (value: string | undefined, original: string | undefined) =>
      original !== undefined && value === original ? original : value?.trim() ?? '';
    const enteredPeople = [...new Set((values.personnel ?? []).map((person) => person.trim()).filter(Boolean))];
    const personnelUnchanged = !!existing && enteredPeople.length === peopleOf(existing).length &&
      enteredPeople.every((person, index) => person === peopleOf(existing)[index]);
    const reportYear = values.reportPeriod?.year() ?? existing?.reportYear ?? TODAY.year();
    const reportMonth = values.reportPeriod ? values.reportPeriod.month() + 1 : existing?.reportMonth ?? TODAY.month() + 1;
    const input: MaintenanceRecordInput = {
      sourceDateText: dateUnchanged ? existing.sourceDateText : date ?? existing?.sourceDateText ?? '',
      date,
      reportYear,
      reportMonth,
      personnel: personnelUnchanged ? existing.personnel : enteredPeople.join('、'),
      department: textValue(values.department, existing?.department),
      location: textValue(values.location, existing?.location),
      equipmentModel: textValue(values.equipmentModel, existing?.equipmentModel),
      workContent: textValue(values.workContent, existing?.workContent),
      workTimeText: textValue(values.workTimeText, existing?.workTimeText),
      replacedParts: textValue(values.replacedParts, existing?.replacedParts),
      faultType: textValue(values.faultType, existing?.faultType),
      faultCause: textValue(values.faultCause, existing?.faultCause),
      isRework: values.isRework ?? false,
      remarks: textValue(values.remarks, existing?.remarks),
    };
    mutation.mutate(input);
  };

  if (query.isLoading) return <div className="maintenance-center"><Spin tip="正在准备登记表" /></div>;
  // 历史记录只用于联想选项；匿名登记拿不到列表（401），属预期，不阻断填报
  if (query.error && tokenStore.getAccessToken()) return <Alert type="error" showIcon message="维修数据加载失败" description={query.error.message} action={<Button onClick={() => void query.refetch()}>重试</Button>} />;
  if (editId && me.isLoading) return <div className="maintenance-center"><Spin tip="正在核对权限" /></div>;
  if (editId && me.data?.role !== Role.SUPER_ADMIN) return <Alert type="warning" showIcon message="仅管理员可以编辑维修记录" action={<Button onClick={() => navigate('/maintenance/records')}>返回记录</Button>} />;
  if (editId && !existing) return <Alert type="warning" showIcon message="找不到要编辑的维修记录" action={<Button onClick={() => navigate('/maintenance/records')}>返回记录</Button>} />;

  if (desktop) return <div className="maintenance-desktop-editor">
    <header className="maintenance-desktop-header"><h2>编辑维修记录</h2><span>{existing?.date ?? existing?.sourceDateText}</span></header>
    <Form<FormValues> form={form} layout="vertical" initialValues={EMPTY_FORM} onFinish={submit} requiredMark={false} className="maintenance-desktop-form">
      <Form.Item name="workContent" label="工作内容" className="maintenance-desktop-wide" rules={[{ required: true, whitespace: true, message: '请填写工作内容' }]}>
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="描述维修、巡检或更换工作" maxLength={1000} />
      </Form.Item>
      <Form.Item name="date" label="日期"><DatePicker className="maintenance-full-width" allowClear format="YYYY-MM-DD" /></Form.Item>
      <Form.Item name="reportPeriod" label="统计月份" rules={[{ required: true, message: '请选择统计月份' }]}><DatePicker className="maintenance-full-width" picker="month" format="YYYY 年 M 月" /></Form.Item>
      <Form.Item name="personnel" label="维修人员" rules={[{ required: true, type: 'array', min: 1, message: '请选择维修人员' }]}>
        <Select mode="tags" placeholder="选择或输入维修人员" options={peopleOptions} tokenSeparators={['、', '，', ',']} />
      </Form.Item>
      <Form.Item name="department" label="所属部门"><AutoComplete options={departmentOptions} placeholder="选择或输入部门" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
      <Form.Item name="location" label="区域 / 位置"><AutoComplete options={locationOptions} placeholder="选择或输入区域" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
      <Form.Item name="equipmentModel" label="设备型号"><AutoComplete options={modelOptions} placeholder="选择或输入型号" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
      <Form.Item name="workTimeText" hidden><Input /></Form.Item>
      <div className="maintenance-desktop-time"><label>工作时间</label><TimePicker.RangePicker aria-label="选择工作时间" className="maintenance-full-width" format="HH:mm" value={timeRange} open={timePickerOpen} onOpenChange={setTimePickerOpen} inputReadOnly onChange={(range) => {
        const next = range as [Dayjs, Dayjs] | null;
        setCustomTimeMode(true);
        form.setFieldValue('workTimeText', next ? `${next[0].format('HH:mm')}–${next[1].format('HH:mm')}` : '');
      }} />
        <Segmented<TimePreset> block value={timePreset} onChange={setPreset} options={[{ label: '全天', value: 'full' }, { label: '上午', value: 'morning' }, { label: '下午', value: 'afternoon' }, { label: '自定义', value: 'custom' }]} />
      </div>
      <Form.Item name="replacedParts" label="更换配件"><Input placeholder="无" /></Form.Item>
      <Form.Item name="faultType" label="故障类型"><AutoComplete options={typeOptions} placeholder="选择或输入类型" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
      <Form.Item name="faultCause" label="故障原因"><AutoComplete options={causeOptions} placeholder="选择或输入原因" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
      <Form.Item name="isRework" label="是否返工" valuePropName="checked"><Switch /></Form.Item>
      <Form.Item name="remarks" label="备注" className="maintenance-desktop-wide"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可选" /></Form.Item>
      <div className="maintenance-desktop-actions"><Button onClick={onClose}>取消</Button><Button type="primary" htmlType="submit" loading={mutation.isPending} icon={<SaveIcon width={16} height={16} />}>保存修改</Button></div>
    </Form>
  </div>;

  return <div className="maintenance-page maintenance-form-page">
    <div className="maintenance-phone-form">
      <header className="maintenance-phone-header">
        <Button type="text" aria-label={onClose ? '关闭编辑' : '返回上一页'} icon={<ArrowLeftIcon width={20} height={20} />} onClick={() => { if (onClose) onClose(); else navigate(exitPath); }} />
        <strong>{editId ? '编辑维修记录' : '维修登记'}</strong>
        {!editId ? <Button type="text" onClick={saveDraft}>草稿</Button> : <span />}
      </header>
      <Form<FormValues> form={form} layout="vertical" initialValues={EMPTY_FORM} onFinish={submit} className="maintenance-entry-form" requiredMark={false}>
        <section className="maintenance-entry-hero">
          <Form.Item name="workContent" label="做了什么" rules={[{ required: true, whitespace: true, message: '请填写工作内容' }]}>
            <Input.TextArea variant="borderless" autoSize={{ minRows: 3, maxRows: 8 }} placeholder="描述维修、巡检或更换工作" maxLength={1000} />
          </Form.Item>
        </section>

        <section className="maintenance-entry-group" aria-label="基础信息">
          <Form.Item name="date" label="日期" className="maintenance-entry-row" rules={[{ required: !editId, message: '请选择日期' }]}><DatePicker variant="borderless" className="maintenance-full-width" allowClear={!!editId} format="YYYY-MM-DD" onChange={(nextDate) => { if (!editId && nextDate) form.setFieldValue('reportPeriod', nextDate.startOf('month')); }} /></Form.Item>
          <Form.Item name="personnel" label="维修人员" className="maintenance-entry-row" rules={[{ required: true, type: 'array', min: 1, message: '请选择维修人员' }]}><Select variant="borderless" mode="multiple" placeholder="选择维修人员" options={peopleOptions} maxTagCount={2} open={false} onClick={() => openPicker('personnel')} /></Form.Item>
          <Form.Item name="department" label="所属部门" className="maintenance-entry-row"><AutoComplete variant="borderless" options={departmentOptions} placeholder="选择或输入" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
          <Form.Item name="location" label="区域 / 位置" className="maintenance-entry-row"><Input variant="borderless" readOnly placeholder="选择区域" suffix={<ArrowRightIcon width={16} height={16} />} onClick={() => openPicker('location')} /></Form.Item>
          <Form.Item name="equipmentModel" label="设备型号" className="maintenance-entry-row"><AutoComplete variant="borderless" options={modelOptions} placeholder="选择或输入" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
        </section>

        <section className="maintenance-entry-group" aria-label="工作时间和配件">
          <Form.Item name="workTimeText" hidden><Input /></Form.Item>
          <div className="maintenance-entry-time-row"><span>工作时间</span><TimePicker.RangePicker aria-label="选择工作时间" variant="borderless" format="HH:mm" value={timeRange} open={timePickerOpen} onOpenChange={setTimePickerOpen} inputReadOnly onChange={(range) => {
            const next = range as [Dayjs, Dayjs] | null;
            setCustomTimeMode(true);
            form.setFieldValue('workTimeText', next ? `${next[0].format('HH:mm')}–${next[1].format('HH:mm')}` : '');
          }} /></div>
          <div className="maintenance-entry-preset"><Segmented<TimePreset> block value={timePreset} onChange={setPreset} options={[{ label: '全天', value: 'full' }, { label: '上午', value: 'morning' }, { label: '下午', value: 'afternoon' }, { label: '自定义', value: 'custom' }]} /></div>
          <div className="maintenance-entry-parts-row"><Form.Item name="replacedParts" label="更换配件" className="maintenance-entry-row"><Input variant="borderless" placeholder="无" /></Form.Item><Button type="link" icon={<PlusIcon width={16} height={16} />} onClick={() => setPartsOpen(true)}>添加</Button></div>
        </section>

        {/* 需求：填报页不展示这些选填项；保留 DOM（hidden）使字段仍注册在表单里，值随提交上报 */}
        <details className="maintenance-entry-more" hidden><summary>更多信息</summary>
          <section className="maintenance-entry-group" aria-label="其他记录">
            <Form.Item name="reportPeriod" label="统计月份" className="maintenance-entry-row" rules={[{ required: true, message: '请选择统计月份' }]}><DatePicker variant="borderless" className="maintenance-full-width" picker="month" format="YYYY 年 M 月" /></Form.Item>
            <Form.Item name="faultType" label="故障类型" className="maintenance-entry-row"><AutoComplete variant="borderless" options={typeOptions} placeholder="选择或输入" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
            <Form.Item name="faultCause" label="故障原因" className="maintenance-entry-row"><AutoComplete variant="borderless" options={causeOptions} placeholder="选择或输入" filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item>
            <Form.Item name="isRework" label="是否返工" valuePropName="checked" className="maintenance-entry-row maintenance-switch-item"><Switch /></Form.Item>
            <Form.Item name="remarks" label="备注" className="maintenance-entry-notes"><Input.TextArea variant="borderless" autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可选" /></Form.Item>
          </section>
        </details>
        <div className="maintenance-phone-footer"><Button type="primary" block htmlType="submit" loading={mutation.isPending} icon={<SaveIcon width={16} height={16} />}>{editId ? '保存修改' : '提交'}</Button></div>
      </Form>
    </div>

    <Drawer title="添加配件" placement="bottom" height="min(70vh, 28rem)" open={partsOpen} onClose={() => setPartsOpen(false)} className="maintenance-parts-drawer" extra={<Button type="primary" onClick={addPart}>加入</Button>}>
      <div className="maintenance-parts-presets">
        <span>常用配件</span>
        <div>{COMMON_PARTS.map((part) => <button key={part.name} type="button"
          className={partsDraft.name === part.name ? 'is-selected' : ''}
          onClick={() => setPartsDraft((draft) => ({ ...draft, name: part.name, unit: part.unit }))}>
          {part.name}
        </button>)}</div>
      </div>
      <div className="maintenance-parts-fields"><label>名称<Input autoFocus placeholder="配件名称" value={partsDraft.name} onChange={(event) => setPartsDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
        <label>数量<InputNumber min={0.1} step={1} className="maintenance-full-width" value={partsDraft.quantity} onChange={(quantity) => setPartsDraft((draft) => ({ ...draft, quantity: quantity ?? 1 }))} /></label>
        <label>单位<Select value={partsDraft.unit} onChange={(unit) => setPartsDraft((draft) => ({ ...draft, unit }))} options={['个', '片', '套', '台', '根', '米', '件', '只'].map((unit) => ({ value: unit, label: unit }))} /></label>
      </div>
    </Drawer>
    <Drawer placement="bottom" height="min(70vh, 34rem)" title={picker === 'personnel' ? '维修人员' : '区域 / 位置'} open={picker !== null} onClose={() => setPicker(null)} className="maintenance-picker-drawer" extra={picker === 'personnel' ? <Button type="link" onClick={() => setPicker(null)}>完成</Button> : null}>
      <Input.Search allowClear aria-label={picker === 'personnel' ? '搜索维修人员' : '搜索区域'} placeholder={picker === 'personnel' ? '搜索或输入姓名' : '搜索或输入区域'} value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} onPressEnter={() => {
        const value = pickerSearch.trim();
        if (!value) return;
        if (picker === 'personnel') { if (!selectedPersonnel.includes(value)) togglePerson(value); setPickerSearch(''); }
        else chooseLocation(value);
      }} />
      <div className="maintenance-picker-options">
        {picker === 'personnel' ? <>
          {selectedPeople.length > 0 && <div className="maintenance-picker-section">已选</div>}
          {selectedPeople.map(personOption)}
          {suggestedPeople.length > 0 && <div className="maintenance-picker-section">常一起</div>}
          {suggestedPeople.map(personOption)}
          {otherPeople.length > 0 && <div className="maintenance-picker-section">全部</div>}
          {otherPeople.map(personOption)}
        </> : <>
          {recentMatches.length > 0 && <div className="maintenance-picker-section">最近区域</div>}
          {recentMatches.map(locationOption)}
          {otherLocations.length > 0 && <div className="maintenance-picker-section">全部区域</div>}
          {otherLocations.map(locationOption)}
        </>}
      </div>
    </Drawer>
  </div>;
}
