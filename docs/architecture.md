# HGXT 架构决策记录（V1）

本文档记录已冻结的技术选型与关键取舍。**技术栈不轻易更换**，后续业务在此地基上生长。

## 冻结的技术栈（2026-09）

| 层 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 运行环境 | Node.js | 24 LTS（已验证 v24.18.0） | |
| 项目组织 | pnpm Workspace Monorepo | pnpm 10 | 前后端一个仓库 |
| 语言 | TypeScript | 5.9 | 前后端统一 |
| 后台前端 | React + Vite | React 19 / Vite 8 | |
| UI 组件 | Ant Design | 6.6.x | 按 DESIGN.md 规范映射主题（见 docs/ui-mapping.md） |
| 路由 | React Router | 8 | |
| 请求 | TanStack Query | 5 | |
| 后端 | NestJS | 12 | |
| API 风格 | REST | — | 不用 GraphQL |
| ORM | Prisma | **7**（锁 7.x，不用 8） | Prisma 8 尚处 RC |
| 数据库 | PostgreSQL | 18（Docker 容器，宿主机 5433 端口） | 5432 被其他项目（hgbord）占用 |
| 接口文档 | Swagger / OpenAPI | @nestjs/swagger | 挂在 `/api/docs` |
| 密码哈希 | Argon2id（@node-rs/argon2） | OWASP 参数：19 MiB / timeCost 2 / 并行 1 | Windows 下免编译 |
| 认证 | JWT Access（15 分钟）+ 不透明 Refresh（7 天，轮换式） | HS256 | Refresh 只存 sha256 |

## Prisma 7 的两个新约定（与老教程不同）

1. `schema.prisma` 的 `datasource` 里**不再写 url**；连接串在 `apps/api/prisma.config.ts` 的 `datasource.url`。
2. `PrismaClient` 需要显式传入驱动适配器：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`（`@prisma/adapter-pg`）。
3. 生成的客户端在 `apps/api/src/generated/prisma/client`（该目录被 gitignore，靠 `pnpm db:generate` 重建）。

## 认证设计

- **Access Token**：JWT，15 分钟，payload `{sub, username, role}`。每个请求守卫都会回查数据库确认用户仍为 ACTIVE——「禁用」即时生效，不等 token 过期。
- **Refresh Token**：随机不透明串，库里只存 sha256。**轮换式**：每次 refresh 作废旧串、发新串；检测到已作废串被复用 → 判定泄露，吊销该用户全部会话。
- **登出**：作废 refresh token（幂等）。Access token 在 ≤15 分钟内自然过期。
- **禁用用户 / 重置密码**：立即吊销该用户全部 refresh token。
- **V1 取舍**：token 存 localStorage（升级路径：httpOnly cookie + CSRF 防护，改动集中在 `apps/admin/src/api/client.ts`）。

## 用户模型与权限

字段：`id / username / name / email / phone / passwordHash / role / status / lastLoginAt / createdAt / updatedAt`。

- `role`：`SUPER_ADMIN | USER`——**不是** RBAC。等真实需求（"张三能看项目但不能删"）出现，再升级为 User–Role–Permission 多表，完全来得及。
- `status`：`ACTIVE | DISABLED`。**没有 DELETE 接口**——企业系统的用户与业务数据关联，离职走禁用，不然将来查"这条审批谁提的"就断线了。
- 用户管理接口全部要求 `SUPER_ADMIN`（RolesGuard）；`USER` 只能登录。

## 明确不做（V1）

- DELETE 用户（用禁用替代）
- RBAC 五表、部门、岗位
- Dashboard 假图表 / 假统计 / 待办
- 邮箱验证、多因素认证、审计日志、移动端适配

等第一个真实业务模块出现时再评估。

## 环境备忘

- 数据库：`docker compose up -d`（仓库根目录），postgres:18，宿主机端口 **5433**，库名 hgxt，用户/密码 postgres/postgres。改用其他 PostgreSQL 只需改 `apps/api/.env` 的 `DATABASE_URL`。
- 端口：API 3001（全局前缀 `/api`），前端 dev 5173（Vite 代理 `/api` → 3001）。
