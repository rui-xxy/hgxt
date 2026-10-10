import { Link } from 'react-router';
import { PagePermission, Role, type PagePermission as PagePermissionType } from '@hgxt/shared';
import { useMe } from '../api/hooks';
import { BriefIcon, FactoryIcon, FormsNavIcon, PackageIcon, SunIcon, SystemNavIcon, TargetIcon, WrenchIcon } from '../components/icons';

interface AppEntry {
  name: string;
  desc: string;
  path: string;
  icon: typeof FormsNavIcon;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  permission?: PagePermissionType;
}

const APPS: AppEntry[] = [
  { name: '全部表单', desc: '表单与报表数据', path: '/forms', icon: FormsNavIcon, adminOnly: true },
  { name: '车间版面', desc: '生产看板', path: '/board', icon: FactoryIcon },
  { name: '经营简报', desc: '生产、销售与库存概览', path: '/brief', icon: BriefIcon, permission: PagePermission.BRIEF },
  { name: '能源中心', desc: '能源消耗', path: '/energy', icon: SunIcon },
  { name: '物料与库存', desc: '库存数据', path: '/materials', icon: PackageIcon },
  { name: '计划与完成', desc: '生产计划进度', path: '/plan', icon: TargetIcon, permission: PagePermission.PLAN },
  { name: '设备', desc: '维修总览', path: '/maintenance', icon: WrenchIcon, permission: PagePermission.MAINTENANCE },
  { name: '系统', desc: '成员与账号管理', path: '/users', icon: SystemNavIcon, superAdminOnly: true },
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
  const isSuperAdmin = me.data?.role === Role.SUPER_ADMIN;
  const isAdmin = isSuperAdmin || me.data?.role === Role.ADMIN;
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <>
      <h1 className="hgxt-greeting">
        {greeting()}，{me.data?.name ?? ''}
      </h1>
      <div className="hgxt-page-sub">{today}</div>
      <h2 className="hgxt-section-title">应用</h2>
      <div className="hgxt-appgrid">
        {APPS.filter((app) => (!app.adminOnly || isAdmin) && (!app.superAdminOnly || isSuperAdmin) && (!app.permission || isSuperAdmin || me.data?.pagePermissions.includes(app.permission))).map((app) => (
          <Link key={app.path} to={app.path} className="hgxt-appcard">
            <span className="hgxt-appicon">
              <app.icon width={20} height={20} strokeWidth={1.6} />
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
