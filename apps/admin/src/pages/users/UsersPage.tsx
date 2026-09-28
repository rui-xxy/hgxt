import { useState } from 'react';
import { App, Badge, Button, Card, Input, Popconfirm, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Role, UserStatus, type UserDTO } from '@hgxt/shared';
import { useMe, useUsers } from '../../api/hooks';
import { createUserApi, deleteUserApi, resetPasswordApi, updateUserApi, updateUserStatusApi } from '../../api/users';
import { PageHeader } from '../../components/PageHeader';
import { UserFormModal, type UserFormValues } from './UserFormModal';
import { ResetPasswordModal } from './ResetPasswordModal';

const roleText: Record<string, string> = {
  [Role.SUPER_ADMIN]: '管理员',
  [Role.USER]: '普通用户',
};

/**
 * 用户管理：HGXT 数据工作区模板（规范见 docs/ui-mapping.md「页面模板」）——
 * PageHeader（标题 + 说明 + 主操作）→ 同一表面内的 Toolbar（搜索 + 计数）与 Table。
 */
export function UsersPage() {
  const { message } = App.useApp();
  const me = useMe();
  const queryClient = useQueryClient();

  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null);
  const [resettingUser, setResettingUser] = useState<UserDTO | null>(null);

  const usersQuery = useUsers({ page, pageSize, keyword });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  /** 变更目标是当前登录用户时，同步刷新 me（角色/姓名变化立即反映到顶栏与权限判断） */
  const invalidateMeIfNeeded = (targetUserId?: string) => {
    if (targetUserId && targetUserId === me.data?.id) {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const createMutation = useMutation({
    mutationFn: createUserApi,
    onSuccess: async (user) => {
      message.success(`用户 ${user.username} 已创建`);
      await invalidateUsers();
      setFormOpen(false);
    },
    onError: (error) => message.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UserFormValues }) =>
      updateUserApi(id, {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        role: values.role,
      }),
    onSuccess: async (user) => {
      message.success('用户信息已更新');
      await invalidateUsers();
      invalidateMeIfNeeded(user.id);
      setFormOpen(false);
    },
    onError: (error) => message.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      updateUserStatusApi(id, status),
    onSuccess: async (user) => {
      message.success(user.status === UserStatus.ACTIVE ? `已启用 ${user.username}` : `已禁用 ${user.username}`);
      await invalidateUsers();
      invalidateMeIfNeeded(user.id);
    },
    onError: (error) => message.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      resetPasswordApi(id, { newPassword }),
    onSuccess: async (user) => {
      message.success('密码已重置，该用户的登录状态已全部失效');
      await invalidateUsers();
      invalidateMeIfNeeded(user.id);
      setResettingUser(null);
    },
    onError: (error) => message.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUserApi(id),
    onSuccess: async () => {
      message.success('用户已删除');
      await invalidateUsers();
    },
    onError: (error) => message.error(error.message),
  });

  const handleSubmit = async (values: UserFormValues, editing: boolean) => {
    if (editing && editingUser) {
      await updateMutation.mutateAsync({ id: editingUser.id, values });
    } else {
      await createMutation.mutateAsync({
        username: values.username,
        name: values.name,
        password: values.password ?? '',
        email: values.email || undefined,
        phone: values.phone || undefined,
        role: values.role,
      });
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      width: 150,
      render: (username: string) => <span className="mono">{username}</span>,
    },
    { title: '姓名', dataIndex: 'name', width: 120 },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (role: UserDTO['role']) =>
        role === Role.SUPER_ADMIN ? (
          <Tag color="gold">{roleText[role]}</Tag>
        ) : (
          <Tag>{roleText[role]}</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: UserDTO['status']) =>
        status === UserStatus.ACTIVE ? (
          <Badge status="success" text="正常" />
        ) : (
          <Badge status="default" text="已禁用" />
        ),
    },
    {
      // 关键业务列伸缩填充宽度，超长省略（避免右侧大片空白）
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: true,
      render: (email: string | null) => email ?? <span style={{ color: 'var(--ant-color-text-tertiary)' }}>—</span>,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 130,
      render: (phone: string | null) => phone ?? <span style={{ color: 'var(--ant-color-text-tertiary)' }}>—</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 150,
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 260,
      render: (_: unknown, record: UserDTO) => {
        const active = record.status === UserStatus.ACTIVE;
        const isSelf = record.id === me.data?.id;
        return (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setEditingUser(record);
                setFormOpen(true);
              }}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setResettingUser(record);
              }}
            >
              重置密码
            </Button>
            <Popconfirm
              title={active ? `确定禁用 ${record.name}？` : `确定启用 ${record.name}？`}
              description={active ? '禁用后该用户将立即退出登录且无法再登录。' : undefined}
              okText={active ? '禁用' : '启用'}
              okButtonProps={active ? { danger: true } : undefined}
              cancelText="取消"
              disabled={statusMutation.isPending}
              onConfirm={() =>
                statusMutation.mutate({
                  id: record.id,
                  status: active ? UserStatus.DISABLED : UserStatus.ACTIVE,
                })
              }
            >
              <Button
                type="link"
                size="small"
                danger={active}
                loading={statusMutation.isPending && statusMutation.variables?.id === record.id}
              >
                {active ? '禁用' : '启用'}
              </Button>
            </Popconfirm>
            {!isSelf && (
              <Popconfirm
                title={`确定删除 ${record.name}（${record.username}）？`}
                description="删除后不可恢复。该用户的表单提交记录会保留（提交人显示为空），但账号和登录会话将被彻底移除。"
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                disabled={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate(record.id)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  loading={deleteMutation.isPending && deleteMutation.variables === record.id}
                >
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="用户管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingUser(null);
              setFormOpen(true);
            }}
          >
            新增用户
          </Button>
        }
      />
      <Card styles={{ body: { padding: 0 } }}>
        <div className="hgxt-toolbar">
          <Input.Search
            allowClear
            placeholder="搜索：用户名 / 姓名 / 手机 / 邮箱"
            style={{ width: 300 }}
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) => {
              setKeyword(value);
              setPage(1);
            }}
          />
          <span className="hgxt-toolbar-meta">共 {usersQuery.data?.total ?? 0} 条</span>
        </div>
        <Table<UserDTO>
          rowKey="id"
          columns={columns}
          dataSource={usersQuery.data?.items}
          loading={usersQuery.isPending}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total: usersQuery.data?.total ?? 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <UserFormModal
        open={formOpen}
        initial={editingUser}
        submitting={createMutation.isPending || updateMutation.isPending}
        onCancel={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
      <ResetPasswordModal
        user={resettingUser}
        submitting={resetMutation.isPending}
        onCancel={() => setResettingUser(null)}
        onSubmit={async (id, newPassword) => {
          await resetMutation.mutateAsync({ id, newPassword });
        }}
      />
    </div>
  );
}
