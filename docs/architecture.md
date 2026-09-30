# HGXT 架构决策记录（V1）

本文档记录已冻结的技术选型与关键取舍。**技术栈不轻易更换**，后续业务在此地基上生长。

> 2026-09 基础底座整改已完成（六阶段 A-F，详见 docs/foundation-remediation.md 的实施记录）：
> 认证安全不变量、运行环境收紧、测试链、前端认证状态机、API 契约、工程质量全部落地。

## 冻结的技术栈（2026-09）

| 层 | 技术 | 版本 | 说明 |
| --- | --- | --- | --- |
| 运行环境 | Node.js | 24 LTS（已验证 v24.18.0） | |
| 项目组织 | pnpm Workspace Monorepo | pnpm 10 | 前后端一个仓库 |
| 语言 | TypeScript | 5.9 | 前后端统一 |
| 后台前端 | React + Vite | React 19 / Vite 8 | |
| UI 组件 | Ant Design | 6.6.x | 主题映射在 apps/admin/src/theme/tokens.ts |
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

## packages/shared 必须是 ESM（踩过的坑）

shared 若编译成 CommonJS，Vite dev（原生 ESM 加载）无法从 CJS 产物中静态识别命名导出，
浏览器直接白屏（`does not provide an export named 'Role'`）——而 `vite build` 会自己做互操作转换，
所以**构建能过但 dev 白屏**，极具迷惑性。因此 shared 固定为 `"type": "module"` + `module: ES2022` 输出；
NestJS 侧的 CJS `require` 加载 ESM 由 Node ≥22.12/24 原生支持（本项目 engines 已锁 Node ≥24）。

## 认证设计

- **Access Token**：JWT，15 分钟，payload `{sub, username, role, ver}`。每个请求守卫都会回查数据库确认用户仍为 ACTIVE 且 `ver === authVersion`——「禁用」「重置密码」均**即时生效**，不等 token 过期。
- **Refresh Token**：随机不透明串，库里只存 sha256。**原子轮换**：`UPDATE ... WHERE revokedAt IS NULL` 条件更新抢占，同一旧 token 并发只有一个请求成功；「旧 token 作废 + 新 token 创建」在同一事务内（create 失败则抢占回滚，旧 token 仍有效）；轮换是「一换一」，竞争输家直接 401。
- **revokedReason**：每次吊销都记录原因（ROTATED / LOGOUT / PASSWORD_RESET / USER_DISABLED / REUSE_DETECTED），便于审计与排查"我为什么被登出"。
- **复用检测与宽限期**：已作废 token 被再次使用——撤销 30 秒内视为并发竞争输家（只拒绝不连坐）；超过 30 秒视为疑似泄露，吊销该用户全部会话。前端配合保证同一旧 token 只尝试刷新一次。
- **authVersion**：重置密码 / 未来任何强制下线场景 +1，使全部旧 Access Token 立即失效。上线该机制瞬间存量会话会强制重登一次（缺 ver 的旧 token 被拒），属预期行为。
- **事务**：重置密码（改哈希 + authVersion+1 + 吊销会话）、禁用（改状态 + 吊销会话）、角色变更（FOR UPDATE 锁后在岗管理员检查 + 写入）均为单事务，无半成功状态。Argon2 哈希在事务外计算。
- **系统不变量**：任何时刻 ACTIVE SUPER_ADMIN ≥ 1（`assertNotLastActiveSuperAdmin`，悲观锁防并发互改竞态）。
- **限流**：仅认证端点——登录 10 次/分/IP、刷新与登出 30 次/分/IP（`@nestjs/throttler`，内存存储）。**不设全局限流**：内网全公司常共享出口 IP，全局限流会误伤正常使用。多实例部署需换 Redis 存储（未做）。
- **登出**：作废 refresh token（幂等）。
- **V1 取舍**：token 存 localStorage（升级路径：httpOnly cookie + CSRF 防护，改动集中在 `apps/admin/src/api/client.ts`）。

## 运行环境（B 整改后）

