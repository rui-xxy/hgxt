# 服务器部署变更记录（2026-10-06）

本次在服务器（8.129.88.214）部署时，相对仓库原始代码做了以下代码改动。
均为本地部署环境所需，升级版本合并代码时请保留这些改动（或按同样思路重新处理）。

---

## 1. 修复 HTTP 直连部署白屏问题

**文件**：`apps/api/src/main.ts`

**问题**：helmet 默认 CSP 含 `upgrade-insecure-requests`，纯 HTTP 访问时浏览器会把页面全部静态资源强制升级为 https 加载，而本服务不提供 TLS（3001 端口），导致资源全部加载失败、页面白屏。

**改动**：生产 CSP directives 中显式关闭该项：

```ts
directives: {
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  upgradeInsecureRequests: null, // 纯 HTTP 直连部署必须关闭；HTTPS 反代部署可去掉此行
},
```

> 日后若上了 HTTPS 反向代理，可删除 `upgradeInsecureRequests: null` 这一行。

---

## 2. 表单填写免登录（所有 form-fill 链接可直接填报）

**背景**：业务要求所有表单填写页通过链接直接访问，无需登录。

### 2.1 后端 `apps/api/src/forms/forms.controller.ts`

三个填报接口加 `@Public()`：

| 接口 | 说明 |
| --- | --- |
| `GET /api/forms/:id` | 表单定义（匿名可读） |
| `POST /api/forms/:id/submissions` | 提交填报（匿名可写，**IP 限流 20 次/分钟**） |
| `GET /api/forms/:id/submissions/latest` | 上次值参考（匿名可读） |

提交接口加了 `ThrottlerGuard` + `@Throttle({ default: { limit: 20, ttl: 60_000 } })` + `ThrottlerExceptionFilter` 防灌水；`@CurrentUser() user?` 改为可选。

### 2.2 后端 `apps/api/src/forms/forms.service.ts`

`createSubmission` 的 `submitterId` 参数类型改为 `string | null`（数据库字段本就可空，匿名提交不关联账号）。

### 2.3 前端 `apps/admin/src/App.tsx`

`form-fill/:id` 路由移出 `<RequireAuth>`，作为顶层公开路由。

---

## 3. 设备维修登记免登录

**背景**：「设备维修登记」表单（code=`maintenance_log`）的填写页会跳转到 `/maintenance/new` 专用登记页，该页原本在登录守卫 + 页面权限（`PagePermission.MAINTENANCE`）之下。

### 3.1 后端 `apps/api/src/maintenance/maintenance.controller.ts`

`POST /api/maintenance/records`（新增维修登记）加 `@Public()` + IP 限流（20 次/分钟）。

### 3.2 后端 `apps/api/src/common/guards/page-permission.guard.ts`

`PagePermissionGuard` 增加 `@Public()` 判断：标记公开的接口跳过页面权限校验（与 `JwtAuthGuard` 行为对齐）。

### 3.3 前端 `apps/admin/src/App.tsx`

新增顶层路由与入口网关：

```tsx
<Route path="maintenance/new" element={<MaintenanceNewGate />} />
```

`MaintenanceNewGate`：无 token（匿名）→ 直接渲染登记页；已登录 → 走原 `AdminLayout` 布局 + `RequirePageAccess` 权限校验的版本，登录用户体验不变。

### 3.4 前端 `apps/admin/src/api/maintenance.ts`

`list` / `listYear` / `create` 请求改为 `auth: false`——匿名访问时 401 不触发全局登出跳登录，仅表现为无历史联想数据。

### 3.5 前端 `apps/admin/src/api/hooks.ts`

`useMe(enabled = true)` 增加参数，可禁止发起 `/api/auth/me` 请求（匿名下 401 会触发全局跳登录）。

### 3.6 前端 `apps/admin/src/pages/MaintenanceNewPage.tsx`

- `useMe(!!editId)`：仅编辑模式（需管理员）才查询登录态，匿名登记不查；
- 历史记录加载失败不再整页报错：`query.error && tokenStore.getAccessToken()` 才显示「维修数据加载失败」，匿名登记继续填报。

