import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import type { UserDTO } from '@hgxt/shared';

interface ResetPasswordValues {
  newPassword: string;
  confirm: string;
}

interface ResetPasswordModalProps {
  user: UserDTO | null;
  onCancel: () => void;
  onSubmit: (userId: string, newPassword: string) => Promise<void>;
}

/** 重置密码：重置成功后该用户全部会话失效 */
export function ResetPasswordModal({ user, onCancel, onSubmit }: ResetPasswordModalProps) {
  const [form] = Form.useForm<ResetPasswordValues>();
  const open = Boolean(user);

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    if (!user) return;
    await onSubmit(user.id, values.newPassword);
  };

  return (
    <Modal
      title={`重置密码${user ? ` - ${user.name}（${user.username}）` : ''}`}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="重置"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '密码至少 8 位' },
            { max: 128 },
          ]}
        >
          <Input.Password placeholder="至少 8 位" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || value === getFieldValue('newPassword')) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="再输入一次" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
