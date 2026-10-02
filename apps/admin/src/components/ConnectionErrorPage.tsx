<<<<<<< HEAD
import { Button, Result } from 'antd';
import { RotateCw } from 'lucide-react';
=======
import { Button } from 'antd';
import { RefreshIcon, WifiOffIcon } from './icons';
import { StatusView } from './StatusView';
>>>>>>> claude/exciting-shannon-u2nwwv

/**
 * D1：网络/服务器错误页。后端未启动、断网、5xx 都不是「登录失效」，
 * 不跳登录页、不清 token——给用户一个明确的重新入口。
 */
export function ConnectionErrorPage({ message }: { message: string }) {
  return (
    <StatusView
      fullscreen
      tone="danger"
      icon={<WifiOffIcon />}
      title="无法连接服务器"
<<<<<<< HEAD
      subTitle={message}
      extra={
        <Button type="primary" icon={<RotateCw size={16} strokeWidth={1.6} />} onClick={() => window.location.reload()}>
=======
      description={message}
      actions={
        <Button type="primary" icon={<RefreshIcon />} onClick={() => window.location.reload()}>
>>>>>>> claude/exciting-shannon-u2nwwv
          重新加载
        </Button>
      }
    />
  );
}
