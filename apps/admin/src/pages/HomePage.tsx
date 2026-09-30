import { Link } from 'react-router';
import { FlaskConical, Users, type LucideIcon } from 'lucide-react';
import { Role } from '@hgxt/shared';
import { useMe } from '../api/hooks';

interface AppEntry {
  name: string;
  desc: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const APPS: AppEntry[] = [
  { name: '生产', desc: '日报填写、报表数据', path: '/forms', icon: FlaskConical },
  { name: '系统', desc: '成员与账号管理', path: '/users', icon: Users, adminOnly: true },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** 首页 = 所有模块的启动台（design/01）；只列真实存在的模块，不做假数据 */
export function HomePage() {
  const me = useMe();
  const isAdmin = me.data?.role === Role.SUPER_ADMIN;
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <>
      <h1 className="hgxt-greeting">
        {greeting()}，{me.data?.name ?? ''}
      </h1>
      <div className="hgxt-page-sub">{today}</div>
      <h2 className="hgxt-section-title">应用</h2>
      <div className="hgxt-appgrid">
        {APPS.filter((app) => !app.adminOnly || isAdmin).map((app) => (
          <Link key={app.path} to={app.path} className="hgxt-appcard">
            <span className="hgxt-appicon">
              <app.icon size={20} strokeWidth={1.6} />
            </span>
            <span>
              <div className="hgxt-appcard-name">{app.name}</div>
              <div className="hgxt-appcard-desc">{app.desc}</div>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
