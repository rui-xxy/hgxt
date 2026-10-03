# AGENTS.md — AI 协作说明（给后续所有 AI 会话的红线）

## 必须遵守的工作规则

1. **改完代码必须 `pnpm check` 全绿**（lint + typecheck + test + build）。这条比任何"请认真修改"的提示词都可靠。
2. **UI 风格以 `apps/admin/src/theme/tokens.ts` 与现有页面实现为准**，动手写界面前先看同类页面怎么写。禁止任意 px 字号/圆角/颜色，禁止语义色做装饰。原始色值只写在 `theme/tokens.ts`，自定义 CSS 只用 `--hg-*` 变量；图标只用 `components/icons.tsx`（不再用 @ant-design/icons）。
3. **技术栈已冻结**（见 docs/architecture.md），不要提议换框架/ORM/数据库。
4. **测试库是 hgxt_test**（127.0.0.1:5433，Docker 容器 hgxt-postgres）。API 集成测试会清库重建数据，绝不连开发库 hgxt。
5. 改 schema 后：`npx prisma migrate dev --name <名称>`（在 apps/api 下）+ 重新 generate + 跑全部测试。
6. **交互切换要保持布局稳定**：对会切换行数的表格、长数字或说明、异步年份切换，按 `docs/layout-stability.md` 预留显示区域并检查长短、空态和窄屏；不要让分页控件或相邻卡片随内容跳动。

## 项目速览

```
pnpm dev          # 同时起 API(3001) + 前端(5173)
pnpm check        # lint + typecheck + test + build（改码后的验收命令）
pnpm db:seed      # 需先在 apps/api/.env 配 SEED_ADMIN_PASSWORD（无默认值）
```

- `apps/api`：NestJS 12 + Prisma 7 + PostgreSQL 18。全局前缀 /api，Swagger /api/docs（仅非生产）。
- `apps/admin`：React 19 + Vite 8 + AntD 6 + React Router + TanStack Query。
- `packages/shared`：前后端 TypeScript 数据契约（**ESM**，改后需重新 build 才对 api 生效）。
- 数据库：Docker postgres:18 @ 127.0.0.1:5433（开发库 hgxt / 测试库 hgxt_test）。

## 安全不变量（改认证/用户代码前必读，违反即回归 bug）

- Refresh Token 轮换是**条件更新抢占**（原子），并有 30 秒复用宽限期——别改成"先查再改"。
- 重置密码/禁用/角色变更都在**事务**内完成；`authVersion` 变更使旧 Access Token 立即失效。
- 任何时刻必须保证 ACTIVE SUPER_ADMIN ≥ 1（`assertNotLastActiveSuperAdmin`，FOR UPDATE 锁）。
- 登录/刷新接口有 IP 限流（10/30 次每分钟）；不要加全局限流（内网共享出口 IP 会误伤）。

## 明确不做（除非用户明确要求）

RBAC 权限五表、动态表单引擎、工作流引擎、部门岗位、租户隔离、Redis 限流、Token Family/Device Session、Zod/OpenAPI codegen。理由见 docs/foundation-remediation.md「明确不做」。

## 修复记录索引

- 整改规格与验收标准：docs/foundation-remediation.md
- Prisma 7 / shared ESM 等踩坑记录：docs/architecture.md
