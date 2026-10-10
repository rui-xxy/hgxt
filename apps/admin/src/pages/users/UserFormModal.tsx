import { useEffect } from 'react';
import { Checkbox, Flex, Form, Input, Modal, Select } from 'antd';
import { CURRENT_DEPARTMENTS, PagePermission, Role, type PagePermission as PagePermissionType, type UserDTO } from '@hgxt/shared';

const PAGE_OPTIONS: { label: string; value: PagePermissionType }[] = [
  { label: '计划与完成', value: PagePermission.PLAN },
  { label: '经营简报', value: PagePermission.BRIEF },
  { label: '设备与维修', value: PagePermission.MAINTENANCE },
];

export interface UserFormValues {
  username: string;
  name: string;
  password?: string;
  phone?: string;
  department?: string | null;
  role: Role;
  pagePermissions: PagePermissionType[];
}

interface UserFormModalProps {
  open: boolean;
  /** 有值 = 编辑模式 */
  initial?: UserDTO | null;
  /** D3：提交进行中（禁用确认按钮，防重复提交） */
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (values: UserFormValues, editing: boolean) => Promise<void>;
}

/** 新增 / 编辑用户（编辑时 username 不可改、不涉及密码） */
export function UserFormModal({ open, initial, submitting, onCancel, onSubmit }: UserFormModalProps) {
  const [form] = Form.useForm<UserFormValues>();
  const editing = Boolean(initial);
  const role = Form.useWatch('role', form);

  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initial) {
        form.setFieldsValue({
          username: initial.username,
          name: initial.name,
          phone: initial.phone ?? '',
          department: initial.department ?? null,
          role: initial.role,
          pagePermissions: initial.pagePermissions,
        });
      }
    }
  }, [open, initial, form]);

  const handleOk = async () => {
    if (submitting) return;
    try {
      const values = await form.validateFields();
      await onSubmit(values, editing);
    } catch {
      // 校验失败或提交失败：保持弹窗打开，错误信息由校验器 / message 呈现
    }
  };

  return (
    <Modal
      title={editing ? '编辑用户' : '新增用户'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ role: Role.USER, pagePermissions: [] }}>
        <Form.Item
          name="username"
          label="用户名"
          rules={[
            { required: true, message: '请输入用户名' },
            {
              pattern: /^[a-zA-Z0-9_-]{2,64}$/,
              message: '2-64 位字母、数字、下划线或横线',
            },
          ]}
          extra={editing ? '用户名创建后不可修改' : undefined}
        >
          <Input placeholder="登录用户名" disabled={editing} />
        </Form.Item>
        <Form.Item
          name="name"
          label="姓名"
          rules={[{ required: true, message: '请输入姓名' }, { max: 64 }]}
        >
          <Input placeholder="姓名" />
        </Form.Item>
        {!editing && (
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 8, message: '密码至少 8 位' },
              { max: 128 },
            ]}
          >
            <Input.Password placeholder="至少 8 位" />
          </Form.Item>
        )}
        <Form.Item name="phone" label="手机号" rules={[{ max: 32 }]}>
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="department" label="部门">
          <Select
            allowClear
            placeholder="选填（访问监控按部门统计）"
            options={CURRENT_DEPARTMENTS.map((name) => ({ value: name, label: name }))}
          />
        </Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
          <Select
            options={[
              { value: Role.USER, label: '普通用户' },
              { value: Role.ADMIN, label: '管理员' },
              { value: Role.SUPER_ADMIN, label: '超级管理员' },
            ]}
          />
        </Form.Item>
        {role !== Role.SUPER_ADMIN && <Form.Item
          name="pagePermissions"
          label="可访问页面"
          extra="经营简报与计划与完成分别授权；车间版面、能源中心和物料与库存对所有登录用户开放。"
        >
          <Checkbox.Group>
            <Flex vertical gap="small">
              {PAGE_OPTIONS.map((option) => <Checkbox key={option.value} value={option.value}>{option.label}</Checkbox>)}
            </Flex>
          </Checkbox.Group>
        </Form.Item>}
        {role === Role.SUPER_ADMIN && <div className="hgxt-muted">超级管理员可以访问全部页面，包括访问监控与成员管理。</div>}
      </Form>
    </Modal>
  );
}
