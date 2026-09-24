import { Button, Result } from 'antd';
import { Link } from 'react-router';

export function NoPermissionPage() {
  return (
    <Result
      status="403"
      title="无权访问"
      subTitle="当前账号没有访问该页面的权限，如需开通请联系管理员。"
      extra={
        <Button type="primary">
          <Link to="/">返回首页</Link>
        </Button>
      }
    />
  );
}