| 项 | 开发默认 | 生产 |
| --- | --- | --- |
| API 监听 | `HOST=127.0.0.1`（仅本机） | 显式 `HOST=0.0.0.0` |
| PostgreSQL | Docker `127.0.0.1:5433`（仅本机回环） | Docker 内网/内网地址，不暴露宿主机端口 |
| Swagger `/api/docs` | 开启 | 默认关闭，`ENABLE_SWAGGER=true` 显式开启 |
| JWT Secret | 弱配置警告 | 长度 <32 或示例值 → **拒绝启动** |
| 安全头 | helmet（开发关 CSP 以兼容 Swagger UI） | helmet 全量 |
| seed | 必须显式 `SEED_ADMIN_PASSWORD`（≥8 位），不再有默认密码、不回显 | 同左 |

## 测试与质量门（C 整改后）

- **API 集成测试**：Vitest + supertest（`apps/api/test/`），指向独立测试库 `hgxt_test`（127.0.0.1:5433），globalSetup 自动 `migrate deploy`，每文件重建数据。覆盖：原子轮换/并发/宽限期、authVersion 即时失效、最后管理员保护、限流 429、契约（正则/小写/null 语义）。
- **前端认证层测试**：Vitest + jsdom + Testing Library（`apps/admin/src/**/*.test.tsx`），覆盖错误三分类、单飞刷新、单次尝试、跨标签同步、守卫分支。
- **统一检查命令**：`pnpm check` = lint（ESLint flat config）+ typecheck + test + build。**任何改动（人或 AI）必须 `pnpm check` 全绿**（见 AGENTS.md）。

## 依赖漏洞治理政策（F2）

`pnpm audit` 当前余量：3 项（2 High + 1 Moderate），路径全部为 `prisma → mysql2`（Prisma CLI 的 MySQL 间接依赖，本项目用 PostgreSQL，实际风险很低）。政策：
1. 不因 audit 红字恐慌性换依赖；
2. 每迭代跟进 Prisma 7.x 小版本升级（当前 7.10.0 已是最新 7.x）并重跑 audit + 全量回归；
3. 若长期不消化，评估 `pnpm.overrides` 强制 `mysql2 >= 3.23.1`（需回归验证与 Prisma CLI 兼容）。

## 用户模型与权限

字段：`id / username / name / email / phone / passwordHash / role / status / lastLoginAt / createdAt / updatedAt`。

- `role`：`SUPER_ADMIN | USER`——**不是** RBAC。等真实需求（"张三能看项目但不能删"）出现，再升级为 User–Role–Permission 多表，完全来得及。
- `status`：`ACTIVE | DISABLED`。**没有 DELETE 接口**——企业系统的用户与业务数据关联，离职走禁用，不然将来查"这条审批谁提的"就断线了。
- 用户管理接口全部要求 `SUPER_ADMIN`（RolesGuard）；`USER` 只能登录。

## 表单系统（硫酸车间报表）

- `Form` 保存标题和字段定义；`FormSubmission` 保存每次提交的 JSON 数据、提交人和时间。已有硫酸车间报表及其历史记录直接沿用，seed 只在空库补字段定义，不生成假记录。
- 左侧「表单系统」列出标题、内容中的最新 `field_date`、数据预览入口和填写入口。预览页采用分组双层表头和冻结列，可逐格编辑、增删行、记录停车情况，并统一保存或撤销；填写页按字段分组录入，自动带入当日日期。
- 批量增删改在一个数据库事务中完成，并校验记录所属表单。接口均沿用现有 JWT 登录，不另建权限体系或表单设计器。
- 表单 API 集成测试使用 `hgxt_test`，覆盖业务日期排序、字段校验、批量事务和跨表单记录隔离。

## 明确不做（V1）

- DELETE 用户（用禁用替代）
- RBAC 五表、部门、岗位
- Dashboard 假图表 / 假统计 / 待办
- 邮箱验证、多因素认证、审计日志、移动端适配

等第一个真实业务模块出现时再评估。

## 环境备忘

- 数据库：`docker compose up -d`（仓库根目录），postgres:18，宿主机端口 **5433**，库名 hgxt，用户/密码 postgres/postgres。改用其他 PostgreSQL 只需改 `apps/api/.env` 的 `DATABASE_URL`。
- 端口：API 3001（全局前缀 `/api`），前端 dev 5173（Vite 代理 `/api` → 3001）。