---

## 3A. 维修登记预设功能（开发机版本合并 + 匿名适配）

**来源**：开发机产出的新版维修登记页（`/root/维修表单预设修改代码.md`），整体替换了
`apps/admin/src/pages/MaintenanceNewPage.tsx` 和 `apps/admin/src/pages/maintenance.css`（CSS 为纯新增样式）。

**新增功能**：

- **常用配件预设**：「添加配件」抽屉内置快捷选项（`COMMON_PARTS` 常量）——软联接膜片（片）、机械密封（套）、联轴器弹性圈（个），点选自动填名称和单位；
- **维修人员快捷分组**：选人抽屉分「已选 / 常一起（按历史记录统计常搭档的人，取前 5）/ 全部」；
- **区域快捷分组**：选区域抽屉分「最近区域 / 全部区域」，选择区域后自动带出所属部门（`departmentOfLocation` 按历史记录统计）。

> 注意：开发机版本基于免登录改动之前的代码，合并时**重新应用了 3.3–3.6 的三处匿名适配**
> （`tokenStore` 导入、`useMe(!!editId)`、错误提示仅对已登录用户阻断）。日后从开发机同步此文件时同样需要重新应用。

## 3B. 匿名登记的联想选项数据（后来补充）

**问题**：预设的人员/部门/区域等快捷选项全部来自历史维修记录，而完整记录接口
`GET /api/maintenance/records` 保持需要登录（含日期、工作内容、备注等明细），匿名用户拿不到，选项为空。

**方案**：新增公开的「仅选项字段」接口，匿名也能看到全部快捷选项。

- 后端 `apps/api/src/maintenance/maintenance.service.ts`：新增 `optionRows()`，只查询
  `personnel / department / location / equipmentModel / faultType / faultCause` 六个分类字段；
- 后端 `apps/api/src/maintenance/maintenance.controller.ts`：新增 `@Public() GET /api/maintenance/options`；
- 前端 `apps/admin/src/api/maintenance.ts`：新增 `maintenanceApi.options()` 与
  `MaintenanceOptionsRow` 类型（`auth: false`）；
- 前端 `apps/admin/src/pages/MaintenanceNewPage.tsx`：登记页数据源按登录态切换——
  已登录拉全量记录（「常一起」共事推荐可用），匿名拉选项接口（无「常一起」，其余分组正常）。

---

## 4. 权限边界（改动后仍需登录的部分）

- 表单列表、历史提交数据管理（仅 SUPER_ADMIN）
- 维修记录完整列表 / 修改 / 删除（修改删除仅 SUPER_ADMIN）；匿名仅可读 3B 的选项字段接口
- 用户管理、后台全部管理页面
- 匿名提交的数据 `submitterId` 为空，不关联员工账号

## 5. 部署环境差异（非代码，运维备忘）

- Node v24.18.0 装在 `/usr/local/node`，pnpm 10.33.0
- 数据库复用服务器现有 **PostgreSQL 16**（开发环境为 Docker PG18；备份恢复时用 `postgresql-client-18` 的 `pg_restore` 转纯 SQL 导入，并删除了 PG18 特有的 `SET transaction_timeout`）
- 代码位于 `/opt/hgxt/app`，运行账号 `hgxt`，systemd 服务 `hgxt-api`（WorkingDirectory 按实际路径调整为 `/opt/hgxt/app/apps/api`）
- 数据库密码 / JWT 密钥见服务器 `/root/hgxt-deploy-credentials.txt`（勿提交 git）

## 6. 验收

- `pnpm lint` / `pnpm typecheck` / `pnpm build` 全绿
- `pnpm test`：API 84 个集成测试 + 前端 40 个测试全部通过
- 匿名实测：form-fill 页 200、表单定义/提交接口免登录、维修登记提交免登录、`/api/maintenance/options` 返回选项数据；完整维修记录等管理接口仍 401
