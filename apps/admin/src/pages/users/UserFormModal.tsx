import { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import { Role, type UserDTO } from '@hgxt/shared';

export interface UserFormValues {
  username: string;
  name: string;
  password?: string;
  email?: string;
  phone?: string;
  role: Role;
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

  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initial) {
        form.setFieldsValue({
          username: initial.username,
          name: initial.name,
          email: initial.email ?? '',
          phone: initial.phone ?? '',
          role: initial.role,
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
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ role: Role.USER }}>
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
        <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="phone" label="手机号" rules={[{ max: 32 }]}>
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
          <Select
            options={[
              { value: Role.USER, label: '普通用户' },
              { value: Role.SUPER_ADMIN, label: '管理员' },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
