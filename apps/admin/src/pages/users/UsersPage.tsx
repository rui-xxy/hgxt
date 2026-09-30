import { useState } from 'react';
import { App, Button, Dropdown, Input, Table, type MenuProps, type TableColumnsType } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Role, UserStatus, type UserDTO } from '@hgxt/shared';
import { useMe, useUsers } from '../../api/hooks';
import { createUserApi, deleteUserApi, resetPasswordApi, updateUserApi, updateUserStatusApi } from '../../api/users';
import { PageHeader } from '../../components/PageHeader';
import {
  BanIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UserCheckIcon,
} from '../../components/icons';
import { UserFormModal, type UserFormValues } from './UserFormModal';
import { ResetPasswordModal } from './ResetPasswordModal';

const roleText: Record<string, string> = {
  [Role.SUPER_ADMIN]: '管理员',
  [Role.USER]: '普通用户',
};

/**
 * 用户管理：HGXT 数据工作区模板（规范见 docs/ui-mapping.md「页面模板」）——
 * PageHeader（标题 + 计数 + 主操作）→ 同一表面内的 Toolbar（搜索 + 计数）与 Table。
 * 低频 / 危险操作（禁用、启用、删除）收进行尾「更多」菜单，均需二次确认。
 */
export function UsersPage() {
  const { message, modal } = App.useApp();
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

  const confirmStatusChange = (record: UserDTO) => {
    const active = record.status === UserStatus.ACTIVE;
    modal.confirm({
      title: active ? `禁用 ${record.name}？` : `启用 ${record.name}？`,
      content: active ? '禁用后该用户将立即退出登录且无法再登录。' : '启用后该用户可以重新登录。',
      icon: <span className={`hg-confirm-icon ${active ? 'hg-confirm-icon-danger' : ''}`}>{active ? <BanIcon /> : <UserCheckIcon />}</span>,
      okText: active ? '禁用' : '启用',
      okButtonProps: active ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: async () => {
        try {
          await statusMutation.mutateAsync({
            id: record.id,
            status: active ? UserStatus.DISABLED : UserStatus.ACTIVE,
          });
        } catch {
          // 失败提示已由 onError 的 message 呈现
        }
      },
    });
  };

  const confirmDelete = (record: UserDTO) => {
    modal.confirm({
      title: `删除 ${record.name}（${record.username}）？`,
      content: '删除后不可恢复。该用户的表单提交记录会保留（提交人显示为空），但账号和登录会话将被彻底移除。',
      icon: <span className="hg-confirm-icon hg-confirm-icon-danger"><TrashIcon /></span>,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteMutation.mutateAsync(record.id);
        } catch {
          // 失败提示已由 onError 的 message 呈现
        }
      },
    });
  };

  const columns: TableColumnsType<UserDTO> = [
    {
      title: '用户',
      dataIndex: 'username',
      width: 220,
      render: (_: string, record) => (
        <div className="hg-cell-user">
          <span className="hg-avatar">{record.name.charAt(0)}</span>
          <div className="hg-cell-stack">
            <span className="hg-cell-primary">
              {record.name}
              {record.id === me.data?.id ? <span className="hg-cell-self">你</span> : null}
            </span>
            <span className="hg-cell-secondary mono">{record.username}</span>
          </div>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (role: UserDTO['role']) =>
        <span className={role === Role.SUPER_ADMIN ? 'hg-badge hg-badge-strong' : 'hg-badge'}>{roleText[role]}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      // 状态语义：颜色 + 文字双重表达
      render: (status: UserDTO['status']) =>
        status === UserStatus.ACTIVE ? (
          <span className="hg-status-dot hg-status-dot-success">正常</span>
        ) : (
          <span className="hg-status-dot">已禁用</span>
        ),
    },
    {
      // 关键业务列伸缩填充宽度，超长省略（避免右侧大片空白）
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: true,
      render: (email: string | null) =>
        email ? <span className="hg-cell-muted">{email}</span> : <span className="hg-cell-empty">—</span>,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 140,
      render: (phone: string | null) =>
        phone ? <span className="tabular hg-cell-muted">{phone}</span> : <span className="hg-cell-empty">—</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (createdAt: string) => (
        <span className="tabular hg-cell-muted">{dayjs(createdAt).format('YYYY-MM-DD HH:mm')}</span>
      ),
    },
    {
      title: <span className="hg-sr-only">操作</span>,
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: unknown, record: UserDTO) => {
        const active = record.status === UserStatus.ACTIVE;
        const isSelf = record.id === me.data?.id;
        const busy =
          (statusMutation.isPending && statusMutation.variables?.id === record.id) ||
          (deleteMutation.isPending && deleteMutation.variables === record.id);
        const moreItems: MenuProps['items'] = [
          active
            ? { key: 'disable', label: '禁用账号', icon: <BanIcon />, danger: true }
            : { key: 'enable', label: '启用账号', icon: <UserCheckIcon /> },
          ...(isSelf
            ? []
            : [
                { type: 'divider' as const },
                { key: 'delete', label: '删除用户', icon: <TrashIcon />, danger: true },
              ]),
        ];
        return (
          <div className="hg-row-actions">
            <Button
              type="text"
              size="small"
              onClick={() => {
                setEditingUser(record);
                setFormOpen(true);
              }}
            >
              编辑
            </Button>
            <Button type="text" size="small" onClick={() => setResettingUser(record)}>
              重置密码
            </Button>
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: moreItems,
                onClick: ({ key }) => {
                  if (key === 'delete') confirmDelete(record);
                  else confirmStatusChange(record);
                },
              }}
            >
              <Button type="text" size="small" icon={<MoreIcon />} loading={busy} aria-label={`${record.name} 的更多操作`} />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="用户管理"
        meta={usersQuery.data ? usersQuery.data.total : undefined}
        extra={
          <Button
            type="primary"
            icon={<PlusIcon />}
            onClick={() => {
              setEditingUser(null);
              setFormOpen(true);
            }}
          >
            新增用户
          </Button>
        }
      />
      <div className="hg-list">
        <div className="hg-toolbar">
          <Input
            allowClear
            variant="filled"
            className="hg-search"
            prefix={<SearchIcon />}
            placeholder="搜索用户名、姓名、手机或邮箱"
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value);
              // 清空即恢复全部
              if (!event.target.value) {
                setKeyword('');
                setPage(1);
              }
            }}
            onPressEnter={() => {
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
          />
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
            size: 'small',
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </div>

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
