# HGXT 管理后台

pnpm Monorepo：`apps/admin`（React 19 + Vite + Ant Design 6 后台）+ `apps/api`（NestJS 12 + Prisma 7 + PostgreSQL 18）。

V1 范围：**登录 + 用户管理**。技术栈已冻结（见 [docs/architecture.md](docs/architecture.md)），UI 规范见 [docs/ui-mapping.md](docs/ui-mapping.md)（依据根目录 DESIGN.md）。

## 快速开始

前置：Node.js 24+、pnpm 10+、Docker（跑数据库）。

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库（postgres:18，仅监听本机 127.0.0.1:5433）
docker compose up -d

# 3. 初始化数据库 + 创建管理员
pnpm db:migrate                                                   # 首次迁移
cd apps/api && SEED_ADMIN_PASSWORD="<你的密码>" pnpm db:seed && cd ../..  # 密码必须显式指定，无默认值

# 4. 启动前后端（API 3001 / 前端 5173）
pnpm dev
```

- 后台页面：http://localhost:5173
- 接口文档（Swagger）：http://localhost:3001/api/docs（生产默认关闭）

> 已有 PostgreSQL？不用 Docker 也行：改 `apps/api/.env` 的 `DATABASE_URL` 指向它，再执行第 3 步。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 同时启动 API + 前端 |
| `pnpm dev:api` / `pnpm dev:admin` | 单独启动某一端 |
| `pnpm check` | **lint + typecheck + test + build 一键验收（改码后必跑）** |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | 单独执行各项检查 |
| `pnpm db:migrate:named -- --name xxx` | 新增迁移（在 apps/api 下） |
| `pnpm db:seed` | 重建/补种管理员（幂等，需 SEED_ADMIN_PASSWORD） |
| `docker compose up -d` / `down` | 启停数据库 |

> 测试使用独立数据库 `hgxt_test`（同容器），自动迁移与重建数据，不影响开发库。

## 目录结构

```text
hgxt/
├─ apps/
│  ├─ admin/            # 后台网页（React 19 + Vite 8 + AntD 6）
│  │  └─ src/{pages,layouts,components,api,router,theme}
│  └─ api/              # 后端（NestJS 12 + Prisma 7）
│     ├─ src/{auth,users,database,common}
│     ├─ prisma/        # schema + 迁移 + seed
│     └─ prisma.config.ts
├─ packages/shared/     # 前后端共享枚举与 DTO 类型
├─ docs/                # 架构决策 / UI 映射 / API 概览
├─ DESIGN.md            # UI 设计规范（最高优先级）
└─ docker-compose.yml   # postgres:18 @ 5433
```
