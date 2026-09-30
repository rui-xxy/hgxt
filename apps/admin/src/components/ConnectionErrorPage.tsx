import { Button, Result } from 'antd';
import { RotateCw } from 'lucide-react';

/**
 * D1：网络/服务器错误页。后端未启动、断网、5xx 都不是「登录失效」，
 * 不跳登录页、不清 token——给用户一个明确的重新入口。
 */
export function ConnectionErrorPage({ message }: { message: string }) {
  return (
    <Result
      status="warning"
      title="无法连接服务器"
      subTitle={message}
      extra={
        <Button type="primary" icon={<RotateCw size={16} strokeWidth={1.6} />} onClick={() => window.location.reload()}>
          重新加载
        </Button>
      }
    />
  );
}
