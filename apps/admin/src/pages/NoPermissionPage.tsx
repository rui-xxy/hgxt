import { Button } from 'antd';
import { Link } from 'react-router';
import { ArrowLeftIcon, LockIcon } from '../components/icons';
import { StatusView } from '../components/StatusView';

export function NoPermissionPage({ showReturn = true }: { showReturn?: boolean }) {
  return (
    <StatusView
      icon={<LockIcon />}
      title="无权访问"
      description="当前账号没有访问该页面的权限，如需开通请联系管理员。"
      actions={showReturn ?
        <Link to="/">
          <Button icon={<ArrowLeftIcon />}>返回首页</Button>
        </Link> : undefined}
    />
  );
}
