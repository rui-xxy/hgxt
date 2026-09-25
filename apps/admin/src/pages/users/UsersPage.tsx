import { useState } from 'react';
import { App, Badge, Button, Card, Flex, Input, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Role, UserStatus, type UserDTO } from '@hgxt/shared';
import { useUsers } from '../../api/hooks';
import { createUserApi, resetPasswordApi, updateUserApi, updateUserStatusApi } from '../../api/users';
import { UserFormModal, type UserFormValues } from './UserFormModal';
import { ResetPasswordModal } from './ResetPasswordModal';

const { Title } = Typography;

const roleText: Record<string, string> = {
  [Role.SUPER_ADMIN]: '管理员',
  [Role.USER]: '普通用户',
};

/** 用户管理：搜索 + 列表 + 新增/编辑/禁用/重置密码 */
export function UsersPage() {
  const { message } = App.useApp();
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
    onSuccess: async () => {
      message.success('用户信息已更新');
      await invalidateUsers();
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
    },
    onError: (error) => message.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      resetPasswordApi(id, { newPassword }),
    onSuccess: async () => {
      message.success('密码已重置，该用户的登录状态已全部失效');
      await invalidateUsers();
      setResettingUser(null);
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
      width: 160,
      render: (username: string) => <span className="mono">{username}</span>,
    },
    { title: '姓名', dataIndex: 'name', width: 140 },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
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
      width: 100,
      render: (status: UserDTO['status']) =>
        status === UserStatus.ACTIVE ? (
          <Badge status="success" text="正常" />
        ) : (
          <Badge status="default" text="已禁用" />
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: UserDTO) => {
        const active = record.status === UserStatus.ACTIVE;
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
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginTop: 0, marginBottom: 16 }}>
        用户管理
      </Title>
      <Card>
        <Flex justify="space-between" style={{ marginBottom: 16 }}>
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
        </Flex>
        <Table<UserDTO>
          rowKey="id"
          columns={columns}
          dataSource={usersQuery.data?.items}
          loading={usersQuery.isPending}
          pagination={{
            current: page,
            pageSize,
            total: usersQuery.data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
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
